"""Search + collections endpoint contract tests (#7) against the SEEDED dev DB via TestClient.

Same harness + skip-guard as ``test_saves_endpoints.py``. These tests run in DEGRADED mode by
pointing the active embedding model at a NO-ROWS model (``active_model_name`` -> a name with 0
``content_embeddings`` rows), so they NEVER embed real queries against the dev DB's 44 real
``text-embedding-3-small`` vectors and NEVER need an API key.

The degraded contract test ALSO patches ``get_embedder`` to raise if it is ever called — proving
the gate is config-only and the embedder is never built when the active model has no rows.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import recall.search.service as service
from recall.db import ping
from recall.main import app

client = TestClient(app)

# A model name guaranteed to have ZERO content_embeddings rows -> forces the FTS-only path.
NO_ROWS_MODEL = "no-such-model-xyz"


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


@pytest.fixture
def degraded(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force DEGRADED (FTS-only) by pointing the active model at a no-rows model name, and make
    building an embedder an ERROR so the test fails loudly if the gate ever tries to embed.
    """
    monkeypatch.setattr(service, "active_model_name", lambda backend=None: NO_ROWS_MODEL)

    def _boom(*_a, **_k):
        raise AssertionError("get_embedder must NOT be called in degraded mode (config-only gate)")

    monkeypatch.setattr(service, "get_embedder", _boom)


# ─────────────────────────── degraded-mode contract ───────────────────────────


def test_search_degraded_is_fts_only_and_never_builds_embedder(degraded: None) -> None:
    resp = client.post("/search", json={"query": "agents", "limit": 20})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1
    assert "read_state" not in body["detected"]  # ADR-0002
    for hit in body["items"]:
        me = hit["match_explanation"]
        assert me["degraded"] is True
        assert me["vector_rank"] is None
        assert me["matched_via"] == ["lexical"]
        assert "score" in hit
        # SearchHit is a Content superset — the Content shape is reused unchanged.
        assert "title" in hit and "appearances" in hit and "starred" in hit


# ─────────────────────────── success-query shapes (degraded FTS) ───────────────────────────


def test_github_repos_about_agents_returns_only_repos(degraded: None) -> None:
    resp = client.post("/search", json={"query": "github repos about agents", "limit": 50})
    assert resp.status_code == 200
    body = resp.json()
    assert body["detected"]["types"] == ["repo"]
    assert body["total"] >= 1
    assert all(hit["content_type"] == "repo" for hit in body["items"])
    # at least one is actually about agents (tag/title/summary mention)
    blob = " ".join(
        (hit["title"] + " " + hit["summary"] + " " + " ".join(hit["tags"])).lower()
        for hit in body["items"]
    )
    assert "agent" in blob


def test_anthropic_ipo_returns_the_ipo_items(degraded: None) -> None:
    resp = client.post("/search", json={"query": "anthropic ipo", "limit": 50})
    assert resp.status_code == 200
    body = resp.json()
    titles = [hit["title"] for hit in body["items"]]
    assert any("Anthropic Files to Go Public" in t for t in titles)
    # the SpaceX IPO item also matches the 'ipo' term
    assert any("IPO" in t or "Go Public" in t for t in titles)


def test_haven_t_read_phrase_does_not_filter_by_read_state(degraded: None) -> None:
    # ADR-0002: 'haven't read' is NOT a cue. The query still returns hits (it does not become an
    # impossible read-state filter) and detected carries no read_state.
    resp = client.post("/search", json={"query": "substacks I haven't read", "limit": 50})
    assert resp.status_code == 200
    body = resp.json()
    assert "read_state" not in body["detected"]
    # weak substack cue is detected (boost), not a hard filter, so results are not empty.
    assert "substack" in body["detected"]["types"]


# ─────────────────────────── explicit filters AND detected intent ───────────────────────────


def test_explicit_type_filter_is_honored(degraded: None) -> None:
    resp = client.post(
        "/search",
        json={"query": "agents", "limit": 50, "filters": {"types": ["repo"]}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert all(hit["content_type"] == "repo" for hit in body["items"])


def test_pagination_slices_total_order(degraded: None) -> None:
    full = client.post("/search", json={"query": "agents", "limit": 50}).json()
    page2 = client.post("/search", json={"query": "agents", "limit": 2, "offset": 2}).json()
    assert page2["total"] == full["total"]
    assert [h["id"] for h in page2["items"]] == [h["id"] for h in full["items"][2:4]]


# ─────────────────────────── smart collections ───────────────────────────


def test_get_collections_returns_seeded_collection_refs() -> None:
    resp = client.get("/collections")
    assert resp.status_code == 200
    cols = resp.json()
    assert len(cols) == 5
    slugs = {c["slug"] for c in cols}
    assert "ipo-watch" in slugs
    for c in cols:
        assert set(c.keys()) == {"slug", "label", "query", "hue"}


def test_collection_items_resolve_live_through_search(degraded: None) -> None:
    resp = client.get("/collections/ipo-watch/items?limit=50")
    assert resp.status_code == 200
    body = resp.json()
    # ipo-watch query is 'IPOs and going public' -> non-empty in degraded FTS-only mode.
    assert body["total"] >= 1
    assert "read_state" not in body["detected"]
    assert all(hit["match_explanation"]["degraded"] is True for hit in body["items"])


def test_collection_items_404_for_unknown_slug(degraded: None) -> None:
    resp = client.get("/collections/does-not-exist/items")
    assert resp.status_code == 404
