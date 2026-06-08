"""Embedder / Reranker portability seam (spec §7.1).

Protocols + the Candidate DTO only — no concrete backends. Business logic depends on
these protocols; concrete implementations (cloud, qwen) land in #6 behind factory.py so
no module ever imports a model SDK directly.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from pydantic import BaseModel


class Candidate(BaseModel):
    """A search candidate passed to a Reranker.

    Carries the canonical content id, the text used for reranking, and a score slot the
    reranker fills/updates.
    """

    content_id: str
    text: str
    score: float | None = None


@runtime_checkable
class Embedder(Protocol):
    name: str  # e.g. 'text-embedding-3-small', 'qwen3-embedding-4b'
    dim: int

    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    def embed_query(self, text: str) -> list[float]: ...


@runtime_checkable
class Reranker(Protocol):
    name: str

    def rerank(self, query: str, candidates: list[Candidate], top_k: int) -> list[Candidate]: ...
