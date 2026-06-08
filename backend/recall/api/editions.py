"""Editions endpoint (spec §9).

``GET /editions`` -> ``[{key, name}]`` (the seeded editions). The frontend controls rail order,
so the API returns a deterministic list (created_at, then key).
"""

from __future__ import annotations

from fastapi import APIRouter

from recall.api.deps import Db
from recall.repositories import EditionRepository
from recall.schemas import Edition

router = APIRouter(tags=["editions"])


@router.get("/editions", response_model=list[Edition])
def list_editions(db: Db) -> list[Edition]:
    editions = EditionRepository(db).list_all()
    return [Edition(key=e.key, name=e.name) for e in editions]
