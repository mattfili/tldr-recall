"""Smart collections endpoints (#7, spec §8, §5.2, ADR-0001).

* ``GET /collections``               -> ``list[CollectionRef]`` (the seeded smart collections).
* ``GET /collections/{slug}/items``  -> ``SearchResponse`` — the collection's stored NL query
  resolved LIVE through the SAME search pipeline (no materialised membership). 404 if absent.

The literal ``/collections`` route is declared BEFORE ``/collections/{slug}/items`` so it is not
shadowed by the path-param route. Read-only (no commit).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from recall.api.deps import CurrentUserId, Db
from recall.repositories import CollectionRepository
from recall.schemas import CollectionRef, SearchResponse
from recall.search import service as search_service

router = APIRouter(tags=["collections"])


@router.get("/collections", response_model=list[CollectionRef])
def list_collections(db: Db) -> list[CollectionRef]:
    rows = CollectionRepository(db).list_all()
    return [CollectionRef.model_validate(c) for c in rows]


@router.get("/collections/{slug}/items", response_model=SearchResponse)
def collection_items(
    slug: str,
    db: Db,
    user_id: CurrentUserId,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> SearchResponse:
    result = search_service.resolve_collection(
        db, user_id=user_id, slug=slug, limit=limit, offset=offset
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Collection not found")
    return result
