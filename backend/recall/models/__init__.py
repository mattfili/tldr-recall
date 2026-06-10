"""SQLAlchemy ORM models (spec §5.2, ADR-0001).

Importing this package imports every model module, so ``Base.metadata`` is fully populated
for Alembic and the repositories. ORM-access discipline: only this package and
``recall.repositories`` (plus ``recall.alembic``) may import these classes.
"""

from __future__ import annotations

from recall.models.appearance import ContentAppearance
from recall.models.base import Base
from recall.models.category import Category
from recall.models.collection import Collection
from recall.models.content import Content
from recall.models.edition import Edition
from recall.models.embedding import EMBED_DIM, ContentEmbedding
from recall.models.enums import (
    ContentType,
    EmbeddingKind,
    ReadState,
    content_type_enum,
    embedding_kind_enum,
    read_state_enum,
)
from recall.models.ingest_run import IngestRun
from recall.models.issue import Issue
from recall.models.url_resolution import UrlResolution
from recall.models.user import User
from recall.models.user_content_state import UserContentState
from recall.models.user_issue_state import UserIssueState

__all__ = [
    "EMBED_DIM",
    "Base",
    "Category",
    "Collection",
    "Content",
    "ContentAppearance",
    "ContentEmbedding",
    "ContentType",
    "Edition",
    "EmbeddingKind",
    "IngestRun",
    "Issue",
    "ReadState",
    "UrlResolution",
    "User",
    "UserContentState",
    "UserIssueState",
    "content_type_enum",
    "embedding_kind_enum",
    "read_state_enum",
]
