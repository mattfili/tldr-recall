"""Application configuration.

pydantic-settings BaseSettings. Field names are the lowercased env-var names so they
map automatically (e.g. ``database_url`` <- ``DATABASE_URL``). Only backend keys from
spec §12.3 live here — the ``VITE_*`` keys are frontend-only and are intentionally absent.
"""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve the REPO-ROOT .env regardless of CWD. This file is backend/recall/config.py, so
# parents[2] is the repo root (the dir that holds .env). Every field keeps a default, so a
# missing .env (e.g. in CI) still loads cleanly.
_ENV_FILE = str(Path(__file__).resolve().parents[2] / ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        extra="ignore",
        case_sensitive=False,
    )

    # ── Database ──
    database_url: str = "postgresql+psycopg://recall:recall@localhost:5432/recall"

    # ── Embeddings / rerank (pluggable) ──
    recall_embed_backend: str = "cloud"  # cloud | qwen
    recall_embed_model: str = "text-embedding-3-small"
    recall_embed_dim: int = 1536
    embedding_api_key: str | None = None
    recall_rerank_backend: str = "none"  # none | cloud | qwen
    rerank_api_key: str | None = None
    qwen_endpoint: str | None = None  # when backend=qwen (OpenAI-compatible URL)

    # ── Ingestion (temporary ETL) ──
    recall_ingest_source: str = "gmail_export"  # gmail_export | gmail | tldr_rest
    gmail_export_dir: str = "./samples"

    # ── Search tuning ──
    recall_search_rrf_k: int = 60
    recall_type_filter_mode: str = "auto"  # auto | soft | hard
    recall_type_boost_weight: float = 0.1

    # ── Auth / admin ──
    recall_admin_token: str | None = None

    # ── Product analytics (PostHog) — optional, no-op when unset ──
    recall_analytics_enabled: bool = False
    posthog_key: str | None = None  # optional server-side events
    posthog_host: str = "https://us.i.posthog.com"

    # ── CORS ──
    # Allowlist of browser origins permitted to call the API. Defaults cover the Vite
    # dev server and the Electron renderer (which loads from a file:// origin).
    cors_allow_origins: list[str] = [
        "http://localhost:5173",
        "file://",
    ]

    @property
    def embedder_name(self) -> str:
        """Configured embed model name, or 'unconfigured' if no backend is set.

        Used by /health. Does NOT instantiate an embedder (none exists yet — concrete
        backends land in #6).
        """
        if not self.recall_embed_backend or self.recall_embed_backend.lower() == "none":
            return "unconfigured"
        return self.recall_embed_model or "unconfigured"


def get_settings() -> Settings:
    return Settings()


settings = get_settings()
