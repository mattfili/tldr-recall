"""Unified hybrid search (#7, spec §8, ADR-0001/0003).

Intent parsing + RRF fusion are pure (stdlib-only) and re-exported here for ergonomic imports.
The orchestrator (``service.search``) and the raw-SQL arms (``repositories.search``) are imported
where used — kept OUT of this package ``__init__`` so importing it pulls no ORM/Session at module
load time.
"""

from __future__ import annotations

from recall.search.fusion import FusionResult, apply_type_boost, rrf
from recall.search.intent import Negation, ParsedIntent, parse

__all__ = [
    "FusionResult",
    "Negation",
    "ParsedIntent",
    "apply_type_boost",
    "parse",
    "rrf",
]
