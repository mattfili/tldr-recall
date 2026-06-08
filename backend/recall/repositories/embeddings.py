"""ContentEmbedding repository.

Seed writes ZERO embedding rows (embeddings land in #6). This repo provides ``count`` so
the migration/seed test can assert the table is empty post-seed, plus a ``create`` method
that #6 will use to write vectors.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select

from recall.models import ContentEmbedding, EmbeddingKind
from recall.repositories.base import Repository


class EmbeddingRepository(Repository):
    def create(
        self,
        *,
        content_id: uuid.UUID,
        kind: EmbeddingKind | str,
        model: str,
        dim: int,
        embedding: list[float],
    ) -> ContentEmbedding:
        row = ContentEmbedding(
            content_id=content_id,
            kind=EmbeddingKind(kind),
            model=model,
            dim=dim,
            embedding=embedding,
        )
        self.session.add(row)
        self.session.flush()
        return row

    def count(self) -> int:
        return self.session.scalar(select(func.count()).select_from(ContentEmbedding)) or 0
