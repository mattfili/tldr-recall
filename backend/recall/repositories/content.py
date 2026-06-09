"""Content repository — the canonical-link table (ADR-0001).

Global dedup on ``content_hash`` (first-seen-wins on the editorial fields).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import and_, exists, func, select

from recall.models import (
    Category,
    Content,
    ContentAppearance,
    ContentType,
    Edition,
    Issue,
    UserContentState,
)
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

    def list_all(self) -> list[Content]:
        """Every Content row, ordered deterministically (id ASC) — the backfill corpus walk.

        Returns full ORM rows; the embed backfill reads id + content_type + title + summary +
        domain + tags off each. No filtering: the idempotency skip happens in the job via the
        existing-ids set (see ``EmbeddingRepository.existing_content_ids``).
        """
        return list(self.session.scalars(select(Content).order_by(Content.id.asc())).all())

    # ── library (#4) ──

    def list_library(
        self,
        *,
        user_id: uuid.UUID,
        types: list[str] | None,
        editions: list[str] | None,
        categories: list[str] | None,
        starred: bool,
        limit: int,
        offset: int,
    ) -> tuple[list[Content], int]:
        """The Library list (ADR-0001): the whole ingested corpus, filtered + paginated.

        Filter model (ADR-0001): dimensions AND together; values within a dimension OR.
        Each active dimension contributes its OWN clause so they AND; ``IN`` inside each gives
        OR within the dimension.

        * type     — Content-level: ``Content.content_type IN (types)`` (raw enum label strings).
        * starred  — Content-level: EXISTS over the stub user's ``user_content_state`` (starred).
        * edition  — HAS-APPEARANCE-IN: a correlated EXISTS over appearances->issues->editions
          (``Edition.key IN editions``). Membership ONLY — it decides INCLUSION, never which
          appearance is shown (the row still renders its stable PRIMARY appearance, assembled
          separately from the batch-loaded provenance per ADR-0001).
        * category — HAS-APPEARANCE-IN: a correlated EXISTS over appearances->categories
          (``Category.slug IN categories``). Membership only, same as edition.

        Ordering is ``first_seen_at DESC, id ASC`` — a TOTAL order (id ASC breaks ties so
        limit/offset paging never duplicates/skips). ``first_seen_at`` is set at seed time
        (ADR-0001 first-seen-wins) to the PRIMARY appearance's published_at, so this equals
        primary-appearance order WITHOUT an aggregate. (If a future seed left first_seen_at
        unset, this ordering would silently drift from primary order.)

        Returns ``(rows, total)`` where ``total`` is the SINGLE in-view count for the SAME
        filters — whole-corpus size when unfiltered, match count when filtered. Appearances are
        NOT joined here (a join over appearances would multiply Content rows and corrupt both
        the count and the paging); they are batch-loaded by ``AppearanceRepository`` afterward.
        """
        base = select(Content)

        if types:
            base = base.where(Content.content_type.in_(types))

        if starred:
            base = base.where(
                exists().where(
                    and_(
                        UserContentState.content_id == Content.id,
                        UserContentState.user_id == user_id,
                        UserContentState.starred.is_(True),
                    )
                )
            )

        if editions:
            base = base.where(
                exists().where(
                    and_(
                        ContentAppearance.content_id == Content.id,
                        ContentAppearance.issue_id == Issue.id,
                        Issue.edition_id == Edition.id,
                        Edition.key.in_(editions),
                    )
                )
            )

        if categories:
            base = base.where(
                exists().where(
                    and_(
                        ContentAppearance.content_id == Content.id,
                        ContentAppearance.category_id == Category.id,
                        Category.slug.in_(categories),
                    )
                )
            )

        total = (
            self.session.scalar(
                select(func.count()).select_from(base.order_by(None).subquery())
            )
            or 0
        )

        rows = list(
            self.session.scalars(
                base.order_by(Content.first_seen_at.desc(), Content.id.asc())
                .limit(limit)
                .offset(offset)
            ).all()
        )
        return rows, total
