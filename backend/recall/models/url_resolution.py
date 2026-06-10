"""``url_resolutions`` — raw-URL -> resolved-URL cache (spec §6.4, issue #23).

One row per distinct raw (tracking) URL, success OR failure. The cache is etiquette,
not just speed: each network resolution registers as a click in TLDR's analytics, so
every distinct link is fetched at most once EVER (grilled 2026-06-10). ``ok=False``
rows pin a degraded resolution (resolved_url == raw_url) but keep the door open for a
future retry job without a schema change.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from recall.models.base import Base, timestamptz, uuid_pk


class UrlResolution(Base):
    __tablename__ = "url_resolutions"
    __table_args__ = (UniqueConstraint("raw_url", name="uq_url_resolutions_raw_url"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    raw_url: Mapped[str] = mapped_column(String, nullable=False)
    resolved_url: Mapped[str] = mapped_column(String, nullable=False)
    domain: Mapped[str | None] = mapped_column(String, nullable=True)
    ok: Mapped[bool] = mapped_column(Boolean, nullable=False)
    resolved_at: Mapped[datetime] = mapped_column(
        timestamptz(), nullable=False, server_default=text("now()")
    )
