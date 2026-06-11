"""Pipeline + ``recall ingest`` tests (spec §6.1/§6.6, issue #26). NO network anywhere.

Fixture strategy mirrors test_parser.py: synthetic TLDR-shaped ``.eml`` built at runtime
in ``tmp_path`` (``*.eml`` is gitignored repo-wide). Every article href is a
CL0-decodable tracking URL, so ``resolve_url`` never opens a connection; where
``ingest_session`` is called directly an exploding/counting client is injected anyway
(test_resolve.py pattern). Destination URLs are uuid-suffixed so content hashes never
collide with whatever the dev DB holds.

Two DB disciplines, both order-independent, NEITHER mutating the default DB:

* rollback-only sessions on DATABASE_URL (test_resolve.py pattern) asserting BEFORE/AFTER
  deltas — seed rows coexist untouched; skips when Postgres is down.
* a throwaway ``recall_ingest_test`` database driven via subprocesses with DATABASE_URL
  repointed (test_migration_seed.py pattern) for the destructive ``--replace`` path,
  including proof that a CI-style ``recall seed`` still works post-wipe.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import subprocess
import sys
import uuid
from datetime import date
from email.message import EmailMessage
from pathlib import Path
from urllib.parse import quote

import httpx
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from recall.config import settings
from recall.ingestion.gmail_export import GmailExportSource
from recall.ingestion.pipeline import ingest_session, normalize_url
from recall.repositories import (
    AppearanceRepository,
    CategoryRepository,
    ContentRepository,
    EditionRepository,
    IngestRunRepository,
    IssueRepository,
)

BACKEND_DIR = Path(__file__).resolve().parents[1]
FIXTURE_PATH = BACKEND_DIR / "tests" / "fixtures" / "recall_seed.json"


# ─────────────────────────── synthetic .eml builders ───────────────────────────


def _cl0(dest: str) -> str:
    """A TLDR-style tracking link that decodes to ``dest`` with ZERO network calls."""
    return f"https://tracking.tldrnewsletter.com/CL0/{quote(dest, safe='')}/1/abc"


def _write_eml(
    directory: Path,
    name: str,
    *,
    from_: str,
    date_header: str,
    sections: list[tuple[str, list[tuple[str, str, str]]]],
    subject: str = "Test issue subject",
) -> Path:
    """One synthetic TLDR-shaped .eml: masthead + sections of (title, href, summary)."""
    tables = []
    for header, articles in sections:
        rows = [f"<tr><td><strong>{header}</strong></td></tr>"]
        for title, href, summary in articles:
            rows.append(f'<tr><td><a href="{href}"><strong>{title}</strong></a></td></tr>')
            rows.append(f"<tr><td>{summary}</td></tr>")
        tables.append("<table>" + "".join(rows) + "</table>")
    html = (
        "<html><body>"
        "<table><tr><td><strong>TLDR 2026-06-08</strong></td></tr>"
        "<tr><td>A subtitle dek.</td></tr></table>"
        + "".join(tables)
        + '<table><tr><td><a href="https://a.tldrnewsletter.com/unsub">Unsubscribe</a>'
        "</td></tr></table></body></html>"
    )
    msg = EmailMessage()
    msg["From"] = from_
    msg["Subject"] = subject
    msg["Date"] = date_header
    msg["Message-ID"] = f"<{name}@tldrnewsletter.com>"
    msg.set_content("plain-text fallback body")
    msg.add_alternative(html, subtype="html")
    path = directory / name
    path.write_bytes(msg.as_bytes())
    return path


def _two_edition_corpus(directory: Path) -> dict[str, str]:
    """Two .eml from DIFFERENT editions sharing ONE article link (3 distinct links)."""
    suffix = uuid.uuid4()
    shared = f"https://example.com/shared/{suffix}"
    solo_a = f"https://example.com/solo-a/{suffix}"
    solo_b = f"https://example.com/solo-b/{suffix}"
    _write_eml(
        directory,
        "01-ai.eml",
        from_="TLDR AI <dan@tldrnewsletter.com>",
        date_header="Mon, 08 Jun 2026 10:30:00 -0400",
        sections=[
            (
                "🚀 Headlines & Launches",
                [
                    ("Robots Learn To Dream (5 minute read)", _cl0(shared), "First-seen sum."),
                    ("Solo Story A (3 minute read)", _cl0(solo_a), "Summary of solo A."),
                ],
            )
        ],
    )
    _write_eml(
        directory,
        "02-founders.eml",
        from_="TLDR Founders <dan@tldrnewsletter.com>",
        date_header="Tue, 09 Jun 2026 10:30:00 -0400",
        sections=[
            (
                "Strategies & Tactics",
                [
                    ("A Different Title (4 minute read)", _cl0(shared), "Second-sight sum."),
                    ("Solo Story B (2 minute read)", _cl0(solo_b), "Summary of solo B."),
                ],
            )
        ],
    )
    return {"shared": shared, "solo_a": solo_a, "solo_b": solo_b}


def _exploding_client() -> httpx.Client:
    """A client whose transport fails the test if ANY request is issued."""

    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError(f"unexpected HTTP request: {request.method} {request.url}")

    return httpx.Client(transport=httpx.MockTransport(handler))


class _CountingConnectErrorTransport(httpx.MockTransport):
    """Counts requests; every one fails with ConnectError (the degraded-resolution path)."""

    def __init__(self) -> None:
        super().__init__(self._handler)
        self.calls = 0

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        self.calls += 1
        return super().handle_request(request)

    @staticmethod
    def _handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("nope", request=request)


def _sha256(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


# ─────────────────────────── normalize_url (pure) ───────────────────────────


def test_normalize_url_lowercases_and_strips_tracking() -> None:
    assert (
        normalize_url("HTTPS://Example.COM:443/Path/Story?utm_source=tldr&q=1&fbclid=x#frag")
        == "https://example.com/Path/Story?q=1"
    )


def test_normalize_url_keeps_real_params_and_nondefault_port() -> None:
    assert (
        normalize_url("http://example.com:8080/a?b=2&a=1")
        == "http://example.com:8080/a?b=2&a=1"
    )


# ─────────────────────────── rollback-only session fixture ───────────────────────────


@pytest.fixture()
def db_session() -> Session:
    """Rollback-only session on the default DATABASE_URL; skips when Postgres is down."""
    from recall.db import engine

    try:
        connection = engine.connect()
    except OperationalError:
        pytest.skip("Postgres server unreachable")
    transaction = connection.begin()
    session = Session(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


# ─────────────────────────── E2E dedupe + first-seen-wins ───────────────────────────


def test_shared_link_across_editions_is_one_content_two_appearances(
    db_session: Session, tmp_path: Path
) -> None:
    urls = _two_edition_corpus(tmp_path)
    content_repo = ContentRepository(db_session)
    appearances_repo = AppearanceRepository(db_session)
    issues_repo = IssueRepository(db_session)

    content_before = content_repo.count()
    appearances_before = appearances_repo.count()
    issues_before = issues_repo.count()

    with _exploding_client() as client:
        counts = ingest_session(
            db_session, GmailExportSource(tmp_path), since=None, http_client=client
        )

    assert counts["issues_created"] == 2
    assert counts["content_created"] == 3  # 3 distinct links
    assert counts["content_skipped"] == 1  # the shared link's second sighting
    assert counts["appearances_created"] == 4
    assert counts["appearances_skipped"] == 0

    assert content_repo.count() == content_before + 3
    assert appearances_repo.count() == appearances_before + 4
    assert issues_repo.count() == issues_before + 2

    shared = content_repo.get_by_hash(_sha256(normalize_url(urls["shared"])))
    assert shared is not None
    # FIRST-SEEN-WINS: editorial text comes from 01-ai.eml, never the Founders re-sight.
    assert shared.title == "Robots Learn To Dream"
    assert shared.summary == "First-seen sum."
    assert shared.read_minutes == 5
    assert shared.url == urls["shared"]

    sightings = appearances_repo.list_for_content(shared.id)
    assert len(sightings) == 2
    assert {a.issue.edition.key for a in sightings} == {"ai", "founders"}
    categories = {a.category.slug for a in sightings}
    assert categories == {"headlines", "strategy"}  # different categories per edition

    run = IngestRunRepository(db_session).latest()
    assert run is not None
    assert run.status == "ok"
    assert run.source_kind == "gmail"
    assert run.finished_at is not None
    assert (run.issues_created, run.content_created, run.appearances_created) == (2, 3, 4)
    assert run.issues_seen == 2 and run.content_upserted == 3  # legacy derived totals


# ─────────────────────────── idempotency ───────────────────────────


def test_rerun_is_idempotent_and_reports_skips(db_session: Session, tmp_path: Path) -> None:
    _two_edition_corpus(tmp_path)
    content_repo = ContentRepository(db_session)
    appearances_repo = AppearanceRepository(db_session)
    issues_repo = IssueRepository(db_session)
    source = GmailExportSource(tmp_path)

    with _exploding_client() as client:
        ingest_session(db_session, source, since=None, http_client=client)
        after_first = (content_repo.count(), appearances_repo.count(), issues_repo.count())
        second = ingest_session(db_session, source, since=None, http_client=client)

    assert (content_repo.count(), appearances_repo.count(), issues_repo.count()) == after_first
    assert second["issues_created"] == 0 and second["issues_skipped"] == 2
    assert second["content_created"] == 0 and second["content_skipped"] == 4
    assert second["appearances_created"] == 0 and second["appearances_skipped"] == 4


# ─────────────────────────── unknown edition auto-create ───────────────────────────


def test_unknown_edition_auto_creates_and_keeps_seeded_names(
    db_session: Session, tmp_path: Path
) -> None:
    _write_eml(
        tmp_path,
        "quantum.eml",
        from_="TLDR Quantum <dan@tldrnewsletter.com>",
        date_header="Mon, 08 Jun 2026 09:00:00 -0400",
        sections=[
            (
                "🚀 Headlines & Launches",
                [("Qubits (1 minute read)", _cl0(f"https://q.example.com/{uuid.uuid4()}"), "S.")],
            )
        ],
    )
    editions_repo = EditionRepository(db_session)
    editions_before = editions_repo.count()
    seeded_ai_name = editions_repo.get_by_key("ai").name if editions_repo.get_by_key("ai") else None

    with _exploding_client() as client:
        ingest_session(db_session, GmailExportSource(tmp_path), since=None, http_client=client)

    assert editions_repo.count() == editions_before + 1
    created = editions_repo.get_by_key("quantum")
    assert created is not None and created.name == "TLDR Quantum"
    if seeded_ai_name is not None:  # existing edition names untouched
        assert editions_repo.get_by_key("ai").name == seeded_ai_name


# ─────────────────────────── category resolve-or-create ───────────────────────────


def test_category_resolution_maps_known_labels_and_creates_unknown(
    db_session: Session, tmp_path: Path
) -> None:
    suffix = uuid.uuid4()
    _write_eml(
        tmp_path,
        "cats.eml",
        from_="TLDR AI <dan@tldrnewsletter.com>",
        date_header="Wed, 10 Jun 2026 09:00:00 -0400",
        sections=[
            (
                "🚀 Headlines & Launches",  # keyword-maps to seeded 'headlines'
                [("H (1 minute read)", _cl0(f"https://h.example.com/{suffix}"), "S.")],
            ),
            (
                "Big Tech & Startups",  # exact normalized match to seeded 'bigtech'
                [("B (1 minute read)", _cl0(f"https://b.example.com/{suffix}"), "S.")],
            ),
            (
                "Quantum Gardening",  # unknown -> NEW category row
                [("Q (1 minute read)", _cl0(f"https://qg.example.com/{suffix}"), "S.")],
            ),
        ],
    )
    categories_repo = CategoryRepository(db_session)
    before = {c.slug for c in categories_repo.list_all()}
    max_sort_before = max((c.sort for c in categories_repo.list_all()), default=-1)

    with _exploding_client() as client:
        ingest_session(db_session, GmailExportSource(tmp_path), since=None, http_client=client)

    after = {c.slug for c in categories_repo.list_all()}
    assert after - before == {"quantum-gardening"}  # known labels created NO new rows

    created = categories_repo.get_by_slug("quantum-gardening")
    assert created.label == "Quantum Gardening"
    assert created.hue == "var(--c-misc)"  # literal default, never var(--c-<slug>)
    assert created.sort == max_sort_before + 1

    appearances = AppearanceRepository(db_session)
    content_repo = ContentRepository(db_session)
    h = content_repo.get_by_hash(_sha256(normalize_url(f"https://h.example.com/{suffix}")))
    b = content_repo.get_by_hash(_sha256(normalize_url(f"https://b.example.com/{suffix}")))
    assert appearances.list_for_content(h.id)[0].category.slug == "headlines"
    assert appearances.list_for_content(b.id)[0].category.slug == "bigtech"


# ─────────────────────────── resolution-failure fallback ───────────────────────────


def test_unresolvable_url_falls_back_to_raw_hash_and_caches(
    db_session: Session, tmp_path: Path
) -> None:
    raw = f"https://dead.example.net/{uuid.uuid4()}/page"  # NOT CL0-decodable
    _write_eml(
        tmp_path,
        "dead.eml",
        from_="TLDR AI <dan@tldrnewsletter.com>",
        date_header="Thu, 11 Jun 2026 09:00:00 -0400",
        sections=[("🚀 Headlines & Launches", [("Dead Link (2 minute read)", raw, "S.")])],
    )
    content_repo = ContentRepository(db_session)
    source = GmailExportSource(tmp_path)
    transport = _CountingConnectErrorTransport()

    with httpx.Client(transport=transport) as client:
        first = ingest_session(db_session, source, since=None, http_client=client)
        calls_after_first = transport.calls
        second = ingest_session(db_session, source, since=None, http_client=client)

    assert first["content_created"] == 1
    content = content_repo.get_by_hash(_sha256(raw))  # raw-url hash, NOT normalized
    assert content is not None
    assert content.url == raw
    assert content.domain == "dead.example.net"

    # Cached FAILURE reused: dedupe holds and ZERO extra HTTP requests on the rerun.
    assert second["content_created"] == 0 and second["content_skipped"] == 1
    assert calls_after_first >= 1
    assert transport.calls == calls_after_first


# ─────────────────────────── source tolerance + since filter ───────────────────────────


def test_gmail_export_source_skips_garbage_and_filters_since(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    (tmp_path / "bad.eml").write_bytes(b"this is not an rfc822 message")  # no Date header
    _write_eml(
        tmp_path,
        "old.eml",
        from_="TLDR <dan@tldrnewsletter.com>",
        date_header="Mon, 01 Jun 2026 09:00:00 -0400",
        sections=[
            ("🚀 Headlines & Launches",
             [("Old (1 minute read)", _cl0("https://o.example.com/x"), "S.")])
        ],
    )
    _write_eml(
        tmp_path,
        "new.eml",
        from_="TLDR <dan@tldrnewsletter.com>",
        date_header="Mon, 08 Jun 2026 09:00:00 -0400",
        sections=[
            ("🚀 Headlines & Launches",
             [("New (1 minute read)", _cl0("https://n.example.com/x"), "S.")])
        ],
    )

    with caplog.at_level(logging.WARNING, logger="recall.ingestion.gmail_export"):
        issues = list(GmailExportSource(tmp_path).fetch(date(2026, 6, 7)))

    assert len(issues) == 1  # garbage skipped, old issue filtered by since
    assert issues[0].published_at == date(2026, 6, 8)
    assert any("bad.eml" in r.message for r in caplog.records)


# ─────────────────────────── --replace (throwaway DB, subprocesses) ───────────────────────────

TEST_DB_NAME = "recall_ingest_test"


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


def _run_subprocess(
    args: list[str], db_url: str, extra_env: dict[str, str] | None = None
) -> subprocess.CompletedProcess[str]:
    env = dict(os.environ)
    env["DATABASE_URL"] = db_url
    env.update(extra_env or {})
    return subprocess.run(
        args, cwd=str(BACKEND_DIR), env=env, capture_output=True, text=True, check=False
    )


def test_replace_wipes_seed_then_ingests_and_seed_still_works(tmp_path: Path) -> None:
    """The grilled wipe + re-ingest decision, end to end on a throwaway DB."""
    admin_url = _admin_url()
    if not _server_reachable(admin_url):
        pytest.skip("Postgres server unreachable")
    _recreate_test_db(admin_url)
    db_url = _test_db_url()

    migrate = _run_subprocess([sys.executable, "-m", "alembic", "upgrade", "head"], db_url)
    assert migrate.returncode == 0, migrate.stderr
    seeded = _run_subprocess([sys.executable, "-m", "recall.jobs.seed"], db_url)
    assert seeded.returncode == 0, seeded.stderr

    export_dir = tmp_path / "export"
    export_dir.mkdir()
    _two_edition_corpus(export_dir)

    engine = create_engine(db_url, future=True)
    try:
        with engine.connect() as conn:
            # A pre-existing cache row proves url_resolutions survives the wipe.
            conn.execute(
                text(
                    "INSERT INTO url_resolutions (raw_url, resolved_url, domain, ok) "
                    "VALUES ('https://pre.example.com/x', 'https://pre.example.com/x', "
                    "'pre.example.com', true)"
                )
            )
            conn.commit()
            seed_content = conn.execute(text("SELECT count(*) FROM content")).scalar()
            collections_before = conn.execute(text("SELECT count(*) FROM collections")).scalar()
        assert seed_content > 0

        result = _run_subprocess(
            [sys.executable, "-m", "recall.jobs.cli", "ingest", "--replace",
             "--since", "2026-01-01"],
            db_url,
            extra_env={"GMAIL_EXPORT_DIR": str(export_dir)},
        )
        assert result.returncode == 0, f"STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        assert "Ingest complete" in result.stdout
        assert "embed-backfill" in result.stdout  # operator reminder printed

        with engine.connect() as conn:
            def count(table: str) -> int:
                return conn.execute(text(f"SELECT count(*) FROM {table}")).scalar()

            # Seeded demo corpus is GONE; the ingested one is what remains.
            assert count("content") == 3  # 3 distinct links, NOT seed_content + 3
            assert count("content_appearances") == 4
            assert count("issues") == 2
            assert (
                conn.execute(
                    text("SELECT count(*) FROM issues WHERE source_kind = 'seed'")
                ).scalar()
                == 0
            )
            assert count("user_content_state") == 0
            assert count("user_issue_state") == 0
            assert count("content_embeddings") == 0
            # Kept: editions, categories, collections, the stub user, the etiquette cache.
            assert count("editions") >= 3
            assert count("categories") >= 9
            assert count("collections") == collections_before
            assert count("users") == 1
            assert (
                conn.execute(
                    text(
                        "SELECT count(*) FROM url_resolutions "
                        "WHERE raw_url = 'https://pre.example.com/x'"
                    )
                ).scalar()
                == 1
            )
            run = conn.execute(
                text(
                    "SELECT status, since, issues_created, content_created, "
                    "appearances_created FROM ingest_runs "
                    "ORDER BY started_at DESC LIMIT 1"
                )
            ).one()
            assert run.status == "ok"
            assert run.since == date(2026, 1, 1)
            assert (run.issues_created, run.content_created, run.appearances_created) == (
                2, 3, 4,
            )

        # CI-style seed still works after the wipe (seed stays the CI/test fixture).
        reseed = _run_subprocess([sys.executable, "-m", "recall.jobs.seed"], db_url)
        assert reseed.returncode == 0, reseed.stderr
        with FIXTURE_PATH.open(encoding="utf-8") as fh:
            items = len(json.load(fh)["ITEMS"])
        with engine.connect() as conn:
            total = conn.execute(text("SELECT count(*) FROM content")).scalar()
        assert total == items + 3  # seed corpus restored alongside the ingested rows
    finally:
        engine.dispose()
