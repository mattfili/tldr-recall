"""Issue repository."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import delete, func, select
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

    def get_by_source_ref(self, source_ref: str) -> Issue | None:
        """Lookup by the ingestion idempotency key (the .eml filename / Gmail message id)."""
        return self.session.scalars(
            select(Issue).where(Issue.source_ref == source_ref)
        ).first()

    def get_by_edition_and_date(
        self, *, edition_id: uuid.UUID, published_at: date
    ) -> Issue | None:
        """One edition's issue for a given date (the NULL-issue_number idempotency guard).

        Gmail issues carry no issue_number, and the ``uq_issues_edition_number`` unique
        treats NULLs as distinct — so (edition, published_at) is the real duplicate guard
        for re-dumped messages / seed leftovers. Two real messages for the same
        edition+date (resends/corrections) deliberately collapse into one issue.
        """
        return self.session.scalars(
            select(Issue).where(
                Issue.edition_id == edition_id, Issue.published_at == published_at
            )
        ).first()

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

    def upsert_from_source(
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
    ) -> tuple[Issue, bool]:
        """Pipeline upsert (#26): source_ref-first idempotency. Returns ``(issue, created)``.

        Match order: (1) ``source_ref`` (re-export of the same message); (2)
        (edition, issue_number) when a number exists; (3) (edition, published_at) —
        the NULL-number guard (adopts seed leftovers / re-dumped ids for the same dated
        issue). Any match is updated in place; otherwise a new row is created. The plain
        ``upsert`` cannot be used here: with ``issue_number=None`` it would collapse
        every NULL-numbered issue of an edition into one row.
        """
        issue = self.get_by_source_ref(source_ref)
        if issue is None and issue_number is not None:
            issue = self.get_by_edition_and_number(
                edition_id=edition_id, issue_number=issue_number
            )
        if issue is None:
            issue = self.get_by_edition_and_date(
                edition_id=edition_id, published_at=published_at
            )

        created = issue is None
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
            issue.edition_id = edition_id
            issue.issue_number = issue_number
            issue.published_at = published_at
            issue.subject = subject
            issue.subtitle = subtitle
            issue.source_kind = source_kind
            issue.source_ref = source_ref
            issue.raw_uri = raw_uri
        self.session.flush()
        return issue, created

    def delete_all(self) -> int:
        """Bulk-delete every issue (the --replace wipe). Returns the rowcount.

        DB-level ``ON DELETE CASCADE`` clears dependent ``content_appearances``;
        ``user_issue_state`` has NO cascade and must be wiped FIRST by the caller.
        """
        result = self.session.execute(delete(Issue))
        self.session.flush()
        return result.rowcount or 0

    def count(self) -> int:
        return self.session.scalar(select(func.count()).select_from(Issue)) or 0
