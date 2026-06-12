"""Editions endpoint (spec §9, #19).

``GET /editions`` -> ``[{key, name, unread_count, latest_unread}]`` (the current reader's
per-edition unread backlog count + whether the NEWEST issue is unread, ADR-0002/#49). The
frontend controls rail order, so the API returns a deterministic list (created_at, then
key). Still a pure GET — both signals come from batched repository queries; mark-on-view
writes happen elsewhere (``PUT /issues/{id}/read``).
"""

from __future__ import annotations

from fastapi import APIRouter

from recall.api.deps import CurrentUserId, Db
from recall.repositories import EditionRepository
from recall.schemas import Edition

router = APIRouter(tags=["editions"])


@router.get("/editions", response_model=list[Edition])
def list_editions(db: Db, user_id: CurrentUserId) -> list[Edition]:
    rows = EditionRepository(db).list_with_unread_counts(user_id=user_id)
    return [
        Edition(key=e.key, name=e.name, unread_count=count, latest_unread=latest)
        for e, count, latest in rows
    ]
