"""CSV exports for the admin portal. Text cells that a spreadsheet could read as a formula are
neutralised (OWASP CSV injection): a leading = + - @ tab or CR gets a single quote prefix."""

from __future__ import annotations

import csv
import io
import sqlite3

from backend.admin import queries

_FORMULA_LEAD = ("=", "+", "-", "@", "\t", "\r")
MAX_EXPORT_ROWS = 10_000


def safe_cell(value: str) -> str:
    return f"'{value}" if value.startswith(_FORMULA_LEAD) else value


def _write(header: list[str], rows: list[list[object]]) -> str:
    out = io.StringIO()
    w = csv.writer(out, lineterminator="\n")
    w.writerow(header)
    for row in rows:
        w.writerow([safe_cell(c) if isinstance(c, str) else c for c in row])
    return out.getvalue()


def runs_csv(
    conn: sqlite3.Connection, *, status: str | None, mode: str | None, user_id: str | None
) -> str:
    page = queries.list_runs(
        conn,
        status=status,
        mode=mode,
        user_id=user_id,
        limit=MAX_EXPORT_ROWS,
        offset=0,
        include_hidden=True,
    )
    return _write(
        [
            "id",
            "question",
            "mode",
            "status",
            "stop_state",
            "termination_reason",
            "owner_email",
            "cost_usd",
            "tokens",
            "hidden",
            "started_at",
            "ended_at",
        ],
        [
            [
                r.id,
                r.question,
                r.mode.value,
                r.status.value,
                r.stop_state.value if r.stop_state else "",
                r.termination_reason.value if r.termination_reason else "",
                r.user_email or "",
                r.cost_usd,
                r.tokens,
                int(r.hidden),
                r.started_at.isoformat(),
                r.ended_at.isoformat() if r.ended_at else "",
            ]
            for r in page.items
        ],
    )


def costs_csv(conn: sqlite3.Connection, days: int) -> str:
    costs = queries.costs(conn, days)
    return _write(
        ["date", "cost_usd", "tokens"], [[d.date, d.cost_usd, d.tokens] for d in costs.daily]
    )
