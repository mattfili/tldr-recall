"""Embedder / Reranker factory (spec §7.1).

Reads config to select a backend. The concrete backend lands in #6; until then these
raise NotImplementedError. /health must NOT call these — it reads the configured model
name straight from config without instantiating anything.
"""

from __future__ import annotations

from recall.embeddings.base import Embedder, Reranker


def get_embedder() -> Embedder:
    raise NotImplementedError("concrete backend lands in #6")


def get_reranker() -> Reranker:
    raise NotImplementedError("concrete backend lands in #6")
