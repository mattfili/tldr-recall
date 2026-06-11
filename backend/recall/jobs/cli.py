"""Recall job CLI (Issue #2).

A tiny argparse front-end so the seed job is runnable two ways:

* ``uv run recall seed`` — via the ``[project.scripts]`` console entry (recall.jobs.cli:main).
* ``uv run python -m recall.jobs.seed`` — module execution delegates here.
* ``uv run recall embed-backfill [--backend ...]`` — embed the ``combined`` kind for all content.
* ``uv run recall mbox-split <takeout.mbox>`` — backfill GMAIL_EXPORT_DIR from a Takeout mbox.
* ``uv run recall gmail-dump`` — incremental Gmail API pull into GMAIL_EXPORT_DIR (§6.8).
* ``uv run recall parse <file.eml>`` — parse one TLDR email into RawIssue JSON (§6.3).
* ``uv run recall resolve-url <url>`` — resolve + classify one link (§6.4/§6.5, cached).
* ``uv run recall ingest [--since YYYY-MM-DD] [--replace]`` — the M4 pipeline (§6.1, #26):
  GMAIL_EXPORT_DIR's .eml corpus -> issues/content/appearances. Ingestion is CLI-only:
  ``POST /admin/ingest`` is explicitly deferred (no server-fetchable source exists in v1 —
  documented deviation from spec §6.6).
"""

from __future__ import annotations

import argparse
from collections.abc import Sequence
from datetime import date, timedelta
from pathlib import Path

from recall.ingestion.parser import parse_eml
from recall.jobs import gmail_dump as dump
from recall.jobs.embed_backfill import embed_backfill
from recall.jobs.seed import seed


def _cmd_resolve_url(args: argparse.Namespace) -> int:
    # Imports kept local: resolve.py is the network-touching ingestion module and pulls in
    # httpx; the other subcommands never need it.
    from recall.db import SessionLocal
    from recall.ingestion.base import RawArticle
    from recall.ingestion.classify import classify_type
    from recall.ingestion.resolve import resolve_url
    from recall.repositories import UrlResolutionRepository

    session = SessionLocal()
    try:
        repo = UrlResolutionRepository(session)
        resolved, domain = resolve_url(args.url, repo=repo)
        content_type = classify_type(domain, resolved, RawArticle(title="", summary=""))
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

    print(f"resolved: {resolved}")
    print(f"domain:   {domain or ''}")
    print(f"type:     {content_type.value}")
    return 0


def _cmd_ingest(args: argparse.Namespace) -> int:
    # Lazy import: pipeline.py pulls in httpx via resolve.py (same convention as
    # _cmd_resolve_url) — the other subcommands never need it.
    from recall.ingestion.gmail_export import GmailExportSource
    from recall.ingestion.pipeline import ingest

    since = date.fromisoformat(args.since) if args.since else date.today() - timedelta(days=90)
    source = GmailExportSource()
    print(f"Ingesting *.eml from {source.export_dir} (since {since.isoformat()}"
          f"{', REPLACING demo data' if args.replace else ''}) ...")
    counts = ingest(since=since, replace=args.replace, source=source)
    print("Ingest complete. Counts:")
    for label, n in counts.items():
        print(f"  {label:<24} {n}")
    print("Embeddings are NOT enqueued — run `uv run recall embed-backfill` to light up "
          "hybrid search.")
    return 0


def _cmd_seed(_args: argparse.Namespace) -> int:
    counts = seed()
    print("Seed complete. Row counts:")
    for table, n in counts.items():
        print(f"  {table:<20} {n}")
    return 0


def _cmd_embed_backfill(args: argparse.Namespace) -> int:
    counts = embed_backfill(backend=args.backend)
    print("Embed backfill complete. Counts:")
    for label, n in counts.items():
        print(f"  {label:<20} {n}")
    return 0


def _cmd_mbox_split(args: argparse.Namespace) -> int:
    counts = dump.mbox_split(
        args.mbox,
        args.dest or dump.default_export_dir(),
        sender_filter=None if args.all else dump.TLDR_SENDER,
    )
    print("mbox split complete. Counts:")
    for label, n in counts.items():
        print(f"  {label:<20} {n}")
    return 0


def _cmd_gmail_dump(args: argparse.Namespace) -> int:
    counts = dump.gmail_dump(
        args.dest or dump.default_export_dir(),
        query=args.query,
        credentials_path=Path(args.credentials),
        token_path=Path(args.token),
    )
    print("Gmail dump complete. Counts:")
    for label, n in counts.items():
        print(f"  {label:<20} {n}")
    return 0


def _cmd_parse(args: argparse.Namespace) -> int:
    issue = parse_eml(Path(args.eml))
    print(issue.model_dump_json(indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="recall", description="Recall job CLI.")
    sub = parser.add_subparsers(dest="command", required=True)

    seed_parser = sub.add_parser("seed", help="Seed the database from the prototype fixture.")
    seed_parser.set_defaults(func=_cmd_seed)

    embed_parser = sub.add_parser(
        "embed-backfill",
        help="Embed the 'combined' kind for every un-embedded Content (idempotent).",
    )
    embed_parser.add_argument(
        "--backend",
        default=None,
        help="Override the embed backend (default: settings.recall_embed_backend). "
        "Orchestrator uses 'cloud'; tests use 'fake'.",
    )
    embed_parser.set_defaults(func=_cmd_embed_backfill)

    split_parser = sub.add_parser(
        "mbox-split",
        help="Split a Google Takeout mbox into per-message .eml in GMAIL_EXPORT_DIR (§6.8).",
    )
    split_parser.add_argument("mbox", help="Path to the Takeout .mbox file.")
    split_parser.add_argument(
        "--dest", default=None, help="Output folder (default: GMAIL_EXPORT_DIR)."
    )
    split_parser.add_argument(
        "--all",
        action="store_true",
        help=f"Keep every message (default keeps only From containing {dump.TLDR_SENDER}).",
    )
    split_parser.set_defaults(func=_cmd_mbox_split)

    dump_parser = sub.add_parser(
        "gmail-dump",
        help="Pull raw TLDR emails via the Gmail API into GMAIL_EXPORT_DIR (§6.8). "
        "Needs the 'gmail' dependency group: uv sync --group gmail.",
    )
    dump_parser.add_argument(
        "--query",
        default=dump.DEFAULT_QUERY,
        help=f"Gmail query (default: {dump.DEFAULT_QUERY!r}).",
    )
    dump_parser.add_argument(
        "--dest", default=None, help="Output folder (default: GMAIL_EXPORT_DIR)."
    )
    dump_parser.add_argument(
        "--credentials",
        default=str(dump.DEFAULT_CREDENTIALS_PATH),
        help="OAuth 'Desktop app' client JSON (never committed).",
    )
    dump_parser.add_argument(
        "--token",
        default=str(dump.DEFAULT_TOKEN_PATH),
        help="Cached OAuth token path (created on first run).",
    )
    dump_parser.set_defaults(func=_cmd_gmail_dump)

    parse_parser = sub.add_parser(
        "parse",
        help="Parse one TLDR .eml into RawIssue JSON (§6.3); sponsor blocks are skipped.",
    )
    parse_parser.add_argument("eml", help="Path to the .eml file (raw RFC822 message).")
    parse_parser.set_defaults(func=_cmd_parse)

    resolve_parser = sub.add_parser(
        "resolve-url",
        help="Resolve one (tracking) URL to its destination + domain and classify its "
        "content type (§6.4/§6.5). Results are cached in url_resolutions — each distinct "
        "link is fetched at most once ever.",
    )
    resolve_parser.add_argument("url", help="Raw URL (e.g. a TLDR tracking link).")
    resolve_parser.set_defaults(func=_cmd_resolve_url)

    ingest_parser = sub.add_parser(
        "ingest",
        help="Ingest GMAIL_EXPORT_DIR's .eml corpus: upsert issues/content/appearances "
        "(idempotent — reruns never duplicate). Embeddings are NOT enqueued; run "
        "`recall embed-backfill` afterwards. POST /admin/ingest is deferred (no "
        "server-fetchable source in v1; documented deviation from spec §6.6).",
    )
    ingest_parser.add_argument(
        "--since",
        default=None,
        metavar="YYYY-MM-DD",
        help="Only ingest issues published on/after this date "
        "(default: 90 days before today — the 3-month corpus window).",
    )
    ingest_parser.add_argument(
        "--replace",
        action="store_true",
        help="FIRST wipe the demo data (content, appearances, embeddings, per-reader "
        "state, issues), THEN ingest fresh. Editions, categories, collections, users, "
        "and the url_resolutions etiquette cache are kept (upserts handle them).",
    )
    ingest_parser.set_defaults(func=_cmd_ingest)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
