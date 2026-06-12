"""Contract tests for the #19 cross-edition unread glance (ADR-0002).

``GET /editions`` carries the current reader's per-edition ``unread_count`` — the number of
that edition's issues with no ``user_issue_state`` row or ``read_state='unread'`` — computed
in ONE batched query. Same TestClient + ``_seeded()`` skip harness as the other contract
modules.

RERUN-SAFETY: there is no un-read API (the only v1 transition is unread->read), so asserting
the pristine "everything unread" seed deterministically requires resetting ``user_issue_state``
directly through the repository layer. That is safe here: conftest.py points the whole suite at
the self-provisioned ``recall_pytest`` DB (never the dev corpus), the seed starts issue-read
EMPTY (deleting rows restores the seed exactly), and ``test_issue_read_endpoints`` never assumes
prior state (it re-marks idempotently). The reset runs in setup AND in a ``finally`` so a
mid-test failure still restores the seed shape.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from recall.db import SessionLocal, ping
from recall.main import app
from recall.repositories import UserIssueStateRepository

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
    reason="Postgres unreachable (conftest provisions the seeded recall_pytest DB)",
)


def _reset_issue_read_state() -> None:
    """Restore the seed's EMPTY ``user_issue_state`` (only the stub user exists in the seed)."""
    with SessionLocal() as session:
        UserIssueStateRepository(session).delete_all()
        session.commit()


def _unread_counts() -> dict[str, int]:
    return {e["key"]: e["unread_count"] for e in client.get("/editions").json()}


def test_editions_unread_count_shape_and_get_is_side_effect_free() -> None:
    body = client.get("/editions").json()
    for e in body:
        assert set(e.keys()) == {"key", "name", "unread_count"}
        assert isinstance(e["unread_count"], int)
        assert e["unread_count"] >= 0
    # Pure GET: a second call reports the identical counts (no mark-on-view side effects).
    assert client.get("/editions").json() == body


def test_unread_counts_start_at_one_and_drop_on_mark_read() -> None:
    _reset_issue_read_state()
    try:
        # Fresh seed: 3 editions x 1 issue each, no user_issue_state rows -> all unread.
        assert _unread_counts() == {"tldr": 1, "ai": 1, "founders": 1}

        # Mark the tldr issue read: tldr drops to 0, the other editions are untouched.
        issue_id = client.get("/issues?edition=tldr").json()["items"][0]["id"]
        resp = client.put(f"/issues/{issue_id}/read")
        assert resp.status_code == 200
        assert _unread_counts() == {"tldr": 0, "ai": 1, "founders": 1}

        # Idempotent re-mark: counts unchanged.
        assert client.put(f"/issues/{issue_id}/read").status_code == 200
        assert _unread_counts() == {"tldr": 0, "ai": 1, "founders": 1}
    finally:
        # Restore the seed's empty issue-read state so reruns (and other modules) are clean.
        _reset_issue_read_state()

    assert _unread_counts() == {"tldr": 1, "ai": 1, "founders": 1}
