"""Ingest-run observability columns (M4, issue #26, spec §6.6).

Widens ``ingest_runs`` for the real pipeline: ``since`` (the window the operator asked
for) plus created/skipped counters for issues, content, and appearances. The legacy
``issues_seen`` / ``content_upserted`` columns from 0001 stay — the pipeline fills them
as derived totals (seen = created + skipped; upserted = content_created) so any existing
dashboard keeps working.

Hand-written (mirrors 0001-0004). ``downgrade`` drops exactly the columns added here.

Revision ID: 0005_ingest_run_counts
Revises: 0004_url_resolutions
Create Date: 2026-06-10
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0005_ingest_run_counts"
down_revision = "0004_url_resolutions"
branch_labels = None
depends_on = None

_COUNT_COLUMNS = (
    "issues_created",
    "issues_skipped",
    "content_created",
    "content_skipped",
    "appearances_created",
    "appearances_skipped",
)


def upgrade() -> None:
    op.add_column("ingest_runs", sa.Column("since", sa.Date(), nullable=True))
    for name in _COUNT_COLUMNS:
        op.add_column(
            "ingest_runs",
            sa.Column(name, sa.Integer(), server_default=sa.text("0"), nullable=False),
        )


def downgrade() -> None:
    for name in reversed(_COUNT_COLUMNS):
        op.drop_column("ingest_runs", name)
    op.drop_column("ingest_runs", "since")
