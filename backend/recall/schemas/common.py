"""Shared API schemas — the pydantic v2 contract (spec §9, ADR-0001).

These are the SINGLE SOURCE OF TRUTH for the response shapes and are mirrored verbatim in
``frontend/src/types.ts``. Field names and nesting here ARE the contract; the UI stage builds
against exactly these shapes.

Pagination envelope is always ``{items, total, limit, offset}`` (generic over the item type).
"""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class EditionRef(BaseModel):
    """``{key, name}`` — an edition reference embedded in larger responses."""

    model_config = ConfigDict(from_attributes=True)

    key: str
    name: str


class CategoryRef(BaseModel):
    """``{slug, label, hue}`` — a category reference. ``hue`` is the stored value verbatim
    (e.g. ``'var(--c-bigtech)'``)."""

    model_config = ConfigDict(from_attributes=True)

    slug: str
    label: str
    hue: str


class IssueRef(BaseModel):
    """``{id, issue_number, published_at}`` — the slim issue reference used inside Content."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    issue_number: str | None
    published_at: date


class Appearance(BaseModel):
    """One sighting of a Content in an issue (ADR-0001): issue + edition + category + position."""

    model_config = ConfigDict(from_attributes=True)

    issue: IssueRef
    edition: EditionRef
    category: CategoryRef | None
    position: int


class Content(BaseModel):
    """The canonical frontend object (spec §9, ADR-0001, ADR-0002).

    Flat PRIMARY-APPEARANCE fields (``edition``/``category``/``issue``) + full provenance in
    ``appearances[]`` + the per-reader ``starred`` (Save/Star) flag. Primary appearance =
    earliest by (issue.published_at, then position). On the seed each Content has exactly ONE
    appearance. Content has NO read state — read/unread is a per-(reader, ISSUE) fact (ADR-0002).
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    summary: str
    content_type: str
    read_minutes: int | None
    url: str
    domain: str
    tags: list[str]
    resources: list[dict[str, Any]] | None

    # primary appearance (flattened for convenience)
    edition: EditionRef
    category: CategoryRef | None
    issue: IssueRef

    # full provenance
    appearances: list[Appearance]

    # per-reader state (stub user) — Save/Star only (ADR-0002).
    starred: bool


class Page[T](BaseModel):
    """The universal pagination envelope: ``{items, total, limit, offset}``."""

    items: list[T]
    total: int
    limit: int
    offset: int
