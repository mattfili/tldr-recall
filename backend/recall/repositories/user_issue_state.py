"""UserIssueState repository — per-(reader, ISSUE) read/unread (ADR-0002).

A row exists after the reader first views an issue (mark-on-view). Missing row -> the issue
is ``unread`` for that reader. Idempotent on (user_id, issue_id).
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select

from recall.models import ReadState, UserIssueState
from recall.repositories.base import Repository


class UserIssueStateRepository(Repository):
    def get(
        self, *, user_id: uuid.UUID, issue_id: uuid.UUID
    ) -> UserIssueState | None:
        return self.session.scalar(
            select(UserIssueState).where(
                UserIssueState.user_id == user_id,
                UserIssueState.issue_id == issue_id,
            )
        )

    def get_many(
        self, *, user_id: uuid.UUID, issue_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, UserIssueState]:
        """The user's issue-state rows for a set of issue ids, keyed by ``issue_id``.

        An issue with no row is absent from the dict — the caller defaults it to
        ``read_state='unread'`` (a missing row means the reader has never viewed it).
        """
        if not issue_ids:
            return {}
        rows = self.session.scalars(
            select(UserIssueState).where(
                UserIssueState.user_id == user_id,
                UserIssueState.issue_id.in_(issue_ids),
            )
        ).all()
        return {row.issue_id: row for row in rows}

    def upsert(
        self,
        *,
        user_id: uuid.UUID,
        issue_id: uuid.UUID,
        read_state: ReadState | str,
    ) -> UserIssueState:
        """Idempotent on (user_id, issue_id)."""
        state = self.get(user_id=user_id, issue_id=issue_id)
        if state is None:
            state = UserIssueState(
                user_id=user_id,
                issue_id=issue_id,
                read_state=ReadState(read_state),
            )
            self.session.add(state)
        else:
            state.read_state = ReadState(read_state)
        self.session.flush()
        return state

    def count(self) -> int:
        return self.session.scalar(select(func.count()).select_from(UserIssueState)) or 0
