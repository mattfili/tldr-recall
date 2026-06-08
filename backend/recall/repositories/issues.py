"""Issue repository."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from recall.models import ContentAppearance, Edition, Issue
from recall.repositories.base import Repository


class IssueRepository(Repository):
    def get_by_edition_and_number(
        self, *, edition_id: uuid.UUID, issue_number: str | None
    ) -> Issue | None:
        return self.session.scalar(
            select(Issue).where(
                Issue.edition_id == edition_id, Issue.issue_number == issue_number
            )
        )

    # ── reads (#3) ──

    def get(self, issue_id: uuid.UUID) -> Issue | None:
        """One issue with its edition eager-loaded."""
        return self.session.scalar(
            select(Issue).options(joinedload(Issue.edition)).where(Issue.id == issue_id)
        )

    def list_summaries(
        self,
        *,
        edition_key: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[Issue], int]:
        """Issues NEWEST FIRST (published_at desc, then issue_number desc), paginated.

        Returns ``(issues, total)`` where ``total`` is the unpaginated count for the same
        filter. Editions are eager-loaded for the IssueSummary response.
        """
        base = select(Issue).join(Edition, Edition.id == Issue.edition_id)
        if edition_key is not None:
            base = base.where(Edition.key == edition_key)

        total = (
            self.session.scalar(
                select(func.count()).select_from(base.order_by(None).subquery())
            )
            or 0
        )

        issues = list(
            self.session.scalars(
                base.options(joinedload(Issue.edition))
                .order_by(Issue.published_at.desc(), Issue.issue_number.desc())
                .limit(limit)
                .offset(offset)
            ).all()
        )
        return issues, total

    def get_latest(self, *, edition_key: str | None = None) -> Issue | None:
        """Newest issue of an edition (or newest overall if edition omitted).

        Newest = published_at desc, then issue_number desc.
        """
        stmt = (
            select(Issue)
            .join(Edition, Edition.id == Issue.edition_id)
            .options(joinedload(Issue.edition))
            .order_by(Issue.published_at.desc(), Issue.issue_number.desc())
            .limit(1)
        )
        if edition_key is not None:
            stmt = stmt.where(Edition.key == edition_key)
        return self.session.scalar(stmt)

    def content_count(self, issue_id: uuid.UUID) -> int:
        """Number of appearances (content items) in an issue."""
        return (
            self.session.scalar(
                select(func.count())
                .select_from(ContentAppearance)
                .where(ContentAppearance.issue_id == issue_id)
            )
            or 0
        )

    def content_counts(self, issue_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
        """Appearance counts for many issues at once (avoids an N+1 in the list endpoint)."""
        if not issue_ids:
            return {}
        rows = self.session.execute(
            select(
                ContentAppearance.issue_id, func.count(ContentAppearance.id)
            )
            .where(ContentAppearance.issue_id.in_(issue_ids))
            .group_by(ContentAppearance.issue_id)
        ).all()
        counts = {issue_id: count for issue_id, count in rows}
        return {issue_id: counts.get(issue_id, 0) for issue_id in issue_ids}

    def upsert(
        self,
        *,
        edition_id: uuid.UUID,
        issue_number: str | None,
        published_at: date,
        subject: str | None,
        subtitle: str | None,
        source_kind: str,
        source_ref: str,
        raw_uri: str | None = None,
    ) -> Issue:
        """Idempotent on (edition_id, issue_number)."""
        issue = self.get_by_edition_and_number(
            edition_id=edition_id, issue_number=issue_number
        )
        if issue is None:
            issue = Issue(
                edition_id=edition_id,
                issue_number=issue_number,
                published_at=published_at,
                subject=subject,
                subtitle=subtitle,
                source_kind=source_kind,
                source_ref=source_ref,
                raw_uri=raw_uri,
            )
            self.session.add(issue)
        else:
            issue.published_at = published_at
            issue.subject = subject
            issue.subtitle = subtitle
            issue.source_kind = source_kind
            issue.source_ref = source_ref
            issue.raw_uri = raw_uri
        self.session.flush()
        return issue

    def count(self) -> int:
        return self.session.scalar(select(func.count()).select_from(Issue)) or 0
