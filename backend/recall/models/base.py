"""Declarative base + shared column helpers for all ORM models.

SQLAlchemy 2.0 typed mapped classes. ``Base.metadata`` is what Alembic targets.

ORM-access discipline (CONTRACT): only ``recall.models`` and ``recall.repositories``
(plus ``recall.alembic``) may import these models or open a Session. Application code
and the seed job go through repositories.
"""

from __future__ import annotations

import uuid

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, mapped_column
from sqlalchemy.types import DateTime


class Base(DeclarativeBase):
    """Shared declarative base. Expose ``Base.metadata`` to Alembic."""


def uuid_pk():
    """UUID primary key column with a server-side ``gen_random_uuid()`` default.

    A Python-side ``uuid4`` default is also set so freshly-created objects carry an id
    before flush (useful for the seed job, which links rows before commit).
    """
    return mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
        default=uuid.uuid4,
    )


def timestamptz():
    """timestamptz column type (with timezone)."""
    return DateTime(timezone=True)
