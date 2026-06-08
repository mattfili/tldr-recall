"""``users`` — stub; one seeded row in v1 (spec §5.2, §11)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from recall.models.base import Base, timestamptz, uuid_pk

if TYPE_CHECKING:
    from recall.models.user_content_state import UserContentState


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    display_name: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        timestamptz(), nullable=False, server_default=text("now()")
    )

    content_states: Mapped[list[UserContentState]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
