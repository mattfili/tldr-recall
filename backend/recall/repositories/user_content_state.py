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
