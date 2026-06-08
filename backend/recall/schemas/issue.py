"""Issue API schemas (spec §9).

* ``IssueSummary`` — a row in ``GET /issues`` (the paginated list).
* ``IssueDetail`` — the full issue with its category ``sections[]`` (``GET /issues/{id}``,
  ``GET /issues/latest``). Sections are the categories that HAVE content in the issue,
  ordered by ``categories.sort`` (CAT_ORDER); each section's content is ordered by
  ``appearance.position``.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from recall.schemas.common import CategoryRef, Content, EditionRef


class IssueSummary(BaseModel):
    """One issue in the paginated ``GET /issues`` list."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    edition: EditionRef
    issue_number: str | None
    published_at: date
    subject: str | None
    subtitle: str | None
    content_count: int


class IssueMeta(BaseModel):
    """The issue object embedded at the top of ``IssueDetail`` (no ``content_count``)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    edition: EditionRef
    issue_number: str | None
    published_at: date
    subject: str | None
    subtitle: str | None


class IssueSection(BaseModel):
    """One category section within an issue: its category + the content filed under it."""

    category: CategoryRef
    content: list[Content]


class IssueDetail(BaseModel):
    """The full issue: ``{issue, sections:[{category, content:[Content]}]}``."""

    issue: IssueMeta
    sections: list[IssueSection]


__all__ = ["IssueDetail", "IssueMeta", "IssueSection", "IssueSummary"]
