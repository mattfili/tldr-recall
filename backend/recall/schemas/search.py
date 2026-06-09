"""Search + collections API schemas — the pydantic v2 contract (#7, spec §8, ADR-0001/0002/0003).

SINGLE SOURCE OF TRUTH, mirrored VERBATIM into ``frontend/src/types.ts``.

* ``SearchRequest`` carries the NL ``query`` + optional EXPLICIT ``filters`` (ANDed with the
  intent the parser detects from the query text).
* ``SearchHit`` composes the full ``Content`` shape (subclassed, so the Content contract is
  reused UNCHANGED and the frontend's ``ContentItem`` renders a hit directly) PLUS ``score`` and
  a HIDDEN ``match_explanation`` (used by ordering-invariant tests + to surface degraded mode;
  NOT shown in the UI).
* ``MatchExplanation`` is minimal: ``matched_via`` + the per-arm ranks + ``fused_score`` +
  optional ``type_boost`` + optional ``degraded``.
* ``DetectedIntent`` reports the parser's ``types`` + ``negations`` — there is NO ``read_state``
  (ADR-0002 removed the read cue).
* ``CollectionRef`` is the slim smart-collection shape for ``GET /collections``.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from recall.schemas.common import Content


class SearchFilters(BaseModel):
    """Explicit filters from the UI, ANDed with the intent detected from the query text."""

    types: list[str] = Field(default_factory=list)
    editions: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    starred: bool = False


class SearchRequest(BaseModel):
    """A unified-search request: a free-text ``query`` over the WHOLE Library + optional filters."""

    query: str
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
    filters: SearchFilters | None = None


class MatchExplanation(BaseModel):
    """HIDDEN per-hit provenance (response-only; never rendered in the UI).

    ``matched_via`` lists the contributing signals ('lexical' / 'vector' / 'type_boost').
    ``lexical_rank`` / ``vector_rank`` are 1-based arm ranks (absent when that arm did not surface
    the hit). ``degraded`` is true when the vector arm was skipped (ADR-0003 graceful degradation).
    """

    matched_via: list[str]
    lexical_rank: int | None = None
    vector_rank: int | None = None
    fused_score: float
    type_boost: float | None = None
    degraded: bool | None = None


class SearchHit(Content):
    """A search result: the full ``Content`` shape + a relevance ``score`` + ``match_explanation``.

    Subclasses ``Content`` so every Content field is reused VERBATIM (the frontend's ``ContentItem``
    renders a hit unchanged); only ``score`` + the hidden ``match_explanation`` are added.
    """

    model_config = ConfigDict(from_attributes=True)

    score: float
    match_explanation: MatchExplanation


class DetectedIntent(BaseModel):
    """What the parser read from the query text: type cues + negation markers. NO read_state."""

    types: list[str] = Field(default_factory=list)
    negations: list[str] = Field(default_factory=list)


class SearchResponse(BaseModel):
    """Page-like envelope for search hits + detected intent (``{items, total, limit, offset}``)."""

    items: list[SearchHit]
    total: int
    limit: int
    offset: int
    detected: DetectedIntent


class CollectionRef(BaseModel):
    """A smart collection ``{slug, label, query, hue}`` (resolved LIVE through the pipeline)."""

    model_config = ConfigDict(from_attributes=True)

    slug: str
    label: str
    query: str
    hue: str
