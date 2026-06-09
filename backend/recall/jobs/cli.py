"""Recall job CLI (Issue #2).

A tiny argparse front-end so the seed job is runnable two ways:

* ``uv run recall seed`` — via the ``[project.scripts]`` console entry (recall.jobs.cli:main).
* ``uv run python -m recall.jobs.seed`` — module execution delegates here.
* ``uv run recall embed-backfill [--backend ...]`` — embed the ``combined`` kind for all content.

Further subcommands (ingest, reindex) land in later issues.
"""

from __future__ import annotations

import argparse
from collections.abc import Sequence

from recall.jobs.embed_backfill import embed_backfill
from recall.jobs.seed import seed


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

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
