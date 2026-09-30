"""Event envelope and canonical event types (SSOT section 11, FR-22).

The events table is the audit log AND the SSE source. Backend and frontend share this shape only
through the generated schema; payload shapes per type are added here as they are implemented.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import Field

from contracts.models import (
    Budget,
    Challenge,
    ChallengeOutcome,
    Claim,
    Conflict,
    Contract,
    CoverageCell,
    DimensionRollup,
    FailureType,
    FinalState,
    Mode,
    Origin,
    Phase,
    Plan,
    Source,
    StopDecision,
    TaskKind,
    TerminationReason,
    Verdict,
)


class EventType(StrEnum):
    RUN_STARTED = "run.started"
    PHASE_ENTERED = "phase.entered"  # CL-02: one event per lifecycle transition (FR-22)
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


# ---------------------------------------------------------------- payload models (CL-04)


class RunStartedPayload(Contract):
    question: str
    mode: Mode
    budget: Budget


class PhaseEnteredPayload(Contract):
    phase: Phase
    reason: str


class PlanCreatedPayload(Contract):
    plan: Plan


class TaskStartedPayload(Contract):
    task_id: str
    slot_id: str
    query_text: str
    kind: TaskKind
    reason: str


class SourceFoundPayload(Contract):
    source: Source


class SourceFetchedPayload(Contract):
    source_id: str
    chars: int
    content_hash: str


class SourceFailedPayload(Contract):
    source_id: str
    failure: FailureType
    reason: str


class PassagesCreatedPayload(Contract):
    source_id: str
    count: int


class ClaimCreatedPayload(Contract):
    claim: Claim


class ClaimRejectedPayload(Contract):
    slot_id: str
    passage_id: str | None = None
    quote: str
    failure: Literal["CLAIM_REJECTED"] = "CLAIM_REJECTED"
    reason: str


class ClaimVerifiedPayload(Contract):
    claim_id: str
    verdict: Verdict
    rationale: str


class OriginUpdatedPayload(Contract):
    origin: Origin


class ConflictDetectedPayload(Contract):
    conflict: Conflict


class CoverageUpdatedPayload(Contract):
    round: int
    cells: list[CoverageCell]
    rollups: list[DimensionRollup]


class RoundStartedPayload(Contract):
    round: int
    reason: str
    task_ids: list[str]


class ChallengeCreatedPayload(Contract):
    challenge: Challenge


class ChallengeOutcomePayload(Contract):
    challenge_id: str
    outcome: ChallengeOutcome


class StopDecidedPayload(Contract):
    decision: StopDecision


class ReportDraftPayload(Contract):
    version: int


class ReportVerifiedPayload(Contract):
    version: int
    dropped_count: int
    certainty_state: FinalState | None = None


class BudgetWarningPayload(Contract):
    limit: str
    used: float
    max: float


class RunCompletedPayload(Contract):
    stop_state: FinalState | None = None
    termination_reason: TerminationReason | None = None


class RunFailedPayload(Contract):
    failure: FailureType
    message: str


EVENT_PAYLOADS: dict[EventType, type[Contract]] = {
    EventType.RUN_STARTED: RunStartedPayload,
    EventType.PHASE_ENTERED: PhaseEnteredPayload,
    EventType.PLAN_CREATED: PlanCreatedPayload,
    EventType.TASK_STARTED: TaskStartedPayload,
    EventType.SOURCE_FOUND: SourceFoundPayload,
    EventType.SOURCE_FETCHED: SourceFetchedPayload,
    EventType.SOURCE_FAILED: SourceFailedPayload,
    EventType.PASSAGES_CREATED: PassagesCreatedPayload,
    EventType.CLAIM_CREATED: ClaimCreatedPayload,
    EventType.CLAIM_REJECTED: ClaimRejectedPayload,
    EventType.CLAIM_VERIFIED: ClaimVerifiedPayload,
    EventType.ORIGIN_UPDATED: OriginUpdatedPayload,
    EventType.CONFLICT_DETECTED: ConflictDetectedPayload,
    EventType.COVERAGE_UPDATED: CoverageUpdatedPayload,
    EventType.ROUND_STARTED: RoundStartedPayload,
    EventType.CHALLENGE_CREATED: ChallengeCreatedPayload,
    EventType.CHALLENGE_OUTCOME: ChallengeOutcomePayload,
    EventType.STOP_DECIDED: StopDecidedPayload,
    EventType.REPORT_DRAFT: ReportDraftPayload,
    EventType.REPORT_VERIFIED: ReportVerifiedPayload,
    EventType.BUDGET_WARNING: BudgetWarningPayload,
    EventType.RUN_COMPLETED: RunCompletedPayload,
    EventType.RUN_FAILED: RunFailedPayload,
}
