"""User repository — the stub user lives here (spec §11)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select

from recall.models import User
from recall.repositories.base import Repository


class UserRepository(Repository):
    def get(self, user_id: uuid.UUID) -> User | None:
        return self.session.get(User, user_id)

    def upsert(
        self,
        *,
        user_id: uuid.UUID,
        email: str | None = None,
        display_name: str | None = None,
    ) -> User:
        """Create the user with a fixed id (the STUB_USER id), or update its fields.

        Seeding the stub user with the exact ``STUB_USER.id`` constant is what makes
        ``AuthProvider.stub`` resolve to the seeded row.
        """
        user = self.get(user_id)
        if user is None:
            user = User(id=user_id, email=email, display_name=display_name)
            self.session.add(user)
        else:
            user.email = email
            user.display_name = display_name
        self.session.flush()
        return user

    def count(self) -> int:
        return self.session.scalar(select(func.count()).select_from(User)) or 0
