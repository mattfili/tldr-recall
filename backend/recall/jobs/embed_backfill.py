"""Embed backfill (Issue #6, spec §7, ADR-0003).

Embeds the ``combined`` EmbeddingKind for every Content that has no row for (combined, active
model), writing one ``content_embeddings`` row per content tagged with the embedder's name +
dim. v1 embeds the ``combined`` kind ONLY (title/summary deferred — the schema already supports
them, so adding later is just a backfill flag, no migration).

Idempotent: the existing-ids set is computed once up front (keyed on the active model name), so
a second run finds every id present and writes 0 rows. Switching backend (fake vs cloud)
re-embeds under the new model name without colliding with the other model's rows, because the
table's unique key is ``(content_id, kind, model)``.

Transaction ownership mirrors ``jobs/seed.py``: open a ``SessionLocal``, do ALL table work
THROUGH the repositories, commit once at the end, roll back + re-raise on error, close in
``finally``. No raw ORM/Session use beyond owning that transaction; NO model SDK import here
(the openai SDK is reachable only via ``--backend cloud`` -> the factory's lazy cloud import).

``--backend`` override: ``None`` -> the job uses ``settings.recall_embed_backend``; the
orchestrator passes ``cloud`` (real run off the .env key); tests pass ``fake`` (deterministic,
no key).
"""

from __future__ import annotations

from recall.db import SessionLocal
from recall.embeddings.factory import get_embedder
from recall.embeddings.text import combined_text
from recall.models import EmbeddingKind
from recall.repositories import ContentRepository, EmbeddingRepository

# One embed call per chunk of this many texts (batched round-trips for the cloud backend).
EMBED_BATCH = 100


def embed_backfill(*, backend: str | None = None) -> dict[str, int]:
    """Backfill ``combined`` embeddings for every un-embedded Content. Returns counts.

    Counts: ``total`` (corpus size), ``existing_skipped`` (already embedded for the active
    model), ``embedded`` (rows written this run).
    """
    embedder = get_embedder(backend)

    session = SessionLocal()
    try:
        content_repo = ContentRepository(session)
        embed_repo = EmbeddingRepository(session)

        existing = embed_repo.existing_content_ids(EmbeddingKind.combined, embedder.name)
        rows = content_repo.list_all()
        todo = [c for c in rows if c.id not in existing]

        # Build the type-prefixed combined text for each item, then embed in batches (order
        # preserved so each vector pairs with the correct content).
        texts = [combined_text(c) for c in todo]
        vectors: list[list[float]] = []
        for start in range(0, len(texts), EMBED_BATCH):
            vectors.extend(embedder.embed_documents(texts[start : start + EMBED_BATCH]))

        for content, vector in zip(todo, vectors, strict=True):
            embed_repo.create(
                content_id=content.id,
                kind=EmbeddingKind.combined,
                model=embedder.name,
                dim=embedder.dim,
                embedding=vector,  # create() enforces the write-time dim guard
            )

        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

    return {
        "total": len(rows),
        "existing_skipped": len(existing),
        "embedded": len(todo),
    }


if __name__ == "__main__":  # pragma: no cover - exercised via the CLI / `python -m`
    from recall.jobs.cli import main

    raise SystemExit(main(["embed-backfill"]))
