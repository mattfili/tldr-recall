"""Repository base.

The repositories package is the ONLY application code allowed to import ORM models or use
a Session (models/ and alembic/ aside). The seed job and the API call repositories — never
raw ORM.

Each repository wraps a single ``Session``. Repositories ``flush`` to allocate ids/defaults
but do NOT ``commit`` — the caller (seed job, request handler) owns the transaction boundary.
"""

from __future__ import annotations

from sqlalchemy.orm import Session


class Repository:
    """Holds a Session. Subclasses add table-specific create/upsert/get/count methods."""

    def __init__(self, session: Session) -> None:
        self.session = session
