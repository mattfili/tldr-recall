"""URL resolution cache table (spec §6.4, issue #23).

Creates ``url_resolutions``: one row per distinct raw (tracking) URL, recording the
resolved destination + parsed domain, an ``ok`` flag (False = degraded fallback), and
``resolved_at``. ``raw_url`` is the unique cache key — each distinct link is fetched at
most once EVER (resolution requests register as clicks in TLDR's analytics, so the cache
is etiquette, not just speed).

Hand-written (mirrors 0001-0003). ``downgrade`` drops the table — exact reverse.

Revision ID: 0004_url_resolutions
Revises: 0003_search_tsv
Create Date: 2026-06-10
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "0004_url_resolutions"
down_revision = "0003_search_tsv"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "url_resolutions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("raw_url", sa.String(), nullable=False),
        sa.Column("resolved_url", sa.String(), nullable=False),
        sa.Column("domain", sa.String(), nullable=True),
        sa.Column("ok", sa.Boolean(), nullable=False),
        sa.Column(
            "resolved_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("raw_url", name="uq_url_resolutions_raw_url"),
    )


def downgrade() -> None:
    op.drop_table("url_resolutions")
