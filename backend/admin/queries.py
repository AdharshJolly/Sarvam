"""Pure, deterministic aggregations for the admin portal. Plain sqlite3, no LLM, no writes.

Cost and token figures come only from `events.cost_usd` / `events.tokens` (the audit log); a run row
has no cost column. Nothing here reads password, salt or session columns.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime, timedelta

from backend.store.db import SCHEMA_VERSION
from contracts.config import Settings
from contracts.models import (
    AdminActivity,
    AdminCostByType,
    AdminCostDay,
    AdminCosts,
    AdminEvent,
    AdminHealth,
    AdminOverview,
    AdminRunDetail,
    AdminRunPage,
    AdminRunRow,
    AdminUserRow,
)

_RUN_SELECT = """
SELECT r.*, u.email AS user_email,
       COALESCE((SELECT SUM(cost_usd) FROM events e WHERE e.run_id = r.id), 0.0) AS cost_usd,
       COALESCE((SELECT SUM(tokens) FROM events e WHERE e.run_id = r.id), 0) AS tokens
FROM runs r LEFT JOIN users u ON u.id = r.user_id
"""


def _counts(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> dict[str, int]:
    return {str(k): int(v) for k, v in conn.execute(sql, params).fetchall() if k is not None}


def _dt(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def _run_row(row: sqlite3.Row) -> AdminRunRow:
    return AdminRunRow(
        id=row["id"],
        question=row["question"],
        mode=row["mode"],
        status=row["status"],
        stop_state=row["stop_state"],
        termination_reason=row["termination_reason"],
        started_at=datetime.fromisoformat(row["started_at"]),
        ended_at=_dt(row["ended_at"]),
        user_id=row["user_id"],
        user_email=row["user_email"],
        hidden=bool(row["hidden"]),
        cost_usd=round(float(row["cost_usd"]), 6),
        tokens=int(row["tokens"]),
    )


def overview(conn: sqlite3.Connection) -> AdminOverview:
    stop_states = _counts(
        conn, "SELECT stop_state, COUNT(*) FROM runs WHERE stop_state IS NOT NULL GROUP BY 1"
    )
    totals = conn.execute(
        "SELECT COALESCE(SUM(cost_usd), 0.0), COALESCE(SUM(tokens), 0) FROM events"
    ).fetchone()
    return AdminOverview(
        users=conn.execute("SELECT COUNT(*) FROM users").fetchone()[0],
        admins=conn.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'").fetchone()[0],
        runs=conn.execute("SELECT COUNT(*) FROM runs").fetchone()[0],
        runs_by_status=_counts(conn, "SELECT status, COUNT(*) FROM runs GROUP BY 1"),
        runs_by_mode=_counts(conn, "SELECT mode, COUNT(*) FROM runs GROUP BY 1"),
        stop_states=stop_states,
        insufficient_runs=stop_states.get("INSUFFICIENT", 0),
        total_cost_usd=round(float(totals[0]), 6),
        total_tokens=int(totals[1]),
    )


def list_runs(
    conn: sqlite3.Connection,
    *,
    status: str | None,
    mode: str | None,
    user_id: str | None,
    limit: int,
    offset: int,
    include_hidden: bool = False,
) -> AdminRunPage:
    where: list[str] = [] if include_hidden else ["r.hidden = 0"]
    params: list[str] = []
    for column, value in (("r.status", status), ("r.mode", mode), ("r.user_id", user_id)):
        if value:
            where.append(f"{column} = ?")
            params.append(value)
    clause = f" WHERE {' AND '.join(where)}" if where else ""
    total = conn.execute(f"SELECT COUNT(*) FROM runs r{clause}", params).fetchone()[0]
    rows = conn.execute(
        f"{_RUN_SELECT}{clause} ORDER BY r.started_at DESC, r.id LIMIT ? OFFSET ?",
        [*params, limit, offset],
    ).fetchall()
    return AdminRunPage(items=[_run_row(r) for r in rows], total=total, limit=limit, offset=offset)


def run_detail(conn: sqlite3.Connection, run_id: str) -> AdminRunDetail | None:
    row = conn.execute(f"{_RUN_SELECT} WHERE r.id = ?", (run_id,)).fetchone()
    if row is None:
        return None
    run = _run_row(row)
    latest = conn.execute("SELECT MAX(round) FROM coverage WHERE run_id = ?", (run_id,)).fetchone()[
        0
    ]
    return AdminRunDetail(
        run=run,
        event_count=conn.execute(
            "SELECT COUNT(*) FROM events WHERE run_id = ?", (run_id,)
        ).fetchone()[0],
        cost_usd=run.cost_usd,
        tokens=run.tokens,
        claims_by_status=_counts(
            conn, "SELECT status, COUNT(*) FROM claims WHERE run_id = ? GROUP BY 1", (run_id,)
        ),
        conflicts_by_status=_counts(
            conn, "SELECT status, COUNT(*) FROM conflicts WHERE run_id = ? GROUP BY 1", (run_id,)
        ),
        challenges_by_outcome=_counts(
            conn,
            "SELECT outcome, COUNT(*) FROM challenges WHERE run_id = ? GROUP BY 1",
            (run_id,),
        ),
        coverage_by_state=(
            _counts(
                conn,
                "SELECT state, COUNT(*) FROM coverage WHERE run_id = ? AND round = ? GROUP BY 1",
                (run_id, latest),
            )
            if latest is not None
            else {}
        ),
    )


def list_users(conn: sqlite3.Connection) -> list[AdminUserRow]:
    # Explicit column list: password_hash and salt are never selected.
    rows = conn.execute(
        """
        SELECT u.id, u.email, u.display_name, u.role, u.created_at, u.last_login_at,
               u.disabled, u.quota_usd,
               COUNT(DISTINCT r.id) AS run_count,
               COALESCE(SUM(e.cost_usd), 0.0) AS cost_usd
        FROM users u
        LEFT JOIN runs r ON r.user_id = u.id
        LEFT JOIN events e ON e.run_id = r.id
        GROUP BY u.id
        ORDER BY u.created_at DESC, u.id
        """
    ).fetchall()
    return [
        AdminUserRow(
            id=r["id"],
            email=r["email"],
            display_name=r["display_name"],
            role=r["role"],
            disabled=bool(r["disabled"]),
            quota_usd=r["quota_usd"],
            created_at=datetime.fromisoformat(r["created_at"]),
            last_login_at=_dt(r["last_login_at"]),
            run_count=r["run_count"],
            cost_usd=round(float(r["cost_usd"]), 6),
        )
        for r in rows
    ]


def costs(conn: sqlite3.Connection, days: int, *, now: datetime | None = None) -> AdminCosts:
    today = (now or datetime.now(UTC)).date()
    start = today - timedelta(days=days - 1)
    since = datetime(start.year, start.month, start.day, tzinfo=UTC).isoformat()
    by_day = {
        r["day"]: r
        for r in conn.execute(
            """
            SELECT substr(ts, 1, 10) AS day, SUM(cost_usd) AS cost, SUM(tokens) AS tokens
            FROM events WHERE ts >= ? GROUP BY 1
            """,
            (since,),
        ).fetchall()
    }
    daily = []
    for i in range(days):
        day = (start + timedelta(days=i)).isoformat()
        r = by_day.get(day)
        daily.append(
            AdminCostDay(
                date=day,
                cost_usd=round(float(r["cost"] or 0.0), 6) if r else 0.0,
                tokens=int(r["tokens"] or 0) if r else 0,
            )
        )
    by_type = conn.execute(
        """
        SELECT type, SUM(cost_usd) AS cost, SUM(tokens) AS tokens, COUNT(*) AS n
        FROM events WHERE ts >= ? AND (cost_usd IS NOT NULL OR tokens IS NOT NULL)
        GROUP BY type ORDER BY cost DESC, type
        """,
        (since,),
    ).fetchall()
    return AdminCosts(
        days=days,
        total_cost_usd=round(sum(d.cost_usd for d in daily), 6),
        total_tokens=sum(d.tokens for d in daily),
        daily=daily,
        by_event_type=[
            AdminCostByType(
                type=r["type"],
                cost_usd=round(float(r["cost"] or 0.0), 6),
                tokens=int(r["tokens"] or 0),
                events=r["n"],
            )
            for r in by_type
        ],
    )


def _event_summary(type_: str, payload_json: str) -> str:
    try:
        payload = json.loads(payload_json)
    except json.JSONDecodeError:
        return type_
    if not isinstance(payload, dict):
        return type_
    for key in ("message", "reason", "question", "phase", "query_text", "limit"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value[:200]
    return type_


def activity(
    conn: sqlite3.Connection, *, since_id: int, type_: str | None, limit: int
) -> AdminActivity:
    where = ["id > ?"]
    params: list[object] = [since_id]
    if type_:
        where.append("type = ?")
        params.append(type_)
    rows = conn.execute(
        f"SELECT * FROM events WHERE {' AND '.join(where)} ORDER BY id DESC LIMIT ?",
        [*params, limit],
    ).fetchall()
    return AdminActivity(
        items=[
            AdminEvent(
                id=r["id"],
                run_id=r["run_id"],
                ts=datetime.fromisoformat(r["ts"]),
                round=r["round"],
                type=r["type"],
                cost_usd=r["cost_usd"],
                tokens=r["tokens"],
                summary=_event_summary(r["type"], r["payload_json"]),
            )
            for r in rows
        ]
    )


def health(conn: sqlite3.Connection, settings: Settings) -> AdminHealth:
    try:
        db_ok = conn.execute("SELECT 1").fetchone()[0] == 1
    except sqlite3.Error:
        db_ok = False
    foreign_keys = bool(conn.execute("PRAGMA foreign_keys").fetchone()[0])
    failures = _counts(
        conn,
        """
        SELECT json_extract(payload_json, '$.failure') AS failure, COUNT(*)
        FROM events WHERE type IN ('run.failed', 'source.failed', 'claim.rejected')
        GROUP BY 1
        """,
    )
    return AdminHealth(
        status="healthy" if db_ok and foreign_keys else "degraded",
        db_ok=db_ok,
        db_foreign_keys=foreign_keys,
        db_journal_mode=str(conn.execute("PRAGMA journal_mode").fetchone()[0]),
        schema_version=SCHEMA_VERSION,
        mode=settings.mode,
        budget_defaults=settings.budget,
        running_runs=conn.execute("SELECT COUNT(*) FROM runs WHERE status = 'running'").fetchone()[
            0
        ],
        failures=failures,
    )
