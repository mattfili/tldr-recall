"""Pydantic request/response models — the API contract (spec §9, ADR-0001).

These schemas are the SINGLE SOURCE OF TRUTH for response shapes and are mirrored in
``frontend/src/types.ts``. The read endpoints (#3) export Edition / IssueSummary /
IssueDetail / Content / the generic Page envelope.
"""

from __future__ import annotations

from recall.schemas.category import Category
from recall.schemas.common import (
    Appearance,
    CategoryRef,
    Content,
    EditionRef,
    IssueRef,
    Page,
)
from recall.schemas.edition import Edition
from recall.schemas.issue import (
    IssueDetail,
    IssueMeta,
    IssueReadState,
    IssueSection,
    IssueSummary,
)
from recall.schemas.saves import SaveState
from recall.schemas.search import (
    CollectionRef,
    DetectedIntent,
    MatchExplanation,
    SearchFilters,
    SearchHit,
    SearchRequest,
    SearchResponse,
)

__all__ = [
    "Appearance",
    "Category",
    "CategoryRef",
    "CollectionRef",
    "Content",
    "DetectedIntent",
    "Edition",
    "EditionRef",
    "IssueDetail",
    "IssueMeta",
    "IssueReadState",
    "IssueRef",
    "IssueSection",
    "IssueSummary",
    "MatchExplanation",
    "Page",
    "SaveState",
    "SearchFilters",
    "SearchHit",
    "SearchRequest",
    "SearchResponse",
]
