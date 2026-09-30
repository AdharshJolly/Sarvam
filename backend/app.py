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

from backend import __version__, auth
from backend.admin import actions as admin_actions
from backend.admin.router import build_admin_router
from backend.controller import RunHandle, run_research
from backend.pipeline.claims import locate_quote
from backend.store import repo
from backend.store.db import connect, init_db
from backend.store.emit import Emitter
from backend.store.events import append_event, read_events
from contracts.config import Settings
from contracts.events import EventType, RunFailedPayload
from contracts.models import (
    AuthResponse,
    Budget,
    ClaimEvidence,
    FailureType,
    ReportView,
    Run,
    RunCreate,
    RunState,
    RunSummary,
    UserCreate,
    UserLogin,
    UserPublic,
    UserUpdate,
    UserUsage,
)

Runner = Callable[[str, Settings, RunHandle], Awaitable[None]]

HEARTBEAT_SECONDS = 15.0
POLL_SECONDS = 0.25
TERMINAL_EVENTS = {EventType.RUN_COMPLETED, EventType.RUN_FAILED}
TERMINAL_STATUSES = {"completed", "failed"}


async def default_runner(run_id: str, settings: Settings, handle: RunHandle) -> None:
    await run_research(run_id, settings=settings, handle=handle)


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
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["*"],
    )

    api = APIRouter(prefix=settings.api_prefix)

    def get_auth_token(request: Request) -> str | None:
        header = request.headers.get("Authorization")
        if header and header.startswith("Bearer "):
            return header[7:].strip()
        return None

    def get_current_user(request: Request) -> UserPublic | None:
        token = get_auth_token(request)
        if not token:
            return None
        return auth.get_user_by_token(request.app.state.db, token)

    def require_auth(request: Request) -> UserPublic:
        user = get_current_user(request)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        return user

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

    # ------------------------------------------------------------ auth routes

    @api.post("/auth/register", status_code=201)
    def register(body: UserCreate, request: Request) -> AuthResponse:
        conn = request.app.state.db
        try:
            user, token = auth.register_user(
                conn,
                email=body.email,
                password=body.password,
                display_name=body.display_name,
                admin_emails=settings.admin_emails,
            )
            return AuthResponse(token=token, user=user)
        except auth.AuthError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @api.post("/auth/login")
    def login(body: UserLogin, request: Request) -> AuthResponse:
        conn = request.app.state.db
        try:
            user, token = auth.login_user(
                conn,
                email=body.email,
                password=body.password,
                admin_emails=settings.admin_emails,
            )
            return AuthResponse(token=token, user=user)
        except auth.AuthError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

    @api.post("/auth/logout")
    def logout(request: Request) -> dict[str, bool]:
        token = get_auth_token(request)
        if token:
            auth.logout_user(request.app.state.db, token)
        return {"ok": True}

    @api.get("/auth/me")
    def me(request: Request) -> UserPublic:
        return require_auth(request)

    @api.get("/auth/me/usage")
    def my_usage(request: Request) -> UserUsage:
        user = require_auth(request)
        conn = request.app.state.db
        quota = conn.execute("SELECT quota_usd FROM users WHERE id = ?", (user.id,)).fetchone()[
            "quota_usd"
        ]
        spent = admin_actions.user_spend(conn, user.id)
        return UserUsage(
            run_count=conn.execute(
                "SELECT COUNT(*) FROM runs WHERE user_id = ?", (user.id,)
            ).fetchone()[0],
            cost_usd=round(spent, 6),
            quota_usd=quota,
            remaining_usd=None if quota is None else max(0.0, round(quota - spent, 6)),
        )

    @api.patch("/auth/me")
    def update_profile(body: UserUpdate, request: Request) -> UserPublic:
        user = require_auth(request)
        try:
            return auth.update_user(
                request.app.state.db,
                user_id=user.id,
                display_name=body.display_name,
                password=body.password,
            )
        except auth.AuthError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @api.delete("/auth/me")
    def delete_account(request: Request) -> dict[str, bool]:
        user = require_auth(request)
        auth.delete_user_account(request.app.state.db, user.id)
        return {"ok": True}

    # ------------------------------------------------------------ run routes

    @api.get("/runs")
    def list_runs(request: Request) -> list[Run]:
        conn = request.app.state.db
        user = get_current_user(request)
        if user:
            rows = conn.execute(
                "SELECT * FROM runs WHERE hidden = 0 AND (user_id = ? OR user_id IS NULL)"
                " ORDER BY started_at DESC LIMIT 50",
                (user.id,),
            ).fetchall()
        else:  # anonymous callers only see unowned runs (B-36: no cross-user leak)
            rows = conn.execute(
                "SELECT * FROM runs WHERE hidden = 0 AND user_id IS NULL"
                " ORDER BY started_at DESC LIMIT 50"
            ).fetchall()
        return [repo.row_to_run(r) for r in rows]

    @api.post("/runs", status_code=201)
    async def create_run(body: RunCreate, request: Request) -> Run:
        question = body.question.strip()
        if not question:
            raise HTTPException(status_code=422, detail="question must not be blank")
        conn = request.app.state.db
        base_budget = admin_actions.stored_default_budget(conn) or settings.budget
        try:
            budget = Budget(**{**base_budget.model_dump(), **(body.budget or {})})
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"invalid budget override: {exc}") from exc

        current_user = get_current_user(request)
        if current_user is not None:
            quota = conn.execute(
                "SELECT quota_usd FROM users WHERE id = ?", (current_user.id,)
            ).fetchone()["quota_usd"]
            if quota is not None and admin_actions.user_spend(conn, current_user.id) >= quota:
                raise HTTPException(
                    status_code=403,
                    detail=f"Cost quota of ${quota:.2f} reached; ask an administrator to raise it",
                )
        run = Run(
            id=f"R{secrets.token_hex(4)}",
            user_id=current_user.id if current_user else None,
            question=question,
            scope=body.scope,
            mode=body.mode,
            budget=budget,
            started_at=datetime.now(UTC),
        )
        try:
            conn.execute(
                "INSERT INTO runs (id, user_id, question, scope_json, mode, budget_json, status,"
                " started_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    run.id,
                    run.user_id,
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
        if run.user_id is not None:  # owned runs: owner or admin only (B-36)
            caller = get_current_user(request)
            if caller is None or (caller.id != run.user_id and caller.role != "admin"):
                raise HTTPException(status_code=403, detail="not your run")
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

    api.include_router(build_admin_router(get_current_user))
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
