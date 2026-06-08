"""FastAPI dependencies for the read endpoints (#3).

Provides the request-scoped DB session and resolves the current reader's user id. Auth is the
stub provider (spec §11): a single fixed user whose id matches the seeded ``users`` row, so
``starred``/``read_state`` resolve against real ``user_content_state`` rows.

Dependencies are exported as ``Annotated`` aliases (``Db`` / ``CurrentUserId``) so routes declare
``db: Db`` rather than ``db = Depends(...)`` — this keeps the ``Depends()`` call out of argument
defaults (ruff B008) while staying idiomatic FastAPI.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from recall.auth.stub import STUB_USER
from recall.db import get_db

__all__ = ["CurrentUserId", "Db", "current_user_id", "get_db"]


def current_user_id() -> uuid.UUID:
    """The current reader's user id (stub auth: the single seeded user)."""
    return uuid.UUID(STUB_USER.id)


# Annotated dependency aliases used in route signatures.
Db = Annotated[Session, Depends(get_db)]
CurrentUserId = Annotated[uuid.UUID, Depends(current_user_id)]
