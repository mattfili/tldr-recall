"""Edition repository."""

from __future__ import annotations

import uuid

from sqlalchemy import and_, func, or_, select

from recall.models import Edition, Issue, ReadState, UserIssueState
from recall.repositories.base import Repository


class EditionRepository(Repository):
    def get_by_key(self, key: str) -> Edition | None:
        return self.session.scalar(select(Edition).where(Edition.key == key))

    def list_all(self) -> list[Edition]:
        """All editions, ordered by created_at then key for a stable response.

        The frontend controls rail order; the API just returns a deterministic list.
        """
        return list(
            self.session.scalars(
                select(Edition).order_by(Edition.created_at, Edition.key)
            ).all()
        )

    def list_with_unread_counts(self, *, user_id: uuid.UUID) -> list[tuple[Edition, int]]:
        """All editions with the reader's unread-issue count, in ``list_all`` order (#19).

        ONE batched query (no N+1): editions LEFT JOIN issues LEFT JOIN the reader's
        ``user_issue_state`` rows (the ``user_id`` predicate lives IN the join condition so
        editions/issues without rows survive the outer join), GROUP BY edition, counting
        issues with no state row OR ``read_state='unread'`` (ADR-0002: a missing row means
        the reader has never viewed the issue). ``func.count(Issue.id)`` keeps an edition
        with zero issues at 0 — its NULL Issue row matches the IS-NULL filter but a NULL
        argument is never counted.
        """
        unread = func.count(Issue.id).filter(
            or_(UserIssueState.id.is_(None), UserIssueState.read_state == ReadState.unread)
        )
        stmt = (
            select(Edition, unread.label("unread_count"))
            .select_from(Edition)
            .outerjoin(Issue, Issue.edition_id == Edition.id)
            .outerjoin(
                UserIssueState,
                and_(
                    UserIssueState.issue_id == Issue.id,
                    UserIssueState.user_id == user_id,
                ),
            )
            .group_by(Edition.id)
            .order_by(Edition.created_at, Edition.key)
        )
        return [(edition, count) for edition, count in self.session.execute(stmt).all()]

    def upsert(self, *, key: str, name: str, sender_email: str | None = None) -> Edition:
        """Create the edition, or update its name/sender_email if it already exists."""
        edition = self.get_by_key(key)
        if edition is None:
            edition = Edition(key=key, name=name, sender_email=sender_email)
            self.session.add(edition)
        else:
            edition.name = name
            if sender_email is not None:
                edition.sender_email = sender_email
        self.session.flush()
        return edition

    def count(self) -> int:
        return self.session.scalar(select(func.count()).select_from(Edition)) or 0
