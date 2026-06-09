"""Contract tests for the #5 (M2) Saves endpoints (ADR-0002).

Run against the SEEDED dev database through the FastAPI app via TestClient (same harness as
``test_read_endpoints.py``). The module skips gracefully if the DB is unreachable / unseeded.

RERUN-SAFE against the SHARED seeded DB: every test that mutates ``starred`` RESTORES the
content's original value before it returns (star-then-unstar a seed-unstarred item;
unstar-then-restar a seed-starred item), so ``/library?starred=true`` stays at 14.
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


def _find_in_latest_tldr(title_prefix: str) -> dict:
    body = client.get("/issues/latest?edition=tldr").json()
    for section in body["sections"]:
        for content in section["content"]:
            if content["title"].startswith(title_prefix):
                return content
    raise AssertionError(f"no content titled {title_prefix!r} in latest tldr issue")


def _starred_ids() -> set[str]:
    body = client.get("/library?starred=true&limit=100").json()
    return {i["id"] for i in body["items"]}


# ─────────────────────────── PUT /saves/{id} (star) ───────────────────────────


def test_put_save_stars_then_restore() -> None:
    # Nvidia PCs is UNSTARRED in the seed — star it, verify, then restore (unstar).
    content = _find_in_latest_tldr("Nvidia Introduces First PCs")
    cid = content["id"]
    assert content["starred"] is False

    resp = client.put(f"/saves/{cid}")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"content_id", "starred"}
    assert body["content_id"] == cid
    assert body["starred"] is True

    # Reflected in GET /content and the starred filter.
    assert client.get(f"/content/{cid}").json()["starred"] is True
    assert cid in _starred_ids()

    # Idempotent: a second PUT stays starred.
    again = client.put(f"/saves/{cid}")
    assert again.status_code == 200
    assert again.json()["starred"] is True

    # RESTORE the seed (unstar).
    restore = client.delete(f"/saves/{cid}")
    assert restore.status_code == 200
    assert restore.json()["starred"] is False
    assert client.get(f"/content/{cid}").json()["starred"] is False


# ─────────────────────────── DELETE /saves/{id} (soft unstar) ───────────────────────────


def test_delete_save_is_soft_then_restore() -> None:
    # Anthropic IPO is STARRED in the seed — unstar (SOFT), verify, then restore (re-star).
    content = _find_in_latest_tldr("Anthropic Files to Go Public")
    cid = content["id"]
    assert content["starred"] is True

    resp = client.delete(f"/saves/{cid}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["content_id"] == cid
    assert body["starred"] is False

    # SOFT: the Content still exists (the row was kept, not deleted) but is unstarred and
    # therefore absent from the starred filter.
    fetched = client.get(f"/content/{cid}")
    assert fetched.status_code == 200
    assert fetched.json()["starred"] is False
    assert cid not in _starred_ids()

    # RESTORE the seed (re-star).
    restore = client.put(f"/saves/{cid}")
    assert restore.status_code == 200
    assert restore.json()["starred"] is True
    assert cid in _starred_ids()


def test_delete_save_on_never_starred_creates_unstarred_row() -> None:
    # DELETE on a never-starred item is an upsert that creates a starred=false row (still 200).
    content = _find_in_latest_tldr("Nvidia Introduces First PCs")
    cid = content["id"]

    resp = client.delete(f"/saves/{cid}")
    assert resp.status_code == 200
    assert resp.json()["starred"] is False
    # Still not starred -> still absent from the starred filter (no seed change to restore).
    assert client.get(f"/content/{cid}").json()["starred"] is False
    assert cid not in _starred_ids()


# ─────────────────────────── 404 ───────────────────────────


def test_put_save_missing_content_is_404() -> None:
    resp = client.put("/saves/00000000-0000-0000-0000-0000000000ff")
    assert resp.status_code == 404


def test_delete_save_missing_content_is_404() -> None:
    resp = client.delete("/saves/00000000-0000-0000-0000-0000000000ff")
    assert resp.status_code == 404
