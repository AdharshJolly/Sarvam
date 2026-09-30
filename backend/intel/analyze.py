"""ANALYZE phase (SSOT section 7, state 7): origins, numeric conflicts, coverage, rollups.

The decision logic lives in the pure modules (`origins`, `numeric`, `conflicts`, `coverage`); this
module reads stored rows, calls them, persists the result and emits the events. Every pass is a
full recomputation over stored rows, so it is idempotent and works for any round (FR-16: the
follow-up rounds only add new rows; nothing is fetched or judged again here).
"""

from __future__ import annotations

import asyncio
import sqlite3
from dataclasses import dataclass

from backend.gateway import BudgetExceeded, CallMetrics, GatewayError
from backend.gateway.core import ToolGateway
from backend.gateway.llm import LLMRole
from backend.intel import origins as origins_mod
from backend.intel.conflicts import (
    ConflictCandidate,
    ConflictClaim,
    contested_claim_ids,
    detect_conflicts,
)
from backend.intel.coverage import (
    CellResult,
    CoverageClaim,
    CoverageDimension,
    CoverageSlot,
    RollupResult,
    compute_coverage,
    rollup_dimensions,
)
from backend.intel.gaps import generate_gap_tasks
from backend.intel.keys import id_number
from backend.intel.numeric import normalize_value
from backend.intel.origins import ClaimFact, OriginInput
from backend.store import repo
from backend.store.emit import Emitter
from contracts.config import Settings
from contracts.events import (
    BudgetWarningPayload,
    ConflictDetectedPayload,
    CoverageUpdatedPayload,
    EventType,
    OriginUpdatedPayload,
    PhaseEnteredPayload,
)
from contracts.llm import ConflictExplanation
from contracts.models import (
    Conflict,
    ConflictKind,
    ConflictStatus,
    CoverageCell,
    DimensionRollup,
    FailureType,
    Origin,
    Phase,
    Scope,
    Task,
    Verdict,
)

# ---------------------------------------------------------------- origins (T10)


def origin_inputs(conn: sqlite3.Connection, run_id: str) -> list[OriginInput]:
    """One input per fetched source that has passages. Claim passages come from non-rejected
    claims; a source without any claim is clustered on all of its passages."""
    claims = [c for c in repo.list_claims(conn, run_id, include_rejected=False) if c.quote_verified]
    claim_passages: dict[str, set[str]] = {}
    facts: dict[str, list[ClaimFact]] = {}
    for c in claims:
        passage = repo.get_passage(conn, c.passage_id)
        if passage is None:
            continue
        claim_passages.setdefault(passage.source_id, set()).add(passage.id)
        facts.setdefault(passage.source_id, []).append(
            ClaimFact(c.entity, c.attribute, c.period, c.value_num)
        )
    out: list[OriginInput] = []
    for source in repo.list_sources(conn, run_id, status="fetched"):
        passages = repo.list_passages(conn, source.id)
        if not passages:
            continue
        chosen = [p for p in passages if p.id in claim_passages.get(source.id, set())] or passages
        out.append(
            OriginInput(
                source_id=source.id,
                domain=source.domain,
                publisher=source.publisher,
                source_type=source.source_type.value,
                authority_tier=source.authority_tier,
                claim_text="\n".join(p.text for p in chosen),
                full_text="\n".join(p.text for p in passages),
                claims=tuple(facts.get(source.id, [])),
            )
        )
    return out


def assign_origin_ids(
    run_id: str, previous: list[Origin], clusters: list[origins_mod.OriginResult]
) -> list[Origin]:
    """Keep the id of an existing origin whenever a cluster still contains its members, so ids
    stay stable across rounds; merged-away ids disappear and new clusters get the next number."""
    taken: set[str] = set()
    next_no = max((id_number(o.id) for o in previous), default=0)
    result: list[Origin] = []
    for cluster in clusters:
        members = set(cluster.source_ids)
        overlap = sorted(
            (o for o in previous if o.id not in taken and members & set(o.member_source_ids)),
            key=lambda o: id_number(o.id),
        )
        if overlap:
            oid = overlap[0].id
        else:
            next_no += 1
            oid = f"O{next_no}"
        taken.add(oid)
        result.append(
            Origin(
                id=oid,
                run_id=run_id,
                label=cluster.label,
                method=cluster.method,
                member_source_ids=list(cluster.source_ids),
            )
        )
    return result


def update_origins(
    conn: sqlite3.Connection, em: Emitter, settings: Settings, run_id: str, *, round: int = 0
) -> list[Origin]:
    """Cluster, persist, and emit `origin.updated` for every origin that is new or changed."""
    previous = repo.list_origins(conn, run_id)
    clustering = origins_mod.cluster_origins(origin_inputs(conn, run_id), settings.thresholds)
    fresh = assign_origin_ids(run_id, previous, clustering.origins)
    before = {o.id: o for o in previous}
    repo.replace_origins(conn, run_id, fresh)
    changed = [o for o in fresh if before.get(o.id) != o]
    for origin in changed:
        em.emit(EventType.ORIGIN_UPDATED, OriginUpdatedPayload(origin=origin), round=round)
    return changed


# ---------------------------------------------------------------- conflicts (T11)


def conflict_claims(conn: sqlite3.Connection, run_id: str) -> list[ConflictClaim]:
    """Non-rejected claims with a verdict, joined to their passage and source."""
    verdicts = repo.latest_verdicts(conn, run_id)
    out: list[ConflictClaim] = []
    for c in repo.list_claims(conn, run_id, include_rejected=False):
        link = verdicts.get(c.id)
        passage = repo.get_passage(conn, c.passage_id)
        source = repo.get_source(conn, passage.source_id) if passage else None
        if link is None or source is None:
            continue
        out.append(
            ConflictClaim(
                id=c.id,
                slot_id=c.slot_id,
                entity=c.entity,
                attribute=c.attribute,
                value_num=c.value_num,
                unit=c.unit,
                period=c.period,
                quote=c.quote,
                text=c.text,
                passage_id=c.passage_id,
                source_id=source.id,
                source_type=source.source_type.value,
                authority_tier=source.authority_tier,
                domain=source.domain,
                published_at=source.published_at.date().isoformat()
                if source.published_at
                else None,
                verdict=link.verdict.value,
            )
        )
    return out


def _same_pair(row: Conflict, cand: ConflictCandidate) -> bool:
    """An existing row describes a candidate when its claims sit on opposite sides of it."""
    if row.slot_id != cand.slot_id:
        return False
    a, b = set(cand.members_a), set(cand.members_b)
    return (row.claim_a in a and row.claim_b in b) or (row.claim_a in b and row.claim_b in a)


@dataclass
class _Resolved:
    candidate: ConflictCandidate
    row: Conflict | None  # the stored conflict this candidate maps to, if any
    kind: ConflictKind
    status: ConflictStatus
    explanation: str | None
    metrics: CallMetrics | None = None
    needs_explainer: bool = False


def _explainer_payload(
    conn: sqlite3.Connection,
    run_id: str,
    cand: ConflictCandidate,
    by_id: dict[str, ConflictClaim],
) -> dict:
    slot = next(s for s in repo.list_slots(conn, run_id) if s.id == cand.slot_id)
    claims, untrusted = [], []
    for cid, members in ((cand.claim_a, cand.members_a), (cand.claim_b, cand.members_b)):
        c = by_id[cid]
        n = normalize_value(c.value_num or 0.0, c.unit, c.period, c.quote)
        claims.append(
            {
                "id": c.id,
                "text": c.text,
                "entity": c.entity,
                "value": c.value_num,
                "unit": c.unit,
                "period": c.period,
                "normalised_value": round(n.value, 4),
                "normalised_unit": n.unit,
                "normalised_period": n.period,
                "source_type": c.source_type,
                "authority_tier": c.authority_tier,
                "domain": c.domain,
                "published_at": c.published_at,
                "claims_on_this_side": len(members),
            }
        )
        passage = repo.get_passage(conn, c.passage_id)
        if passage is not None and all(u["id"] != passage.id for u in untrusted):
            untrusted.append({"id": passage.id, "text": passage.text})
    return {
        "conflict": {
            "slot": {"id": slot.id, "name": slot.name, "description": slot.description},
            "attribute": by_id[cand.claim_a].attribute,
            "delta_pct": cand.delta_pct,
            "claims": claims,
        },
        "allowed_kinds": [k.value for k in ConflictKind],
        "untrusted": untrusted,
    }


async def update_conflicts(
    gateway: ToolGateway,
    conn: sqlite3.Connection,
    em: Emitter,
    settings: Settings,
    run_id: str,
    *,
    round: int = 0,
    explain: bool = True,
) -> list[Conflict]:
    """Detect numeric conflicts, classify new ones, persist, mark `contested` claims and emit
    `conflict.detected` for every conflict that is new or changed. With `explain=False` (wrap-up)
    no LLM is called: unexplained disagreements stay open, which is the conservative reading.

    Unit traps are explained by rule. Disagreements after normalisation go to the LLM explainer
    once; if it fails the conflict stays open (kind genuine, no explanation) and is retried next
    pass. BudgetExceeded is re-raised after everything decided so far has been persisted.
    """
    claims = conflict_claims(conn, run_id)
    by_id = {c.id: c for c in claims}
    candidates = detect_conflicts(claims, settings.thresholds.conflict_tolerance)
    existing = repo.list_conflicts(conn, run_id)

    resolved: list[_Resolved] = []
    for cand in candidates:
        row = next((r for r in existing if _same_pair(r, cand)), None)
        if cand.explained_by == "rule":
            resolved.append(
                _Resolved(
                    cand,
                    row,
                    cand.kind or ConflictKind.UNIT_ERROR,
                    cand.status,
                    cand.explanation,
                )
            )
        elif row is not None and (row.status is ConflictStatus.EXPLAINED or row.explanation):
            resolved.append(_Resolved(cand, row, row.kind, row.status, row.explanation))
        else:
            resolved.append(
                _Resolved(
                    cand, row, ConflictKind.GENUINE, ConflictStatus.OPEN, None, needs_explainer=True
                )
            )

    failures = 0
    budget_error: BudgetExceeded | None = None

    async def explain_one(item: _Resolved) -> None:
        nonlocal failures, budget_error
        payload = _explainer_payload(conn, run_id, item.candidate, by_id)
        try:
            res = await gateway.llm(LLMRole.EXPLAINER, "explainer.v1", ConflictExplanation, payload)
        except BudgetExceeded as exc:
            budget_error = budget_error or exc
            return
        except GatewayError as exc:
            if exc.failure in (FailureType.STEP_FAILED, FailureType.RATE_LIMITED):
                failures += 1
                return
            raise
        out = res.value
        explanation = out.explanation.strip()
        item.metrics = res.metrics
        if out.kind is ConflictKind.GENUINE or not explanation:
            # An explanation-less "explained" verdict would hide a conflict: keep it open.
            item.kind, item.status = ConflictKind.GENUINE, ConflictStatus.OPEN
            item.explanation = explanation or None
        else:
            item.kind, item.status = out.kind, ConflictStatus.EXPLAINED
            item.explanation = explanation

    if explain:
        await asyncio.gather(*(explain_one(i) for i in resolved if i.needs_explainer))

    changed: list[Conflict] = []
    for item in resolved:
        cand = item.candidate
        fields = {
            "claim_a": cand.claim_a,
            "claim_b": cand.claim_b,
            "delta_pct": cand.delta_pct,
            "kind": item.kind,
            "status": item.status,
            "explanation": item.explanation,
        }
        if item.row is None:
            saved = repo.insert_conflict(
                conn,
                run_id,
                slot_id=cand.slot_id,
                **{k: getattr(v, "value", v) for k, v in fields.items()},
            )
        else:
            wanted = item.row.model_copy(update=fields)
            if wanted == item.row:
                continue
            repo.update_conflict(
                conn, item.row.id, **{k: getattr(v, "value", v) for k, v in fields.items()}
            )
            saved = wanted
        changed.append(saved)
        em.emit(
            EventType.CONFLICT_DETECTED,
            ConflictDetectedPayload(conflict=saved),
            round=round,
            metrics=item.metrics,
        )

    contested = contested_claim_ids(
        [i.candidate for i in resolved], [i.status is ConflictStatus.OPEN for i in resolved]
    )
    verdicts = repo.latest_verdicts(conn, run_id)
    desired: dict[str, str] = {}
    current: dict[str, str] = {}
    for c in repo.list_claims(conn, run_id, include_rejected=False):
        link = verdicts.get(c.id)
        current[c.id] = c.status.value
        if link is None:
            continue
        if link.verdict is Verdict.SUPPORTS:
            desired[c.id] = "contested" if c.id in contested else "supported"
        elif link.verdict is Verdict.PARTIAL:
            desired[c.id] = "partial"
    repo.set_claim_statuses(conn, {k: v for k, v in desired.items() if current[k] != v})

    if failures:
        em.emit(
            EventType.BUDGET_WARNING,
            BudgetWarningPayload(limit="explainer_step_failures", used=failures, max=len(resolved)),
            round=round,
        )
    if budget_error is not None:
        raise budget_error
    return changed


# ---------------------------------------------------------------- coverage and gaps (T12)


def _coverage_slots(conn: sqlite3.Connection, run_id: str) -> list[CoverageSlot]:
    return [
        CoverageSlot(s.id, s.dimension_id, s.name, s.critical, s.min_independent, s.primary_ok)
        for s in repo.list_slots(conn, run_id)
    ]


def coverage_claims(conn: sqlite3.Connection, run_id: str) -> list[CoverageClaim]:
    """Every claim that has a verdict (rejected ones too, so a RED reason can say what happened),
    placed on the origin of its source."""
    origins = {o.id: o for o in repo.list_origins(conn, run_id)}
    verdicts = repo.latest_verdicts(conn, run_id)
    out: list[CoverageClaim] = []
    for c in repo.list_claims(conn, run_id):
        link = verdicts.get(c.id)
        passage = repo.get_passage(conn, c.passage_id)
        source = repo.get_source(conn, passage.source_id) if passage else None
        if link is None or source is None:
            continue
        origin = origins.get(source.origin_id or "")
        out.append(
            CoverageClaim(
                claim_id=c.id,
                slot_id=c.slot_id,
                source_id=source.id,
                origin_id=origin.id if origin else source.id,
                origin_established=origin is not None and origin.method.value != "none",
                verdict=link.verdict.value,
                authority_tier=source.authority_tier,
            )
        )
    return out


def compute_run_coverage(
    conn: sqlite3.Connection, run_id: str
) -> tuple[list[CellResult], list[RollupResult]]:
    slots = _coverage_slots(conn, run_id)
    dims = [CoverageDimension(d.id, d.name) for d in repo.list_dimensions(conn, run_id)]
    open_by_slot: dict[str, int] = {}
    for c in repo.list_conflicts(conn, run_id):
        if c.status is ConflictStatus.OPEN:
            open_by_slot[c.slot_id] = open_by_slot.get(c.slot_id, 0) + 1
    cells = compute_coverage(slots, coverage_claims(conn, run_id), open_by_slot)
    rollups = rollup_dimensions(dims, slots, {c.slot_id: c.state for c in cells})
    return cells, rollups


def update_coverage(
    conn: sqlite3.Connection, em: Emitter, run_id: str, *, round: int = 0
) -> tuple[list[CoverageCell], list[DimensionRollup]]:
    """Recompute the round's coverage matrix and dimension rollups; store and emit
    `coverage.updated` only when something changed since the last pass."""
    results, roll = compute_run_coverage(conn, run_id)
    rows = [
        {
            "slot_id": r.slot_id,
            "state": r.state.value,
            "independent_origins": r.independent_origins,
            "supporting_claims": r.supporting_claims,
            "open_conflicts": r.open_conflicts,
            "reason": r.reason,
        }
        for r in results
    ]
    rollups = [
        DimensionRollup(dimension_id=r.dimension_id, state=r.state, reason=r.reason) for r in roll
    ]
    previous = repo.list_coverage(conn, run_id, round=round)

    def signature(cells: list[CoverageCell]) -> list[tuple]:
        return [
            (
                c.slot_id,
                c.state,
                c.independent_origins,
                c.supporting_claims,
                c.open_conflicts,
                c.reason,
            )
            for c in cells
        ]

    cells = repo.replace_coverage_round(conn, run_id, round, rows)
    if signature(previous) != signature(cells):
        em.emit(
            EventType.COVERAGE_UPDATED,
            CoverageUpdatedPayload(round=round, cells=cells, rollups=rollups),
            round=round,
        )
    return cells, rollups


def create_gap_tasks(
    conn: sqlite3.Connection, run_id: str, scope: Scope, *, round: int, limit: int | None = None
) -> list[Task]:
    """Store one follow-up task per critical slot that is not GREEN (FR-14). The tasks are
    `pending`, kind `gap`, in `round`; DISCOVER picks them up like any other task. With `limit`
    (what the search budget can still pay for) RED slots come first, then AMBER, in slot order."""
    cells, _ = compute_run_coverage(conn, run_id)
    slots = _coverage_slots(conn, run_id)
    attributes = {s.id: s.attributes for s in repo.list_slots(conn, run_id)}
    queries: dict[str, list[str]] = {}
    for t in repo.list_tasks(conn, run_id):
        queries.setdefault(t.slot_id, []).append(t.query_text)
    made = generate_gap_tasks(slots, attributes, cells, queries, scope)
    if limit is not None:
        red = {c.slot_id for c in cells if c.state.value == "RED"}
        made = sorted(made, key=lambda g: g.slot_id not in red)[: max(limit, 0)]
    return [
        repo.insert_task(conn, run_id, slot_id=g.slot_id, query=g.query, kind="gap", round=round)
        for g in made
    ]


async def run_analyze(
    gateway: ToolGateway,
    conn: sqlite3.Connection,
    em: Emitter,
    settings: Settings,
    run_id: str,
    *,
    round: int = 0,
    reason: str = "Clustering origins, checking numeric conflicts and scoring coverage.",
    explain: bool = True,
) -> tuple[list[CoverageCell], list[DimensionRollup]]:
    """ANALYZE phase: origins, then conflicts, then coverage. If the explainer hits a budget limit
    or a provider outage, coverage is still computed from what is stored and the error re-raised."""
    em.emit(
        EventType.PHASE_ENTERED,
        PhaseEnteredPayload(phase=Phase.ANALYZE, reason=reason),
        round=round,
    )
    update_origins(conn, em, settings, run_id, round=round)
    failure: GatewayError | None = None
    try:
        await update_conflicts(gateway, conn, em, settings, run_id, round=round, explain=explain)
    except GatewayError as exc:  # budget limit or provider outage: still score what is stored
        failure = exc
    result = update_coverage(conn, em, run_id, round=round)
    if failure is not None:
        raise failure
    return result
