"""Saves API schema (M2, ADR-0002).

``SaveState`` is the full per-reader Content Save/Star state returned by both
``PUT /saves/{content_id}`` and ``DELETE /saves/{content_id}`` — the shape the frontend
reconciles its optimistic flip against. Built explicitly in the route (no ``from_attributes``).
"""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel


class SaveState(BaseModel):
    """``{content_id, starred}`` — the reader's Save/Star state for one Content."""

    content_id: UUID
    starred: bool


__all__ = ["SaveState"]
