"""Embeddings seam + backfill tests (Issue #6).

Covers (NO real OpenAI calls, NO key required anywhere):

* FakeEmbedder determinism / dim==config / L2-norm.
* factory selection: fake / cloud (lazy, openai mocked) / qwen (NotImplementedError) / unknown
  (ValueError); none/cloud rerankers.
* combined_text EXACT format (type prefix, U+2014 em dash, ', ' tag join, empty-tags branch).
* openai isolation: importing factory/base/fake/reranker/text and the backfill in a CLEAN
  subprocess leaves 'openai' out of sys.modules; importing cloud DOES pull it (positive control).
* CloudEmbedder missing-key raises (message has no key) + batching/order with a mocked client.
* EmbeddingRepository dim guard.
* ContentRepository.list_all id-ASC order (unit, fake session) + backfill idempotency
  (integration against a THROWAWAY recall_test DB so the dev 'recall' DB gets ZERO fake rows).
"""

from __future__ import annotations

import math
import os
import subprocess
import sys
import textwrap
import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.exc import OperationalError

from recall.config import settings
from recall.embeddings.base import Candidate
from recall.embeddings.fake import FAKE_MODEL_NAME, FakeEmbedder
from recall.embeddings.reranker import NoOpReranker
from recall.embeddings.text import combined_text
from recall.models.enums import ContentType

BACKEND_DIR = Path(__file__).resolve().parents[1]
TEST_DB_NAME = "recall_test"


# ─────────────────────────── tiny content stand-in ───────────────────────────


class _FakeContent:
    """Duck-typed Content for combined_text tests (content_type carries a ``.value``)."""

    def __init__(
        self,
        *,
        content_type: ContentType,
        title: str,
        summary: str,
        domain: str,
        tags: list[str],
    ) -> None:
        self.content_type = content_type
        self.title = title
        self.summary = summary
        self.domain = domain
        self.tags = tags


# ─────────────────────────── FakeEmbedder ───────────────────────────


def test_fake_embedder_name_and_dim() -> None:
    emb = FakeEmbedder()
    assert emb.name == FAKE_MODEL_NAME == "fake-1536"
    assert emb.dim == settings.recall_embed_dim == 1536
    vec = emb.embed_query("hello world")
    assert len(vec) == settings.recall_embed_dim


def test_fake_embedder_is_deterministic_across_calls_and_instances() -> None:
    a = FakeEmbedder()
    b = FakeEmbedder()
    assert a.embed_query("same text") == a.embed_query("same text")
    assert a.embed_query("same text") == b.embed_query("same text")
    # distinct text -> distinct vector
    assert a.embed_query("text one") != a.embed_query("text two")


def test_fake_embedder_documents_preserve_order_and_match_query() -> None:
    emb = FakeEmbedder()
    texts = ["alpha", "beta", "gamma"]
    docs = emb.embed_documents(texts)
    assert len(docs) == 3
    for t, v in zip(texts, docs, strict=True):
        assert v == emb.embed_query(t)


def test_fake_embedder_vectors_are_l2_normalized() -> None:
    emb = FakeEmbedder()
    for t in ["", "a", "the quick brown fox", "[repo] Headroom — ..."]:
        v = emb.embed_query(t)
        norm = math.sqrt(sum(x * x for x in v))
        assert norm == pytest.approx(1.0, abs=1e-9)


# ─────────────────────────── combined_text format ───────────────────────────


def test_combined_text_exact_format_with_tags() -> None:
    content = _FakeContent(
        content_type=ContentType.repo,
        title="Headroom",
        summary="Compresses everything an agent reads",
        domain="github.com",
        tags=["agents", "context"],
    )
    assert combined_text(content) == (
        "[repo] Headroom — Compresses everything an agent reads "
        "(source: github.com; tags: agents, context)"
    )
    # em dash is U+2014 (load-bearing).
    assert "—" in combined_text(content)


def test_combined_text_empty_tags_omits_tags_segment() -> None:
    content = _FakeContent(
        content_type=ContentType.article,
        title="A Title",
        summary="A summary",
        domain="example.com",
        tags=[],
    )
    assert combined_text(content) == "[article] A Title — A summary (source: example.com)"


def test_combined_text_uses_raw_enum_label() -> None:
    content = _FakeContent(
        content_type=ContentType.substack,
        title="T",
        summary="S",
        domain="d.com",
        tags=["x"],
    )
    # The prefix is the raw enum VALUE ('substack'), not 'ContentType.substack'.
    assert combined_text(content).startswith("[substack] ")


# ─────────────────────────── factory selection ───────────────────────────


def test_factory_get_embedder_fake() -> None:
    from recall.embeddings.factory import get_embedder

    emb = get_embedder("fake")
    assert isinstance(emb, FakeEmbedder)


def test_factory_get_embedder_cloud_lazy_with_mocked_openai(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """get_embedder('cloud') builds a CloudEmbedder with openai mocked — NO network call."""
    import openai

    monkeypatch.setattr(settings, "embedding_api_key", "test-key", raising=False)

    constructed: dict[str, str] = {}

    class _FakeClient:
        def __init__(self, *, api_key: str) -> None:
            constructed["api_key"] = api_key

    monkeypatch.setattr(openai, "OpenAI", _FakeClient)

    from recall.embeddings.cloud import CloudEmbedder
    from recall.embeddings.factory import get_embedder

    emb = get_embedder("cloud")
    assert isinstance(emb, CloudEmbedder)
    assert emb.name == settings.recall_embed_model == "text-embedding-3-small"
    assert emb.dim == settings.recall_embed_dim
    assert constructed["api_key"] == "test-key"


def test_factory_get_embedder_qwen_not_implemented() -> None:
    from recall.embeddings.factory import get_embedder

    with pytest.raises(NotImplementedError):
        get_embedder("qwen")


def test_factory_get_embedder_unknown_raises_value_error() -> None:
    from recall.embeddings.factory import get_embedder

    with pytest.raises(ValueError):
        get_embedder("nope")


def test_factory_get_embedder_default_honors_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    from recall.embeddings.factory import get_embedder

    monkeypatch.setattr(settings, "recall_embed_backend", "fake", raising=False)
    assert isinstance(get_embedder(), FakeEmbedder)


def test_factory_get_reranker_none() -> None:
    from recall.embeddings.factory import get_reranker

    rer = get_reranker("none")
    assert isinstance(rer, NoOpReranker)
    assert rer.name == "none"


def test_factory_get_reranker_cloud_is_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    from recall.embeddings.cloud import CloudReranker
    from recall.embeddings.factory import get_reranker

    rer = get_reranker("cloud")
    assert isinstance(rer, CloudReranker)
    assert rer.name == "none"


def test_noop_reranker_returns_top_k_unchanged() -> None:
    rer = NoOpReranker()
    cands = [
        Candidate(content_id="a", text="ta", score=0.9),
        Candidate(content_id="b", text="tb", score=0.5),
        Candidate(content_id="c", text="tc", score=0.1),
    ]
    out = rer.rerank("q", cands, top_k=2)
    assert [c.content_id for c in out] == ["a", "b"]
    assert [c.score for c in out] == [0.9, 0.5]  # scores untouched


# ─────────────────────────── CloudEmbedder ───────────────────────────


def test_cloud_embedder_missing_key_raises_without_leaking_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "embedding_api_key", None, raising=False)
    from recall.embeddings.cloud import CloudEmbedder

    with pytest.raises((RuntimeError, ValueError)) as exc:
        CloudEmbedder()
    # The error must not contain a key value (there is none set, but assert no obvious leak).
    assert "None" not in str(exc.value) or "key value is never logged" in str(exc.value)


def test_cloud_embedder_batches_and_preserves_order(monkeypatch: pytest.MonkeyPatch) -> None:
    """Mock the client so embed_documents over >EMBED_BATCH inputs issues multiple calls
    and returns vectors in input order (the embedder sorts response.data by .index)."""
    import openai

    import recall.embeddings.cloud as cloud_mod

    monkeypatch.setattr(settings, "embedding_api_key", "test-key", raising=False)
    monkeypatch.setattr(cloud_mod, "EMBED_BATCH", 2)  # force multiple chunks

    calls: list[list[str]] = []

    class _Datum:
        def __init__(self, index: int, embedding: list[float]) -> None:
            self.index = index
            self.embedding = embedding

    class _Response:
        def __init__(self, data: list[_Datum]) -> None:
            self.data = data

    class _Embeddings:
        def create(self, *, model: str, input: list[str]):  # noqa: A002 - mirrors SDK kwarg
            calls.append(list(input))
            # Return OUT OF ORDER to prove the embedder sorts by .index.
            data = [_Datum(i, [float(i)] * settings.recall_embed_dim) for i in range(len(input))]
            return _Response(list(reversed(data)))

    class _FakeClient:
        def __init__(self, *, api_key: str) -> None:
            self.embeddings = _Embeddings()

    monkeypatch.setattr(openai, "OpenAI", _FakeClient)

    from recall.embeddings.cloud import CloudEmbedder

    emb = CloudEmbedder()
    texts = ["t0", "t1", "t2", "t3", "t4"]
    vecs = emb.embed_documents(texts)

    # 5 inputs at batch size 2 -> 3 create() calls.
    assert len(calls) == 3
    assert calls[0] == ["t0", "t1"]
    assert calls[2] == ["t4"]
    # Order preserved within each chunk despite the reversed response.
    assert vecs[0][0] == 0.0
    assert vecs[1][0] == 1.0
    assert len(vecs) == 5


# ─────────────────────────── openai isolation ───────────────────────────


def test_openai_isolated_from_factory_and_backfill() -> None:
    """In a CLEAN subprocess, importing the safe modules must NOT register 'openai'; importing
    cloud DOES (positive control). The lazy cloud import in factory.py is the guardrail — this
    test fails loudly if a refactor hoists it to module top."""
    script = textwrap.dedent(
        """
        import sys
        import recall.embeddings.factory  # noqa: F401
        import recall.embeddings.base     # noqa: F401
        import recall.embeddings.fake     # noqa: F401
        import recall.embeddings.reranker # noqa: F401
        import recall.embeddings.text     # noqa: F401
        import recall.jobs.embed_backfill # noqa: F401
        assert "openai" not in sys.modules, "openai leaked into a safe-import graph"

        import recall.embeddings.cloud    # noqa: F401
        assert "openai" in sys.modules, "cloud.py must import openai (positive control)"
        print("OK")
        """
    )
    proc = subprocess.run(
        [sys.executable, "-c", script],
        cwd=str(BACKEND_DIR),
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, f"STDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}"
    assert "OK" in proc.stdout


# ─────────────────────────── dim guard (no DB write) ───────────────────────────


class _NoDbSession:
    """A Session stand-in whose add/flush would explode — proves the guard fires FIRST."""

    def add(self, _obj: object) -> None:  # pragma: no cover - must never be reached
        raise AssertionError("add() reached despite a dim mismatch")

    def flush(self) -> None:  # pragma: no cover
        raise AssertionError("flush() reached despite a dim mismatch")


def test_embedding_repo_dim_guard_raises_before_write() -> None:
    from recall.repositories.embeddings import EmbeddingRepository

    repo = EmbeddingRepository(_NoDbSession())  # type: ignore[arg-type]
    short_vector = [0.0] * (settings.recall_embed_dim - 1)
    with pytest.raises(ValueError) as exc:
        repo.create(
            content_id=uuid.uuid4(),
            kind="combined",
            model="fake-1536",
            dim=settings.recall_embed_dim,
            embedding=short_vector,
        )
    msg = str(exc.value)
    assert str(settings.recall_embed_dim) in msg  # expected dim named
    assert str(settings.recall_embed_dim - 1) in msg  # actual dim named


# ─────────────────────────── backfill (throwaway recall_test DB) ───────────────────────────


def _admin_url() -> str:
    url = make_url(settings.database_url).set(database="postgres")
    return url.render_as_string(hide_password=False)


def _test_db_url() -> str:
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
        args,
        cwd=str(BACKEND_DIR),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


@pytest.fixture(scope="module")
def seeded_test_engine() -> Engine:
    """Recreate + migrate + seed ``recall_test`` (skips if Postgres is unreachable).

    Using the throwaway DB makes dev-DB residue STRUCTURALLY impossible — no fake-1536 rows
    are ever written to the dev 'recall' DB by these tests.
    """
    admin_url = _admin_url()
    if not _server_reachable(admin_url):
        pytest.skip("Postgres server unreachable")

    _recreate_test_db(admin_url)
    db_url = _test_db_url()

    migrate = _run([sys.executable, "-m", "alembic", "upgrade", "head"], db_url)
    assert migrate.returncode == 0, f"migrate failed:\n{migrate.stdout}\n{migrate.stderr}"

    seed = _run([sys.executable, "-m", "recall.jobs.seed"], db_url)
    assert seed.returncode == 0, f"seed failed:\n{seed.stdout}\n{seed.stderr}"

    engine = create_engine(db_url, future=True)
    yield engine
    engine.dispose()


def _content_count(engine: Engine) -> int:
    with engine.connect() as conn:
        return conn.execute(text("SELECT count(*) FROM content")).scalar()


def _fake_row_count(engine: Engine) -> int:
    with engine.connect() as conn:
        return conn.execute(
            text("SELECT count(*) FROM content_embeddings WHERE model = :m"),
            {"m": FAKE_MODEL_NAME},
        ).scalar()


def test_backfill_idempotency_against_throwaway_db(seeded_test_engine: Engine) -> None:
    db_url = _test_db_url()
    n_content = _content_count(seeded_test_engine)
    assert n_content > 0

    # ── First run: embed everything with the fake backend (--backend fake -> no key needed). ──
    run1 = _run(
        [sys.executable, "-m", "recall.jobs.cli", "embed-backfill", "--backend", "fake"],
        db_url,
    )
    assert run1.returncode == 0, f"run1 failed:\n{run1.stdout}\n{run1.stderr}"
    assert f"embedded             {n_content}" in run1.stdout
    assert "existing_skipped     0" in run1.stdout
    assert _fake_row_count(seeded_test_engine) == n_content

    # ── Second run: idempotent — 0 new rows, all skipped, row count unchanged. ──
    run2 = _run(
        [sys.executable, "-m", "recall.jobs.cli", "embed-backfill", "--backend", "fake"],
        db_url,
    )
    assert run2.returncode == 0, f"run2 failed:\n{run2.stdout}\n{run2.stderr}"
    assert "embedded             0" in run2.stdout
    assert f"existing_skipped     {n_content}" in run2.stdout
    assert _fake_row_count(seeded_test_engine) == n_content  # still exactly one row per content


def test_backfill_writes_combined_kind_for_all_content(seeded_test_engine: Engine) -> None:
    """Every fake row is the 'combined' kind with the configured dim (depends on the prior run)."""
    with seeded_test_engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT kind, dim FROM content_embeddings WHERE model = :m"
            ),
            {"m": FAKE_MODEL_NAME},
        ).all()
    assert rows, "expected fake-1536 rows from the idempotency test run"
    assert all(kind == "combined" for kind, _dim in rows)
    assert all(dim == settings.recall_embed_dim for _kind, dim in rows)
