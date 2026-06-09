"""NoOpReranker — the v1 reranker (spec §7.1).

Reranking is a no-op in v1: it returns the top-k candidates IN THE GIVEN ORDER without
reordering or mutating scores. It reports ``name = 'none'`` so callers can see the configured
intent. A real cross-encoder reranker lands later (qwen / cloud).

Pure stdlib — no model SDK. Implements the base.Reranker Protocol structurally.
"""

from __future__ import annotations

from recall.embeddings.base import Candidate


class NoOpReranker:
    """Returns ``candidates[:top_k]`` unchanged (no reorder, no score mutation)."""

    name = "none"

    def rerank(self, query: str, candidates: list[Candidate], top_k: int) -> list[Candidate]:
        return candidates[:top_k]
