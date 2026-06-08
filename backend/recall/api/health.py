"""Health endpoint.

GET /health returns {status, db, embedder, version} per the M0 contract. The db field
reflects a real connection check (SELECT 1); the embedder field is the configured model
name from config (never instantiates an embedder — none exists yet).
"""

from __future__ import annotations

from fastapi import APIRouter

from recall import __version__
from recall.config import settings
from recall.db import ping

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    try:
        ping()
        db_status = "ok"
    except Exception as exc:  # noqa: BLE001 - surface the failure text to the caller
        db_status = f"error: {exc}"

    return {
        "status": "ok",
        "db": db_status,
        "embedder": settings.embedder_name,
        "version": __version__,
    }
