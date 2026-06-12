"""Health endpoint contract test.

Asserts /health returns 200 with the four required keys and the configured embedder name.
The db field is checked for "ok" only when a real DB is reachable, so the test passes
locally without docker (db will say "error: ...") and passes with db == "ok" when a DB is
up.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from recall.config import settings
from recall.db import ping
from recall.main import app

client = TestClient(app)


def _db_reachable() -> bool:
    try:
        ping()
        return True
    except Exception:
        return False


def test_health_returns_200_and_contract_keys() -> None:
    resp = client.get("/health")
    assert resp.status_code == 200

    body = resp.json()
    assert set(body.keys()) == {"status", "db", "embedder", "version"}

    assert body["status"] == "ok"
    assert body["version"] == "0.1.0"


def test_health_embedder_is_configured_model() -> None:
    body = client.get("/health").json()
    assert body["embedder"] == settings.embedder_name
    assert body["embedder"] == "text-embedding-3-small"


def test_health_db_ok_when_reachable() -> None:
    body = client.get("/health").json()
    if _db_reachable():
        assert body["db"] == "ok"
    else:
        # No DB up locally (e.g. docker not running) — the field reports the failure.
        assert body["db"].startswith("error:")


def test_cors_allows_null_origin_for_webview_hosts() -> None:
    """The Expo mobile shell's DOM component is file-served -> Origin: null (#53).

    CORSMiddleware must echo it back, or every fetch from the mobile webview is
    blocked. ("null" sits in the default allowlist; CORS is plumbing, not security,
    for this stub-auth API.)
    """
    resp = client.get("/health", headers={"Origin": "null"})
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "null"
