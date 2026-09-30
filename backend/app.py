"""Sarvam FastAPI application (SSOT section 11).

Endpoints under /api: health, POST /runs, GET /runs/{id}, GET /runs/{id}/events (SSE),
GET /runs/{id}/state, GET /runs/{id}/claims/{cid}, GET /runs/{id}/report, POST /runs/{id}/stop.

A run executes as one asyncio task on its own DB connection (decision B-10). In the test env no
work is started unless a runner is injected, so POST /runs stays a pure create (run row + event).
"""

from __future__ import annotations

import asyncio
import json
import secrets
import sqlite3
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import APIRouter, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from backend import __version__
from backend.controller import RunHandle, run_m0
from backend.pipeline.claims import locate_quote
from backend.store import repo
from backend.store.db import connect, init_db
from backend.store.emit import Emitter
from backend.store.events import append_event, read_events
from contracts.config import Settings
from contracts.events import EventType, RunFailedPayload
from contracts.models import (
    Budget,
    ClaimEvidence,
    FailureType,
    ReportView,
    Run,
    RunCreate,
    RunState,
    RunSummary,
)

Runner = Callable[[str, Settings, RunHandle], Awaitable[None]]

HEARTBEAT_SECONDS = 15.0
POLL_SECONDS = 0.25
TERMINAL_EVENTS = {EventType.RUN_COMPLETED, EventType.RUN_FAILED}
TERMINAL_STATUSES = {"completed", "failed"}


async def default_runner(run_id: str, settings: Settings, handle: RunHandle) -> None:
    await run_m0(run_id, settings=settings, handle=handle)


def _fail_stale_runs(conn: sqlite3.Connection) -> None:
    """A run left `running` by a crash or restart can never finish: mark it failed (typed)."""
    for row in conn.execute("SELECT id FROM runs WHERE status='running'").fetchall():
        Emitter(conn, row["id"]).emit(
            EventType.RUN_FAILED,
            RunFailedPayload(failure=FailureType.BLOCKED, message="server restarted"),
        )
        repo.set_run_status(conn, row["id"], "failed", ended=True)


def create_app(settings: Settings | None = None, *, runner: Runner | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    if runner is None and settings.env != "test":
        runner = default_runner

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        conn = init_db(settings.db_path)
        _fail_stale_runs(conn)
        app.state.db = conn
        try:
            yield
        finally:
            tasks = [h.task for h in app.state.runs.values() if h.task and not h.task.done()]
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            conn.close()

    app = FastAPI(
        title="Sarvam API",
        description="Sarvam: Evidence-First Autonomous Research Agent",
        version=__version__,
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.runs = {}  # run id -> RunHandle

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    api = APIRouter(prefix=settings.api_prefix)

    def require_run(conn: sqlite3.Connection, run_id: str) -> Run:
        run = repo.get_run(conn, run_id)
        if run is None:
            raise HTTPException(status_code=404, detail=f"run {run_id} not found")
        return run

    def summary(request: Request, run_id: str) -> RunSummary:
        conn = request.app.state.db
        handle = request.app.state.runs.get(run_id)
        usage = handle.gateway.usage() if handle and handle.gateway else None
        result = repo.build_run_summary(conn, run_id, usage)
        if result is None:
            raise HTTPException(status_code=404, detail=f"run {run_id} not found")
        return result

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
    async def create_run(body: RunCreate, request: Request) -> Run:
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
        if runner is not None:
            handle = RunHandle()
            handle.task = asyncio.create_task(runner(run.id, settings, handle))
            request.app.state.runs[run.id] = handle
        return run

    @api.get("/runs/{run_id}")
    def get_run(run_id: str, request: Request) -> RunSummary:
        return summary(request, run_id)

    @api.get("/runs/{run_id}/state")
    def get_state(run_id: str, request: Request) -> RunState:
        state = repo.build_run_state(request.app.state.db, run_id)
        if state is None:
            raise HTTPException(status_code=404, detail=f"run {run_id} not found")
        return state

    @api.get("/runs/{run_id}/claims/{claim_id}")
    def get_claim(run_id: str, claim_id: str, request: Request) -> ClaimEvidence:
        conn = request.app.state.db
        require_run(conn, run_id)
        evidence = repo.build_claim_evidence(conn, run_id, claim_id, locate_quote)
        if evidence is None:
            raise HTTPException(status_code=404, detail=f"claim {claim_id} not found")
        return evidence

    @api.get("/runs/{run_id}/report")
    def get_report(run_id: str, request: Request) -> ReportView:
        conn = request.app.state.db
        require_run(conn, run_id)
        view = repo.build_report_view(conn, run_id)
        if view is None:
            raise HTTPException(status_code=404, detail="no report yet")
        return view

    @api.post("/runs/{run_id}/stop", status_code=202)
    def stop_run(run_id: str, request: Request) -> RunSummary:
        conn = request.app.state.db
        run = require_run(conn, run_id)
        handle = request.app.state.runs.get(run_id)
        live = handle is not None and handle.task is not None and not handle.task.done()
        if not (run.status == "running" or (run.status == "queued" and live)):
            raise HTTPException(status_code=409, detail=f"run is {run.status}, not running")
        handle.stop_event.set()  # type: ignore[union-attr]
        return summary(request, run_id)

    @api.get("/runs/{run_id}/events")
    async def stream_events(
        run_id: str,
        request: Request,
        after: int = Query(default=0, ge=0),
    ) -> StreamingResponse:
        require_run(request.app.state.db, run_id)
        header = request.headers.get("last-event-id", "")
        start = max(after, int(header) if header.isdigit() else 0)
        return StreamingResponse(
            _event_stream(request, settings, run_id, start),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    app.include_router(api)
    return app


async def _event_stream(
    request: Request, settings: Settings, run_id: str, after: int
) -> AsyncIterator[str]:
    """SSE: `id:` + `data:` frames only (no `event:` field, decision B-11). Own DB connection."""
    conn = connect(settings.db_path)
    last, idle = after, 0.0
    try:
        while True:
            if await request.is_disconnected():
                return
            events = list(read_events(conn, run_id, last))
            if not events:
                row = conn.execute("SELECT status FROM runs WHERE id=?", (run_id,)).fetchone()
                if row and row["status"] in TERMINAL_STATUSES:
                    events = list(read_events(conn, run_id, last))  # final re-read, then close
                    if not events:
                        return
            for ev in events:
                last, idle = ev.id, 0.0
                yield f"id: {ev.id}\ndata: {ev.model_dump_json()}\n\n"
                if ev.type in TERMINAL_EVENTS:
                    return
            if not events:
                await asyncio.sleep(POLL_SECONDS)
                idle += POLL_SECONDS
                if idle >= HEARTBEAT_SECONDS:
                    idle = 0.0
                    yield ": keepalive\n\n"
    finally:
        conn.close()


app = create_app()
