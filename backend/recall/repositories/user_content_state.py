"""UserContentState repository — per-reader Save/Star (§5.2, ADR-0002).

A row exists after the first star; the seed only creates rows for items that are starred.
This table carries ``starred`` ONLY (read/unread is per-Issue — see ``user_issue_state``).
"""

from __future__ import annotations

import uuid

from sqlalchemy import delete, func, select

from recall.models import UserContentState
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
        ``starred=False`` (a missing row means the reader has never starred it).
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
    ) -> UserContentState:
        """Idempotent on (user_id, content_id). Starred-only; a soft un-star keeps the row."""
        state = self.get(user_id=user_id, content_id=content_id)
        if state is None:
            state = UserContentState(
                user_id=user_id,
                content_id=content_id,
                starred=starred,
            )
            self.session.add(state)
        else:
            state.starred = starred
        self.session.flush()
        return state

    def delete_all(self) -> int:
        """Bulk-delete every per-reader Content state row (the --replace wipe).

        Must run BEFORE the content wipe: the content_id FK has no ON DELETE CASCADE.
        """
        result = self.session.execute(delete(UserContentState))
        self.session.flush()
        return result.rowcount or 0

    def count(self) -> int:
        return self.session.scalar(select(func.count()).select_from(UserContentState)) or 0
