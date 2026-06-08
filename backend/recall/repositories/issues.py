"""Issue repository."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select

from recall.models import Issue
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
