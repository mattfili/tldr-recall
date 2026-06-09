"""Saves endpoints (M2, ADR-0002).

Save/Star is the single per-(reader, Content) fact. Both endpoints return the FULL
``SaveState`` so the frontend can reconcile its optimistic flip.

* ``PUT /saves/{content_id}``    -> upsert starred=true.
* ``DELETE /saves/{content_id}`` -> SOFT upsert starred=false (the row is KEPT, never deleted).

Both 404 when the content does not exist. NOTE: ``get_db()`` does not commit and the
repositories only ``flush`` (the caller owns the transaction), so these write endpoints MUST
``db.commit()`` explicitly or the change is rolled back on session close.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException

from recall.api.deps import CurrentUserId, Db
from recall.repositories import ContentRepository, UserContentStateRepository
from recall.schemas import SaveState

router = APIRouter(tags=["saves"])


@router.put("/saves/{content_id}", response_model=SaveState)
def save_content(content_id: uuid.UUID, db: Db, user_id: CurrentUserId) -> SaveState:
    if ContentRepository(db).get(content_id) is None:
        raise HTTPException(status_code=404, detail="Content not found")
    UserContentStateRepository(db).upsert(
        user_id=user_id, content_id=content_id, starred=True
    )
    db.commit()
    return SaveState(content_id=content_id, starred=True)


@router.delete("/saves/{content_id}", response_model=SaveState)
def unsave_content(content_id: uuid.UUID, db: Db, user_id: CurrentUserId) -> SaveState:
    if ContentRepository(db).get(content_id) is None:
        raise HTTPException(status_code=404, detail="Content not found")
    # SOFT delete: the row is kept with starred=false (never physically removed).
    UserContentStateRepository(db).upsert(
        user_id=user_id, content_id=content_id, starred=False
    )
    db.commit()
    return SaveState(content_id=content_id, starred=False)
