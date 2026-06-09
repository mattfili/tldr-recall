"""Library endpoint (spec §9, ADR-0001).

``GET /library?type=&edition=&category=&starred=&limit=&offset=`` -> ``Page[Content]``.

The Library is the WHOLE ingested corpus, browsable + filterable (NOT only bookmarks). Filters
combine per ADR-0001: dimensions AND together; values within a dimension OR (multi-select via
REPEATABLE query params, e.g. ``?type=article&type=repo``).

* ``type``     — Content-level (``content.content_type IN ...``).
* ``edition``  — HAS-APPEARANCE-IN (match ANY of the Content's appearances).
* ``category`` — HAS-APPEARANCE-IN.
* ``starred``  — Content-level, the stub user's ``user_content_state``.

edition/category decide INCLUSION only; each row still renders its STABLE PRIMARY appearance
(ADR-0001), assembled here from ALL its appearances (batch-loaded to avoid an N+1).

There is NO ``density`` param (presentation is a client-only pref) and NO ``read_state`` param
(ADR-0002 — read/unread is per-Issue, not a Content property). ``total`` is the SINGLE in-view
count for the SAME filters (whole-corpus when unfiltered, match count when filtered) — there is
no separate corpus_total field.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from recall.api.assemble import build_content
from recall.api.deps import CurrentUserId, Db
from recall.repositories import (
    AppearanceRepository,
    ContentRepository,
    UserContentStateRepository,
)
from recall.schemas import Content, Page

router = APIRouter(tags=["library"])


@router.get("/library", response_model=Page[Content])
def list_library(
    db: Db,
    user_id: CurrentUserId,
    type: Annotated[list[str] | None, Query()] = None,
    edition: Annotated[list[str] | None, Query()] = None,
    category: Annotated[list[str] | None, Query()] = None,
    starred: Annotated[bool, Query()] = False,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[Content]:
    rows, total = ContentRepository(db).list_library(
        user_id=user_id,
        types=type,
        editions=edition,
        categories=category,
        starred=starred,
        limit=limit,
        offset=offset,
    )
    content_ids = [c.id for c in rows]
    provenance = AppearanceRepository(db).list_for_contents(content_ids)
    states = UserContentStateRepository(db).get_many(
        user_id=user_id, content_ids=content_ids
    )
    items = [
        build_content(c, provenance.get(c.id, []), states.get(c.id)) for c in rows
    ]
    return Page[Content](items=items, total=total, limit=limit, offset=offset)
