"""Reciprocal Rank Fusion + per-weak-type boost for unified hybrid search (#7, spec §8).

Two ranked arms (lexical FTS + vector cosine) are fused by RRF: each arm contributes
``1/(k + rank)`` per id (1-based rank), summed across the arms. ADR-0003 GRACEFUL DEGRADATION:
in degraded mode the vector arm is empty, so RRF fuses a SINGLE list — still a correct ordering.

The helpers also return per-id PROVENANCE (which arm, at what 1-based rank, and any type boost)
so the search service can build the (hidden) ``match_explanation`` without re-deriving ranks.

Pure stdlib — no ORM, no model SDK.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class FusionEntry:
    """Per-id fused score + provenance for one search hit."""

    content_id: str
    fused_score: float = 0.0
    lexical_rank: int | None = None
    vector_rank: int | None = None
    type_boost: float | None = None

    @property
    def matched_via(self) -> list[str]:
        """Which signals contributed, in a stable order (lexical, vector, type_boost)."""
        via: list[str] = []
        if self.lexical_rank is not None:
            via.append("lexical")
        if self.vector_rank is not None:
            via.append("vector")
        if self.type_boost:
            via.append("type_boost")
        return via


@dataclass
class FusionResult:
    """The fused ranking: ``entries`` keyed by content id, plus the total ordering."""

    entries: dict[str, FusionEntry] = field(default_factory=dict)

    def ordered_ids(self) -> list[str]:
        """Ids in total order: fused_score DESC, then content_id ASC (stable tie-break)."""
        return [
            e.content_id
            for e in sorted(
                self.entries.values(),
                key=lambda e: (-e.fused_score, e.content_id),
            )
        ]


def rrf(
    lexical_ids: list[str],
    vector_ids: list[str],
    k: int,
) -> FusionResult:
    """Reciprocal Rank Fusion of the two arms (1-based ranks, contribution ``1/(k+rank)``).

    Either list may be empty. In degraded mode ``vector_ids == []`` so RRF fuses a single list
    (still correct). Each id's ``fused_score`` is the SUM of its per-arm contributions; the arm
    rank that produced each contribution is recorded for ``match_explanation``.
    """
    result = FusionResult()

    def _entry(content_id: str) -> FusionEntry:
        e = result.entries.get(content_id)
        if e is None:
            e = FusionEntry(content_id=content_id)
            result.entries[content_id] = e
        return e

    for rank, content_id in enumerate(lexical_ids, start=1):
        e = _entry(content_id)
        e.fused_score += 1.0 / (k + rank)
        # Keep the BEST (smallest) rank if an id appears more than once in a list.
        if e.lexical_rank is None or rank < e.lexical_rank:
            e.lexical_rank = rank

    for rank, content_id in enumerate(vector_ids, start=1):
        e = _entry(content_id)
        e.fused_score += 1.0 / (k + rank)
        if e.vector_rank is None or rank < e.vector_rank:
            e.vector_rank = rank

    return result


def apply_type_boost(
    result: FusionResult,
    content_type_by_id: dict[str, str],
    weak_types: set[str],
    weight: float,
) -> FusionResult:
    """Add ``weight`` to every fused id whose ``content_type`` is in ``weak_types`` (mutates in
    place and returns the same result for chaining).

    The per-weak-type additive SOFT boost (settings.recall_type_boost_weight). Strong type cues
    are already enforced as a HARD filter inside the arm queries, so they are not boosted here.
    Records ``type_boost`` on the entry so ``match_explanation`` can surface it.
    """
    if not weak_types or weight == 0.0:
        return result
    for entry in result.entries.values():
        ctype = content_type_by_id.get(entry.content_id)
        if ctype is not None and ctype in weak_types:
            entry.fused_score += weight
            entry.type_boost = (entry.type_boost or 0.0) + weight
    return result
