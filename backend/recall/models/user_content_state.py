"""``user_content_state`` — per-reader Save/Star, keyed on Content (§5.2, ADR-0002).

A row exists after the first star. It now carries ``starred`` ONLY — read/unread is a
per-(reader, ISSUE) fact (see ``user_issue_state``, ADR-0002), never a Content property.
``starred`` default false; a DELETE /saves soft-upserts ``starred=false`` (the row is kept).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from recall.models.base import Base, timestamptz, uuid_pk

if TYPE_CHECKING:
    from recall.models.content import Content
    from recall.models.user import User


class UserContentState(Base):
    __tablename__ = "user_content_state"
    __table_args__ = (
        UniqueConstraint("user_id", "content_id", name="uq_user_content_state_user_content"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    # §5.2 does not mark these FKs ON DELETE CASCADE, so they restrict by default.
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    content_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("content.id"), nullable=False)
    starred: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    updated_at: Mapped[datetime] = mapped_column(
        timestamptz(), nullable=False, server_default=text("now()")
    )

    user: Mapped[User] = relationship(back_populates="content_states")
    content: Mapped[Content] = relationship(back_populates="user_states")
