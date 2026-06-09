"""Deterministic FakeEmbedder for tests / keyless CI (grilled scope for #6, 2026-06-09).

The real backfill runs locally off the ``.env`` key via ``CloudEmbedder`` (the orchestrator
runs ``embed-backfill --backend cloud`` separately). Tests and CI run WITHOUT a key by forcing
``--backend fake``, which selects this embedder.

DETERMINISTIC: the same text always maps to the same vector — across calls AND across
processes — because the vector is derived purely from a stable hash of the text (no
per-instance or per-process state, no clock, no global RNG). The vector is L2-normalized so it
behaves like a real cosine-space embedding.

DISTINCT MODEL NAME: ``name = f'fake-{dim}'`` (NOT the real ``text-embedding-3-small``) so its
rows never collide with real rows under ``unique(content_id, kind, model)`` and are trivially
deletable by ``model LIKE 'fake-%'``. At the default ``dim==1536`` this is ``'fake-1536'`` (the
``FAKE_MODEL_NAME`` constant, kept for the #6 tests). The name is parameterised on ``dim`` so it
EQUALS ``factory.active_model_name('fake')`` for ANY dim — the #7 degradation gate's invariant.

NO model SDK import here — only stdlib. ``dim`` defaults to the configured embed dim (1536).
"""

from __future__ import annotations

import hashlib
import math
import random

from recall.config import settings

FAKE_MODEL_NAME = "fake-1536"


class FakeEmbedder:
    """A deterministic, key-free Embedder (implements the base.Embedder Protocol)."""

    def __init__(self, *, dim: int | None = None) -> None:
        self.dim = dim if dim is not None else settings.recall_embed_dim
        # name == active_model_name('fake') == f"fake-{dim}" (the #7 gating invariant). At the
        # default dim==1536 this equals FAKE_MODEL_NAME ('fake-1536'), so the #6 tests still hold.
        self.name = f"fake-{self.dim}"

    def _embed_one(self, text: str) -> list[float]:
        # Seed a PRNG from a stable 64-bit hash of the text -> identical sequence every time.
        seed = int.from_bytes(hashlib.sha256(text.encode("utf-8")).digest()[:8], "big")
        rng = random.Random(seed)
        vec = [rng.uniform(-1.0, 1.0) for _ in range(self.dim)]

        norm = math.sqrt(sum(x * x for x in vec))
        if norm == 0.0:
            # Degenerate (astronomically unlikely): return a unit vector on the first axis.
            unit = [0.0] * self.dim
            if self.dim:
                unit[0] = 1.0
            return unit
        return [x / norm for x in vec]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed_one(text)
