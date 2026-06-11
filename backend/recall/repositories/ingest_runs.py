"""IngestRun repository — the per-run observability row (spec §6.6, issue #26).

``create`` opens a run (status='running'); ``finish`` stamps finished_at + counts +
final status. The legacy ``issues_seen`` / ``content_upserted`` columns are filled as
derived totals so nothing reading them breaks. Flush, no commit — the caller (the
ingest job) owns the transaction.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import func, select

from recall.models import IngestRun
from recall.repositories.base import Repository

#: The count keys ``finish`` accepts (everything else in the dict is ignored).
COUNT_FIELDS = (
    "issues_created",
    "issues_skipped",
    "content_created",
    "content_skipped",
    "appearances_created",
    "appearances_skipped",
)


class IngestRunRepository(Repository):
    def create(self, *, source_kind: str, since: date | None) -> IngestRun:
        run = IngestRun(source_kind=source_kind, since=since, status="running")
        self.session.add(run)
        self.session.flush()
        return run

    def finish(
        self,
        run: IngestRun,
        *,
        status: str,
        counts: dict[str, int] | None = None,
        error: str | None = None,
    ) -> IngestRun:
        counts = counts or {}
        for field in COUNT_FIELDS:
            setattr(run, field, int(counts.get(field, 0)))
        run.issues_seen = run.issues_created + run.issues_skipped
        run.content_upserted = run.content_created
        run.status = status
        run.error = error
        run.finished_at = datetime.now(UTC)
        self.session.flush()
        return run

    def latest(self) -> IngestRun | None:
        return self.session.scalars(
            select(IngestRun).order_by(IngestRun.started_at.desc()).limit(1)
        ).first()

    def count(self) -> int:
        return self.session.scalar(select(func.count()).select_from(IngestRun)) or 0
