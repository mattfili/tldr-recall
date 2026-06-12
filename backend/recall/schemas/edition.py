"""Edition API schema (spec §9, #19).

``GET /editions`` returns a plain list of ``{key, name, unread_count}`` — ``EditionRef``
plus the current reader's per-edition unread-issue count (ADR-0002: an issue is unread
when the reader has no ``user_issue_state`` row for it or the row says ``'unread'``).
``EditionRef`` itself stays ``{key, name}`` — it is embedded across Content/Appearance/
IssueSummary and mirrored verbatim in ``frontend/src/types.ts``.
"""

from __future__ import annotations

from recall.schemas.common import EditionRef


class Edition(EditionRef):
    """One edition in ``GET /editions``: the ref + the reader's unread-issue count."""

    unread_count: int


__all__ = ["Edition"]
