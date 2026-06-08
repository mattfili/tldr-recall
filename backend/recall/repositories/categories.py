"""Category repository.

``hue`` is stored verbatim (the data.js ``v`` value); this layer never derives a hue.
"""

from __future__ import annotations

from sqlalchemy import func, select

from recall.models import Category
from recall.repositories.base import Repository


class CategoryRepository(Repository):
    def get_by_slug(self, slug: str) -> Category | None:
        return self.session.scalar(select(Category).where(Category.slug == slug))

    def upsert(self, *, slug: str, label: str, hue: str, sort: int) -> Category:
        """Create the category, or update label/hue/sort if it already exists.

        ``hue`` is whatever the caller passes (verbatim from data.js ``v``).
        """
        category = self.get_by_slug(slug)
        if category is None:
            category = Category(slug=slug, label=label, hue=hue, sort=sort)
            self.session.add(category)
        else:
            category.label = label
            category.hue = hue
            category.sort = sort
        self.session.flush()
        return category

    def count(self) -> int:
        return self.session.scalar(select(func.count()).select_from(Category)) or 0
