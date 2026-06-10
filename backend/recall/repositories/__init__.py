"""Data-access layer — the ONLY application code that touches the ORM (CONTRACT).

The seed job and the API call these repositories; they never import ORM models or open a
Session directly. Each repository wraps a Session and exposes create/upsert + get/count
methods. Repositories flush but do not commit — the caller owns the transaction.
"""

from __future__ import annotations

from recall.repositories.appearances import AppearanceRepository
from recall.repositories.categories import CategoryRepository
from recall.repositories.collections import CollectionRepository
from recall.repositories.content import ContentRepository
from recall.repositories.editions import EditionRepository
from recall.repositories.embeddings import EmbeddingRepository
from recall.repositories.issues import IssueRepository
from recall.repositories.search import SearchRepository
from recall.repositories.url_resolutions import UrlResolutionRepository
from recall.repositories.user_content_state import UserContentStateRepository
from recall.repositories.user_issue_state import UserIssueStateRepository
from recall.repositories.users import UserRepository

__all__ = [
    "AppearanceRepository",
    "CategoryRepository",
    "CollectionRepository",
    "ContentRepository",
    "EditionRepository",
    "EmbeddingRepository",
    "IssueRepository",
    "SearchRepository",
    "UrlResolutionRepository",
    "UserContentStateRepository",
    "UserIssueStateRepository",
    "UserRepository",
]
