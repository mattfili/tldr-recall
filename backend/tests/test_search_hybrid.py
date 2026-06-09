"""Hybrid (two-arm) search contract test via the deterministic FakeEmbedder (#7).

Runs against a THROWAWAY ``recall_test`` DB (recreated + migrated + seeded), mirroring
``test_embeddings.py``'s ``seeded_test_engine`` idiom — so the dev ``recall`` DB and its 44 REAL
``text-embedding-3-small`` vectors are NEVER touched and ZERO fake rows are left behind.

The vector arm is exercised ONLY through the FakeEmbedder (backend='fake' -> active model
``fake-<dim>``). We backfill fake vectors into the throwaway DB so ``active_model_name('fake')``
has rows, force ``settings.recall_embed_backend='fake'``, run a query, and assert: hits carry a
``vector_rank``, both arms contribute to at least one hit (lexical_rank AND vector_rank), the
fused score combines the arms, and ordering is deterministic. NEVER embeds a real query against
``text-embedding-3-small``.
"""

from __future__ import annotations

import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker

from recall.auth.stub import STUB_USER
from recall.config import settings
from recall.embeddings.factory import active_model_name
from recall.schemas.search import SearchRequest

BACKEND_DIR = Path(__file__).resolve().parents[1]
TEST_DB_NAME = "recall_test"


def _admin_url() -> str:
    return make_url(settings.database_url).set(database="postgres").render_as_string(
        hide_password=False
    )


def _test_db_url() -> str:
    return make_url(settings.database_url).set(database=TEST_DB_NAME).render_as_string(
        hide_password=False
    )


def _server_reachable(admin_url: str) -> bool:
    try:
        eng = create_engine(admin_url, isolation_level="AUTOCOMMIT")
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        eng.dispose()
        return True
    except (OperationalError, Exception):
        return False


def _recreate_test_db(admin_url: str) -> None:
    eng = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    try:
        with eng.connect() as conn:
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


def _run(args: list[str], db_url: str) -> subprocess.CompletedProcess[str]:
    env = dict(os.environ)
    env["DATABASE_URL"] = db_url
    return subprocess.run(
        args, cwd=str(BACKEND_DIR), env=env, capture_output=True, text=True, check=False
    )


@pytest.fixture(scope="module")
def hybrid_engine() -> Engine:
    """Recreate + migrate + seed + FAKE-backfill ``recall_test`` (skips if PG unreachable)."""
    admin_url = _admin_url()
    if not _server_reachable(admin_url):
        pytest.skip("Postgres server unreachable")

    _recreate_test_db(admin_url)
    db_url = _test_db_url()

    migrate = _run([sys.executable, "-m", "alembic", "upgrade", "head"], db_url)
    assert migrate.returncode == 0, f"migrate failed:\n{migrate.stdout}\n{migrate.stderr}"
    seed = _run([sys.executable, "-m", "recall.jobs.seed"], db_url)
    assert seed.returncode == 0, f"seed failed:\n{seed.stdout}\n{seed.stderr}"
    # Backfill FAKE vectors so active_model_name('fake') == f'fake-{dim}' has rows.
    backfill = _run(
        [sys.executable, "-m", "recall.jobs.cli", "embed-backfill", "--backend", "fake"],
        db_url,
    )
    assert backfill.returncode == 0, f"backfill failed:\n{backfill.stdout}\n{backfill.stderr}"

    engine = create_engine(db_url, future=True)
    yield engine
    engine.dispose()


def _fake_row_count(engine: Engine) -> int:
    with engine.connect() as conn:
        return conn.execute(
            text("SELECT count(*) FROM content_embeddings WHERE model LIKE 'fake-%'")
        ).scalar()


def test_hybrid_search_runs_both_arms_via_fake_embedder(
    hybrid_engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Sanity: the fake backfill populated the active fake model's rows.
    assert _fake_row_count(hybrid_engine) > 0
    assert active_model_name("fake") == f"fake-{settings.recall_embed_dim}"

    # Force the service onto the FAKE backend (active model -> fake-<dim>, which has rows). The
    # FakeEmbedder is key-free + deterministic, so embed_query() succeeds without any real call.
    monkeypatch.setattr(settings, "recall_embed_backend", "fake", raising=False)

    import recall.search.service as service

    SessionTest = sessionmaker(bind=hybrid_engine, future=True)
    session: Session = SessionTest()
    try:
        uid = uuid.UUID(STUB_USER.id)
        resp = service.search(
            session, user_id=uid, request=SearchRequest(query="agents", limit=50)
        )
    finally:
        session.close()

    assert resp.total >= 1
    # NOT degraded: the active fake model has rows, the fake embedder embeds the topic, the
    # vector arm runs. At least one hit must carry a vector_rank.
    assert any(h.match_explanation.vector_rank is not None for h in resp.items)
    # No hit should be flagged degraded in the hybrid run.
    assert all(h.match_explanation.degraded is None for h in resp.items)

    # Both arms contribute to at least one hit (lexical AND vector ranks present).
    both = [
        h
        for h in resp.items
        if h.match_explanation.lexical_rank is not None
        and h.match_explanation.vector_rank is not None
    ]
    assert both, "expected at least one hit surfaced by BOTH arms"
    # The fused score for a both-arms hit combines the two arm contributions (> a single arm's).
    sample = both[0]
    k = settings.recall_search_rrf_k
    assert sample.match_explanation.fused_score > 1.0 / (k + 1)
    assert "vector" in sample.match_explanation.matched_via
    assert "lexical" in sample.match_explanation.matched_via

    # Deterministic ordering: a second identical run returns the same id order (FakeEmbedder is
    # hash-stable, so the vector arm is reproducible).
    session2: Session = SessionTest()
    try:
        resp2 = service.search(
            session2, user_id=uuid.UUID(STUB_USER.id),
            request=SearchRequest(query="agents", limit=50),
        )
    finally:
        session2.close()
    assert [h.id for h in resp.items] == [h.id for h in resp2.items]


def test_dev_db_has_no_fake_rows_after_hybrid_run() -> None:
    """The dev 'recall' DB must carry ZERO fake rows (the throwaway DB isolates them) and keep
    its 44 real text-embedding-3-small rows untouched."""
    from recall.db import engine as dev_engine

    with dev_engine.connect() as conn:
        fakes = conn.execute(
            text("SELECT count(*) FROM content_embeddings WHERE model LIKE 'fake-%'")
        ).scalar()
        reals = conn.execute(
            text("SELECT count(*) FROM content_embeddings WHERE model = 'text-embedding-3-small'")
        ).scalar()
    assert fakes == 0
    assert reals == 44
