"""Deterministic Markdown renderer (SSOT 9.11, task T07).

Citations are written `[C41]` from stored claim ids only. `verify_citations` proves that every
cited id resolves claim -> passage -> a passage that contains the quote (NFR-05). Certainty chips
and the assurance state come from the report verifier (T15) and the stop decision (T14).
"""

from __future__ import annotations

import re
import sqlite3

from backend.intel.stop import HARD_LIMITS
from backend.pipeline.claims import quote_in_passage
from backend.store import repo
from backend.synth.report_verify import VerifiedReport
from contracts.config import Settings
from contracts.glossary import CHALLENGE_PENDING, READING_GUIDE, entry, gap_text
from contracts.models import BudgetUsage, Claim, Run, StopDecision

CITATION = re.compile(r"\[(C\d+)\]")


class CitationError(ValueError):
    """A citation does not resolve to a stored passage containing the quoted text."""


def _cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ").strip()


def _sentence(text: str) -> str:
    """Writer text with any model-typed citation markers removed (ids come from claim_ids only)."""
    return re.sub(r"\s+", " ", CITATION.sub("", text)).strip()


def _conflict_next_step(x) -> str:
    """What a reader can do about a conflict: the kind's advice if it has any, else the status's."""
    step = (
        entry("conflict_kind", x.kind.value).next_step
        or entry("conflict_status", x.status.value).next_step
    )
    return f" Next step: {step}" if step else ""


def render_markdown(
    conn: sqlite3.Connection,
    run: Run,
    report: VerifiedReport,
    usage: BudgetUsage,
    settings: Settings,
    claims: list[Claim],
    *,
    decision: StopDecision,
    degraded_reason: str | None = None,
) -> str:
    dims = {d.id: d for d in repo.list_dimensions(conn, run.id)}
    slots = {s.id: s for s in repo.list_slots(conn, run.id)}
    by_id = {c.id: c for c in claims}
    lines: list[str] = [f"# {_sentence(run.question)}", "", "## Decision summary", ""]
    lines += [_sentence(report.decision_summary) or "No summary was produced.", ""]
    verdict = entry("final_state", decision.state.value)
    stop_why = entry("termination_reason", decision.termination_reason.value)
    lines += [
        f"**{verdict.label}.** {verdict.meaning}",
        "",
        f"Why the research stopped: {stop_why.label}. {stop_why.meaning}",
        "",
    ]
    if verdict.next_step:
        lines += [verdict.next_step, ""]
    # Technical state line: kept verbatim for tooling and the gates (B-38).
    lines += [
        f"**Assurance state: {decision.state.value}** ({decision.termination_reason.value})",
        "",
    ]
    lines += [f"- {_sentence(c)}" for c in decision.caveats]
    if decision.caveats:
        lines.append("")

    lines += ["## How to read this report", ""]
    lines += [f"- {text}" for text in READING_GUIDE]
    lines.append("")

    lines += ["## Question and scope", "", f"- Question: {_sentence(run.question)}"]
    scope = {k: v for k, v in run.scope.model_dump().items() if v}
    if scope:
        for key, value in scope.items():
            lines.append(f"- {key.replace('_', ' ').capitalize()}: {_sentence(str(value))}")
    else:
        lines.append("- No scope constraints were given.")
    lines.append("")

    latest = max((c.round for c in repo.list_coverage(conn, run.id)), default=0)
    cells = repo.list_coverage(conn, run.id, round=latest)
    lines += ["## Coverage matrix", ""]
    if cells:
        lines += [
            "| Dimension | Key point | State | Independent sources | Why |",
            "| --- | --- | --- | --- | --- |",
        ]
        for cell in cells:
            slot = slots.get(cell.slot_id)
            dim = dims.get(slot.dimension_id) if slot else None
            why = (
                "Enough independent sources agree."
                if cell.state.value == "GREEN"
                else gap_text(
                    cell.state.value,
                    cell.independent_origins,
                    cell.supporting_claims,
                    cell.open_conflicts,
                ).reason
                + "."
            )
            lines.append(
                f"| {_cell(dim.name if dim else '')} | {_cell(slot.name if slot else cell.slot_id)}"
                f"{' (critical)' if slot and slot.critical else ''} | "
                f"{entry('coverage_state', cell.state.value).label} ({cell.state.value}) | "
                f"{cell.independent_origins} | {_cell(why)} |"
            )
    else:
        lines.append("Coverage was not scored.")
    lines.append("")

    lines += ["## Findings by dimension", ""]
    cited: list[str] = []
    sections = {s.dimension_id: s for s in report.sections}
    for dim_id, dim in dims.items():
        lines.append(f"### {_sentence(dim.name)}")
        section = sections.get(dim_id)
        if section is None or not section.findings:
            lines += ["- No verified claims were found for this dimension.", ""]
            continue
        for finding in section.findings:
            marks = " ".join(f"[{cid}]" for cid in finding.claim_ids)
            lines.append(
                f"- {_sentence(finding.text)} {marks} {{{{certainty:{finding.certainty.value}}}}}"
            )
            cited += list(finding.claim_ids)
        lines.append("")

    conflicts = repo.list_conflicts(conn, run.id)
    lines += ["## Conflicts and unresolved items", ""]
    listed = False
    for x in conflicts:
        if x.claim_a not in by_id or x.claim_b not in by_id:
            continue
        listed = True
        note = f" {_sentence(x.explanation)}" if x.explanation else ""
        lines.append(
            f"- {entry('conflict_kind', x.kind.value).label} "
            f"({entry('conflict_status', x.status.value).label.lower()}, "
            f"{x.delta_pct:.0%} apart) between [{x.claim_a}] and [{x.claim_b}].{note}"
            f"{_conflict_next_step(x)}"
        )
        cited += [x.claim_a, x.claim_b]
    for cell in cells:
        slot = slots.get(cell.slot_id)
        if slot and slot.critical and cell.state.value != "GREEN":
            listed = True
            gap = gap_text(
                cell.state.value,
                cell.independent_origins,
                cell.supporting_claims,
                cell.open_conflicts,
            )
            lines.append(
                f"- {_sentence(slot.name)}: {gap.reason} ({cell.state.value})."
                f"{f' Next step: {gap.next_step}' if gap.next_step else ''}"
            )
    if not listed:
        lines.append("- No open conflicts, and every critical point is well supported.")
    lines.append("")

    lines += ["## What could change the conclusion", ""]
    challenges = repo.list_challenges(conn, run.id)
    if challenges:
        for ch in challenges:
            outcome = (
                entry("challenge_outcome", ch.outcome.value).label
                if ch.outcome
                else entry("challenge_outcome", CHALLENGE_PENDING).label
            ).lower()
            change = (
                f" It would change the conclusion if: {_sentence(ch.would_change_if)}"
                if ch.would_change_if
                else ""
            )
            lines.append(f"- Attack ({outcome}): {_sentence(ch.attack)}.{change}")
    else:
        lines.append("- No challenge was completed, so this run did not test its own conclusion.")
    lines.append("")

    lines += ["## Sources index", ""]
    source_ids: dict[str, None] = {}
    for cid in dict.fromkeys(cited):
        passage = repo.get_passage(conn, by_id[cid].passage_id)
        if passage:
            source_ids[passage.source_id] = None
    if source_ids:
        lines += [
            "| Source | Domain | Type | Tier | Retrieved | URL |",
            "| --- | --- | --- | --- | --- | --- |",
        ]
        for sid in sorted(source_ids, key=lambda s: int(s[1:])):
            src = repo.get_source(conn, sid)
            if src is None:
                continue
            when = src.retrieved_at.date().isoformat() if src.retrieved_at else "n/a"
            lines.append(
                f"| {src.id} | {_cell(src.domain)} | {src.source_type.value} | "
                f"{src.authority_tier} | {when} | {_cell(src.url)} |"
            )
    else:
        lines.append("No sources are cited because no findings survived verification.")
    lines.append("")

    b = run.budget
    cost = f"${usage.cost_usd:.4f}" if usage.cost_usd > 0 else "not reported by provider"
    rounds = max((c.round for c in repo.list_coverage(conn, run.id)), default=0)
    lines += [
        "## Method and run metadata",
        "",
        f"- Mode: {run.mode.value}",
        f"- Rounds: initial pass plus {rounds} follow-up round(s); challenge rounds completed: "
        f"{decision.challenge_rounds_completed}",
        f"- Stop: {decision.state.value}, reason {decision.termination_reason.value}",
        f"- Searches: {usage.searches}/{b.max_searches}; fetches: {usage.fetches}/{b.max_fetches}; "
        f"LLM calls: {usage.llm_calls}/{b.max_llm_calls}",
        f"- Cost: {cost} (limit ${b.max_cost_usd:.2f}); elapsed: {usage.elapsed_seconds:.0f} s",
        f"- Models: fast {settings.llm_model_fast or 'n/a'}, "
        f"strong {settings.llm_model_strong or 'n/a'}",
    ]
    if decision.termination_reason in HARD_LIMITS:
        lines.append(
            f"- Run ended early: {decision.termination_reason.value} "
            "(wrap-up with the evidence in hand)"
        )
    if degraded_reason:
        lines.append(f"- Narrative writer unavailable: {_sentence(degraded_reason)}")
    if report.dropped:
        lines.append(f"- Sentences removed by the report verifier: {len(report.dropped)}")
    lines.append("")
    return "\n".join(lines)


def verify_citations(conn: sqlite3.Connection, run_id: str, markdown: str) -> list[str]:
    """Every `[Cn]` must resolve claim -> passage containing the quote. Returns the cited ids or
    raises CitationError listing every failure."""
    cited = list(dict.fromkeys(CITATION.findall(markdown)))
    problems: list[str] = []
    for cid in cited:
        claim = repo.get_claim(conn, cid)
        passage = repo.get_passage(conn, claim.passage_id) if claim else None
        if claim is None or claim.run_id != run_id:
            problems.append(f"{cid}: no stored claim in this run")
        elif passage is None:
            problems.append(f"{cid}: passage {claim.passage_id} is not stored")
        elif not quote_in_passage(claim.quote, passage.text).ok:
            problems.append(f"{cid}: quote is not in passage {passage.id}")
    if problems:
        raise CitationError("; ".join(problems))
    return cited
