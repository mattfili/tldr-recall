"""Unified hybrid search endpoint (#7, spec §8, ADR-0001/0003).

``POST /search`` (body: ``SearchRequest``) -> ``SearchResponse``. One search box over the WHOLE
Library; results are one-per-story canonical Content wrapped with a score + a HIDDEN
match_explanation. The service does intent parse -> lexical + (optional) vector arms -> RRF +
type boost -> assemble. Read-only (no commit). Mirrors the ``library.py`` idiom (the service owns
assembly; the API just wires deps).
"""

from __future__ import annotations

from fastapi import APIRouter

from recall.api.deps import CurrentUserId, Db
from recall.schemas import SearchRequest, SearchResponse
from recall.search import service as search_service

router = APIRouter(tags=["search"])


@router.post("/search", response_model=SearchResponse)
def unified_search(
    body: SearchRequest, db: Db, user_id: CurrentUserId
) -> SearchResponse:
    return search_service.search(db, user_id=user_id, request=body)
