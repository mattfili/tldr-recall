"""Session-level test-database wiring (issue #38).

The local dev database (``recall``) holds the REAL ingested corpus, while the test
suite asserts seed-shaped data. This conftest points the suite at a dedicated,
automatically provisioned database so `uv run pytest` is self-sufficient locally and
the dev corpus is never touched.

Decision contract (evaluated once, at import time):

- ``RECALL_PYTEST_DB=<name>`` in the environment: use that database name on the
  configured Postgres server and provision it. Explicit override; wins over CI.
- ``CI=true`` (GitHub Actions sets this): complete no-op. CI provisions and seeds its
  own service DB and exports DATABASE_URL before pytest — we pass it through untouched.
- Otherwise (local dev): use ``recall_pytest`` on the same server as the configured
  DATABASE_URL. The name is deliberately NOT ``recall_test`` — test_embeddings.py and
  test_search_hybrid.py drop+recreate that throwaway DB themselves.

Provisioning (local path): create the DB if missing, then ``alembic upgrade head`` and
the seed job via subprocesses (keeping this module free of ``recall.*`` imports). The
DB is REUSED across sessions — safe because the seed is an idempotent natural-key
upsert and the saves/issue-read contract tests restore the state they mutate — so
repeat runs are fast and rerun-safe.

Import-order assumption (load-bearing): pytest imports this conftest BEFORE any test
module, and ``recall.config`` builds its ``settings`` singleton at import time with
real env vars taking precedence over the repo-root .env. Setting
``os.environ["DATABASE_URL"]`` at module top level here therefore rewires the entire
suite. No installed pytest plugin imports ``recall`` earlier (dev deps are only
pytest + ruff). Consequently this module must not import ``recall.*`` itself.

The env var is set even when Postgres is unreachable or provisioning is skipped:
the suite then skips/fails against the pytest DB (same friendly per-module skip
behavior as before), and writing to the dev corpus DB is structurally impossible.
This also means test_search_hybrid's leak-guard (zero ``fake-%`` rows in the
CONFIGURED engine) now guards ``recall_pytest`` — which is the correct semantics.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

BACKEND_DIR = Path(__file__).resolve().parents[1]
_ENV_FILE = BACKEND_DIR.parent / ".env"
_DEFAULT_DB_URL = "postgresql+psycopg://recall:recall@localhost:5432/recall"
PYTEST_DB_NAME = "recall_pytest"  # NOT "recall_test" (owned by test_embeddings et al.)


def _base_database_url() -> str:
    """Configured DATABASE_URL without importing recall.config (which freezes settings)."""
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    if _ENV_FILE.exists():
        for line in _ENV_FILE.read_text().splitlines():
            m = re.match(r"\s*DATABASE_URL\s*=\s*(\S+)", line)
            if m:
                return m.group(1)
    return _DEFAULT_DB_URL


def _server_reachable(admin_url: str) -> bool:
    try:
        eng = create_engine(admin_url, isolation_level="AUTOCOMMIT")
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        eng.dispose()
        return True
    except Exception:
        return False


def _create_db_if_missing(admin_url: str, name: str) -> None:
    eng = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    try:
        with eng.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": name}
            ).scalar()
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{name}"'))
    finally:
        eng.dispose()


def _run(args: list[str], db_url: str) -> subprocess.CompletedProcess[str]:
    env = dict(os.environ)
    env["DATABASE_URL"] = db_url
    return subprocess.run(
        args, cwd=str(BACKEND_DIR), env=env, capture_output=True, text=True, check=False
    )


def _provision(db_url: str) -> None:
    """Migrate + seed the pytest DB; fail loudly rather than cascade 100 test failures."""
    for label, args in (
        ("alembic upgrade head", [sys.executable, "-m", "alembic", "upgrade", "head"]),
        ("seed", [sys.executable, "-m", "recall.jobs.seed"]),
    ):
        proc = _run(args, db_url)
        if proc.returncode != 0:
            raise pytest.UsageError(
                f"pytest DB provisioning step '{label}' failed "
                f"(DATABASE_URL={db_url}):\n{proc.stdout}\n{proc.stderr}"
            )


def _wire_pytest_db() -> None:
    override = os.environ.get("RECALL_PYTEST_DB")
    if not override and os.environ.get("CI", "").lower() == "true":
        return  # CI provides a migrated+seeded DB via DATABASE_URL — pass through untouched.

    db_name = override or PYTEST_DB_NAME
    base = make_url(_base_database_url())
    pytest_url = base.set(database=db_name).render_as_string(hide_password=False)

    # Set FIRST, unconditionally: even if Postgres is down, the suite must resolve to the
    # pytest DB (modules then skip with their existing "Postgres server unreachable" idiom).
    os.environ["DATABASE_URL"] = pytest_url

    admin_url = base.set(database="postgres").render_as_string(hide_password=False)
    if not _server_reachable(admin_url):
        return

    _create_db_if_missing(admin_url, db_name)
    _provision(pytest_url)


_wire_pytest_db()
