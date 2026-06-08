"""Database engine, session, and connection helpers.

SQLAlchemy 2.0. No ORM models are defined here — those land in #2. This module only
provides the engine, a session factory, the ``get_db`` dependency, and ``ping`` for the
health check.
"""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from recall.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


@event.listens_for(engine, "connect")
def _register_pgvector(dbapi_connection, connection_record):  # noqa: ANN001
    """Attempt pgvector type registration on each new DBAPI connection.

    GUARDED in try/except so the app still boots before the ``vector`` extension exists
    or before migrations have run. Full Vector column support lands in #2.
    """
    try:
        from pgvector.psycopg import register_vector

        register_vector(dbapi_connection)
    except Exception:
        # Extension/types not present yet (pre-migration), or driver mismatch. Ignore so
        # the connection is still usable for plain SQL (e.g. the SELECT 1 health check).
        pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ping() -> bool:
    """Run ``SELECT 1`` against the configured database.

    Returns True on success; raises on failure (callers decide how to report it).
    """
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return True
