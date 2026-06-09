"""Cloud (OpenAI) embedding + rerank backend (spec §7.1, ADR-0003).

THIS IS THE ONLY MODULE ALLOWED TO ``import openai`` (hard constraint #1). The factory imports
it LAZILY (only when ``backend == 'cloud'``), so importing ``recall.embeddings.factory`` — or
``base``/``fake``/``reranker``/``text`` or the backfill — never transitively pulls openai, and
keyless CI stays green.

``CloudEmbedder`` reads name/dim/key straight from settings (the factory stays a pure
dispatcher). It raises a clear error — WITHOUT leaking the key — when no key is configured.
``CloudReranker`` is a no-op in v1 (mirrors NoOpReranker; reports ``name = 'none'``).
"""

from __future__ import annotations

import openai

from recall.config import settings
from recall.embeddings.base import Candidate

# One OpenAI request per chunk of this many inputs (far fewer round-trips than per-item).
EMBED_BATCH = 100


class CloudEmbedder:
    """OpenAI embeddings backend (implements the base.Embedder Protocol)."""

    def __init__(self) -> None:
        if not settings.embedding_api_key:
            raise RuntimeError(
                "CloudEmbedder requires an embedding API key. Set EMBEDDING_API_KEY in the "
                "repo-root .env (the key value is never logged)."
            )
        self.name = settings.recall_embed_model
        self.dim = settings.recall_embed_dim
        self._client = openai.OpenAI(api_key=settings.embedding_api_key)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Batched embeddings call; vectors returned IN INPUT ORDER."""
        out: list[list[float]] = []
        for start in range(0, len(texts), EMBED_BATCH):
            chunk = texts[start : start + EMBED_BATCH]
            response = self._client.embeddings.create(model=self.name, input=chunk)
            # Sort by .index defensively so each vector pairs with the correct input.
            ordered = sorted(response.data, key=lambda d: d.index)
            out.extend(list(d.embedding) for d in ordered)
        return out

    def embed_query(self, text: str) -> list[float]:
        return self.embed_documents([text])[0]


class CloudReranker:
    """No-op reranker (v1): returns ``candidates[:top_k]`` unchanged (spec §7.1)."""

    name = "none"

    def rerank(self, query: str, candidates: list[Candidate], top_k: int) -> list[Candidate]:
        return candidates[:top_k]
