"""FastAPI application factory.

create_app() builds the app, wires CORS from config, and mounts the health router. The
module-level ``app`` is what uvicorn serves (``recall.main:app``). Real endpoints beyond
/health arrive in later issues.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from recall.api.health import router as health_router
from recall.config import settings


def create_app() -> FastAPI:
    app = FastAPI(title="Recall API")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router)

    return app


app = create_app()
