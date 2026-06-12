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
    """One edition in ``GET /editions``: the ref + the reader's unread state.

    ``latest_unread`` (#49) is what the rail dot keys off — whether the edition's NEWEST
    issue is unread. ``unread_count`` is the full backlog count (a freshly ingested
    historical corpus starts fully unread, so the count alone would pin dots forever).
    """

    unread_count: int
    latest_unread: bool


__all__ = ["Edition"]
