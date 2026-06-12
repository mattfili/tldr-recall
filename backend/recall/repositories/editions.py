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

    def list_with_unread_counts(
        self, *, user_id: uuid.UUID
    ) -> list[tuple[Edition, int, bool]]:
        """All editions with the reader's unread-issue count AND whether the edition's
        LATEST issue is unread, in ``list_all`` order (#19, #49).

        TWO batched queries (still no N+1, regardless of edition count):

        1. editions LEFT JOIN issues LEFT JOIN the reader's ``user_issue_state`` rows
           (the ``user_id`` predicate lives IN the join condition so editions/issues
           without rows survive the outer join), GROUP BY edition, counting issues with
           no state row OR ``read_state='unread'`` (ADR-0002: a missing row means the
           reader has never viewed the issue). ``func.count(Issue.id)`` keeps an edition
           with zero issues at 0.
        2. ``DISTINCT ON (edition_id) … ORDER BY published_at DESC`` over issues with the
           same state join — the read-state of each edition's newest issue. This is what
           the rail dot keys off (#49): a historical backlog must not pin the dot forever;
           "unread" at a glance means "the latest issue is new to you". Editions with no
           issues report False.
        """
        is_unread = or_(
            UserIssueState.id.is_(None), UserIssueState.read_state == ReadState.unread
        )
        state_join = and_(
            UserIssueState.issue_id == Issue.id,
            UserIssueState.user_id == user_id,
        )

        unread = func.count(Issue.id).filter(is_unread)
        counts_stmt = (
            select(Edition, unread.label("unread_count"))
            .select_from(Edition)
            .outerjoin(Issue, Issue.edition_id == Edition.id)
            .outerjoin(UserIssueState, state_join)
            .group_by(Edition.id)
            .order_by(Edition.created_at, Edition.key)
        )
        counts = self.session.execute(counts_stmt).all()

        latest_stmt = (
            select(Issue.edition_id, is_unread.label("latest_unread"))
            .distinct(Issue.edition_id)  # Postgres DISTINCT ON
            .outerjoin(UserIssueState, state_join)
            .order_by(Issue.edition_id, Issue.published_at.desc(), Issue.id.desc())
        )
        latest = {edition_id: flag for edition_id, flag in self.session.execute(latest_stmt)}

        return [
            (edition, count, bool(latest.get(edition.id, False))) for edition, count in counts
        ]

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
