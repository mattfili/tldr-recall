"""ContentAppearance repository — one sighting of Content in an Issue (ADR-0001)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select

from recall.models import ContentAppearance
from recall.repositories.base import Repository


class AppearanceRepository(Repository):
    def get(self, *, issue_id: uuid.UUID, content_id: uuid.UUID) -> ContentAppearance | None:
        return self.session.scalar(
            select(ContentAppearance).where(
                ContentAppearance.issue_id == issue_id,
                ContentAppearance.content_id == content_id,
            )
        )

    def upsert(
        self,
        *,
        content_id: uuid.UUID,
        issue_id: uuid.UUID,
        category_id: uuid.UUID | None,
        position: int,
    ) -> ContentAppearance:
        """Idempotent on (issue_id, content_id)."""
        appearance = self.get(issue_id=issue_id, content_id=content_id)
        if appearance is None:
            appearance = ContentAppearance(
                content_id=content_id,
                issue_id=issue_id,
                category_id=category_id,
                position=position,
            )
            self.session.add(appearance)
        else:
            appearance.category_id = category_id
            appearance.position = position
        self.session.flush()
        return appearance

    def count(self) -> int:
        return self.session.scalar(select(func.count()).select_from(ContentAppearance)) or 0
