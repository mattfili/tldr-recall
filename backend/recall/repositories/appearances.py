"""ContentAppearance repository — one sighting of Content in an Issue (ADR-0001)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from recall.models import Category, ContentAppearance, Edition, Issue
from recall.repositories.base import Repository


class AppearanceRepository(Repository):
    def get(self, *, issue_id: uuid.UUID, content_id: uuid.UUID) -> ContentAppearance | None:
        return self.session.scalar(
            select(ContentAppearance).where(
                ContentAppearance.issue_id == issue_id,
                ContentAppearance.content_id == content_id,
            )
        )

    # ── reads (#3) ──

    def _with_provenance(self, stmt):
        """Eager-load the joins every appearance->Content needs: content, its issue's edition,
        and the appearance's category. Avoids per-row lazy loads when assembling Content.
        """
        return stmt.options(
            joinedload(ContentAppearance.content),
            joinedload(ContentAppearance.issue).joinedload(Issue.edition),
            joinedload(ContentAppearance.category),
        )

    def list_for_issue(self, issue_id: uuid.UUID) -> list[ContentAppearance]:
        """All appearances in an issue, ordered by the category's CAT_ORDER (``categories.sort``)
        then by ``position``. Content/issue/edition/category are eager-loaded.

        Appearances with no category sort to the end (NULLS LAST) so the grouping step never
        crashes on an uncategorised sighting.
        """
        stmt = (
            select(ContentAppearance)
            .outerjoin(Category, Category.id == ContentAppearance.category_id)
            .where(ContentAppearance.issue_id == issue_id)
            .order_by(Category.sort.asc().nulls_last(), ContentAppearance.position)
        )
        return list(self.session.scalars(self._with_provenance(stmt)).unique().all())

    def list_for_content(self, content_id: uuid.UUID) -> list[ContentAppearance]:
        """All appearances of a Content, ordered earliest-first by (issue.published_at,
        position) — so ``[0]`` is the PRIMARY appearance (ADR-0001). Provenance joins are
        eager-loaded.
        """
        stmt = (
            select(ContentAppearance)
            .join(Issue, Issue.id == ContentAppearance.issue_id)
            .join(Edition, Edition.id == Issue.edition_id)
            .where(ContentAppearance.content_id == content_id)
            .order_by(Issue.published_at.asc(), ContentAppearance.position.asc())
        )
        return list(self.session.scalars(self._with_provenance(stmt)).unique().all())

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
