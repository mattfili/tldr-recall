"""Editions endpoint (spec §9, #19).

``GET /editions`` -> ``[{key, name, unread_count}]`` (the seeded editions + the current
reader's per-edition unread-issue count, ADR-0002). The frontend controls rail order, so
the API returns a deterministic list (created_at, then key). Still a pure GET — the count
is computed in ONE batched repository query; mark-on-view writes happen elsewhere
(``PUT /issues/{id}/read``).
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
    return [Edition(key=e.key, name=e.name, unread_count=count) for e, count in rows]
