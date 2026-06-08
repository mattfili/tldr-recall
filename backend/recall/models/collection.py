"""``collections`` — smart/AI-formed collections (data.js COLLECTIONS) (spec §5.2).

Seeded: slug<-id, label<-label, query<-q, hue<-v VERBATIM, is_smart=true, user_id=null.
data.js ``count`` is IGNORED (resolved live via search).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, String, text
from sqlalchemy.orm import Mapped, mapped_column

from recall.models.base import Base, timestamptz, uuid_pk


class Collection(Base):
    __tablename__ = "collections"

    id: Mapped[uuid.UUID] = uuid_pk()
    # §5.2 does not mark this FK ON DELETE CASCADE. null = global/seeded collection.
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    slug: Mapped[str] = mapped_column(String, nullable=False)
    label: Mapped[str] = mapped_column(String, nullable=False)
    query: Mapped[str] = mapped_column(String, nullable=False)
    hue: Mapped[str] = mapped_column(String, nullable=False)
    is_smart: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(
        timestamptz(), nullable=False, server_default=text("now()")
    )
