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
    """True only if the DB is reachable, migrated, AND looks seeded (>=3 editions).

    Evaluated at collection time, so it must NEVER raise: a reachable-but-unmigrated
    DB (e.g. a fresh CI Postgres before the migrate+seed step) makes ``/editions``
    raise ``UndefinedTable`` — caught here so the module skips cleanly instead of
    erroring during collection.
    """
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


# ─────────────────────────── /library (#4) ───────────────────────────


def _all_library(**params: object) -> list[dict]:
    """Fetch every Library item for the given filters by paging to exhaustion (limit=100)."""
    items: list[dict] = []
    offset = 0
    while True:
        qs = {**params, "limit": 100, "offset": offset}
        body = client.get("/library", params=qs).json()
        items.extend(body["items"])
        offset += body["limit"]
        if offset >= body["total"] or not body["items"]:
            return items


def test_library_default_envelope() -> None:
    resp = client.get("/library")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"items", "total", "limit", "offset"}
    assert body["limit"] == 20
    assert body["offset"] == 0
    # Unfiltered, total is the SINGLE in-view count == whole-corpus Content size.
    assert body["total"] >= 1
    assert body["total"] == 44
    # Each item is the full Content contract incl. appearances[] + per-reader state.
    for item in body["items"]:
        assert set(item.keys()) == CONTENT_KEYS
        assert len(item["appearances"]) >= 1


def test_library_ordering_first_seen_desc_then_id_asc() -> None:
    # Primary-appearance order: first_seen_at == primary appearance published_at (ADR-0001),
    # so item['issue']['published_at'] is non-increasing; id ASC breaks ties.
    items = _all_library()
    keyed = [(i["issue"]["published_at"], i["id"]) for i in items]
    for (date_a, id_a), (date_b, id_b) in zip(keyed, keyed[1:], strict=False):
        assert date_a >= date_b, "published_at must be non-increasing (first_seen_at DESC)"
        if date_a == date_b:
            assert id_a < id_b, "ids must ascend within an equal first_seen_at (id ASC tiebreak)"


def test_library_pagination_distinct_pages_stable_total() -> None:
    page1 = client.get("/library?limit=1&offset=0").json()
    page2 = client.get("/library?limit=1&offset=1").json()
    assert page1["limit"] == 1 and page1["offset"] == 0
    assert len(page1["items"]) == 1
    assert len(page2["items"]) == 1
    assert page1["items"][0]["id"] != page2["items"][0]["id"]
    assert page1["total"] == page2["total"]


def test_library_no_overlap_across_pages() -> None:
    half = client.get("/library?limit=5&offset=0").json()["items"]
    rest = client.get("/library?limit=5&offset=5").json()["items"]
    ids_a = {i["id"] for i in half}
    ids_b = {i["id"] for i in rest}
    assert ids_a.isdisjoint(ids_b), "consecutive pages must not overlap"


def test_library_type_filter_single_value() -> None:
    body = client.get("/library?type=repo&limit=100").json()
    assert all(i["content_type"] == "repo" for i in body["items"])
    # total reflects the filtered match count (Content-level content_type == 'repo').
    assert body["total"] == len(body["items"])
    assert body["total"] == 6


def test_library_type_filter_multi_value_is_or_within() -> None:
    # OR within the type dimension: article ∪ repo.
    body = client.get("/library?type=article&type=repo&limit=100").json()
    assert all(i["content_type"] in {"article", "repo"} for i in body["items"])
    assert body["total"] == 34
    only_article = client.get("/library?type=article&limit=100").json()["total"]
    only_repo = client.get("/library?type=repo&limit=100").json()["total"]
    assert body["total"] == only_article + only_repo


def test_library_edition_filter_is_has_appearance_in() -> None:
    body = client.get("/library?edition=tldr&limit=100").json()
    assert body["total"] == 20
    for item in body["items"]:
        # Matched by HAS-APPEARANCE-IN: at least one appearance is in a tldr issue.
        assert any(ap["edition"]["key"] == "tldr" for ap in item["appearances"])
        # Inclusion-only: the row still reports its STABLE PRIMARY appearance (flat fields).
        primary = item["appearances"][0]
        assert item["edition"]["key"] == primary["edition"]["key"]
        assert item["issue"]["id"] == primary["issue"]["id"]


def test_library_category_filter_single_and_or_within() -> None:
    body = client.get("/library?category=bigtech&limit=100").json()
    assert body["total"] == 4
    for item in body["items"]:
        assert any(
            ap["category"] is not None and ap["category"]["slug"] == "bigtech"
            for ap in item["appearances"]
        )
    # OR within: bigtech ∪ strategy.
    both = client.get("/library?category=bigtech&category=strategy&limit=100").json()
    assert both["total"] == 8
    for item in both["items"]:
        assert any(
            ap["category"] is not None and ap["category"]["slug"] in {"bigtech", "strategy"}
            for ap in item["appearances"]
        )


def test_library_starred_filter_reflects_seed() -> None:
    body = client.get("/library?starred=true&limit=100").json()
    # 14 starred items in the seed for the stub user.
    assert body["total"] == 14
    assert all(i["starred"] is True for i in body["items"])
    titles = [i["title"] for i in body["items"]]
    assert any(t.startswith("Anthropic Files to Go Public") for t in titles)
    # A known-unstarred item (Nvidia PCs) must NOT appear.
    assert not any(t.startswith("Nvidia Introduces First PCs") for t in titles)


def test_library_and_across_dimensions() -> None:
    # type=article AND edition=tldr -> intersection (article-type Content with a tldr appearance).
    body = client.get("/library?type=article&edition=tldr&limit=100").json()
    assert body["total"] == 16
    for item in body["items"]:
        assert item["content_type"] == "article"
        assert any(ap["edition"]["key"] == "tldr" for ap in item["appearances"])


def test_library_ignores_unknown_params() -> None:
    # density / read_state are NOT query dimensions (grilled scope + ADR-0002): passing them
    # changes nothing.
    base = client.get("/library?limit=100").json()
    with_density = client.get("/library?density=expanded&limit=100").json()
    with_read = client.get("/library?read_state=unread&limit=100").json()
    assert with_density["total"] == base["total"]
    assert with_read["total"] == base["total"]
    assert [i["id"] for i in with_density["items"]] == [i["id"] for i in base["items"]]
    assert [i["id"] for i in with_read["items"]] == [i["id"] for i in base["items"]]


# ─────────────────────────── /categories (#4) ───────────────────────────


def test_categories_shape_and_sort_order() -> None:
    body = client.get("/categories").json()
    assert isinstance(body, list)
    assert len(body) >= 1
    for c in body:
        assert set(c.keys()) == {"slug", "label", "hue"}
    slugs = [c["slug"] for c in body]
    # Ordered by categories.sort (CAT_ORDER): headlines < bigtech < strategy, etc.
    for earlier, later in [("headlines", "bigtech"), ("bigtech", "strategy")]:
        if earlier in slugs and later in slugs:
            assert slugs.index(earlier) < slugs.index(later)
    by_slug = {c["slug"]: c for c in body}
    # hue is the stored value VERBATIM.
    assert by_slug["bigtech"]["hue"] == "var(--c-bigtech)"
    assert by_slug["bigtech"]["label"] == "Big Tech & Startups"
