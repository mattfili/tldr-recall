"""ContentEmbedding repository.

Seed writes ZERO embedding rows. The embed backfill (#6) writes vectors through ``create``;
``existing_content_ids`` is the idempotency seam (skip content that already has a row for the
active ``(kind, model)``). ``count`` lets the migration/seed test assert the table is empty
post-seed.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select

from recall.config import settings
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
        # Write-time dim guard: the vector length MUST equal the configured embed dim (the
        # Vector(EMBED_DIM) column is fixed at migration time). Catches both a misconfigured
        # embedder and a backend returning the wrong size BEFORE anything reaches Postgres. The
        # message names expected vs actual dim and NEVER includes the vector data.
        if len(embedding) != settings.recall_embed_dim:
            raise ValueError(
                f"embedding dim mismatch: expected {settings.recall_embed_dim}, "
                f"got {len(embedding)} (content_id={content_id}, model={model})"
            )

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

    def existing_content_ids(
        self, kind: EmbeddingKind | str, model: str
    ) -> set[uuid.UUID]:
        """Content ids that ALREADY have a ``(kind, model)`` embedding row.

        Returned as a set for O(1) skip-membership in the backfill (the idempotency seam). Keyed
        on ``model`` so switching backend (fake vs cloud) re-embeds under the new model name
        without colliding with the other model's rows.
        """
        rows = self.session.scalars(
            select(ContentEmbedding.content_id).where(
                ContentEmbedding.kind == EmbeddingKind(kind),
                ContentEmbedding.model == model,
            )
        ).all()
        return set(rows)

    def count_for(self, kind: EmbeddingKind | str, model: str) -> int:
        """Row count for a specific ``(kind, model)`` — the #7 degradation gate's second input.

        The search service calls ``count_for(combined, active_model)``; ``0`` -> DEGRADED
        (FTS-only, the embedder is NEVER built so no key is needed). Cheap COUNT, mirroring the
        ``existing_content_ids`` predicate.
        """
        return (
            self.session.scalar(
                select(func.count())
                .select_from(ContentEmbedding)
                .where(
                    ContentEmbedding.kind == EmbeddingKind(kind),
                    ContentEmbedding.model == model,
                )
            )
            or 0
        )

    def count(self) -> int:
        return self.session.scalar(select(func.count()).select_from(ContentEmbedding)) or 0
