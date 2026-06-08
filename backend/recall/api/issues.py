"""Issues endpoints (spec §9, ADR-0001).

* ``GET /issues?edition=&limit=&offset=`` -> paginated ``IssueSummary`` list, NEWEST FIRST.
* ``GET /issues/latest?edition=``          -> ``IssueDetail`` (Editorial landing).
* ``GET /issues/{id}``                      -> ``IssueDetail``.

An ``IssueDetail`` is assembled by reading the issue's appearances (already ordered by
``categories.sort`` then ``position``), grouping them into category sections in that CAT_ORDER,
and building each Content with full provenance + the reader's state.

NOTE: ``/issues/latest`` is declared BEFORE ``/issues/{id}`` so the literal path wins over the
``{id}`` UUID path converter.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy.orm import Session

from recall.api.assemble import build_content
from recall.api.deps import CurrentUserId, Db
from recall.models import ContentAppearance, Issue
from recall.repositories import (
    AppearanceRepository,
    IssueRepository,
    UserContentStateRepository,
)
from recall.schemas import IssueDetail, IssueSummary, Page
from recall.schemas.common import CategoryRef, EditionRef
from recall.schemas.issue import IssueMeta, IssueSection

router = APIRouter(tags=["issues"])


def _summary(issue: Issue, content_count: int) -> IssueSummary:
    return IssueSummary(
        id=issue.id,
        edition=EditionRef(key=issue.edition.key, name=issue.edition.name),
        issue_number=issue.issue_number,
        published_at=issue.published_at,
        subject=issue.subject,
        subtitle=issue.subtitle,
        content_count=content_count,
    )


def _build_issue_detail(db: Session, issue: Issue, user_id: uuid.UUID) -> IssueDetail:
    """Assemble an IssueDetail: appearances -> Content -> grouped into CAT_ORDER sections."""
    appearances = AppearanceRepository(db).list_for_issue(issue.id)

    # Full provenance for every Content in this issue (length 1 on the seed). Batched so the
    # per-Content appearances[] is correct without an N+1.
    appearance_repo = AppearanceRepository(db)
    provenance: dict[uuid.UUID, list[ContentAppearance]] = {}
    for ap in appearances:
        cid = ap.content_id
        if cid not in provenance:
            provenance[cid] = appearance_repo.list_for_content(cid)

    content_ids = [ap.content_id for ap in appearances]
    states = UserContentStateRepository(db).get_many(
        user_id=user_id, content_ids=content_ids
    )

    # Group appearances into sections. ``list_for_issue`` already orders by category sort then
    # position, so iterating in order and breaking on a category change preserves CAT_ORDER and
    # keeps each section's content ordered by position. Appearances with no category are skipped
    # from sections (an issue section requires a category).
    sections: list[IssueSection] = []
    current_slug: str | None = None
    current_section: IssueSection | None = None
    for ap in appearances:
        cat = ap.category
        if cat is None:
            continue
        content = build_content(
            ap.content, provenance.get(ap.content_id, [ap]), states.get(ap.content_id)
        )
        if cat.slug != current_slug:
            current_slug = cat.slug
            current_section = IssueSection(
                category=CategoryRef(slug=cat.slug, label=cat.label, hue=cat.hue),
                content=[],
            )
            sections.append(current_section)
        assert current_section is not None
        current_section.content.append(content)

    meta = IssueMeta(
        id=issue.id,
        edition=EditionRef(key=issue.edition.key, name=issue.edition.name),
        issue_number=issue.issue_number,
        published_at=issue.published_at,
        subject=issue.subject,
        subtitle=issue.subtitle,
    )
    return IssueDetail(issue=meta, sections=sections)


@router.get("/issues", response_model=Page[IssueSummary])
def list_issues(
    db: Db,
    edition: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[IssueSummary]:
    repo = IssueRepository(db)
    issues, total = repo.list_summaries(edition_key=edition, limit=limit, offset=offset)
    counts = repo.content_counts([i.id for i in issues])
    items = [_summary(i, counts.get(i.id, 0)) for i in issues]
    return Page[IssueSummary](items=items, total=total, limit=limit, offset=offset)


@router.get("/issues/latest", response_model=IssueDetail)
def get_latest_issue(
    db: Db,
    user_id: CurrentUserId,
    edition: Annotated[str | None, Query()] = None,
) -> IssueDetail:
    issue = IssueRepository(db).get_latest(edition_key=edition)
    if issue is None:
        raise HTTPException(status_code=404, detail="No issues found")
    return _build_issue_detail(db, issue, user_id)


@router.get("/issues/{issue_id}", response_model=IssueDetail)
def get_issue(issue_id: uuid.UUID, db: Db, user_id: CurrentUserId) -> IssueDetail:
    issue = IssueRepository(db).get(issue_id)
    if issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    return _build_issue_detail(db, issue, user_id)
