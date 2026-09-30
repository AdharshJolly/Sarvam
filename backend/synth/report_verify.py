"""Report verifier (SSOT 9.11, FR-19, FR-20, task T15). Deterministic, no LLM.

Every findings sentence must cite at least one stored claim, and every number in the sentence must
appear in the claims it cites (after normalisation: `1,299` equals `1299`). A sentence that breaks a
rule is removed and listed in the report's dropped sentences. Each kept finding gets a certainty
label derived from the cited claims and the coverage state of their slots:

- `contested`: a cited claim sits in an open conflict.
- `supported`: every cited claim belongs to a GREEN slot.
- `single-origin`: anything else (the slot is not GREEN, so the evidence is thin).
- `assumed` is reserved for a "System inference" section; the writer does not produce one yet, so
  no finding carries it (decision B-31).

Numbers the reader wrote in the question or scope are allowed in the decision summary and findings,
so "in 2027" does not have to appear in a source.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

from contracts.llm import ReportDraft
from contracts.models import (
    CertaintyLabel,
    Claim,
    ClaimStatus,
    CoverageState,
    Dimension,
    Run,
)

NUMBER = re.compile(r"(?<![\w.])\d[\d,]*(?:\.\d+)?")
SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


@dataclass(frozen=True)
class VerifiedFinding:
    text: str
    claim_ids: tuple[str, ...]
    certainty: CertaintyLabel


@dataclass(frozen=True)
class VerifiedSection:
    dimension_id: str
    heading: str
    findings: tuple[VerifiedFinding, ...]


@dataclass
class VerifiedReport:
    decision_summary: str
    sections: list[VerifiedSection]
    dropped: list[str] = field(default_factory=list)


def normalise_number(raw: str) -> str | None:
    """`1,299` -> `1299`, `12.50` -> `12.5`, `3.0` -> `3`. None when it is not a number."""
    try:
        value = Decimal(raw.replace(",", "").rstrip("."))
    except InvalidOperation:
        return None
    text = format(value.normalize(), "f")
    return text


def numbers_in(text: str) -> set[str]:
    return {n for m in NUMBER.findall(text) if (n := normalise_number(m)) is not None}


def claim_numbers(claim: Claim) -> set[str]:
    """Numbers a claim states: in its text, its quote and its extracted value."""
    found = numbers_in(claim.text) | numbers_in(claim.quote)
    if claim.value_num is not None:
        n = normalise_number(repr(claim.value_num))
        if n is not None:
            found.add(n)
    return found


def allowed_numbers(run: Run) -> set[str]:
    """Numbers the reader supplied (question and scope): they need no source."""
    scope = " ".join(str(v) for v in run.scope.model_dump().values() if v)
    return numbers_in(f"{run.question} {scope}")


def unsupported_numbers(sentence: str, supporting: Iterable[Claim], allowed: set[str]) -> set[str]:
    have = set(allowed)
    for claim in supporting:
        have |= claim_numbers(claim)
    return numbers_in(sentence) - have


def certainty_for(cited: list[Claim], slot_state: dict[str, CoverageState]) -> CertaintyLabel:
    if any(c.status is ClaimStatus.CONTESTED for c in cited):
        return CertaintyLabel.CONTESTED
    if all(slot_state.get(c.slot_id) is CoverageState.GREEN for c in cited):
        return CertaintyLabel.SUPPORTED
    return CertaintyLabel.SINGLE_ORIGIN


def verify_report(
    draft: ReportDraft,
    claims: list[Claim],
    dimensions: list[Dimension],
    slot_state: dict[str, CoverageState],
    allowed: set[str],
) -> VerifiedReport:
    """Check the writer's draft against the eligible claims. Never raises on a bad sentence."""
    by_id = {c.id: c for c in claims}
    dims = {d.id for d in dimensions}
    dropped: list[str] = []

    all_numbers = set(allowed)
    for c in claims:
        all_numbers |= claim_numbers(c)
    kept_summary: list[str] = []
    for sentence in SENTENCE_END.split(draft.decision_summary.strip()):
        if not sentence.strip():
            continue
        if numbers_in(sentence) - all_numbers:
            dropped.append(sentence.strip())  # a summary figure no stored claim states
        else:
            kept_summary.append(sentence.strip())

    sections: list[VerifiedSection] = []
    for section in draft.sections:
        findings: list[VerifiedFinding] = []
        for finding in section.findings:
            text = finding.text.strip()
            ids = list(dict.fromkeys(finding.claim_ids))
            if not text:
                dropped.append("(empty finding)")
                continue
            if not ids or any(i not in by_id for i in ids) or section.dimension_id not in dims:
                dropped.append(text)  # no claim id, an unknown one, or an unknown dimension
                continue
            cited = [by_id[i] for i in ids]
            if unsupported_numbers(text, cited, allowed):
                dropped.append(text)  # a number the cited claims do not state
                continue
            findings.append(VerifiedFinding(text, tuple(ids), certainty_for(cited, slot_state)))
        if findings:
            sections.append(
                VerifiedSection(
                    section.dimension_id, section.heading.strip() or "Findings", tuple(findings)
                )
            )
    return VerifiedReport(" ".join(kept_summary), sections, dropped)
