"""Recall job CLI (Issue #2).

A tiny argparse front-end so the seed job is runnable two ways:

* ``uv run recall seed`` — via the ``[project.scripts]`` console entry (recall.jobs.cli:main).
* ``uv run python -m recall.jobs.seed`` — module execution delegates here.
* ``uv run recall embed-backfill [--backend ...]`` — embed the ``combined`` kind for all content.
* ``uv run recall mbox-split <takeout.mbox>`` — backfill GMAIL_EXPORT_DIR from a Takeout mbox.
* ``uv run recall gmail-dump`` — incremental Gmail API pull into GMAIL_EXPORT_DIR (§6.8).
* ``uv run recall parse <file.eml>`` — parse one TLDR email into RawIssue JSON (§6.3).
* ``uv run recall resolve-url <url>`` — resolve + classify one link (§6.4/§6.5, cached).

Further subcommands (ingest, reindex) land in later issues.
"""

from __future__ import annotations

import argparse
from collections.abc import Sequence
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

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
