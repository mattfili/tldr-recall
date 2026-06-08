"""Content repository — the canonical-link table (ADR-0001).

Global dedup on ``content_hash`` (first-seen-wins on the editorial fields).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select

from recall.models import Content, ContentType
from recall.repositories.base import Repository


class ContentRepository(Repository):
    def get_by_hash(self, content_hash: str) -> Content | None:
        return self.session.scalar(
            select(Content).where(Content.content_hash == content_hash)
        )

    def get(self, content_id: uuid.UUID) -> Content | None:
        """One Content row by id (None if absent)."""
        return self.session.get(Content, content_id)

    def upsert(
        self,
        *,
        title: str,
        summary: str,
        content_type: ContentType | str,
        url: str,
        domain: str,
        content_hash: str,
        first_seen_at: datetime,
        read_minutes: int | None = None,
        tags: list[str] | None = None,
        resources: list[dict[str, Any]] | None = None,
        editor_note: str | None = None,
    ) -> Content:
        """Create the content, or return the existing row (first-seen-wins).

        Identity is ``content_hash``. If a row already exists, its editorial fields are left
        untouched (first-seen-wins per ADR-0001); only newer appearances will be attached.
        """
        existing = self.get_by_hash(content_hash)
        if existing is not None:
            return existing

        content = Content(
            title=title,
            summary=summary,
            content_type=ContentType(content_type),
            url=url,
            domain=domain,
            content_hash=content_hash,
            first_seen_at=first_seen_at,
            read_minutes=read_minutes,
            tags=list(tags) if tags is not None else [],
            resources=resources,
            editor_note=editor_note,
        )
        self.session.add(content)
        self.session.flush()
        return content

    def count(self) -> int:
        return self.session.scalar(select(func.count()).select_from(Content)) or 0
