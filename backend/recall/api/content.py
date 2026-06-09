"""Content endpoint (spec §9, ADR-0001).

``GET /content/{id}`` -> the canonical ``Content`` object: flat primary-appearance fields +
full ``appearances[]`` + the reader's ``starred`` (Save/Star; Content has no read state per
ADR-0002).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException

from recall.api.assemble import build_content
from recall.api.deps import CurrentUserId, Db
from recall.repositories import (
    AppearanceRepository,
    ContentRepository,
    UserContentStateRepository,
)
from recall.schemas import Content

router = APIRouter(tags=["content"])


@router.get("/content/{content_id}", response_model=Content)
def get_content(content_id: uuid.UUID, db: Db, user_id: CurrentUserId) -> Content:
    content = ContentRepository(db).get(content_id)
    if content is None:
        raise HTTPException(status_code=404, detail="Content not found")

    appearances = AppearanceRepository(db).list_for_content(content_id)
    state = UserContentStateRepository(db).get(user_id=user_id, content_id=content_id)
    return build_content(content, appearances, state)
