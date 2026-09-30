"""Sarvam FastAPI application (SSOT section 11).

Only the health endpoint exists at bootstrap. Run endpoints (POST /api/runs, SSE, state, claims,
report, stop) are added by later task cards against the contracts package.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from backend import __version__
from backend.store.db import init_db
from contracts.config import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        conn = init_db(settings.db_path)
        app.state.db = conn
        try:
            yield
        finally:
            conn.close()

    app = FastAPI(
        title="Sarvam API",
        description="Sarvam: Evidence-First Autonomous Research Agent",
        version=__version__,
        lifespan=lifespan,
    )
    app.state.settings = settings

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    api = APIRouter(prefix=settings.api_prefix)

    @api.get("/health")
    def health(request: Request) -> dict[str, str]:
        journal = request.app.state.db.execute("PRAGMA journal_mode").fetchone()[0]
        return {
            "status": "ok",
            "service": "sarvam",
            "version": __version__,
            "env": settings.env,
            "db_journal_mode": journal,
        }

    app.include_router(api)
    return app


app = create_app()
