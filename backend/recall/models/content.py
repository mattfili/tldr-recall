"""``content`` — one canonical summarized link, globally deduped by ``content_hash``.

The core unit (ADR-0001). Editorial text lives here (first-seen-wins); where it ran lives
in ``content_appearances``.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Computed, Integer, String, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from recall.models.base import Base, timestamptz, uuid_pk
from recall.models.enums import ContentType, content_type_enum

if TYPE_CHECKING:
    from recall.models.appearance import ContentAppearance
    from recall.models.embedding import ContentEmbedding
    from recall.models.user_content_state import UserContentState


def _weighted(column_expr: str, weight: str) -> str:
    return f"setweight(to_tsvector('pg_catalog.english'::regconfig, {column_expr}), '{weight}')"


# The generated search_tsv expression — IDENTICAL to migration 0003's SEARCH_TSV_EXPRESSION
# (assembled from per-column fragments only to keep line length sane). Weights A>B>C>D feed
# ts_rank_cd so title hits outrank summary, then tags, then domain.
SEARCH_TSV_EXPRESSION = (
    _weighted("coalesce(title, '')", "A")
    + " || "
    + _weighted("coalesce(summary, '')", "B")
    + " || "
    + _weighted("recall_tags_text(tags)", "C")
    + " || "
    + _weighted("coalesce(domain, '')", "D")
)


class Content(Base):
    __tablename__ = "content"

    id: Mapped[uuid.UUID] = uuid_pk()
    title: Mapped[str] = mapped_column(String, nullable=False)
    summary: Mapped[str] = mapped_column(String, nullable=False)
    content_type: Mapped[ContentType] = mapped_column(content_type_enum, nullable=False)
    read_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    url: Mapped[str] = mapped_column(String, nullable=False)
    domain: Mapped[str] = mapped_column(String, nullable=False)
    # ARRAY(String) -> text[]; server default empty array so unseeded content has [] not NULL.
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default=text("'{}'::text[]")
    )
    resources: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)
    editor_note: Mapped[str | None] = mapped_column(String, nullable=True)
    content_hash: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    first_seen_at: Mapped[datetime] = mapped_column(timestamptz(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        timestamptz(), nullable=False, server_default=text("now()")
    )

    # search-internal lexical FTS vector (#7). STORED generated column, DB-maintained —
    # NEVER written by repositories and NOT exposed in build_content / the Content schema.
    # Keeps Base.metadata in sync with migration 0003 (same expression, persisted=True). The
    # tags arm goes through the IMMUTABLE recall_tags_text() helper created by migration 0003,
    # since array_to_string is only STABLE and would make the STORED expression illegal.
    search_tsv: Mapped[str | None] = mapped_column(
        TSVECTOR,
        Computed(SEARCH_TSV_EXPRESSION, persisted=True),
        nullable=True,
    )

    appearances: Mapped[list[ContentAppearance]] = relationship(
        back_populates="content", cascade="all, delete-orphan"
    )
    embeddings: Mapped[list[ContentEmbedding]] = relationship(
        back_populates="content", cascade="all, delete-orphan"
    )
    user_states: Mapped[list[UserContentState]] = relationship(
        back_populates="content", cascade="all, delete-orphan"
    )
