"""Seed the database from the prototype fixture (Issue #2, ADR-0001).

Loads ``backend/tests/fixtures/recall_seed.json`` (the reproducible data.js -> JSON
converter output) and writes it into Postgres through the REPOSITORIES layer only — this
module never imports an ORM model or opens a Session against the ORM directly (it owns the
transaction via ``SessionLocal`` and the repositories do the table work).

Seeding rules (locked by the CONTRACT — obey exactly):

* Each ITEMS entry -> exactly ONE ``content`` row + ONE ``content_appearances`` row.
* ``categories.hue`` = the data.js ``v`` value VERBATIM (the full string, e.g.
  ``'var(--c-bigtech)'``). headlines and eng reuse hues (``var(--c-strategy)`` /
  ``var(--c-ai)``); we never derive ``var(--c-<slug>)``. ``categories.sort`` = the slug's
  index in ``CAT_ORDER``.
* editions: from ``ED``. issues: ONE per edition from ``ED_META`` (issue_number e.g.
  ``'#3120'``; published_at parsed from the human date e.g. ``'Tue, Jun 2 2026'``;
  subtitle=sub; subject=name; source_kind=``'seed'``; source_ref=edition key).
* content (per spec §5.3): title<-title; summary<-sum; content_type<-src;
  read_minutes<-read (verbatim, incl. when a repo has a read value); tags<-tags (default
  ``[]``); resources<-resources (jsonb, nullable); editor_note<-why (nullable);
  domain<-domain VERBATIM; url<-``'https://'+domain``;
  first_seen_at<-the issue's published_at.

  content_hash: synthesized PER ITEM from the data.js item ``id`` (sha256 of the item id).
  ADR-0001 wins over the spec/CONTRACT wording here and is explicit: "The seed set has no
  duplicates, so the hash is synthesized per item." A literal ``sha256('https://'+domain)``
  collides for the two pairs of distinct ``ai``-edition articles that share a publisher
  domain (``nvidia.com``: nemotron/cosmos3; ``anthropic.com``: model-welfare/anthropic-econ),
  which would dedup 44 items down to 42 content rows AND drop two appearances (the
  appearance unique is ``(issue_id, content_id)`` and both members of each pair sit in the
  same edition/issue). That violates the locked invariant "ONE content row + ONE
  appearance per ITEM" / "content == len(ITEMS) == 44". Per-item synthesis keeps the seed's
  global-dedup semantics correct (one canonical row per distinct link) while honoring
  ADR-0001's "no duplicates in the seed set" statement. ``url``/``domain`` remain verbatim
  as the CONTRACT requires. See the SEEDING-RULE DEVIATION note in ``_content_hash``.
* content_appearances: link content -> its edition's single issue; category_id<-resolve(cat);
  position<-the item's 0-based index among items of the SAME edition in data.js order.
* user_content_state: create a row for the seeded STUB user IFF (starred OR
  read_state=='read'); set starred / read_state from the item. Others -> NO row.
* users: ONE stub user whose id EQUALS ``STUB_USER.id`` from ``recall.auth.stub``.
* collections: from ``COLLECTIONS`` — slug<-id, label<-label, query<-q, hue<-v VERBATIM,
  is_smart=true, user_id=null. data.js ``count`` is IGNORED.
* content_embeddings: NONE — zero rows written here (embeddings land in #6).

The job is idempotent: every repository upsert is keyed on a stable natural key, so a
re-run against an already-seeded DB converges to the same rows.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from recall.auth.stub import STUB_USER
from recall.db import SessionLocal
from recall.repositories import (
    AppearanceRepository,
    CategoryRepository,
    CollectionRepository,
    ContentRepository,
    EditionRepository,
    IssueRepository,
    UserContentStateRepository,
    UserRepository,
)

# The reproducible fixture produced by tests/fixtures/build_fixture.mjs from tldr-web/data.js.
FIXTURE_PATH = (
    Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "recall_seed.json"
)

# The issue's source_kind for seed-originated issues (spec §5.3 / CONTRACT).
SEED_SOURCE_KIND = "seed"

# Human date format used in data.js ED_META, e.g. "Tue, Jun 2 2026" -> date(2026, 6, 2).
_DATE_FORMAT = "%a, %b %d %Y"


def load_fixture(path: Path = FIXTURE_PATH) -> dict[str, Any]:
    """Load the seed fixture JSON (verbatim window.RECALL from data.js)."""
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def _parse_published_at(human_date: str) -> date:
    """Parse a data.js human date like 'Tue, Jun 2 2026' into a ``date``."""
    return datetime.strptime(human_date, _DATE_FORMAT).date()


def _content_hash(item_id: str) -> str:
    """sha256 hexdigest synthesized PER ITEM from the data.js item id.

    SEEDING-RULE DEVIATION (authorized — ADR-0001 wins over the spec/CONTRACT and is fixed
    here as an outright bug): the CONTRACT says ``content_hash <- sha256('https://'+domain)``,
    but ADR-0001 states "The seed set has no duplicates, so the hash is synthesized per item."
    Two ``ai``-edition pairs share a publisher domain (nvidia.com, anthropic.com) yet are
    distinct articles; hashing on domain alone collides them, dropping the corpus from 44 to
    42 content rows and losing 2 appearances — breaking the locked "ONE content + ONE
    appearance per ITEM" invariant and the Stage-1 expected count (content == 44). We
    synthesize the hash from the per-item ``id`` instead. ``url``/``domain`` are still stored
    verbatim ('https://'+domain) as the CONTRACT requires; only the dedup identity is
    per-item, matching ADR-0001's seed semantics.
    """
    return hashlib.sha256(item_id.encode("utf-8")).hexdigest()


def seed_session(session: Session, data: dict[str, Any]) -> dict[str, int]:
    """Seed everything into ``session`` from the loaded fixture ``data``.

    Goes exclusively through the repositories. Does NOT commit — the caller owns the
    transaction. Returns a dict of observed row counts for logging / assertions.
    """
    editions_repo = EditionRepository(session)
    categories_repo = CategoryRepository(session)
    issues_repo = IssueRepository(session)
    content_repo = ContentRepository(session)
    appearances_repo = AppearanceRepository(session)
    users_repo = UserRepository(session)
    state_repo = UserContentStateRepository(session)
    collections_repo = CollectionRepository(session)

    cats: dict[str, dict[str, str]] = data["CATS"]
    ed: dict[str, str] = data["ED"]
    ed_meta: dict[str, dict[str, str]] = data["ED_META"]
    cat_order: list[str] = data["CAT_ORDER"]
    items: list[dict[str, Any]] = data["ITEMS"]
    collections: list[dict[str, Any]] = data["COLLECTIONS"]

    # ── 1. Stub user (id MUST equal STUB_USER.id so AuthProvider.stub resolves it). ──
    stub_user_id = uuid.UUID(STUB_USER.id)
    users_repo.upsert(
        user_id=stub_user_id,
        email=STUB_USER.email,
        display_name=STUB_USER.display_name,
    )

    # ── 2. Categories — hue VERBATIM from `v`, sort = index in CAT_ORDER. ──
    category_ids: dict[str, uuid.UUID] = {}
    for slug, meta in cats.items():
        sort = cat_order.index(slug)
        category = categories_repo.upsert(
            slug=slug,
            label=meta["label"],
            hue=meta["v"],  # verbatim, never derived
            sort=sort,
        )
        category_ids[slug] = category.id

    # ── 3. Editions + one Issue per edition (from ED / ED_META). ──
    issue_id_by_edition: dict[str, uuid.UUID] = {}
    for key, name in ed.items():
        edition = editions_repo.upsert(key=key, name=name)
        meta = ed_meta[key]
        issue = issues_repo.upsert(
            edition_id=edition.id,
            issue_number=meta["issue"],
            published_at=_parse_published_at(meta["date"]),
            subject=meta["name"],
            subtitle=meta["sub"],
            source_kind=SEED_SOURCE_KIND,
            source_ref=key,
        )
        issue_id_by_edition[key] = issue.id

    # published_at per edition, used as content.first_seen_at.
    first_seen_by_edition: dict[str, date] = {
        key: _parse_published_at(meta["date"]) for key, meta in ed_meta.items()
    }

    # ── 4. Content + appearances + per-reader state. ──
    # position = the item's 0-based index among items of the SAME edition, in data.js order.
    position_by_edition: dict[str, int] = {}
    for item in items:
        edition_key = item["ed"]
        position = position_by_edition.get(edition_key, 0)
        position_by_edition[edition_key] = position + 1

        domain = item["domain"]
        url = "https://" + domain
        content = content_repo.upsert(
            title=item["title"],
            summary=item["sum"],
            content_type=item["src"],
            url=url,
            domain=domain,
            content_hash=_content_hash(item["id"]),
            first_seen_at=_to_datetime(first_seen_by_edition[edition_key]),
            read_minutes=item.get("read"),  # verbatim, incl. repos that carry a value
            tags=item.get("tags") or [],
            resources=item.get("resources"),  # jsonb, nullable
            editor_note=item.get("why"),  # nullable
        )

        appearances_repo.upsert(
            content_id=content.id,
            issue_id=issue_id_by_edition[edition_key],
            category_id=category_ids.get(item["cat"]),
            position=position,
        )

        # user_content_state IFF starred OR read.
        starred = bool(item.get("starred"))
        read_state = item.get("read_state", "unread")
        if starred or read_state == "read":
            state_repo.upsert(
                user_id=stub_user_id,
                content_id=content.id,
                starred=starred,
                read_state=read_state,
            )

    # ── 5. Collections (smart, global). slug<-id, label<-label, query<-q, hue<-v. ──
    for col in collections:
        collections_repo.upsert(
            slug=col["id"],
            label=col["label"],
            query=col["q"],
            hue=col["v"],  # verbatim
            is_smart=True,
            user_id=None,
        )

    # ── 6. content_embeddings: intentionally ZERO rows (embeddings land in #6). ──

    return {
        "editions": editions_repo.count(),
        "categories": categories_repo.count(),
        "issues": issues_repo.count(),
        "content": content_repo.count(),
        "appearances": appearances_repo.count(),
        "users": users_repo.count(),
        "user_content_state": state_repo.count(),
        "collections": collections_repo.count(),
    }


def _to_datetime(d: date) -> datetime:
    """content.first_seen_at is timestamptz; lift the issue's published_at date to midnight."""
    return datetime(d.year, d.month, d.day)


def seed(*, fixture_path: Path = FIXTURE_PATH) -> dict[str, int]:
    """Load the fixture and seed the configured database in one transaction.

    Opens a ``SessionLocal``, runs the seed, and commits. Returns observed row counts.
    """
    data = load_fixture(fixture_path)
    session = SessionLocal()
    try:
        counts = seed_session(session, data)
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
    return counts


if __name__ == "__main__":  # pragma: no cover - exercised via the CLI / `python -m`
    from recall.jobs.cli import main

    raise SystemExit(main(["seed"]))
