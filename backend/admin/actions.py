"""Admin mutations (B-37). Every function validates first, then writes, then records an audit row.

A rejected action raises `ActionError` and writes nothing, including no audit row. Functions take a
plain sqlite3 connection so the rules are unit-testable without HTTP.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime

from backend import auth
from contracts.models import AdminAction, AdminAudit, Budget, UserPublic

DEFAULT_BUDGET_KEY = "default_budget"


class ActionError(Exception):
    """A refused admin action. `status` maps to the HTTP status the router returns."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


# ---------------------------------------------------------------------- audit


def record_action(
    conn: sqlite3.Connection,
    actor: UserPublic,
    action: str,
    target_type: str,
    target_id: str = "",
    detail: dict | None = None,
) -> None:
    conn.execute(
        "INSERT INTO admin_actions (ts, actor_id, actor_email, action, target_type, target_id,"
        " detail_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            datetime.now(UTC).isoformat(),
            actor.id,
            actor.email,
            action,
            target_type,
            target_id,
            json.dumps(detail or {}),
        ),
    )
    conn.commit()


def list_audit(conn: sqlite3.Connection, *, since_id: int, limit: int) -> AdminAudit:
    rows = conn.execute(
        "SELECT * FROM admin_actions WHERE id > ? ORDER BY id DESC LIMIT ?", (since_id, limit)
    ).fetchall()
    return AdminAudit(
        items=[
            AdminAction(
                id=r["id"],
                ts=datetime.fromisoformat(r["ts"]),
                actor_id=r["actor_id"],
                actor_email=r["actor_email"],
                action=r["action"],
                target_type=r["target_type"],
                target_id=r["target_id"],
                detail=json.loads(r["detail_json"]),
            )
            for r in rows
        ]
    )


# ----------------------------------------------------------------------- users


def _enabled_admin_count(conn: sqlite3.Connection, *, excluding: str) -> int:
    return conn.execute(
        "SELECT COUNT(*) FROM users WHERE role = 'admin' AND disabled = 0 AND id != ?",
        (excluding,),
    ).fetchone()[0]


def _require_user(conn: sqlite3.Connection, user_id: str) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        raise ActionError(404, f"user {user_id} not found")
    return row


def update_user(
    conn: sqlite3.Connection,
    actor: UserPublic,
    user_id: str,
    *,
    role: str | None,
    disabled: bool | None,
    set_quota: bool,
    quota_usd: float | None,
) -> None:
    row = _require_user(conn, user_id)
    removes_admin = (
        row["role"] == "admin" and row["disabled"] == 0 and (role == "user" or disabled is True)
    )
    if removes_admin:
        if user_id == actor.id:
            raise ActionError(409, "You cannot demote or disable your own account")
        if _enabled_admin_count(conn, excluding=user_id) == 0:
            raise ActionError(409, "This is the last enabled admin and cannot be removed")
    if user_id == actor.id and (role == "user" or disabled is True):
        raise ActionError(409, "You cannot demote or disable your own account")

    changes: dict[str, object] = {}
    if role is not None and role != row["role"]:
        conn.execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))
        changes["role"] = role
    if disabled is not None and bool(row["disabled"]) != disabled:
        conn.execute("UPDATE users SET disabled = ? WHERE id = ?", (int(disabled), user_id))
        if disabled:
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        changes["disabled"] = disabled
    if set_quota and quota_usd != row["quota_usd"]:
        conn.execute("UPDATE users SET quota_usd = ? WHERE id = ?", (quota_usd, user_id))
        changes["quota_usd"] = quota_usd
    conn.commit()
    if changes:
        record_action(conn, actor, "user.update", "user", user_id, changes)


def delete_user(conn: sqlite3.Connection, actor: UserPublic, user_id: str) -> None:
    row = _require_user(conn, user_id)
    if user_id == actor.id:
        raise ActionError(409, "You cannot delete your own account here")
    if (
        row["role"] == "admin"
        and row["disabled"] == 0
        and _enabled_admin_count(conn, excluding=user_id) == 0
    ):
        raise ActionError(409, "This is the last enabled admin and cannot be deleted")
    auth.delete_user_account(conn, user_id)  # anonymises their runs, drops sessions
    record_action(conn, actor, "user.delete", "user", user_id, {"email": row["email"]})


def user_spend(conn: sqlite3.Connection, user_id: str) -> float:
    """Total metered cost of a user's runs, from the audit log."""
    return float(
        conn.execute(
            "SELECT COALESCE(SUM(e.cost_usd), 0.0) FROM events e"
            " JOIN runs r ON r.id = e.run_id WHERE r.user_id = ?",
            (user_id,),
        ).fetchone()[0]
    )


# ------------------------------------------------------------------------ runs


def set_run_hidden(conn: sqlite3.Connection, actor: UserPublic, run_id: str, hidden: bool) -> None:
    row = conn.execute("SELECT hidden FROM runs WHERE id = ?", (run_id,)).fetchone()
    if row is None:
        raise ActionError(404, f"run {run_id} not found")
    if bool(row["hidden"]) != hidden:
        conn.execute("UPDATE runs SET hidden = ? WHERE id = ?", (int(hidden), run_id))
        conn.commit()
        record_action(conn, actor, "run.hide" if hidden else "run.unhide", "run", run_id)


# -------------------------------------------------------------------- settings


def validate_budget(b: Budget) -> list[str]:
    problems = []
    for name in ("max_searches", "max_fetches", "max_llm_calls", "max_wall_seconds_soft"):
        if getattr(b, name) < 1:
            problems.append(f"{name} must be at least 1")
    if b.max_cost_usd <= 0:
        problems.append("max_cost_usd must be greater than 0")
    if b.max_followup_rounds < 0:
        problems.append("max_followup_rounds must not be negative")
    if b.max_wall_seconds_hard < b.max_wall_seconds_soft:
        problems.append("max_wall_seconds_hard must not be below max_wall_seconds_soft")
    return problems


def stored_default_budget(conn: sqlite3.Connection) -> Budget | None:
    row = conn.execute(
        "SELECT value_json FROM settings WHERE key = ?", (DEFAULT_BUDGET_KEY,)
    ).fetchone()
    return Budget.model_validate_json(row["value_json"]) if row else None


def put_default_budget(conn: sqlite3.Connection, actor: UserPublic, budget: Budget) -> None:
    problems = validate_budget(budget)
    if problems:
        raise ActionError(422, "; ".join(problems))
    conn.execute(
        "INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)"
        " ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,"
        " updated_at = excluded.updated_at",
        (DEFAULT_BUDGET_KEY, budget.model_dump_json(), datetime.now(UTC).isoformat()),
    )
    conn.commit()
    record_action(
        conn, actor, "settings.update", "settings", DEFAULT_BUDGET_KEY, budget.model_dump()
    )


def reset_default_budget(conn: sqlite3.Connection, actor: UserPublic) -> None:
    conn.execute("DELETE FROM settings WHERE key = ?", (DEFAULT_BUDGET_KEY,))
    conn.commit()
    record_action(conn, actor, "settings.reset", "settings", DEFAULT_BUDGET_KEY)
