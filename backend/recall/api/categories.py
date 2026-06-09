"""Categories endpoint (spec §9).

``GET /categories`` -> ``[{slug, label, hue}]`` ordered by ``categories.sort`` (CAT_ORDER) so
the Library FilterPanel renders the Category group in canonical order.
"""

from __future__ import annotations

from fastapi import APIRouter

from recall.api.deps import Db
from recall.repositories import CategoryRepository
from recall.schemas import Category

router = APIRouter(tags=["categories"])


@router.get("/categories", response_model=list[Category])
def list_categories(db: Db) -> list[Category]:
    cats = CategoryRepository(db).list_all()
    return [Category(slug=c.slug, label=c.label, hue=c.hue) for c in cats]
