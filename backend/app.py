"""Sarvam FastAPI application (SSOT section 11).

Phase 0 exposes GET /api/health and POST /api/runs (creates the run row and its run.started
event; it does not start the controller). The other run endpoints (summary, SSE, state, claims,
report, stop) are added by later task cards.
"""

from __future__ import annotations

import json
import secrets
import sqlite3
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import Field

from backend import __version__
from backend.store.db import init_db
from backend.store.events import append_event
from contracts.config import Settings
from contracts.events import EventType
from contracts.models import Budget, Contract, Mode, Run, Scope


class RunCreate(Contract):
    """POST /api/runs body (SSOT section 11): question, scope, mode, optional budget overrides."""

    question: str = Field(min_length=1, max_length=2000)
    scope: Scope = Field(default_factory=Scope)
    mode: Mode = Mode.LIVE
    budget: dict[str, int | float] | None = None


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

    @api.post("/runs", status_code=201)
    def create_run(body: RunCreate, request: Request) -> Run:
        question = body.question.strip()
        if not question:
            raise HTTPException(status_code=422, detail="question must not be blank")
        try:
            budget = Budget(**{**settings.budget.model_dump(), **(body.budget or {})})
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"invalid budget override: {exc}") from exc
        run = Run(
            id=f"R{secrets.token_hex(4)}",
            question=question,
            scope=body.scope,
            mode=body.mode,
            budget=budget,
            started_at=datetime.now(UTC),
        )
        conn = request.app.state.db
        try:
            conn.execute(
                "INSERT INTO runs (id, question, scope_json, mode, budget_json, status, started_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    run.id,
                    run.question,
                    run.scope.model_dump_json(),
                    run.mode.value,
                    run.budget.model_dump_json(),
                    run.status.value,
                    run.started_at.isoformat(),
                ),
            )
            # append_event commits: the run row and run.started become durable together.
            append_event(
                conn,
                run.id,
                EventType.RUN_STARTED,
                payload={
                    "question": run.question,
                    "mode": run.mode.value,
                    "budget": json.loads(run.budget.model_dump_json()),
                },
            )
        except sqlite3.Error as exc:
            conn.rollback()
            raise HTTPException(status_code=500, detail="run could not be persisted") from exc
        return run

    app.include_router(api)
    return app


app = create_app()
