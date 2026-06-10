"""UrlResolution repository — the resolver's cache seam (spec §6.4, issue #23).

``get`` is the cache lookup; ``record`` persists EVERY outcome (success and failure)
keyed on the raw URL, so each distinct link triggers at most one network fetch ever.
Flush, no commit — the caller owns the transaction (repositories/base.py contract).
"""

from __future__ import annotations

from sqlalchemy import func, select

from recall.models import UrlResolution
from recall.repositories.base import Repository


class UrlResolutionRepository(Repository):
    def get(self, raw_url: str) -> UrlResolution | None:
        return self.session.scalars(
            select(UrlResolution).where(UrlResolution.raw_url == raw_url)
        ).first()

    def record(
        self, *, raw_url: str, resolved_url: str, domain: str | None, ok: bool
    ) -> UrlResolution:
        row = UrlResolution(raw_url=raw_url, resolved_url=resolved_url, domain=domain, ok=ok)
        self.session.add(row)
        self.session.flush()
        return row

    def count(self) -> int:
        return self.session.scalar(select(func.count()).select_from(UrlResolution)) or 0
