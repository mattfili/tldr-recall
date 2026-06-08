"""``editions`` — the newsletter sub-brands (spec §5.2)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from recall.models.base import Base, timestamptz, uuid_pk

if TYPE_CHECKING:
    from recall.models.issue import Issue


class Edition(Base):
    __tablename__ = "editions"

    id: Mapped[uuid.UUID] = uuid_pk()
    # edition key is TEXT (extensible — NOT an enum): 'tldr' | 'ai' | 'founders' | ...
    key: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    sender_email: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        timestamptz(), nullable=False, server_default=text("now()")
    )

    issues: Mapped[list[Issue]] = relationship(
        back_populates="edition", cascade="all, delete-orphan"
    )
