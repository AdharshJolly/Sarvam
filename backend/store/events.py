"""Append-only event writer (FR-22). The events table is the audit log and the SSE source."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

from contracts.events import EVENT_PAYLOADS, Event, EventType


def append_event(
    conn: sqlite3.Connection,
    run_id: str,
    type: EventType,
    *,
    round: int = 0,
    payload: dict[str, Any] | None = None,
    step_ms: int | None = None,
    tokens: int | None = None,
    cost_usd: float | None = None,
) -> Event:
    payload = payload or {}
    # Raises pydantic.ValidationError (a ValueError) for a payload that does not match its type.
    EVENT_PAYLOADS[type].model_validate(payload)
    ts = datetime.now(UTC)
    cur = conn.execute(
        "INSERT INTO events (run_id, ts, round, type, step_ms, tokens, cost_usd, payload_json)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            run_id,
            ts.isoformat(),
            round,
            type.value,
            step_ms,
            tokens,
            cost_usd,
            json.dumps(payload or {}),
        ),
    )
    conn.commit()
    return Event(
        id=int(cur.lastrowid or 0),
        run_id=run_id,
        ts=ts,
        round=round,
        type=type,
        step_ms=step_ms,
        tokens=tokens,
        cost_usd=cost_usd,
        payload=payload or {},
    )


def _row_to_event(row: sqlite3.Row) -> Event:
    return Event(
        id=row["id"],
        run_id=row["run_id"],
        ts=datetime.fromisoformat(row["ts"]),
        round=row["round"],
        type=EventType(row["type"]),
        step_ms=row["step_ms"],
        tokens=row["tokens"],
        cost_usd=row["cost_usd"],
        payload=json.loads(row["payload_json"]),
    )


def read_events(conn: sqlite3.Connection, run_id: str, after_id: int = 0) -> Iterator[Event]:
    """Events for a run with id > after_id (supports SSE Last-Event-ID reconnect)."""
    rows = conn.execute(
        "SELECT * FROM events WHERE run_id = ? AND id > ? ORDER BY id", (run_id, after_id)
    )
    for row in rows:
        yield _row_to_event(row)
