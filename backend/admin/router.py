"""Admin routes. `require_admin` is the server-side gate: 401 anonymous, 403 non-admin."""

from __future__ import annotations

from collections.abc import Callable
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from backend.admin import actions, export, queries
from contracts.models import (
    AdminActivity,
    AdminAudit,
    AdminCosts,
    AdminHealth,
    AdminOverview,
    AdminRunDetail,
    AdminRunPage,
    AdminRunUpdate,
    AdminSettings,
    AdminSettingsUpdate,
    AdminUserRow,
    AdminUserUpdate,
    UserPublic,
)


def _refuse(exc: actions.ActionError) -> HTTPException:
    return HTTPException(status_code=exc.status, detail=exc.message)


def build_admin_router(
    get_current_user: Callable[[Request], UserPublic | None],
) -> APIRouter:
    def require_admin(request: Request) -> UserPublic:
        user = get_current_user(request)
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        if user.role != "admin":
            raise HTTPException(status_code=403, detail="Admin role required")
        return user

    router = APIRouter(prefix="/admin", dependencies=[Depends(require_admin)])

    @router.get("/overview")
    def overview(request: Request) -> AdminOverview:
        return queries.overview(request.app.state.db)

    @router.get("/runs")
    def runs(
        request: Request,
        status: Literal["queued", "running", "completed", "failed"] | None = None,
        mode: Literal["LIVE", "REPLAY"] | None = None,
        user_id: str | None = None,
        include_hidden: bool = False,
        limit: int = Query(default=25, ge=1, le=200),
        offset: int = Query(default=0, ge=0),
    ) -> AdminRunPage:
        return queries.list_runs(
            request.app.state.db,
            status=status,
            mode=mode,
            user_id=user_id,
            limit=limit,
            offset=offset,
            include_hidden=include_hidden,
        )

    @router.get("/runs/{run_id}")
    def run_detail(run_id: str, request: Request) -> AdminRunDetail:
        detail = queries.run_detail(request.app.state.db, run_id)
        if detail is None:
            raise HTTPException(status_code=404, detail=f"run {run_id} not found")
        return detail

    @router.get("/users")
    def users(request: Request) -> list[AdminUserRow]:
        return queries.list_users(request.app.state.db)

    @router.get("/costs")
    def costs(request: Request, days: int = 30) -> AdminCosts:
        if days not in (7, 30, 90):
            raise HTTPException(status_code=422, detail="days must be 7, 30 or 90")
        return queries.costs(request.app.state.db, days)

    @router.get("/activity")
    def activity(
        request: Request,
        since_id: int = Query(default=0, ge=0),
        type: str | None = None,
        limit: int = Query(default=50, ge=1, le=200),
    ) -> AdminActivity:
        return queries.activity(request.app.state.db, since_id=since_id, type_=type, limit=limit)

    @router.get("/health")
    def health(request: Request) -> AdminHealth:
        return queries.health(request.app.state.db, request.app.state.settings)

    # ------------------------------------------------------------ management

    def user_row(request: Request, user_id: str) -> AdminUserRow:
        return next(u for u in queries.list_users(request.app.state.db) if u.id == user_id)

    @router.patch("/users/{user_id}")
    def update_user(
        user_id: str,
        body: AdminUserUpdate,
        request: Request,
        actor: UserPublic = Depends(require_admin),
    ) -> AdminUserRow:
        if not body.model_fields_set:
            raise HTTPException(status_code=422, detail="no fields to update")
        try:
            actions.update_user(
                request.app.state.db,
                actor,
                user_id,
                role=body.role,
                disabled=body.disabled,
                set_quota="quota_usd" in body.model_fields_set,
                quota_usd=body.quota_usd,
            )
        except actions.ActionError as exc:
            raise _refuse(exc) from exc
        return user_row(request, user_id)

    @router.delete("/users/{user_id}")
    def delete_user(
        user_id: str, request: Request, actor: UserPublic = Depends(require_admin)
    ) -> dict[str, bool]:
        try:
            actions.delete_user(request.app.state.db, actor, user_id)
        except actions.ActionError as exc:
            raise _refuse(exc) from exc
        return {"ok": True}

    @router.post("/runs/{run_id}/stop", status_code=202)
    def stop_run(
        run_id: str, request: Request, actor: UserPublic = Depends(require_admin)
    ) -> AdminRunDetail:
        conn = request.app.state.db
        detail = queries.run_detail(conn, run_id)
        if detail is None:
            raise HTTPException(status_code=404, detail=f"run {run_id} not found")
        handle = request.app.state.runs.get(run_id)
        live = handle is not None and handle.task is not None and not handle.task.done()
        if detail.run.status.value not in ("running", "queued") or not live:
            raise HTTPException(
                status_code=409, detail=f"run is {detail.run.status.value} and not stoppable"
            )
        handle.stop_event.set()  # type: ignore[union-attr]
        actions.record_action(conn, actor, "run.stop", "run", run_id)
        return detail

    @router.patch("/runs/{run_id}")
    def update_run(
        run_id: str,
        body: AdminRunUpdate,
        request: Request,
        actor: UserPublic = Depends(require_admin),
    ) -> AdminRunDetail:
        if body.hidden is None:
            raise HTTPException(status_code=422, detail="no fields to update")
        conn = request.app.state.db
        try:
            actions.set_run_hidden(conn, actor, run_id, body.hidden)
        except actions.ActionError as exc:
            raise _refuse(exc) from exc
        detail = queries.run_detail(conn, run_id)
        assert detail is not None
        return detail

    def settings_view(request: Request) -> AdminSettings:
        stored = actions.stored_default_budget(request.app.state.db)
        return AdminSettings(
            default_budget=stored or request.app.state.settings.budget,
            customized=stored is not None,
        )

    @router.get("/settings")
    def get_settings(request: Request) -> AdminSettings:
        return settings_view(request)

    @router.put("/settings")
    def put_settings(
        body: AdminSettingsUpdate,
        request: Request,
        actor: UserPublic = Depends(require_admin),
    ) -> AdminSettings:
        try:
            actions.put_default_budget(request.app.state.db, actor, body.default_budget)
        except actions.ActionError as exc:
            raise _refuse(exc) from exc
        return settings_view(request)

    @router.delete("/settings")
    def reset_settings(
        request: Request, actor: UserPublic = Depends(require_admin)
    ) -> AdminSettings:
        actions.reset_default_budget(request.app.state.db, actor)
        return settings_view(request)

    @router.get("/audit")
    def audit(
        request: Request,
        since_id: int = Query(default=0, ge=0),
        limit: int = Query(default=50, ge=1, le=200),
    ) -> AdminAudit:
        return actions.list_audit(request.app.state.db, since_id=since_id, limit=limit)

    # ---------------------------------------------------------------- export

    def csv_response(name: str, body: str) -> Response:
        return Response(
            content=body,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{name}"'},
        )

    @router.get("/export/runs.csv")
    def export_runs(
        request: Request,
        status: Literal["queued", "running", "completed", "failed"] | None = None,
        mode: Literal["LIVE", "REPLAY"] | None = None,
        user_id: str | None = None,
        actor: UserPublic = Depends(require_admin),
    ) -> Response:
        conn = request.app.state.db
        body = export.runs_csv(conn, status=status, mode=mode, user_id=user_id)
        actions.record_action(
            conn,
            actor,
            "export.runs",
            "export",
            "runs.csv",
            {"status": status, "mode": mode, "user_id": user_id},
        )
        return csv_response("sarvam-runs.csv", body)

    @router.get("/export/costs.csv")
    def export_costs(
        request: Request, days: int = 30, actor: UserPublic = Depends(require_admin)
    ) -> Response:
        if days not in (7, 30, 90):
            raise HTTPException(status_code=422, detail="days must be 7, 30 or 90")
        conn = request.app.state.db
        body = export.costs_csv(conn, days)
        actions.record_action(conn, actor, "export.costs", "export", "costs.csv", {"days": days})
        return csv_response("sarvam-costs.csv", body)

    return router
