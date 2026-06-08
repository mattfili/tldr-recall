"""IngestionSource portability seam + normalized DTOs (spec §6.1).

Source-agnostic pydantic DTOs and the IngestionSource protocol only — no concrete
sources. Swapping Gmail -> a first-party TLDR REST feed means writing one new
IngestionSource implementation; nothing downstream changes. Concrete sources land in #4.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date
from typing import Protocol, runtime_checkable

from pydantic import BaseModel


class RawArticle(BaseModel):
    title: str
    summary: str
    raw_url: str | None = None  # tracking/redirect URL as found
    read_minutes: int | None = None
    resources: list[dict] | None = None


class RawSection(BaseModel):
    category_label: str  # raw header text, e.g. 'Big Tech & Startups'
    articles: list[RawArticle]


class RawIssue(BaseModel):
    edition_key: str  # 'tldr' | 'ai' | 'founders'
    issue_number: str | None = None
    published_at: date
    subject: str
    subtitle: str | None = None
    source_kind: str  # 'gmail' | 'tldr_rest'
    source_ref: str  # idempotency key
    sections: list[RawSection]


@runtime_checkable
class IngestionSource(Protocol):
    def fetch(self, since: date | None) -> Iterable[RawIssue]: ...
