"""``GmailExportSource`` — the v1 IngestionSource: a folder of ``.eml`` files (spec §6.2).

Reads ``GMAIL_EXPORT_DIR`` (populated by ``recall gmail-dump`` / ``recall mbox-split``,
§6.8), parses each ``*.eml`` through ``parse_eml`` (§6.3), and yields ``RawIssue``s.
No DB, no network — byte acquisition and persistence both live elsewhere.

Tolerant by contract: ONE unparseable file logs a warning and is skipped; it never kills
the run. The ``since`` filter drops issues published before the window
(``published_at >= since``); ``since=None`` keeps everything.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from datetime import date
from pathlib import Path

from recall.ingestion.base import RawIssue
from recall.ingestion.parser import parse_eml
from recall.jobs.gmail_dump import default_export_dir

logger = logging.getLogger(__name__)


class GmailExportSource:
    """IngestionSource over a folder of raw RFC822 ``.eml`` files."""

    #: Recorded on the ingest_runs row (and on every RawIssue this source emits).
    source_kind = "gmail"

    def __init__(self, export_dir: Path | None = None) -> None:
        self.export_dir = Path(export_dir) if export_dir is not None else default_export_dir()

    def fetch(self, since: date | None) -> Iterator[RawIssue]:
        if not self.export_dir.is_dir():
            logger.warning("export dir %s does not exist; nothing to ingest", self.export_dir)
            return
        for path in sorted(self.export_dir.glob("*.eml")):
            try:
                issue = parse_eml(path)
            except Exception as exc:  # one bad file never kills the run
                logger.warning("skipping unparseable %s: %s", path.name, exc)
                continue
            if since is not None and issue.published_at < since:
                continue
            yield issue
