"""URL resolver tests (spec §6.4, issue #23). NO real network anywhere.

* Decode tests: TLDR's CL0 path form + query-param wrappers resolve with zero HTTP calls
  (the injected transport raises if touched) and no DB (in-memory fake repo).
* Network tests: httpx.MockTransport serves a 302->200 chain / timeouts / terminal 500s;
  failures degrade to (raw_url, parsed domain) and never raise.
* Cache tests: second resolve of the same raw_url performs ZERO additional HTTP calls —
  including for a cached FAILURE (one fetch ever per distinct link is etiquette: each
  network resolution registers as a click in TLDR's analytics).
* Repository/migration smoke: record + get round-trip on the real ``url_resolutions``
  table (migration 0004) using a rollback-only session on the default DATABASE_URL, with
  uuid-suffixed raw_urls so the dev DB is never polluted. Skips if Postgres is down.
"""

from __future__ import annotations

import uuid

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from recall.ingestion.resolve import resolve_url
from recall.repositories import UrlResolutionRepository

TRACKING_CL0 = "https://tracking.tldrnewsletter.com/CL0/https%3A%2F%2Fexample.com%2Frobots/1/abc"
TRACKING_GITHUB = "https://tracking.tldrnewsletter.com/CL0/https%3A%2F%2Fgithub.com%2Fq/2/def"
TRACKING_QUERY = "https://t.example.net/redirect?u=https%3A%2F%2Fwww.theverge.com%2F2026%2Fstory"


# ─────────────────────────── fakes ───────────────────────────


class _FakeRow:
    def __init__(self, raw_url: str, resolved_url: str, domain: str | None, ok: bool) -> None:
        self.raw_url = raw_url
        self.resolved_url = resolved_url
        self.domain = domain
        self.ok = ok


class _FakeRepo:
    """In-memory stand-in honoring the UrlResolutionRepository get/record surface."""

    def __init__(self) -> None:
        self.rows: dict[str, _FakeRow] = {}

    def get(self, raw_url: str) -> _FakeRow | None:
        return self.rows.get(raw_url)

    def record(
        self, *, raw_url: str, resolved_url: str, domain: str | None, ok: bool
    ) -> _FakeRow:
        row = _FakeRow(raw_url, resolved_url, domain, ok)
        self.rows[raw_url] = row
        return row


def _exploding_client() -> httpx.Client:
    """A client whose transport fails the test if ANY request is issued."""

    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError(f"unexpected HTTP request: {request.method} {request.url}")

    return httpx.Client(transport=httpx.MockTransport(handler))


class _CountingTransport(httpx.MockTransport):
    def __init__(self, handler) -> None:  # noqa: ANN001 - httpx handler signature
        super().__init__(handler)
        self.calls = 0

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        self.calls += 1
        return super().handle_request(request)


# ─────────────────────────── decode path (no network, no DB) ───────────────────────────


def test_cl0_path_form_decodes_without_network() -> None:
    repo = _FakeRepo()
    with _exploding_client() as client:
        resolved, domain = resolve_url(TRACKING_CL0, repo=repo, client=client)
    assert resolved == "https://example.com/robots"
    assert domain == "example.com"
    row = repo.rows[TRACKING_CL0]
    assert row.ok is True and row.resolved_url == "https://example.com/robots"


def test_cl0_github_form_decodes_without_network() -> None:
    repo = _FakeRepo()
    with _exploding_client() as client:
        resolved, domain = resolve_url(TRACKING_GITHUB, repo=repo, client=client)
    assert resolved == "https://github.com/q"
    assert domain == "github.com"


def test_query_param_form_decodes_without_network_and_strips_www() -> None:
    repo = _FakeRepo()
    with _exploding_client() as client:
        resolved, domain = resolve_url(TRACKING_QUERY, repo=repo, client=client)
    assert resolved == "https://www.theverge.com/2026/story"
    assert domain == "theverge.com"  # www. stripped


def test_decode_hit_is_cached_no_network_ever() -> None:
    """Second call is served from the cache row; the transport is never touched."""
    repo = _FakeRepo()
    with _exploding_client() as client:
        first = resolve_url(TRACKING_CL0, repo=repo, client=client)
        second = resolve_url(TRACKING_CL0, repo=repo, client=client)
    assert first == second
    assert len(repo.rows) == 1


# ─────────────────────────── network fallback (MockTransport) ───────────────────────────


def test_network_fallback_follows_redirects_to_final_url() -> None:
    raw = "https://short.example.net/abc"

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "short.example.net":
            return httpx.Response(302, headers={"location": "https://www.dest.com/article/42"})
        return httpx.Response(200)

    repo = _FakeRepo()
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        resolved, domain = resolve_url(raw, repo=repo, client=client)
    assert resolved == "https://www.dest.com/article/42"
    assert domain == "dest.com"
    assert repo.rows[raw].ok is True


def test_head_rejected_falls_back_to_get() -> None:
    raw = "https://headless.example.net/x"

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "dest.com":
            return httpx.Response(200)
        if request.method == "HEAD":
            return httpx.Response(405)
        return httpx.Response(302, headers={"location": "https://dest.com/ok"})

    repo = _FakeRepo()
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        resolved, domain = resolve_url(raw, repo=repo, client=client)
    assert resolved == "https://dest.com/ok"
    assert domain == "dest.com"


def test_connect_timeout_degrades_to_raw_url_without_raising() -> None:
    raw = "https://unreachable.example.net/path/x"

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("boom", request=request)

    repo = _FakeRepo()
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        resolved, domain = resolve_url(raw, repo=repo, client=client)
    assert resolved == raw
    assert domain == "unreachable.example.net"
    assert repo.rows[raw].ok is False  # failure persisted as a cache row


def test_terminal_500_with_no_redirect_chain_degrades() -> None:
    raw = "https://broken.example.net/y"

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    repo = _FakeRepo()
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        resolved, domain = resolve_url(raw, repo=repo, client=client)
    assert (resolved, domain) == (raw, "broken.example.net")
    assert repo.rows[raw].ok is False


# ─────────────────────────── cache: at most one fetch EVER ───────────────────────────


def test_success_is_cached_second_resolve_makes_zero_http_calls() -> None:
    raw = "https://short.example.net/cached"

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "short.example.net":
            return httpx.Response(302, headers={"location": "https://dest.com/a"})
        return httpx.Response(200)

    transport = _CountingTransport(handler)
    repo = _FakeRepo()
    with httpx.Client(transport=transport) as client:
        first = resolve_url(raw, repo=repo, client=client)
        calls_after_first = transport.calls
        second = resolve_url(raw, repo=repo, client=client)
    assert first == second == ("https://dest.com/a", "dest.com")
    assert calls_after_first >= 1
    assert transport.calls == calls_after_first  # ZERO additional requests


def test_failure_is_cached_too_no_retry_on_second_resolve() -> None:
    raw = "https://down.example.net/z"

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("nope", request=request)

    transport = _CountingTransport(handler)
    repo = _FakeRepo()
    with httpx.Client(transport=transport) as client:
        first = resolve_url(raw, repo=repo, client=client)
        calls_after_first = transport.calls
        second = resolve_url(raw, repo=repo, client=client)
    assert first == second == (raw, "down.example.net")
    assert transport.calls == calls_after_first  # cached FAILURE: no second click
    assert repo.rows[raw].ok is False


# ─────────────────────────── repository + migration smoke (rollback-only) ──────────────


@pytest.fixture()
def db_session() -> Session:
    """Rollback-only session on the default DATABASE_URL; skips when Postgres is down.

    CI migrates before pytest, so a successful round-trip proves migration 0004 created
    ``url_resolutions``. Nothing is ever committed to the dev DB.
    """
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


def test_url_resolutions_table_exists_and_round_trips(db_session: Session) -> None:
    repo = UrlResolutionRepository(db_session)
    raw = f"https://tracking.tldrnewsletter.com/CL0/test/{uuid.uuid4()}"

    assert repo.get(raw) is None
    row = repo.record(
        raw_url=raw, resolved_url="https://example.com/story", domain="example.com", ok=True
    )
    assert row.id is not None
    assert row.resolved_at is not None  # server_default now() applied at flush

    fetched = repo.get(raw)
    assert fetched is not None
    assert fetched.resolved_url == "https://example.com/story"
    assert fetched.domain == "example.com"
    assert fetched.ok is True


def test_resolver_end_to_end_through_real_repository(db_session: Session) -> None:
    """Full resolve_url path against the real table: decode -> persist -> cache hit."""
    repo = UrlResolutionRepository(db_session)
    suffix = uuid.uuid4()
    raw = f"https://tracking.tldrnewsletter.com/CL0/https%3A%2F%2Fexample.com%2Fa/{suffix}"

    with _exploding_client() as client:
        first = resolve_url(raw, repo=repo, client=client)
        second = resolve_url(raw, repo=repo, client=client)  # served from the table row
    assert first == second == ("https://example.com/a", "example.com")


def test_raw_url_unique_constraint(db_session: Session) -> None:
    """The cache key is enforced in the schema, not just in application logic."""
    raw = f"https://tracking.tldrnewsletter.com/CL0/dup/{uuid.uuid4()}"
    db_session.execute(
        text(
            "INSERT INTO url_resolutions (raw_url, resolved_url, domain, ok) "
            "VALUES (:r, :r, 'x.com', true)"
        ),
        {"r": raw},
    )
    with pytest.raises(Exception, match="uq_url_resolutions_raw_url"):
        db_session.execute(
            text(
                "INSERT INTO url_resolutions (raw_url, resolved_url, domain, ok) "
                "VALUES (:r, :r, 'x.com', true)"
            ),
            {"r": raw},
        )
