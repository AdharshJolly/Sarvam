"""Event emission helper: one place that turns payload models and call metrics into events."""

from __future__ import annotations

import sqlite3
from typing import Any

from pydantic import BaseModel

from backend.gateway import CallMetrics
from backend.store.events import append_event
from contracts.events import Event, EventType


class Emitter:
    """Appends events for one run on one connection (NFR-09: latency, tokens, cost)."""

    def __init__(self, conn: sqlite3.Connection, run_id: str) -> None:
        self.conn = conn
        self.run_id = run_id

    def emit(
        self,
        type: EventType,
        payload: BaseModel | dict[str, Any] | None = None,
        *,
        round: int = 0,
        metrics: CallMetrics | None = None,
    ) -> Event:
        data = payload.model_dump(mode="json") if isinstance(payload, BaseModel) else payload
        return append_event(
            self.conn,
            self.run_id,
            type,
            round=round,
            payload=data,
            step_ms=metrics.latency_ms if metrics else None,
            tokens=metrics.tokens if metrics else None,
            cost_usd=metrics.cost_usd if metrics else None,
        )
