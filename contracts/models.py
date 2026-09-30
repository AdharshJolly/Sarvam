"""Canonical domain models. Field names and shapes follow SSOT v2.0 section 8 (data model),
section 9.10 / Appendix B (StopDecision) and section 18 (typed failures).

The frontend never defines its own copies: TypeScript types are generated from these models
(see contracts/schema_export.py).
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class Contract(BaseModel):
    """Base for all contracts: unknown fields are rejected so shapes cannot drift silently."""

    model_config = ConfigDict(extra="forbid")


# ---------------------------------------------------------------- enums


class Mode(StrEnum):
    LIVE = "LIVE"
    REPLAY = "REPLAY"


class RunStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class FailureType(StrEnum):
    """Typed failure states (SSOT section 18). No silent failures (NFR-04)."""

    RATE_LIMITED = "RATE_LIMITED"
    SOURCE_UNAVAILABLE = "SOURCE_UNAVAILABLE"
    SOURCE_EMPTY = "SOURCE_EMPTY"
    STEP_FAILED = "STEP_FAILED"
    CLAIM_REJECTED = "CLAIM_REJECTED"
    BLOCKED = "BLOCKED"


class SourceStatus(StrEnum):
    """Source status: found/fetched plus the typed fetch failures from section 18."""

    FOUND = "found"
    FETCHED = "fetched"
    SOURCE_UNAVAILABLE = "SOURCE_UNAVAILABLE"
    SOURCE_EMPTY = "SOURCE_EMPTY"


class SourceType(StrEnum):
    REGULATOR = "regulator"
    COMPANY_PRIMARY = "company_primary"
    NEWS = "news"
    BLOG = "blog"
    UNKNOWN = "unknown"


class TaskKind(StrEnum):
    INITIAL = "initial"
    GAP = "gap"
    CHALLENGE = "challenge"


class ClaimStatus(StrEnum):
    PENDING = "pending"
    SUPPORTED = "supported"
    PARTIAL = "partial"
    CONTESTED = "contested"
    REJECTED = "rejected"


class Verdict(StrEnum):
    SUPPORTS = "supports"
    PARTIAL = "partial"
    CONTRADICTS = "contradicts"
    IRRELEVANT = "irrelevant"


class OriginMethod(StrEnum):
    DOMAIN = "domain"
    NEAR_DUPLICATE = "near_duplicate"
    SHARED_NUMBER = "shared_number"
    ATTRIBUTION = "attribution"
    NONE = "none"


class ConflictKind(StrEnum):
    UNIT_ERROR = "unit_error"
    SCOPE_DIFFERENCE = "scope_difference"
    TEMPORAL = "temporal"
    DEFINITION = "definition"
    GENUINE = "genuine"


class ConflictStatus(StrEnum):
    OPEN = "open"
    EXPLAINED = "explained"


class CoverageState(StrEnum):
    RED = "RED"
    AMBER = "AMBER"
    GREEN = "GREEN"


class ChallengeOutcome(StrEnum):
    STRENGTHENED = "strengthened"
    WEAKENED = "weakened"
    UNRESOLVED = "unresolved"


class FinalState(StrEnum):
    SUFFICIENT = "SUFFICIENT"
    SUFFICIENT_WITH_CAVEATS = "SUFFICIENT_WITH_CAVEATS"
    INSUFFICIENT = "INSUFFICIENT"


class TerminationReason(StrEnum):
    CRITERIA_MET = "criteria_met"
    NO_MARGINAL_GAIN = "no_marginal_gain"
    MAX_ROUNDS = "max_rounds"
    BUDGET = "budget"
    TIMEOUT = "timeout"
    USER_STOPPED = "user_stopped"
    BLOCKED = "blocked"


class CertaintyLabel(StrEnum):
    """Per-finding certainty (FR-20)."""

    SUPPORTED = "supported"
    CONTESTED = "contested"
    SINGLE_ORIGIN = "single-origin"
    ASSUMED = "assumed"


# ---------------------------------------------------------------- run inputs


class Scope(Contract):
    """Optional scope for a question (FR-01)."""

    geography: str | None = None
    time_horizon: str | None = None
    constraints: str | None = None


class Budget(Contract):
    """Hard run limits (FR-03, SSOT 5.1). Enforced by the controller / ToolGateway."""

    max_searches: int = 24
    max_fetches: int = 40
    max_llm_calls: int = 250
    max_cost_usd: float = 3.00
    max_wall_seconds_soft: int = 480
    max_wall_seconds_hard: int = 600
    max_followup_rounds: int = 2


# ---------------------------------------------------------------- entities (section 8)


class Run(Contract):
    id: str
    question: str
    scope: Scope = Field(default_factory=Scope)
    mode: Mode
    budget: Budget = Field(default_factory=Budget)
    status: RunStatus = RunStatus.QUEUED
    stop_state: FinalState | None = None
    termination_reason: TerminationReason | None = None
    started_at: datetime
    ended_at: datetime | None = None


class Dimension(Contract):
    id: str
    run_id: str
    name: str
    description: str = ""
    critical: bool = False


class EvidenceSlot(Contract):
    """A named piece of evidence a dimension needs (glossary: Slot)."""

    id: str
    run_id: str
    dimension_id: str
    name: str
    description: str
    critical: bool = False
    attributes: list[str] = Field(default_factory=list)
    min_independent: int = 2
    primary_ok: bool = False


class Task(Contract):
    id: str
    run_id: str
    slot_id: str
    query_text: str
    kind: TaskKind = TaskKind.INITIAL
    round: int = 0
    status: str = "pending"


class Source(Contract):
    id: str  # S3
    run_id: str
    url: str
    canonical_url: str
    domain: str
    publisher: str | None = None
    source_type: SourceType = SourceType.UNKNOWN
    authority_tier: int = Field(default=3, ge=1, le=3)
    published_at: datetime | None = None
    retrieved_at: datetime | None = None
    content_hash: str | None = None
    status: SourceStatus = SourceStatus.FOUND
    fail_reason: str | None = None
    origin_id: str | None = None
    task_id: str | None = None


class Passage(Contract):
    """Immutable citation target."""

    id: str  # P12
    source_id: str
    idx: int
    text: str
    char_start: int
    char_end: int


class Claim(Contract):
    id: str  # C41
    run_id: str
    slot_id: str
    round: int = 0
    text: str
    entity: str | None = None
    attribute: str | None = None
    value_num: float | None = None
    unit: str | None = None
    period: str | None = None
    quote: str  # verbatim; MUST occur in the cited passage (quote guard, FR-09)
    passage_id: str
    quote_verified: bool = False
    status: ClaimStatus = ClaimStatus.PENDING


class EvidenceLink(Contract):
    id: str
    claim_id: str
    passage_id: str
    verdict: Verdict
    verdict_rationale: str = ""


class Origin(Contract):
    id: str
    run_id: str
    label: str
    method: OriginMethod = OriginMethod.NONE
    member_source_ids: list[str] = Field(default_factory=list)


class Conflict(Contract):
    id: str
    run_id: str
    slot_id: str
    claim_a: str
    claim_b: str
    delta_pct: float
    kind: ConflictKind = ConflictKind.GENUINE
    status: ConflictStatus = ConflictStatus.OPEN
    explanation: str | None = None


class CoverageCell(Contract):
    """One slot in the coverage matrix for one round."""

    id: str
    run_id: str
    round: int
    slot_id: str
    state: CoverageState
    independent_origins: int = 0
    supporting_claims: int = 0
    open_conflicts: int = 0
    reason: str


class Challenge(Contract):
    id: str
    run_id: str
    round: int
    attack: str
    target_slot: str | None = None
    target_claim: str | None = None
    required_evidence: str = ""
    would_change_if: str = ""
    followup_task_ids: list[str] = Field(default_factory=list)
    outcome: ChallengeOutcome | None = None


class Report(Contract):
    id: str
    run_id: str
    version: int
    markdown: str
    certainty_state: FinalState | None = None
    dropped_sentences: list[str] = Field(default_factory=list)


class CriticalSlotCounts(Contract):
    green: int = 0
    amber: int = 0
    red: int = 0


class StopDecision(Contract):
    """Deterministic stop outcome (SSOT 9.10, Appendix B)."""

    state: FinalState
    termination_reason: TerminationReason
    critical_slots: CriticalSlotCounts = Field(default_factory=CriticalSlotCounts)
    open_conflicts: int = 0
    challenge_rounds_completed: int = 0
    caveats: list[str] = Field(default_factory=list)
