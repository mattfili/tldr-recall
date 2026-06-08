"""Postgres ENUM types (spec §5.1).

These are the canonical enum vocabularies. ``edition.key`` is deliberately NOT an enum
(it is extensible TEXT) — see ``editions.py``.

The string values double as the seed/ingest vocabulary, so we keep plain ``str`` Python
enums whose ``.value`` is exactly the Postgres label.
"""

from __future__ import annotations

import enum

from sqlalchemy.dialects.postgresql import ENUM


class ContentType(enum.StrEnum):
    article = "article"
    repo = "repo"
    website = "website"
    substack = "substack"
    paper = "paper"


class ReadState(enum.StrEnum):
    unread = "unread"
    read = "read"


class EmbeddingKind(enum.StrEnum):
    title = "title"
    summary = "summary"
    combined = "combined"


# Postgres ENUM type objects. ``create_type=False`` so the migration owns DDL creation
# (we create the types explicitly in the migration in dependency order) and table creates
# do not race to CREATE TYPE. ``values_callable`` makes the stored labels the enum values
# (e.g. 'article'), not the member names.
def _pg_enum(py_enum: type[enum.Enum], name: str) -> ENUM:
    return ENUM(
        py_enum,
        name=name,
        create_type=False,
        values_callable=lambda e: [member.value for member in e],
    )


content_type_enum = _pg_enum(ContentType, "content_type")
read_state_enum = _pg_enum(ReadState, "read_state")
embedding_kind_enum = _pg_enum(EmbeddingKind, "embedding_kind")
