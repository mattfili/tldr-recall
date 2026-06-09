"""Collection repository — smart collections (data.js COLLECTIONS) (§5.2).

``hue`` is stored verbatim (the data.js ``v`` value). data.js ``count`` is ignored.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select

from recall.models import Collection
from recall.repositories.base import Repository


class CollectionRepository(Repository):
    def get_by_slug(
        self, *, slug: str, user_id: uuid.UUID | None = None
    ) -> Collection | None:
        return self.session.scalar(
            select(Collection).where(
                Collection.slug == slug, Collection.user_id.is_(user_id)
            )
        )

    def list_all(self, *, user_id: uuid.UUID | None = None) -> list[Collection]:
        """Every collection for the scope (seeded/global when ``user_id`` is None), in a stable
        order (created_at, then slug to break ties). Drives ``GET /collections``.
        """
        return list(
            self.session.scalars(
                select(Collection)
                .where(Collection.user_id.is_(user_id))
                .order_by(Collection.created_at.asc(), Collection.slug.asc())
            ).all()
        )

    def upsert(
        self,
        *,
        slug: str,
        label: str,
        query: str,
        hue: str,
        is_smart: bool = True,
        user_id: uuid.UUID | None = None,
    ) -> Collection:
        """Create the collection, or update label/query/hue if it already exists.

        Keyed on (slug, user_id). ``hue`` is verbatim from data.js ``v``.
        """
        collection = self.get_by_slug(slug=slug, user_id=user_id)
        if collection is None:
            collection = Collection(
                slug=slug,
                label=label,
                query=query,
                hue=hue,
                is_smart=is_smart,
                user_id=user_id,
            )
            self.session.add(collection)
        else:
            collection.label = label
            collection.query = query
            collection.hue = hue
            collection.is_smart = is_smart
        self.session.flush()
        return collection

    def count(self) -> int:
        return self.session.scalar(select(func.count()).select_from(Collection)) or 0
