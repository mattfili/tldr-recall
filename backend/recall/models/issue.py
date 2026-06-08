"""``issues`` — one dated edition of a newsletter (spec §5.2)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from recall.models.base import Base, timestamptz, uuid_pk

if TYPE_CHECKING:
    from recall.models.appearance import ContentAppearance
    from recall.models.edition import Edition


class Issue(Base):
    __tablename__ = "issues"
    __table_args__ = (
        UniqueConstraint("edition_id", "issue_number", name="uq_issues_edition_number"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    edition_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("editions.id", ondelete="CASCADE"), nullable=False
    )
    issue_number: Mapped[str | None] = mapped_column(String, nullable=True)
    published_at: Mapped[date] = mapped_column(Date, nullable=False)
    subject: Mapped[str | None] = mapped_column(String, nullable=True)
    subtitle: Mapped[str | None] = mapped_column(String, nullable=True)
    source_kind: Mapped[str] = mapped_column(String, nullable=False)
    source_ref: Mapped[str] = mapped_column(String, nullable=False)
    raw_uri: Mapped[str | None] = mapped_column(String, nullable=True)
    ingested_at: Mapped[datetime] = mapped_column(
        timestamptz(), nullable=False, server_default=text("now()")
    )

    edition: Mapped[Edition] = relationship(back_populates="issues")
    appearances: Mapped[list[ContentAppearance]] = relationship(
        back_populates="issue", cascade="all, delete-orphan"
    )
