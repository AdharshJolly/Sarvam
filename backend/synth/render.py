"""Deterministic Markdown renderer (SSOT 9.11, task T07).

Citations are written `[C41]` from stored claim ids only. `verify_citations` proves that every
cited id resolves claim -> passage -> a passage that contains the quote (NFR-05). No certainty chips
at M0 (they arrive with T15).
"""

from __future__ import annotations

import re
import sqlite3

from backend.pipeline.claims import quote_in_passage
from backend.store import repo
from contracts.config import Settings
from contracts.llm import ReportDraft
from contracts.models import BudgetUsage, Claim, Run

CITATION = re.compile(r"\[(C\d+)\]")
ASSURANCE_LINE = "Assurance state: not yet computed (M0)"


class CitationError(ValueError):
    """A citation does not resolve to a stored passage containing the quoted text."""


def _cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ").strip()


def _sentence(text: str) -> str:
    """Writer text with any model-typed citation markers removed (ids come from claim_ids only)."""
    return re.sub(r"\s+", " ", CITATION.sub("", text)).strip()


def render_markdown(
    conn: sqlite3.Connection,
    run: Run,
    draft: ReportDraft,
    usage: BudgetUsage,
    settings: Settings,
    claims: list[Claim],
    *,
    termination_reason: str | None = None,
    degraded_reason: str | None = None,
) -> str:
    dims = {d.id: d for d in repo.list_dimensions(conn, run.id)}
    by_id = {c.id: c for c in claims}
    lines: list[str] = [f"# {_sentence(run.question)}", "", "## Decision summary", ""]
    lines += [_sentence(draft.decision_summary) or "No summary was produced.", ""]
    lines += [ASSURANCE_LINE, ""]

    lines += ["## Question and scope", "", f"- Question: {_sentence(run.question)}"]
    scope = {k: v for k, v in run.scope.model_dump().items() if v}
    if scope:
        for key, value in scope.items():
            lines.append(f"- {key.replace('_', ' ').capitalize()}: {_sentence(str(value))}")
    else:
        lines.append("- No scope constraints were given.")
    lines.append("")

    lines += ["## Findings by dimension", ""]
    cited: list[str] = []
    sections = {s.dimension_id: s for s in draft.sections}
    for dim_id, dim in dims.items():
        lines.append(f"### {_sentence(dim.name)}")
        section = sections.get(dim_id)
        if section is None or not section.findings:
            lines += ["- No verified claims were found for this dimension.", ""]
            continue
        for finding in section.findings:
            marks = " ".join(f"[{cid}]" for cid in finding.claim_ids if cid in by_id)
            lines.append(f"- {_sentence(finding.text)} {marks}".rstrip())
            cited += [cid for cid in finding.claim_ids if cid in by_id]
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
    lines += [
        "## Method and run metadata",
        "",
        f"- Mode: {run.mode.value}",
        "- Rounds completed: 0 follow-up rounds (M0: single pass, no challenge loop yet)",
        f"- Searches: {usage.searches}/{b.max_searches}; fetches: {usage.fetches}/{b.max_fetches}; "
        f"LLM calls: {usage.llm_calls}/{b.max_llm_calls}",
        f"- Cost: {cost} (limit ${b.max_cost_usd:.2f}); elapsed: {usage.elapsed_seconds:.0f} s",
        f"- Models: fast {settings.llm_model_fast or 'n/a'}, "
        f"strong {settings.llm_model_strong or 'n/a'}",
    ]
    if termination_reason:
        lines.append(f"- Run ended early: {termination_reason} (wrap-up with the evidence in hand)")
    if degraded_reason:
        lines.append(f"- Narrative writer unavailable: {_sentence(degraded_reason)}")
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
