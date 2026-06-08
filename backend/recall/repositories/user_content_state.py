"""UserContentState repository — per-reader star + read state (§5.2).

A row exists after the first star OR read; seed only creates rows for items that are
starred or read.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select

from recall.models import ReadState, UserContentState
from recall.repositories.base import Repository


class UserContentStateRepository(Repository):
    def get(
        self, *, user_id: uuid.UUID, content_id: uuid.UUID
    ) -> UserContentState | None:
        return self.session.scalar(
            select(UserContentState).where(
                UserContentState.user_id == user_id,
                UserContentState.content_id == content_id,
            )
        )

    def get_many(
        self, *, user_id: uuid.UUID, content_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, UserContentState]:
        """The user's state rows for a set of content ids, keyed by ``content_id``.

        Content with no row is simply absent from the dict — the caller defaults it to
        ``starred=False`` / ``read_state='unread'`` (a missing row means neither star nor read).
        """
        if not content_ids:
            return {}
        rows = self.session.scalars(
            select(UserContentState).where(
                UserContentState.user_id == user_id,
                UserContentState.content_id.in_(content_ids),
            )
        ).all()
        return {row.content_id: row for row in rows}

    def upsert(
        self,
        *,
        user_id: uuid.UUID,
        content_id: uuid.UUID,
        starred: bool,
        read_state: ReadState | str,
    ) -> UserContentState:
        """Idempotent on (user_id, content_id)."""
        state = self.get(user_id=user_id, content_id=content_id)
        if state is None:
            state = UserContentState(
                user_id=user_id,
                content_id=content_id,
                starred=starred,
                read_state=ReadState(read_state),
            )
            self.session.add(state)
        else:
            state.starred = starred
            state.read_state = ReadState(read_state)
        self.session.flush()
        return state

    def count(self) -> int:
        return self.session.scalar(select(func.count()).select_from(UserContentState)) or 0
