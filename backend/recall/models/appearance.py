"""``content_appearances`` — one row per sighting of a Content in an Issue (ADR-0001)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from recall.models.base import Base, timestamptz, uuid_pk

if TYPE_CHECKING:
    from recall.models.category import Category
    from recall.models.content import Content
    from recall.models.issue import Issue


class ContentAppearance(Base):
    __tablename__ = "content_appearances"
    __table_args__ = (
        UniqueConstraint("issue_id", "content_id", name="uq_appearances_issue_content"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    content_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("content.id", ondelete="CASCADE"), nullable=False
    )
    issue_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("issues.id", ondelete="CASCADE"), nullable=False
    )
    # category_id is nullable per §5.2 (category can vary across editions); no cascade
    # specified in the spec, so deleting a category is left to fail/restrict by default.
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id"), nullable=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        timestamptz(), nullable=False, server_default=text("now()")
    )

    content: Mapped[Content] = relationship(back_populates="appearances")
    issue: Mapped[Issue] = relationship(back_populates="appearances")
    category: Mapped[Category | None] = relationship(back_populates="appearances")
