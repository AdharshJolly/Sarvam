"""Backend-internal LLM input/output schemas (SSOT section 10, Appendix B).

These validate model output inside the gateway and pipeline. They are NOT part of the REST or event
surface, so they are not exported to TypeScript.
"""

from __future__ import annotations

from pydantic import Field

from contracts.models import ConflictKind, Contract, Verdict


class ClaimDraft(Contract):
    slot_id: str
    text: str
    entity: str | None = None
    attribute: str | None = None
    value: float | None = None
    unit: str | None = None
    period: str | None = None
    passage_id: str
    quote: str


class ClaimList(Contract):
    claims: list[ClaimDraft] = Field(default_factory=list)


class VerdictOut(Contract):
    claim_id: str
    passage_id: str
    verdict: Verdict
    rationale: str = ""


class AttackTarget(Contract):
    slot_id: str | None = None
    claim_id: str | None = None


class AttackDraft(Contract):
    """One challenger attack (SSOT Appendix B ChallengeSet)."""

    attack_hypothesis: str
    target: AttackTarget = Field(default_factory=AttackTarget)
    required_evidence: str = ""
    followup_queries: list[str] = Field(default_factory=list)
    would_change_conclusion_if: str = ""


class ChallengeSet(Contract):
    attacks: list[AttackDraft] = Field(default_factory=list)


class ConflictExplanation(Contract):
    kind: ConflictKind
    explanation: str


class ReportFindingDraft(Contract):
    text: str
    claim_ids: list[str] = Field(default_factory=list)


class ReportSectionDraft(Contract):
    dimension_id: str
    heading: str
    findings: list[ReportFindingDraft] = Field(default_factory=list)


class ReportDraft(Contract):
    decision_summary: str
    sections: list[ReportSectionDraft] = Field(default_factory=list)
