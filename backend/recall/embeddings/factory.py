"""Embedder / Reranker factory (spec §7.1).

Reads config to select a backend, with an optional ``backend`` override (the orchestrator
forces ``'cloud'`` for the real run; tests force ``'fake'``; ``None`` means production reads
config). /health must NOT call these — it reads the configured model name straight from
config (``settings.embedder_name``) without instantiating anything.

OPENAI ISOLATION (hard constraint #1): the openai-bearing ``CloudEmbedder`` / ``CloudReranker``
are imported LAZILY — the ``from recall.embeddings.cloud import ...`` statements live INSIDE the
``'cloud'`` branches, never at module top — so importing this factory never pulls openai. The
sole ``import openai`` site is ``recall.embeddings.cloud``.
"""

from __future__ import annotations

from recall.config import settings
from recall.embeddings.base import Embedder, Reranker


def active_model_name(backend: str | None = None) -> str:
    """The ACTIVE embedding model name, computed from CONFIG ONLY (#7 degradation gate).

    This is the first input to the key-free degradation gate (ADR-0003): the search service
    resolves the active model name WITHOUT instantiating an embedder and WITHOUT importing
    openai, then checks ``EmbeddingRepository.count_for(combined, active_model)``. Each embedder's
    ``.name`` equals the value this returns for its backend, so rows written under a backend carry
    ``model == active_model_name(that_backend)``.

    * ``cloud`` -> ``settings.recall_embed_model`` (== ``CloudEmbedder.name``).
    * ``fake``  -> ``f"fake-{settings.recall_embed_dim}"`` (== ``FakeEmbedder.name``).
    * ``qwen``  -> not yet implemented.
    """
    backend = (backend or settings.recall_embed_backend or "").lower()
    if backend == "cloud":
        return settings.recall_embed_model
    if backend == "fake":
        return f"fake-{settings.recall_embed_dim}"
    if backend == "qwen":
        raise NotImplementedError("qwen embed backend lands later")
    raise ValueError(f"unknown embed backend: {backend!r}")


def get_embedder(backend: str | None = None) -> Embedder:
    """Return the configured Embedder. ``backend`` overrides ``settings.recall_embed_backend``."""
    backend = (backend or settings.recall_embed_backend or "").lower()

    if backend == "cloud":
        from recall.embeddings.cloud import CloudEmbedder  # lazy: only place openai is reachable

        return CloudEmbedder()
    if backend == "fake":
        from recall.embeddings.fake import FakeEmbedder

        return FakeEmbedder()
    if backend == "qwen":
        raise NotImplementedError("qwen embed backend lands later")
    raise ValueError(f"unknown embed backend: {backend!r}")


def get_reranker(backend: str | None = None) -> Reranker:
    """Return the configured Reranker. ``backend`` overrides ``settings.recall_rerank_backend``."""
    backend = (backend or settings.recall_rerank_backend or "").lower()

    if backend == "none":
        from recall.embeddings.reranker import NoOpReranker

        return NoOpReranker()
    if backend == "cloud":
        from recall.embeddings.cloud import CloudReranker  # lazy (no-op in v1)

        return CloudReranker()
    if backend == "qwen":
        raise NotImplementedError("qwen rerank backend lands later")
    raise ValueError(f"unknown rerank backend: {backend!r}")
