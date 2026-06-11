"""The ingestion pipeline: ``RawIssue`` stream -> Postgres (spec §6.1, issue #26).

Source-agnostic — any ``IngestionSource`` works. For each raw issue:

* **Issue** — idempotent on ``source_ref`` first, then ``(edition, issue_number)``, then
  ``(edition, published_at)`` (the NULL-issue_number guard; see
  ``IssueRepository.upsert_from_source``). Two real messages for the same edition+date
  deliberately collapse into one issue.
* **Edition** — unknown edition keys AUTO-CREATE a row (CONTEXT.md: editions are stored,
  not enumerated). Get-or-create only — an existing edition's display name is never
  overwritten with a derived one.
* **Category** — ``resolve_or_create_category``: normalized exact match against existing
  labels, then a seeded-slug keyword table, else a NEW row with a generated slug, the
  literal default hue (``var(--c-misc)`` — hue is verbatim, NEVER derived per the house
  rule), and ``sort = max(existing) + 1``.
* **Content** — global dedupe on ``content_hash`` = sha256 of the NORMALIZED resolved URL
  (ADR-0001); normalization lowercases scheme+host, drops default ports + the fragment,
  and strips common tracking params (``utm_*``, fbclid, gclid, mc_cid, mc_eid). When
  resolution failed (cached ``ok=False``) the hash falls back to sha256(raw_url),
  un-normalized. Editorial text is FIRST-SEEN-WINS — never overwritten on re-sight.
* **Appearance** — unique on (issue_id, content_id); records category + a running
  0-based position across the whole issue.

Each run writes an ``ingest_runs`` row (source kind, since, created/skipped counts,
started/finished/status). Embeddings are NOT enqueued here — the operator runs
``recall embed-backfill`` afterwards (ADR-0003 covers the keyless interim).

INGESTION-ONLY: imports ``resolve`` (httpx) — never import from request-serving paths.
Transaction ownership mirrors ``jobs/seed.py``: ``ingest_session`` flushes through the
repositories only; ``ingest`` owns SessionLocal/commit/rollback/close. On failure the
error ingest_runs row is written in a FRESH short session (the rolled-back transaction
would otherwise swallow it).
"""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import date, datetime
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
from sqlalchemy.orm import Session

from recall.db import SessionLocal
from recall.ingestion.base import IngestionSource, RawIssue
from recall.ingestion.classify import classify_type
from recall.ingestion.resolve import resolve_url
from recall.models import Category
from recall.repositories import (
    AppearanceRepository,
    CategoryRepository,
    ContentRepository,
    EditionRepository,
    EmbeddingRepository,
    IngestRunRepository,
    IssueRepository,
    UrlResolutionRepository,
    UserContentStateRepository,
    UserIssueStateRepository,
)

logger = logging.getLogger(__name__)

#: New categories get this literal hue. NEVER derive ``var(--c-<slug>)`` — hue strings are
#: verbatim values, not slug-coupled (locked house rule, see models/category.py).
DEFAULT_CATEGORY_HUE = "var(--c-misc)"

#: Exact-match tracking params stripped during URL normalization (plus any ``utm_*``).
_TRACKING_PARAMS = frozenset({"fbclid", "gclid", "mc_cid", "mc_eid"})

#: Known edition keys -> display names (matches the seed). Unknown keys derive
#: ``"TLDR " + key.capitalize()`` ("webdev" -> "TLDR Webdev").
_EDITION_NAMES = {"tldr": "TLDR", "ai": "TLDR AI", "founders": "TLDR Founders"}

#: Seeded-slug keyword table for category resolution (checked in order against the
#: NORMALIZED label). Only applies when the slug actually exists in the DB.
_CATEGORY_KEYWORDS: tuple[tuple[str, str], ...] = (
    ("headline", "headlines"),
    ("big tech", "bigtech"),
    ("strateg", "strategy"),
    ("science", "science"),
    ("programming", "prog"),
    ("deep dive", "deep"),
    ("tools", "tools"),
    ("resources", "tools"),
    ("engineering", "eng"),
    ("research", "eng"),
    ("miscellaneous", "misc"),
)


# ── URL normalization + content_hash (ADR-0001) ──────────────────────────────────────


def normalize_url(url: str) -> str:
    """Canonical form of a resolved URL for global dedupe.

    Lowercases scheme + host, drops default ports (:80 http / :443 https), strips the
    fragment, and drops tracking query params (``utm_*`` prefix or the fbclid/gclid/
    mc_cid/mc_eid set). Remaining param order and the path are preserved verbatim.
    """
    parts = urlsplit(url)
    scheme = parts.scheme.lower()
    host = (parts.hostname or "").lower()
    netloc = host
    if parts.port is not None and not (
        (scheme == "http" and parts.port == 80) or (scheme == "https" and parts.port == 443)
    ):
        netloc = f"{host}:{parts.port}"
    kept = [
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if not k.lower().startswith("utm_") and k.lower() not in _TRACKING_PARAMS
    ]
    return urlunsplit((scheme, netloc, parts.path, urlencode(kept), ""))


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# ── category resolution ───────────────────────────────────────────────────────────────


def _normalize_label(label: str) -> str:
    """Lowercase, '&' -> 'and', strip emoji/punctuation runs to single spaces."""
    lowered = label.lower().replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", " ", lowered).strip()


def _slugify(label: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
    return slug or "category"


class _CategoryResolver:
    """resolve-or-create with a per-run cache (spec §6.5).

    Order: (1) exact normalized-label match against EXISTING rows (DB-driven, so reruns
    also catch previously auto-created categories); (2) seeded-slug keyword contains
    match; (3) create with generated slug (collision-suffixed), label verbatim,
    ``DEFAULT_CATEGORY_HUE``, sort appended after the current max.
    """

    def __init__(self, repo: CategoryRepository) -> None:
        self.repo = repo
        self._by_normalized: dict[str, Category] = {
            _normalize_label(c.label): c for c in repo.list_all()
        }

    def resolve(self, label: str) -> Category:
        normalized = _normalize_label(label)
        cached = self._by_normalized.get(normalized)
        if cached is not None:
            return cached

        for keyword, slug in _CATEGORY_KEYWORDS:
            if keyword in normalized:
                seeded = self.repo.get_by_slug(slug)
                if seeded is not None:
                    self._by_normalized[normalized] = seeded
                    return seeded

        slug = _slugify(label)
        candidate, n = slug, 2
        while self.repo.get_by_slug(candidate) is not None:
            candidate, n = f"{slug}-{n}", n + 1
        next_sort = max((c.sort for c in self.repo.list_all()), default=-1) + 1
        category = self.repo.upsert(
            slug=candidate, label=label, hue=DEFAULT_CATEGORY_HUE, sort=next_sort
        )
        logger.info("auto-created category %r (slug=%s)", label, candidate)
        self._by_normalized[normalized] = category
        return category


# ── editions ──────────────────────────────────────────────────────────────────────────


def _edition_display_name(key: str) -> str:
    return _EDITION_NAMES.get(key, f"TLDR {key.capitalize()}")


# ── the wipe (--replace) ──────────────────────────────────────────────────────────────


def wipe_demo_data(session: Session) -> dict[str, int]:
    """Delete the demo corpus in FK-safe order; return per-table deleted counts.

    Wiped: per-reader state (no DB cascade — first), embeddings, appearances, content,
    issues. KEPT: editions, categories, users, collections, ingest_runs, and
    url_resolutions (an etiquette cache — each distinct link is fetched at most once
    EVER — not demo data).
    """
    return {
        "user_content_state": UserContentStateRepository(session).delete_all(),
        "user_issue_state": UserIssueStateRepository(session).delete_all(),
        "content_embeddings": EmbeddingRepository(session).delete_all(),
        "content_appearances": AppearanceRepository(session).delete_all(),
        "content": ContentRepository(session).delete_all(),
        "issues": IssueRepository(session).delete_all(),
    }


# ── the pipeline loop ─────────────────────────────────────────────────────────────────


def _to_datetime(d: date) -> datetime:
    """content.first_seen_at is timestamptz; lift the issue's published_at to midnight."""
    return datetime(d.year, d.month, d.day)


def _ingest_issue(
    raw_issue: RawIssue,
    *,
    session: Session,
    resolver: _CategoryResolver,
    counts: dict[str, int],
    http_client: httpx.Client | None,
) -> None:
    """Upsert one raw issue + its articles into the session (flush only)."""
    editions_repo = EditionRepository(session)
    issues_repo = IssueRepository(session)
    content_repo = ContentRepository(session)
    appearances_repo = AppearanceRepository(session)
    url_repo = UrlResolutionRepository(session)

    # Edition: get-or-create ONLY (upsert on an existing key would clobber the seeded
    # display name, e.g. "TLDR AI" -> "TLDR Ai").
    edition = editions_repo.get_by_key(raw_issue.edition_key)
    if edition is None:
        edition = editions_repo.upsert(
            key=raw_issue.edition_key, name=_edition_display_name(raw_issue.edition_key)
        )
        logger.info("auto-created edition %r (%s)", edition.name, edition.key)

    issue, created = issues_repo.upsert_from_source(
        edition_id=edition.id,
        issue_number=raw_issue.issue_number,
        published_at=raw_issue.published_at,
        subject=raw_issue.subject,
        subtitle=raw_issue.subtitle,
        source_kind=raw_issue.source_kind,
        source_ref=raw_issue.source_ref,
    )
    counts["issues_created" if created else "issues_skipped"] += 1

    position = 0  # running position across the WHOLE issue (all sections)
    for section in raw_issue.sections:
        category = resolver.resolve(section.category_label)
        for raw_article in section.articles:
            if not raw_article.raw_url:
                logger.warning(
                    "skipping article %r in %s: no URL (content.url is NOT NULL)",
                    raw_article.title,
                    raw_issue.source_ref,
                )
                counts["articles_skipped"] += 1
                continue

            resolved, domain = resolve_url(
                raw_article.raw_url, repo=url_repo, client=http_client
            )
            cache_row = url_repo.get(raw_article.raw_url)
            resolution_ok = cache_row.ok if cache_row is not None else True
            # ADR-0001: hash the NORMALIZED resolved URL; fall back to the raw URL
            # (un-normalized) when resolution failed so distinct dead links never collide.
            content_hash = _sha256(
                normalize_url(resolved) if resolution_ok else raw_article.raw_url
            )
            content_type = classify_type(domain, resolved, raw_article)

            # upsert() is first-seen-wins but does not report created-vs-existing; the
            # pre-check keeps its signature stable (seed.py depends on it).
            existed = content_repo.get_by_hash(content_hash) is not None
            content = content_repo.upsert(
                title=raw_article.title,
                summary=raw_article.summary,
                content_type=content_type,
                url=resolved,
                domain=domain or "",
                content_hash=content_hash,
                first_seen_at=_to_datetime(raw_issue.published_at),
                read_minutes=raw_article.read_minutes,
                tags=[],
                resources=raw_article.resources,
            )
            counts["content_skipped" if existed else "content_created"] += 1

            appearance_existed = (
                appearances_repo.get(issue_id=issue.id, content_id=content.id) is not None
            )
            appearances_repo.upsert(
                content_id=content.id,
                issue_id=issue.id,
                category_id=category.id,
                position=position,
            )
            counts["appearances_skipped" if appearance_existed else "appearances_created"] += 1
            position += 1


def ingest_session(
    session: Session,
    source: IngestionSource,
    *,
    since: date | None,
    replace: bool = False,
    http_client: httpx.Client | None = None,
) -> dict[str, int]:
    """Run the §6.1 loop into ``session``. Flushes only — the caller owns the commit.

    Writes the ``ingest_runs`` row (created up front as 'running', finished 'ok' with the
    counts). With ``replace=True`` the demo corpus is wiped FIRST (``wipe_demo_data``);
    the per-table deleted counts come back as ``wiped_*`` keys. ``http_client`` is the
    test seam threaded through ``resolve_url``.
    """
    run_repo = IngestRunRepository(session)
    source_kind = getattr(source, "source_kind", type(source).__name__)
    run = run_repo.create(source_kind=source_kind, since=since)

    counts: dict[str, int] = {
        "issues_created": 0,
        "issues_skipped": 0,
        "content_created": 0,
        "content_skipped": 0,
        "appearances_created": 0,
        "appearances_skipped": 0,
        "articles_skipped": 0,
    }
    if replace:
        wiped = wipe_demo_data(session)
        counts.update({f"wiped_{table}": n for table, n in wiped.items()})

    resolver = _CategoryResolver(CategoryRepository(session))
    for raw_issue in source.fetch(since):
        _ingest_issue(
            raw_issue,
            session=session,
            resolver=resolver,
            counts=counts,
            http_client=http_client,
        )

    run_repo.finish(run, status="ok", counts=counts)
    return counts


def ingest(
    *,
    since: date | None,
    replace: bool = False,
    source: IngestionSource | None = None,
) -> dict[str, int]:
    """One transactional ingest run against the configured database. Returns counts.

    Mirrors ``jobs/seed.py``: opens a ``SessionLocal``, commits once, rolls back +
    re-raises on error. A failed run still gets a status='error' ``ingest_runs`` row,
    written in a fresh short session AFTER the rollback.
    """
    if source is None:
        from recall.ingestion.gmail_export import GmailExportSource

        source = GmailExportSource()

    session = SessionLocal()
    try:
        counts = ingest_session(session, source, since=since, replace=replace)
        session.commit()
    except Exception as exc:
        session.rollback()
        _record_failed_run(
            source_kind=getattr(source, "source_kind", type(source).__name__),
            since=since,
            error=exc,
        )
        raise
    finally:
        session.close()
    return counts


def _record_failed_run(*, source_kind: str, since: date | None, error: Exception) -> None:
    """Persist a status='error' ingest_runs row in its own session (post-rollback)."""
    try:
        session = SessionLocal()
        try:
            repo = IngestRunRepository(session)
            run = repo.create(source_kind=source_kind, since=since)
            repo.finish(run, status="error", error=f"{type(error).__name__}: {error}")
            session.commit()
        finally:
            session.close()
    except Exception:  # never mask the original ingest failure
        logger.exception("failed to record the error ingest_runs row")
