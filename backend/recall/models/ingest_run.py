"""``ingest_runs`` — observability for the ETL (spec §5.2, widened in #26/0005).

One row per ``recall ingest`` run: source kind, the ``--since`` window, status
(running | ok | error), and created/skipped counters for issues, content, and
appearances. The legacy ``issues_seen`` / ``content_upserted`` columns (0001) are kept
and filled as derived totals.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, Integer, String, text
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
    since: Mapped[date | None] = mapped_column(Date, nullable=True)
    issues_created: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    issues_skipped: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    content_created: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    content_skipped: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    appearances_created: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    appearances_skipped: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    # Legacy totals from 0001 — filled as derived values (seen = created + skipped;
    # upserted = content_created) so nothing reading them breaks.
    issues_seen: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    content_upserted: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    error: Mapped[str | None] = mapped_column(String, nullable=True)
