"""``user_content_state`` — per-reader bookmarking + read state, keyed on Content (§5.2).

A row exists after the first star OR read. ``starred`` default false; read-state independent
of saving.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from recall.models.base import Base, timestamptz, uuid_pk
from recall.models.enums import ReadState, read_state_enum

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
    read_state: Mapped[ReadState] = mapped_column(
        read_state_enum, nullable=False, server_default=text("'unread'")
    )
    updated_at: Mapped[datetime] = mapped_column(
        timestamptz(), nullable=False, server_default=text("now()")
    )

    user: Mapped[User] = relationship(back_populates="content_states")
    content: Mapped[Content] = relationship(back_populates="user_states")
