"""Event envelope and canonical event types (SSOT section 11, FR-22).

The events table is the audit log AND the SSE source. Backend and frontend share this shape only
through the generated schema; payload shapes per type are added here as they are implemented.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import Field

from contracts.models import Contract


class EventType(StrEnum):
    RUN_STARTED = "run.started"
    PLAN_CREATED = "plan.created"
    TASK_STARTED = "task.started"
    SOURCE_FOUND = "source.found"
    SOURCE_FETCHED = "source.fetched"
    SOURCE_FAILED = "source.failed"
    PASSAGES_CREATED = "passages.created"
    CLAIM_CREATED = "claim.created"
    CLAIM_REJECTED = "claim.rejected"
    CLAIM_VERIFIED = "claim.verified"
    ORIGIN_UPDATED = "origin.updated"
    CONFLICT_DETECTED = "conflict.detected"
    COVERAGE_UPDATED = "coverage.updated"
    ROUND_STARTED = "round.started"
    CHALLENGE_CREATED = "challenge.created"
    CHALLENGE_OUTCOME = "challenge.outcome"
    STOP_DECIDED = "stop.decided"
    REPORT_DRAFT = "report.draft"
    REPORT_VERIFIED = "report.verified"
    BUDGET_WARNING = "budget.warning"
    RUN_COMPLETED = "run.completed"
    RUN_FAILED = "run.failed"


class Event(Contract):
    """{ id, run_id, ts, round, type, step_ms, tokens, cost_usd, payload }"""

    id: int  # monotonic per database; used as the SSE Last-Event-ID
    run_id: str
    ts: datetime
    round: int = 0
    type: EventType
    step_ms: int | None = None
    tokens: int | None = None  # LLM events only
    cost_usd: float | None = None  # LLM events only
    payload: dict[str, Any] = Field(default_factory=dict)
