"""Migration + seed integration test (Issue #2).

Against a FRESH ``recall_test`` database on the docker Postgres server:

1. drop-if-exists then create ``recall_test`` (AUTOCOMMIT — CREATE/DROP DATABASE cannot run
   inside a transaction),
2. run ``alembic upgrade head`` against it,
3. run the seed job against it,
4. assert structure (all §5.2 tables exist; the ``vector`` extension is enabled; the HNSW
   index is present on ``content_embeddings``) and row counts (DERIVED FROM the fixture
   file, never hardcoded), plus the category hue / sort rules and the stub user row.

Alembic and the seed are run in subprocesses with ``DATABASE_URL`` pointed at ``recall_test``
so the app's module-level settings singleton resolves to the test database. Assertions use
raw SQL (``text(...)``) — raw SQL is not ORM access, per the ORM-access discipline.

The test skips gracefully if the Postgres server is unreachable, but PASSES fully when the
docker Postgres is up.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from collections import Counter
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.exc import OperationalError

from recall.auth.stub import STUB_USER
from recall.config import settings

BACKEND_DIR = Path(__file__).resolve().parents[1]
FIXTURE_PATH = BACKEND_DIR / "tests" / "fixtures" / "recall_seed.json"

TEST_DB_NAME = "recall_test"

# Every table the schema must create (§5.2 + the M2 user_issue_state, ADR-0002).
EXPECTED_TABLES = {
    "editions",
    "issues",
    "categories",
    "content",
    "content_appearances",
    "content_embeddings",
    "users",
    "user_content_state",
    "user_issue_state",
    "collections",
    "ingest_runs",
}

HNSW_INDEX_NAME = "ix_content_embeddings_embedding_hnsw"


# ─────────────────────────── helpers ───────────────────────────


def _admin_url() -> str:
    """The configured URL re-pointed at the maintenance ``postgres`` database.

    Used (in AUTOCOMMIT) to DROP/CREATE the test database.
    """
    url = make_url(settings.database_url).set(database="postgres")
    return url.render_as_string(hide_password=False)


def _test_db_url() -> str:
    """The configured URL re-pointed at ``recall_test``."""
    url = make_url(settings.database_url).set(database=TEST_DB_NAME)
    return url.render_as_string(hide_password=False)


def _server_reachable(admin_url: str) -> bool:
    try:
        eng = create_engine(admin_url, isolation_level="AUTOCOMMIT")
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        eng.dispose()
        return True
    except OperationalError:
        return False
    except Exception:
        return False


def _recreate_test_db(admin_url: str) -> None:
    """Drop ``recall_test`` if it exists, then create it. Runs in AUTOCOMMIT."""
    eng = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    try:
        with eng.connect() as conn:
            # Terminate any stragglers so DROP DATABASE can proceed.
            conn.execute(
                text(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                    "WHERE datname = :name AND pid <> pg_backend_pid()"
                ),
                {"name": TEST_DB_NAME},
            )
            conn.execute(text(f'DROP DATABASE IF EXISTS "{TEST_DB_NAME}"'))
            conn.execute(text(f'CREATE DATABASE "{TEST_DB_NAME}"'))
    finally:
        eng.dispose()


def _run_subprocess(args: list[str], db_url: str) -> subprocess.CompletedProcess[str]:
    """Run a backend subprocess with ``DATABASE_URL`` pointed at the test DB."""
    env = dict(os.environ)
    env["DATABASE_URL"] = db_url
    return subprocess.run(
        args,
        cwd=str(BACKEND_DIR),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


# ─────────────────────────── fixtures ───────────────────────────


@pytest.fixture(scope="module")
def fixture_data() -> dict:
    with FIXTURE_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


@pytest.fixture(scope="module")
def seeded_engine(fixture_data: dict) -> Engine:
    """Recreate + migrate + seed ``recall_test``, yielding an engine bound to it.

    Skips the whole module if the Postgres server is unreachable.
    """
    admin_url = _admin_url()
    if not _server_reachable(admin_url):
        pytest.skip(
            f"Postgres server unreachable at {make_url(settings.database_url).set(password='***')}"
        )

    _recreate_test_db(admin_url)
    db_url = _test_db_url()

    migrate = _run_subprocess(
        [sys.executable, "-m", "alembic", "upgrade", "head"], db_url
    )
    assert migrate.returncode == 0, (
        f"alembic upgrade head failed:\nSTDOUT:\n{migrate.stdout}\nSTDERR:\n{migrate.stderr}"
    )

    seed = _run_subprocess(
        [sys.executable, "-m", "recall.jobs.seed"], db_url
    )
    assert seed.returncode == 0, (
        f"seed job failed:\nSTDOUT:\n{seed.stdout}\nSTDERR:\n{seed.stderr}"
    )

    engine = create_engine(db_url, future=True)
    yield engine
    engine.dispose()


# ─────────────────────────── structure ───────────────────────────


def test_all_tables_exist(seeded_engine: Engine) -> None:
    with seeded_engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public'"
            )
        ).scalars()
        present = set(rows)
    missing = EXPECTED_TABLES - present
    assert not missing, f"missing tables: {sorted(missing)}"


def test_vector_extension_enabled(seeded_engine: Engine) -> None:
    with seeded_engine.connect() as conn:
        enabled = conn.execute(
            text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")
        ).scalar()
    assert enabled == 1, "the 'vector' extension is not enabled"


def test_hnsw_index_present(seeded_engine: Engine) -> None:
    with seeded_engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT indexdef FROM pg_indexes "
                "WHERE tablename = 'content_embeddings' AND indexname = :name"
            ),
            {"name": HNSW_INDEX_NAME},
        ).scalar()
    assert row is not None, f"HNSW index {HNSW_INDEX_NAME} missing"
    assert "hnsw" in row.lower(), f"index is not HNSW: {row}"
    assert "vector_cosine_ops" in row, f"index is not cosine ops: {row}"


# ─────────────────────────── row counts (derived from fixture) ───────────────────────────


def _count(conn, table: str) -> int:
    return conn.execute(text(f"SELECT count(*) FROM {table}")).scalar()


def test_row_counts_match_fixture(seeded_engine: Engine, fixture_data: dict) -> None:
    items = fixture_data["ITEMS"]
    expected_content = len(items)
    expected_appearances = len(items)
    expected_editions = len(fixture_data["ED"])
    expected_categories = len(fixture_data["CATS"])
    expected_issues = len(fixture_data["ED_META"])
    expected_collections = len(fixture_data["COLLECTIONS"])
    # user_content_state is STARRED-ONLY (ADR-0002); read/unread is per-Issue now.
    expected_state = sum(1 for it in items if it.get("starred"))

    with seeded_engine.connect() as conn:
        assert _count(conn, "content") == expected_content
        assert _count(conn, "content_appearances") == expected_appearances
        assert _count(conn, "editions") == expected_editions
        assert _count(conn, "categories") == expected_categories
        assert _count(conn, "issues") == expected_issues
        assert _count(conn, "collections") == expected_collections
        assert _count(conn, "user_content_state") == expected_state
        # user_issue_state is seeded EMPTY (mark-on-view is client-fired at runtime).
        assert _count(conn, "user_issue_state") == 0
        # embeddings intentionally empty (land in #6).
        assert _count(conn, "content_embeddings") == 0
        # exactly one stub user.
        assert _count(conn, "users") == 1


# ─────────────────────────── category hue / sort rules ───────────────────────────


def test_category_hue_is_verbatim(seeded_engine: Engine, fixture_data: dict) -> None:
    cats = fixture_data["CATS"]
    with seeded_engine.connect() as conn:
        rows = conn.execute(text("SELECT slug, hue FROM categories")).all()
    hue_by_slug = {slug: hue for slug, hue in rows}

    for slug, meta in cats.items():
        assert hue_by_slug[slug] == meta["v"], (
            f"hue for {slug} should be verbatim {meta['v']!r}, got {hue_by_slug[slug]!r}"
        )

    # Explicit reused-hue checks (CONTRACT): headlines -> strategy hue, eng -> ai hue.
    assert hue_by_slug["headlines"] == "var(--c-strategy)"
    assert hue_by_slug["eng"] == "var(--c-ai)"


def test_category_sort_follows_cat_order(seeded_engine: Engine, fixture_data: dict) -> None:
    cat_order = fixture_data["CAT_ORDER"]
    with seeded_engine.connect() as conn:
        rows = conn.execute(text("SELECT slug, sort FROM categories")).all()
    sort_by_slug = {slug: sort for slug, sort in rows}
    for slug in fixture_data["CATS"]:
        assert sort_by_slug[slug] == cat_order.index(slug), (
            f"sort for {slug} should be its CAT_ORDER index {cat_order.index(slug)}, "
            f"got {sort_by_slug[slug]}"
        )


# ─────────────────────────── stub user identity ───────────────────────────


def test_stub_user_row_exists(seeded_engine: Engine) -> None:
    with seeded_engine.connect() as conn:
        row = conn.execute(
            text("SELECT id FROM users WHERE id = :id"),
            {"id": STUB_USER.id},
        ).scalar()
    assert str(row) == STUB_USER.id, (
        f"stub user row with id {STUB_USER.id} should exist; got {row!r}"
    )


# ─────────────────────────── appearance integrity (extra confidence) ───────────────────────────


def test_appearance_positions_are_per_edition(seeded_engine: Engine, fixture_data: dict) -> None:
    """Positions are 0-based and contiguous within each edition's single issue."""
    per_edition = Counter(it["ed"] for it in fixture_data["ITEMS"])
    with seeded_engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT i.source_ref AS edition_key, ca.position "
                "FROM content_appearances ca JOIN issues i ON i.id = ca.issue_id"
            )
        ).all()
    positions_by_edition: dict[str, list[int]] = {}
    for edition_key, position in rows:
        positions_by_edition.setdefault(edition_key, []).append(position)
    for edition_key, count in per_edition.items():
        positions = sorted(positions_by_edition[edition_key])
        assert positions == list(range(count)), (
            f"edition {edition_key} positions should be 0..{count - 1}, got {positions}"
        )
