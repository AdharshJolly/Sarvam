"""Writer v0 (SSOT 9.11, task T07): an LLM drafts findings from verified claims; code enforces that
every finding cites only stored, eligible claims. The full sentence and number verifier, certainty
labels and "System inference" handling are T15 (M1) and intentionally not built here.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass

from backend.gateway import CallMetrics, GatewayError
from backend.gateway.core import ToolGateway
from backend.gateway.llm import LLMRole
from backend.store import repo
from contracts.llm import ReportDraft, ReportFindingDraft, ReportSectionDraft
from contracts.models import Claim, Dimension, EvidenceSlot, Run, Source

NO_CLAIMS_SUMMARY = (
    "No claims survived quote verification, so this report contains no findings. "
    "The run did not gather citable evidence for the question."
)


def eligible_statuses() -> frozenset[str]:
    """Claim statuses the writer may use. M0: unverified-by-judge `pending` claims whose quote was
    proven by the quote guard. The independent verifier (M1) will tighten this to supported,
    partial and contested."""
    return frozenset({"pending"})


def eligible_claims(conn: sqlite3.Connection, run_id: str) -> list[Claim]:
    return [
        c
        for c in repo.list_claims(conn, run_id)
        if c.status.value in eligible_statuses() and c.quote_verified
    ]


@dataclass
class WriterResult:
    draft: ReportDraft
    dropped: list[str]
    metrics: CallMetrics | None
    degraded_reason: str | None = None  # set when the LLM narrative could not be produced


def deterministic_draft(
    claims: list[Claim],
    slots: dict[str, EvidenceSlot],
    summary: str,
) -> ReportDraft:
    """Evidence-only report: each eligible claim is one finding citing itself. Used when there are
    no claims to narrate or the writer could not run (budget, outage)."""
    by_dim: dict[str, list[ReportFindingDraft]] = {}
    for c in claims:
        dim = slots[c.slot_id].dimension_id if c.slot_id in slots else ""
        by_dim.setdefault(dim, []).append(ReportFindingDraft(text=c.text, claim_ids=[c.id]))
    sections = [
        ReportSectionDraft(dimension_id=d, heading="Evidence", findings=f)
        for d, f in by_dim.items()
        if d
    ]
    return ReportDraft(decision_summary=summary, sections=sections)


def clean_draft(
    draft: ReportDraft, claims: list[Claim], dimensions: list[Dimension]
) -> tuple[ReportDraft, list[str]]:
    """Drop findings with no claim ids, unknown claim ids or an unknown dimension. Deterministic."""
    known_claims = {c.id for c in claims}
    known_dims = {d.id for d in dimensions}
    dropped: list[str] = []
    sections: list[ReportSectionDraft] = []
    for section in draft.sections:
        kept: list[ReportFindingDraft] = []
        for finding in section.findings:
            ids = list(dict.fromkeys(finding.claim_ids))
            text = finding.text.strip()
            if (
                not text
                or not ids
                or any(i not in known_claims for i in ids)
                or section.dimension_id not in known_dims
            ):
                dropped.append(text or "(empty finding)")
                continue
            kept.append(ReportFindingDraft(text=text, claim_ids=ids))
        if kept:
            sections.append(
                ReportSectionDraft(
                    dimension_id=section.dimension_id,
                    heading=section.heading.strip() or "Findings",
                    findings=kept,
                )
            )
    return ReportDraft(decision_summary=draft.decision_summary.strip(), sections=sections), dropped


async def write_draft(
    gateway: ToolGateway,
    conn: sqlite3.Connection,
    run: Run,
    claims: list[Claim],
    *,
    wrap_up_note: str | None = None,
) -> WriterResult:
    slots = {s.id: s for s in repo.list_slots(conn, run.id)}
    dims = repo.list_dimensions(conn, run.id)
    if not claims:
        return WriterResult(ReportDraft(decision_summary=NO_CLAIMS_SUMMARY), [], None)
    dim_name = {d.id: d.name for d in dims}
    tiers: dict[str, int] = {}
    for c in claims:
        psg = repo.get_passage(conn, c.passage_id)
        src: Source | None = repo.get_source(conn, psg.source_id) if psg else None
        tiers[c.id] = src.authority_tier if src else 3
    payload = {
        "question": run.question,
        "scope": run.scope.model_dump(),
        "dimensions": [{"id": d.id, "name": d.name} for d in dims],
        "claims": [
            {
                "id": c.id,
                "dimension_id": slots[c.slot_id].dimension_id if c.slot_id in slots else "",
                "dimension": dim_name.get(slots[c.slot_id].dimension_id, "")
                if c.slot_id in slots
                else "",
                "slot_id": c.slot_id,
                "text": c.text,
                "source_tier": tiers[c.id],
            }
            for c in claims
        ],
    }
    try:
        res = await gateway.llm(LLMRole.WRITER, "writer.v1", ReportDraft, payload)
    except GatewayError as exc:
        reason = f"{exc.failure.value}: {exc.message or 'writer unavailable'}"
        summary = (
            "The narrative summary could not be written "
            f"({reason}). The verified claims are listed below by dimension."
        )
        if wrap_up_note:
            summary = f"{wrap_up_note} {summary}"
        return WriterResult(deterministic_draft(claims, slots, summary), [], None, reason)
    draft, dropped = clean_draft(res.value, claims, dims)
    return WriterResult(draft, dropped, res.metrics)
