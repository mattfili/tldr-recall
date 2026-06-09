"""Search orchestrator — unified hybrid search end-to-end (#7, spec §8, ADR-0001/0002/0003).

``search(db, *, user_id, request)`` runs the whole pipeline through REPOSITORIES + the pure
``intent`` / ``fusion`` modules + the ``factory`` (config-only). The API layer just calls this.

PIPELINE:
 1. parse intent (type cues, negations, edition/starred filters, the intent-stripped topic).
 2. merge detected intent with the explicit request filters (AND across dimensions, OR within).
 3. KEY-FREE DEGRADATION GATE (ADR-0003, get this exact):
      a. ``active_model = active_model_name()`` — CONFIG ONLY, never builds an embedder/imports
         openai.
      b. ``n = EmbeddingRepository.count_for(combined, active_model)``. ``n == 0`` -> DEGRADED:
         FTS-only, ``match_explanation.degraded = True``, the embedder is NEVER built (so keyless
         CI never needs a key).
      c. ``n > 0`` -> build the embedder and embed the topic INSIDE a try/except; ANY failure
         (missing key / transport error) -> DEGRADED + log, skip the vector arm (the request never
         fails).
 4. lexical arm (always) + vector arm (only when not degraded), BOTH with the same hard filters.
 5. RRF(k=settings.recall_search_rrf_k) + per-weak-type additive boost (honoring
    RECALL_TYPE_FILTER_MODE: auto = strong-filter/weak-boost; soft = all boost; hard = all filter).
 6. no-op rerank via ``get_reranker()`` (order preserved).
 7. sort fused_score DESC, id ASC (total order); slice offset/limit; total = fused count.
 8. batch-assemble Content (+ appearances + states) via ``build_content``; wrap as ``SearchHit``.

``resolve_collection`` runs a collection's stored NL query through this SAME ``search()`` (LIVE).
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy.orm import Session

from recall.api.assemble import build_content
from recall.config import settings
from recall.embeddings.factory import active_model_name, get_embedder, get_reranker
from recall.models import EmbeddingKind
from recall.repositories import (
    AppearanceRepository,
    CollectionRepository,
    ContentRepository,
    EmbeddingRepository,
    SearchRepository,
    UserContentStateRepository,
)
from recall.schemas.search import (
    DetectedIntent,
    MatchExplanation,
    SearchHit,
    SearchRequest,
    SearchResponse,
)
from recall.search.fusion import apply_type_boost, rrf
from recall.search.intent import ParsedIntent, parse

logger = logging.getLogger(__name__)

# Per-arm candidate cap. Big enough to cover the whole seed corpus; the page slice happens after
# fusion. Both arms share it so neither arm's truncation skews RRF.
ARM_LIMIT = 500


def _merge_filters(intent: ParsedIntent, request: SearchRequest) -> dict:
    """Combine detected intent with explicit request.filters (ADR-0001: AND across dimensions).

    Returns the resolved hard-filter inputs honoring RECALL_TYPE_FILTER_MODE:
      * auto -> strong cues hard-filter, weak cues boost (the default).
      * soft -> ALL type cues become boosts (nothing hard-filters by type).
      * hard -> ALL type cues hard-filter (weak promoted to filter, no boost).
    Explicit ``filters.types`` are ALWAYS hard includes (the UI asked for them directly).
    """
    mode = (settings.recall_type_filter_mode or "auto").lower()
    explicit = request.filters

    if mode == "soft":
        types_strong: set[str] = set()
        types_weak = set(intent.types_strong) | set(intent.types_weak)
    elif mode == "hard":
        types_strong = set(intent.types_strong) | set(intent.types_weak)
        types_weak = set()
    else:  # auto
        types_strong = set(intent.types_strong)
        types_weak = set(intent.types_weak)

    if explicit and explicit.types:
        types_strong |= set(explicit.types)

    editions = set(intent.editions)
    if explicit and explicit.editions:
        editions |= set(explicit.editions)

    categories: set[str] = set()
    if explicit and explicit.categories:
        categories |= set(explicit.categories)

    starred = intent.starred or bool(explicit and explicit.starred)

    exclude_types = {n.content_type for n in intent.negations if n.content_type is not None}
    topic_excludes = [n.term for n in intent.negations if n.term is not None]

    return {
        "types_strong": types_strong,
        "types_weak": types_weak,
        "editions": editions,
        "categories": categories,
        "starred": starred,
        "exclude_types": exclude_types,
        "topic_excludes": topic_excludes,
    }


def _try_embed_query(cleaned_query: str) -> list[float] | None:
    """Build the embedder + embed the topic. Returns None on ANY failure (-> degrade).

    Only ever called AFTER the count gate found rows for the active model, so a failure here means
    the configured backend cannot embed right now (missing key / transport error) — we log and
    degrade rather than failing the request.
    """
    try:
        embedder = get_embedder()
        return embedder.embed_query(cleaned_query)
    except Exception as exc:  # noqa: BLE001 - degrade on ANY embed failure (ADR-0003)
        logger.warning("vector arm disabled: embed_query failed (%s); degrading to FTS-only", exc)
        return None


def search(db: Session, *, user_id: uuid.UUID, request: SearchRequest) -> SearchResponse:
    """Run the unified hybrid search pipeline and return a ``SearchResponse``."""
    intent = parse(request.query)
    merged = _merge_filters(intent, request)

    search_repo = SearchRepository(db)

    # ── KEY-FREE DEGRADATION GATE (config-only first; embedder built only if rows exist). ──
    active_model = active_model_name()
    has_vectors = EmbeddingRepository(db).count_for(EmbeddingKind.combined, active_model) > 0

    qvec: list[float] | None = None
    if has_vectors:
        qvec = _try_embed_query(intent.cleaned_query)
    degraded = qvec is None  # True when no rows OR the embed attempt failed.

    # ── Arms (both with the SAME hard filters so RRF stays correct). ──
    lexical_ids = [
        str(cid)
        for cid in search_repo.fts_search(
            cleaned_query=intent.cleaned_query,
            types_strong=merged["types_strong"],
            exclude_types=merged["exclude_types"],
            editions=merged["editions"],
            starred=merged["starred"],
            topic_excludes=merged["topic_excludes"],
            user_id=user_id,
            limit=ARM_LIMIT,
        )
    ]

    vector_ids: list[str] = []
    if not degraded and qvec is not None:
        vector_ids = [
            str(cid)
            for cid in search_repo.vector_search(
                qvec=qvec,
                active_model=active_model,
                types_strong=merged["types_strong"],
                exclude_types=merged["exclude_types"],
                editions=merged["editions"],
                starred=merged["starred"],
                topic_excludes=merged["topic_excludes"],
                user_id=user_id,
                limit=ARM_LIMIT,
            )
        ]

    # ── Fuse + type boost. ──
    fused = rrf(lexical_ids, vector_ids, settings.recall_search_rrf_k)

    weak_types = merged["types_weak"]
    if weak_types:
        all_ids = [uuid.UUID(cid) for cid in fused.entries]
        type_by_id = _content_type_by_id(db, all_ids)
        apply_type_boost(fused, type_by_id, weak_types, settings.recall_type_boost_weight)

    # ── No-op rerank (order preserved) + total order. ──
    get_reranker()  # v1 no-op; preserves order. Built for the seam (no candidates needed here).
    ordered_ids = fused.ordered_ids()
    total = len(ordered_ids)

    # ── Page slice. ──
    page_id_strs = ordered_ids[request.offset : request.offset + request.limit]
    page_ids = [uuid.UUID(cid) for cid in page_id_strs]

    # ── Batch-assemble Content + score + match_explanation. ──
    items = _assemble_hits(db, user_id, page_ids, fused, degraded)

    return SearchResponse(
        items=items,
        total=total,
        limit=request.limit,
        offset=request.offset,
        detected=DetectedIntent(
            types=sorted(intent.types_strong | intent.types_weak),
            negations=_detected_negations(intent),
        ),
    )


def _detected_negations(intent: ParsedIntent) -> list[str]:
    """Human-readable negation tokens for the response (type label or topic term)."""
    out: list[str] = []
    for neg in intent.negations:
        out.append(neg.content_type if neg.content_type is not None else (neg.term or ""))
    return out


def _content_type_by_id(db: Session, ids: list[uuid.UUID]) -> dict[str, str]:
    """``{id_str: content_type}`` for the fused ids (used by the weak-type boost)."""
    repo = ContentRepository(db)
    out: dict[str, str] = {}
    for cid in ids:
        row = repo.get(cid)
        if row is not None:
            out[str(cid)] = str(row.content_type)
    return out


def _assemble_hits(
    db: Session,
    user_id: uuid.UUID,
    page_ids: list[uuid.UUID],
    fused,  # noqa: ANN001 - FusionResult (avoid an import cycle at the signature)
    degraded: bool,
) -> list[SearchHit]:
    """Load Content + provenance + state for the page ids and wrap each as a ``SearchHit``."""
    if not page_ids:
        return []

    content_repo = ContentRepository(db)
    provenance = AppearanceRepository(db).list_for_contents(page_ids)
    states = UserContentStateRepository(db).get_many(user_id=user_id, content_ids=page_ids)

    hits: list[SearchHit] = []
    for cid in page_ids:
        row = content_repo.get(cid)
        if row is None:
            continue
        content = build_content(row, provenance.get(cid, []), states.get(cid))
        entry = fused.entries[str(cid)]
        explanation = MatchExplanation(
            matched_via=entry.matched_via,
            lexical_rank=entry.lexical_rank,
            vector_rank=entry.vector_rank,
            fused_score=entry.fused_score,
            type_boost=entry.type_boost,
            degraded=True if degraded else None,
        )
        hits.append(
            SearchHit(
                **content.model_dump(),
                score=entry.fused_score,
                match_explanation=explanation,
            )
        )
    return hits


def resolve_collection(
    db: Session,
    *,
    user_id: uuid.UUID,
    slug: str,
    limit: int,
    offset: int,
) -> SearchResponse | None:
    """Resolve a smart collection LIVE: run its stored NL query through ``search()``.

    Returns None when the collection does not exist (the API maps that to a 404).
    """
    collection = CollectionRepository(db).get_by_slug(slug=slug)
    if collection is None:
        return None
    return search(
        db,
        user_id=user_id,
        request=SearchRequest(query=collection.query, limit=limit, offset=offset),
    )
