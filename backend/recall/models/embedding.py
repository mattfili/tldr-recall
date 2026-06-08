"""``content_embeddings`` — pgvector, one row per (content, kind, model) (spec §5.2).

Each story is embedded once (canonical content). The HNSW cosine index on ``embedding``
is created in the migration (not declaratively here — it needs USING hnsw + the
vector_cosine_ops operator class). Seed writes ZERO rows (embeddings land in #6).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from pgvector.sqlalchemy import Vector
from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from recall.config import settings
from recall.models.base import Base, timestamptz, uuid_pk
from recall.models.enums import EmbeddingKind, embedding_kind_enum

if TYPE_CHECKING:
    from recall.models.content import Content

# Column dimension = RECALL_EMBED_DIM (1536 for the v1 text-embedding-3-small model).
EMBED_DIM = settings.recall_embed_dim


class ContentEmbedding(Base):
    __tablename__ = "content_embeddings"
    __table_args__ = (
        UniqueConstraint("content_id", "kind", "model", name="uq_embeddings_content_kind_model"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    content_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("content.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[EmbeddingKind] = mapped_column(embedding_kind_enum, nullable=False)
    model: Mapped[str] = mapped_column(String, nullable=False)
    dim: Mapped[int] = mapped_column(Integer, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBED_DIM), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        timestamptz(), nullable=False, server_default=text("now()")
    )

    content: Mapped[Content] = relationship(back_populates="embeddings")
