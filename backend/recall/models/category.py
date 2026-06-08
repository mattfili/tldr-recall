"""``categories`` (spec §5.2).

``hue`` is copied VERBATIM from data.js ``v`` (the full string e.g. 'var(--c-bigtech)').
NEVER derived as 'var(--c-${slug})'. ``sort`` is the slug's index in CAT_ORDER.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from recall.models.base import Base, uuid_pk

if TYPE_CHECKING:
    from recall.models.appearance import ContentAppearance


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = uuid_pk()
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    label: Mapped[str] = mapped_column(String, nullable=False)
    hue: Mapped[str] = mapped_column(String, nullable=False)
    sort: Mapped[int] = mapped_column(Integer, nullable=False)

    appearances: Mapped[list[ContentAppearance]] = relationship(back_populates="category")
