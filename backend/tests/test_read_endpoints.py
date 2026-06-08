"""Contract tests for the #3 read endpoints (spec §9, ADR-0001).

Run against the SEEDED dev database (``postgresql+psycopg://recall:recall@localhost:5432/recall``)
through the FastAPI app via TestClient. The module skips gracefully if the DB is unreachable or
not seeded, and PASSES fully when the docker Postgres is up + seeded.

What is asserted:
* ``GET /editions`` returns the 3 seeded editions.
* ``GET /issues`` uses the ``{items,total,limit,offset}`` envelope, is NEWEST FIRST, and paginates.
* ``GET /issues/latest?edition=tldr`` returns issue ``#3120`` whose FIRST section is ``bigtech``
  ('Big Tech & Startups') and whose first bigtech item starts with 'Nvidia Introduces First PCs',
  with section ordering following CAT_ORDER.
* ``Content`` has the EXACT key set incl. ``appearances[]`` (length 1 on the seed) +
  ``starred``/``read_state``; a known starred+read item (anthropic-ipo) reports
  starred=true/read_state='read' and a plain item reports false/'unread'.
* ``GET /content/{id}`` round-trips the same shape.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from recall.db import ping
from recall.main import app

client = TestClient(app)


def _seeded() -> bool:
    """True only if the DB is reachable AND looks seeded (>=3 editions)."""
    try:
        ping()
    except Exception:
        return False
    resp = client.get("/editions")
    return resp.status_code == 200 and len(resp.json()) >= 3


pytestmark = pytest.mark.skipif(
    not _seeded(),
    reason="seeded dev DB unreachable (expects the migrated + seeded dev 'recall' DB)",
)


# The exact top-level key set of a Content response (spec §9 / ADR-0001 contract).
CONTENT_KEYS = {
    "id",
    "title",
    "summary",
    "content_type",
    "read_minutes",
    "url",
    "domain",
    "tags",
    "resources",
    "edition",
    "category",
    "issue",
    "appearances",
    "starred",
    "read_state",
}


# ─────────────────────────── editions ───────────────────────────


def test_editions_returns_three_seeded() -> None:
    body = client.get("/editions").json()
    keys = {e["key"] for e in body}
    assert keys == {"tldr", "ai", "founders"}
    for e in body:
        assert set(e.keys()) == {"key", "name"}
    names = {e["key"]: e["name"] for e in body}
    assert names["tldr"] == "TLDR"
    assert names["ai"] == "TLDR AI"
    assert names["founders"] == "TLDR Founders"


# ─────────────────────────── /issues envelope + ordering ───────────────────────────


def test_issues_pagination_envelope() -> None:
    resp = client.get("/issues")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"items", "total", "limit", "offset"}
    assert isinstance(body["items"], list)
    assert body["total"] >= 3
    assert body["limit"] == 20
    assert body["offset"] == 0
    # IssueSummary shape.
    item = body["items"][0]
    assert set(item.keys()) == {
        "id",
        "edition",
        "issue_number",
        "published_at",
        "subject",
        "subtitle",
        "content_count",
    }
    assert set(item["edition"].keys()) == {"key", "name"}
    assert item["content_count"] >= 1


def test_issues_newest_first() -> None:
    items = client.get("/issues").json()["items"]
    dates = [i["published_at"] for i in items]
    assert dates == sorted(dates, reverse=True), "issues must be newest-first (published_at desc)"


def test_issues_pagination_limit_offset() -> None:
    page1 = client.get("/issues?limit=1&offset=0").json()
    page2 = client.get("/issues?limit=1&offset=1").json()
    assert page1["limit"] == 1 and page1["offset"] == 0
    assert len(page1["items"]) == 1
    assert len(page2["items"]) == 1
    assert page1["items"][0]["id"] != page2["items"][0]["id"]
    assert page1["total"] == page2["total"]


def test_issues_filter_by_edition() -> None:
    body = client.get("/issues?edition=tldr").json()
    assert body["total"] == 1
    assert body["items"][0]["edition"]["key"] == "tldr"
    assert body["items"][0]["issue_number"] == "#3120"


# ─────────────────────────── /issues/latest detail ───────────────────────────


def test_latest_tldr_first_section_is_bigtech() -> None:
    body = client.get("/issues/latest?edition=tldr").json()

    # IssueDetail shape.
    assert set(body.keys()) == {"issue", "sections"}
    assert body["issue"]["issue_number"] == "#3120"
    assert body["issue"]["edition"]["key"] == "tldr"

    sections = body["sections"]
    assert len(sections) >= 1

    # The seeded TLDR issue has NO 'headlines' items, so the first section is 'bigtech'.
    first = sections[0]
    assert first["category"]["slug"] == "bigtech"
    assert first["category"]["label"] == "Big Tech & Startups"
    assert first["category"]["hue"] == "var(--c-bigtech)"

    first_item = first["content"][0]
    assert first_item["title"].startswith("Nvidia Introduces First PCs")


def test_latest_section_order_follows_cat_order() -> None:
    # CAT_ORDER from the prototype.
    cat_order = [
        "headlines",
        "bigtech",
        "strategy",
        "science",
        "prog",
        "deep",
        "tools",
        "eng",
        "misc",
    ]
    sections = client.get("/issues/latest?edition=tldr").json()["sections"]
    slugs = [s["category"]["slug"] for s in sections]
    indices = [cat_order.index(s) for s in slugs]
    assert indices == sorted(indices), f"sections must follow CAT_ORDER, got {slugs}"


def test_latest_no_edition_returns_newest_overall() -> None:
    body = client.get("/issues/latest").json()
    assert body["issue"]["published_at"] == "2026-06-02"


# ─────────────────────────── Content shape + per-reader state ───────────────────────────


def _find_in_latest_tldr(title_prefix: str) -> dict:
    body = client.get("/issues/latest?edition=tldr").json()
    for section in body["sections"]:
        for content in section["content"]:
            if content["title"].startswith(title_prefix):
                return content
    raise AssertionError(f"no content titled {title_prefix!r} in latest tldr issue")


def test_content_has_exact_keys_and_single_appearance() -> None:
    content = _find_in_latest_tldr("Nvidia Introduces First PCs")
    assert set(content.keys()) == CONTENT_KEYS

    # appearances[] length 1 on the seed; each appearance carries full provenance.
    assert len(content["appearances"]) == 1
    appearance = content["appearances"][0]
    assert set(appearance.keys()) == {"issue", "edition", "category", "position"}
    assert set(appearance["issue"].keys()) == {"id", "issue_number", "published_at"}
    assert set(appearance["edition"].keys()) == {"key", "name"}
    assert set(appearance["category"].keys()) == {"slug", "label", "hue"}

    # flat primary-appearance fields mirror the single appearance.
    assert content["edition"]["key"] == appearance["edition"]["key"]
    assert content["category"]["slug"] == appearance["category"]["slug"]
    assert content["issue"]["id"] == appearance["issue"]["id"]


def test_starred_read_item_reports_true_read() -> None:
    content = _find_in_latest_tldr("Anthropic Files to Go Public")
    assert content["starred"] is True
    assert content["read_state"] == "read"


def test_plain_item_reports_false_unread() -> None:
    # Nvidia PCs item is neither starred nor read in the seed.
    content = _find_in_latest_tldr("Nvidia Introduces First PCs")
    assert content["starred"] is False
    assert content["read_state"] == "unread"


def test_get_content_by_id_round_trips() -> None:
    listed = _find_in_latest_tldr("Anthropic Files to Go Public")
    fetched = client.get(f"/content/{listed['id']}").json()
    assert set(fetched.keys()) == CONTENT_KEYS
    assert fetched["id"] == listed["id"]
    assert fetched["starred"] is True
    assert fetched["read_state"] == "read"
    assert len(fetched["appearances"]) == 1


def test_get_content_missing_is_404() -> None:
    resp = client.get("/content/00000000-0000-0000-0000-0000000000ff")
    assert resp.status_code == 404


def test_get_issue_by_id_matches_latest() -> None:
    latest = client.get("/issues/latest?edition=tldr").json()
    by_id = client.get(f"/issues/{latest['issue']['id']}").json()
    assert by_id["issue"]["id"] == latest["issue"]["id"]
    assert [s["category"]["slug"] for s in by_id["sections"]] == [
        s["category"]["slug"] for s in latest["sections"]
    ]
