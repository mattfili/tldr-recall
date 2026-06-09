"""Lexical FTS column for unified hybrid search (#7, spec §8, ADR-0001/0003).

Adds a STORED generated ``tsvector`` column ``search_tsv`` on ``content`` plus a GIN index
for fast ``@@`` matching. The vector is weighted A>B>C>D so title hits outrank summary, then
tags, then domain when ranked by ``ts_rank_cd``:

    setweight(to_tsvector('english', coalesce(title,'')),   'A') ||
    setweight(to_tsvector('english', coalesce(summary,'')), 'B') ||
    setweight(to_tsvector('english', array_to_string(tags,' ')), 'C') ||
    setweight(to_tsvector('english', coalesce(domain,'')),  'D')

Every component function must be IMMUTABLE for a STORED generated column to be legal:
``to_tsvector(regconfig, text)`` over the SCHEMA-QUALIFIED ``'pg_catalog.english'::regconfig``
cast is IMMUTABLE; ``coalesce`` and ``setweight`` are IMMUTABLE. The plain two-arg
``to_tsvector('english', ...)`` form is only STABLE because it resolves the config name through
``search_path``; the schema-qualified regconfig cast pins it.

THE ONE NON-IMMUTABLE PIECE: ``array_to_string(anyarray, text)`` is only STABLE in this PG build
(it can call element output functions), and ``tags::text`` is stable for the same reason — both
are rejected inside a STORED expression. So we wrap the tag join in a tiny IMMUTABLE SQL helper
``recall_tags_text(text[]) -> text`` created in this migration; feeding its result into
``to_tsvector('pg_catalog.english'::regconfig, ...)`` keeps the whole expression immutable AND
keeps english stemming on tags (weight 'C'). Postgres then computes the column for ALL existing
rows at ADD time and auto-maintains it on every future INSERT/UPDATE: no separate backfill step,
no trigger.

Hand-written (mirrors 0001/0002). Touches only ``content``; ``content_embeddings`` + the HNSW
index from 0001 are untouched (the vector arm reuses them). ``downgrade`` is the exact reverse
(drop index, then drop column — the column drop removes the generated expression).

Revision ID: 0003_search_tsv
Revises: 0002_saves_issue_read
Create Date: 2026-06-09
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "0003_search_tsv"
down_revision = "0002_saves_issue_read"
branch_labels = None
depends_on = None

# IMMUTABLE helper joining the text[] tags with a space. array_to_string itself is only STABLE
# in this PG build, so wrapping it in an IMMUTABLE SQL function makes the STORED expression legal
# while preserving english stemming on tags. Kept identical to the ORM mapping in
# recall.models.content so Base.metadata never drifts from the migrated schema.
TAGS_FN_CREATE = (
    "CREATE FUNCTION recall_tags_text(text[]) RETURNS text "
    "LANGUAGE sql IMMUTABLE PARALLEL SAFE AS "
    "$$ SELECT coalesce(array_to_string($1, ' '), '') $$"
)
TAGS_FN_DROP = "DROP FUNCTION recall_tags_text(text[])"

# The generated-column expression. Kept identical to the ORM mapping in recall.models.content.
SEARCH_TSV_EXPRESSION = (
    "setweight(to_tsvector('pg_catalog.english'::regconfig, coalesce(title, '')), 'A') || "
    "setweight(to_tsvector('pg_catalog.english'::regconfig, coalesce(summary, '')), 'B') || "
    "setweight(to_tsvector('pg_catalog.english'::regconfig, recall_tags_text(tags)), 'C') || "
    "setweight(to_tsvector('pg_catalog.english'::regconfig, coalesce(domain, '')), 'D')"
)


def upgrade() -> None:
    # IMMUTABLE tag-join helper, then the STORED generated tsvector that uses it. Postgres
    # backfills all existing rows at ADD time and auto-maintains it thereafter.
    op.execute(TAGS_FN_CREATE)
    op.add_column(
        "content",
        sa.Column(
            "search_tsv",
            postgresql.TSVECTOR(),
            sa.Computed(SEARCH_TSV_EXPRESSION, persisted=True),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_content_search_tsv",
        "content",
        ["search_tsv"],
        postgresql_using="gin",
    )


def downgrade() -> None:
    # Exact reverse: drop the index, then the column (which removes the generated expression),
    # then the now-unreferenced helper function.
    op.drop_index("ix_content_search_tsv", table_name="content")
    op.drop_column("content", "search_tsv")
    op.execute(TAGS_FN_DROP)
