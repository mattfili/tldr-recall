"""Contract tests for the #5 (M2) Issue-read endpoints (ADR-0002).

Run against the SEEDED dev database through the FastAPI app via TestClient (same harness as
``test_read_endpoints.py``). The module skips gracefully if the DB is unreachable / unseeded.

RERUN-SAFE against the SHARED seeded DB: there is no un-read transition in v1, so these tests
only assert the IDEMPOTENT unread->read mark. They NEVER assert an issue is pristine 'unread'
(a prior run may already have marked it), and the GET /issues read_state is only required to be
a valid label.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from recall.db import ping
from recall.main import app

client = TestClient(app)


def _seeded() -> bool:
    try:
        ping()
        resp = client.get("/editions")
        return resp.status_code == 200 and len(resp.json()) >= 3
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not _seeded(),
    reason="seeded dev DB unreachable (expects the migrated + seeded dev 'recall' DB)",
)


def _tldr_issue_id() -> str:
    body = client.get("/issues?edition=tldr").json()
    return body["items"][0]["id"]


# ─────────────────────────── GET /issues carries read_state ───────────────────────────


def test_issues_list_includes_read_state() -> None:
    body = client.get("/issues").json()
    for item in body["items"]:
        assert "read_state" in item
        assert item["read_state"] in {"unread", "read"}


# ─────────────────────────── PUT /issues/{id}/read ───────────────────────────


def test_put_issue_read_marks_read_idempotent() -> None:
    issue_id = _tldr_issue_id()

    resp = client.put(f"/issues/{issue_id}/read")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"issue_id", "read_state"}
    assert body["issue_id"] == issue_id
    assert body["read_state"] == "read"

    # The list now reports this issue as read.
    listed = client.get("/issues?edition=tldr").json()["items"][0]
    assert listed["id"] == issue_id
    assert listed["read_state"] == "read"

    # Idempotent: a second mark stays read (the only valid v1 transition is unread->read).
    again = client.put(f"/issues/{issue_id}/read")
    assert again.status_code == 200
    assert again.json()["read_state"] == "read"
    assert client.get("/issues?edition=tldr").json()["items"][0]["read_state"] == "read"


def test_put_issue_read_missing_is_404() -> None:
    resp = client.put("/issues/00000000-0000-0000-0000-0000000000ff/read")
    assert resp.status_code == 404
