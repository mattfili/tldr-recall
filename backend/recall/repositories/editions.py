"""Edition repository."""

from __future__ import annotations

from sqlalchemy import func, select

from recall.models import Edition
from recall.repositories.base import Repository


class EditionRepository(Repository):
    def get_by_key(self, key: str) -> Edition | None:
        return self.session.scalar(select(Edition).where(Edition.key == key))

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
