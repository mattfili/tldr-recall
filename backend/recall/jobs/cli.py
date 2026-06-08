"""Recall job CLI (Issue #2).

A tiny argparse front-end so the seed job is runnable two ways:

* ``uv run recall seed`` — via the ``[project.scripts]`` console entry (recall.jobs.cli:main).
* ``uv run python -m recall.jobs.seed`` — module execution delegates here.

Further subcommands (ingest, reindex, embed-backfill) land in later issues; this file owns
only ``seed`` for now.
"""

from __future__ import annotations

import argparse
from collections.abc import Sequence

from recall.jobs.seed import seed


def _cmd_seed(_args: argparse.Namespace) -> int:
    counts = seed()
    print("Seed complete. Row counts:")
    for table, n in counts.items():
        print(f"  {table:<20} {n}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="recall", description="Recall job CLI.")
    sub = parser.add_subparsers(dest="command", required=True)

    seed_parser = sub.add_parser("seed", help="Seed the database from the prototype fixture.")
    seed_parser.set_defaults(func=_cmd_seed)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
