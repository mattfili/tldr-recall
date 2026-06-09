"""FastAPI application factory.

create_app() builds the app, wires CORS from config, and mounts the routers. The module-level
``app`` is what uvicorn serves (``recall.main:app``). #3 adds the read endpoints: editions,
issues (list/latest/detail), and content. #5 (M2) adds the writes: saves (PUT/DELETE) and the
client-fired PUT /issues/{id}/read (mounted on the issues router).
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from recall.api.categories import router as categories_router
from recall.api.collections import router as collections_router
from recall.api.content import router as content_router
from recall.api.editions import router as editions_router
from recall.api.health import router as health_router
from recall.api.issues import router as issues_router
from recall.api.library import router as library_router
from recall.api.saves import router as saves_router
from recall.api.search import router as search_router
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
    app.include_router(editions_router)
    app.include_router(issues_router)
    app.include_router(content_router)
    app.include_router(library_router)
    app.include_router(categories_router)
    app.include_router(saves_router)
    app.include_router(search_router)
    app.include_router(collections_router)

    return app


app = create_app()
