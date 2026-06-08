"""``ingest_runs`` — observability for the ETL (spec §5.2)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from recall.models.base import Base, timestamptz, uuid_pk


class IngestRun(Base):
    __tablename__ = "ingest_runs"

    id: Mapped[uuid.UUID] = uuid_pk()
    source_kind: Mapped[str] = mapped_column(String, nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        timestamptz(), nullable=False, server_default=text("now()")
    )
    finished_at: Mapped[datetime | None] = mapped_column(timestamptz(), nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False)  # running | ok | error
    issues_seen: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    content_upserted: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    error: Mapped[str | None] = mapped_column(String, nullable=True)
