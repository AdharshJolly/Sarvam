"""Challenge loop and rule-based outcomes (SSOT 9.9, FR-15, task T13).

The challenger (STRONG tier) attacks the weakest slots and claims. Code validates its output,
turns each attack into one follow-up task of kind `challenge`, and later decides the outcome by
rule: the independent verifier judges the attack hypothesis, as if it were a claim, against the
passages the follow-up search found. Any `supports` verdict weakens the conclusion; at least three
relevant passages and none supporting strengthens it; anything else stays unresolved. The LLM never
decides an outcome.
"""

from __future__ import annotations

import asyncio
import re
import sqlite3
from dataclasses import dataclass

from backend.gateway import BudgetExceeded, CallMetrics, GatewayError
from backend.gateway.core import ToolGateway
from backend.gateway.llm import LLMRole
from backend.store import repo
from backend.store.emit import Emitter
from contracts.events import (
    BudgetWarningPayload,
    ChallengeCreatedPayload,
    ChallengeOutcomePayload,
    EventType,
    PhaseEnteredPayload,
)
from contracts.llm import AttackDraft, ChallengeSet, VerdictBatch
from contracts.models import (
    Challenge,
    ChallengeOutcome,
    CoverageState,
    FailureType,
    Passage,
    Phase,
    Scope,
    Verdict,
)

MAX_ATTACKS = 3  # SSOT 9.9
MIN_RELEVANT_TO_STRENGTHEN = 3  # SSOT 9.9
PASSAGES_PER_ATTACK = 6  # keeps a challenge to two verifier calls
BATCH_SIZE = 5
TOP_CLAIMS_PER_SLOT = 3

_STATE_RANK = {CoverageState.RED: 0, CoverageState.AMBER: 1, CoverageState.GREEN: 2}


# ---------------------------------------------------------------- outcome rule (pure)


def outcome_by_rule(verdicts: list[Verdict]) -> ChallengeOutcome:
    """SSOT 9.9. `verdicts` are the verifier's labels of the attack against each new passage."""
    if any(v is Verdict.SUPPORTS for v in verdicts):
        return ChallengeOutcome.WEAKENED
    relevant = sum(1 for v in verdicts if v is not Verdict.IRRELEVANT)
    if relevant >= MIN_RELEVANT_TO_STRENGTHEN:
        return ChallengeOutcome.STRENGTHENED
    return ChallengeOutcome.UNRESOLVED


# ---------------------------------------------------------------- attack validation (pure)


@dataclass(frozen=True)
class ValidAttack:
    hypothesis: str
    slot_id: str
    claim_id: str | None
    required_evidence: str
    would_change_if: str
    queries: tuple[str, ...]


def validate_attacks(
    drafts: list[AttackDraft],
    slot_ids: set[str],
    claim_slot: dict[str, str],
    tried: list[str],
) -> list[ValidAttack]:
    """Keep at most MAX_ATTACKS attacks that name a real slot (or a real claim, which gives the
    slot), carry a hypothesis and at least one new query. Ids the model invented drop the attack."""
    tried_norm = {_norm(q) for q in tried}
    out: list[ValidAttack] = []
    for d in drafts:
        hypothesis = d.attack_hypothesis.strip()
        claim_id = d.target.claim_id if d.target.claim_id in claim_slot else None
        slot_id = d.target.slot_id if d.target.slot_id in slot_ids else None
        if slot_id is None and claim_id is not None:
            slot_id = claim_slot[claim_id]
        if not hypothesis or slot_id is None:
            continue
        queries: list[str] = []
        for q in d.followup_queries:
            q = q.strip()
            if q and _norm(q) not in tried_norm and _norm(q) not in {_norm(x) for x in queries}:
                queries.append(q)
        if not queries:
            continue
        out.append(
            ValidAttack(
                hypothesis,
                slot_id,
                claim_id,
                d.required_evidence.strip(),
                d.would_change_conclusion_if.strip(),
                tuple(queries[:2]),
            )
        )
        if len(out) == MAX_ATTACKS:
            break
    return out


def _norm(text: str) -> str:
    return " ".join(re.findall(r"\w+", text.lower()))


# ---------------------------------------------------------------- challenger input


def challenger_payload(
    conn: sqlite3.Connection, run_id: str, scope: Scope, question: str, round: int
) -> dict:
    slots = {s.id: s for s in repo.list_slots(conn, run_id)}
    dims = {d.id: d for d in repo.list_dimensions(conn, run_id)}
    latest = max((c.round for c in repo.list_coverage(conn, run_id)), default=0)
    cells = repo.list_coverage(conn, run_id, round=latest)
    ordered = sorted(
        cells,
        key=lambda c: (
            _STATE_RANK[c.state],
            not slots[c.slot_id].critical,
            c.slot_id,
        ),
    )
    coverage = [
        {
            "slot_id": c.slot_id,
            "slot": slots[c.slot_id].name,
            "dimension": dims[slots[c.slot_id].dimension_id].name,
            "critical": slots[c.slot_id].critical,
            "state": c.state.value,
            "independent_origins": c.independent_origins,
            "reason": c.reason,
        }
        for c in ordered
    ]
    origin_of_source = {}
    for o in repo.list_origins(conn, run_id):
        for sid in o.member_source_ids:
            origin_of_source[sid] = o
    top: list[dict] = []
    untrusted: list[dict] = []
    per_slot: dict[str, int] = {}
    for c in repo.list_claims(conn, run_id, include_rejected=False):
        if c.status.value not in ("supported", "partial", "contested"):
            continue
        if per_slot.get(c.slot_id, 0) >= TOP_CLAIMS_PER_SLOT:
            continue
        passage = repo.get_passage(conn, c.passage_id)
        origin = origin_of_source.get(passage.source_id) if passage else None
        per_slot[c.slot_id] = per_slot.get(c.slot_id, 0) + 1
        top.append({"id": c.id, "slot_id": c.slot_id, "origin_id": origin.id if origin else None})
        untrusted.append({"id": c.id, "text": c.text})
    return {
        "question": question,
        "scope": scope.model_dump(),
        "round": round,
        "coverage": coverage,
        "top_claims": top,
        "open_conflicts": [
            {"id": x.id, "slot_id": x.slot_id, "claim_a": x.claim_a, "claim_b": x.claim_b}
            for x in repo.list_conflicts(conn, run_id)
            if x.status.value == "open"
        ],
        "origins": [
            {"id": o.id, "label": o.label, "sources": len(o.member_source_ids)}
            for o in repo.list_origins(conn, run_id)
        ],
        "already_tried": [t.query_text for t in repo.list_tasks(conn, run_id)],
        "untrusted": untrusted,
    }


# ---------------------------------------------------------------- create the attacks


async def run_challenge(
    gateway: ToolGateway,
    conn: sqlite3.Connection,
    em: Emitter,
    run_id: str,
    question: str,
    scope: Scope,
    *,
    round: int,
    reason: str = "Attacking the weakest slots and claims before relying on them.",
) -> list[Challenge]:
    """CHALLENGE phase (state 8): ask the challenger for attacks, store each with one follow-up task
    of kind `challenge` in `round`, and emit `challenge.created`. A challenger that fails after its
    retries yields no attacks (a warning is emitted and the round is not a completed challenge);
    BudgetExceeded and provider outages propagate to the controller."""
    em.emit(
        EventType.PHASE_ENTERED,
        PhaseEnteredPayload(phase=Phase.CHALLENGE, reason=reason),
        round=round,
    )
    payload = challenger_payload(conn, run_id, scope, question, round)
    try:
        res = await gateway.llm(LLMRole.CHALLENGER, "challenger.v1", ChallengeSet, payload)
    except GatewayError as exc:
        if exc.failure in (FailureType.STEP_FAILED, FailureType.RATE_LIMITED):
            em.emit(
                EventType.BUDGET_WARNING,
                BudgetWarningPayload(limit="challenger_step_failed", used=1, max=1),
                round=round,
            )
            return []
        raise
    slots = {s.id for s in repo.list_slots(conn, run_id)}
    claim_slot = {c.id: c.slot_id for c in repo.list_claims(conn, run_id, include_rejected=False)}
    attacks = validate_attacks(res.value.attacks, slots, claim_slot, payload["already_tried"])
    made: list[Challenge] = []
    metrics: CallMetrics | None = res.metrics
    for attack in attacks:
        task = repo.insert_task(
            conn, run_id, slot_id=attack.slot_id, query=attack.queries[0], kind="challenge",
            round=round,
        )  # fmt: skip
        challenge = repo.insert_challenge(
            conn,
            run_id,
            round=round,
            attack=attack.hypothesis,
            target_slot=attack.slot_id,
            target_claim=attack.claim_id,
            required_evidence=attack.required_evidence,
            would_change_if=attack.would_change_if,
            followup_task_ids=[task.id],
        )
        em.emit(
            EventType.CHALLENGE_CREATED,
            ChallengeCreatedPayload(challenge=challenge),
            round=round,
            metrics=metrics,
        )
        metrics = None  # the call's usage is recorded once
        made.append(challenge)
    return made


# ---------------------------------------------------------------- outcomes


def _tokens(text: str) -> set[str]:
    return {w for w in re.findall(r"\w+", text.lower()) if len(w) > 2}


def rank_for_attack(passages: list[Passage], attack: str, k: int) -> list[Passage]:
    """Top-k passages by word overlap with the attack; ties keep stored order. Deterministic."""
    want = _tokens(attack)
    order = sorted(range(len(passages)), key=lambda i: (-len(want & _tokens(passages[i].text)), i))
    return [passages[i] for i in order[:k]]


async def resolve_challenges(
    gateway: ToolGateway,
    conn: sqlite3.Connection,
    em: Emitter,
    run_id: str,
    *,
    round: int,
) -> list[Challenge]:
    """Assign the outcome of every challenge of `round` that has none, by rule, and emit
    `challenge.outcome`. A challenge whose verifier calls fail stays without an outcome (the round
    is then not a completed challenge) unless a supporting verdict already decided it."""
    pending = [
        c for c in repo.list_challenges(conn, run_id) if c.round == round and c.outcome is None
    ]
    sources = repo.list_sources(conn, run_id, status="fetched")
    done: list[Challenge] = []
    fatal: GatewayError | None = None

    async def one(ch: Challenge) -> None:
        nonlocal fatal
        found = [p for s in sources if s.task_id in ch.followup_task_ids
                 for p in repo.list_passages(conn, s.id)]  # fmt: skip
        chosen = rank_for_attack(found, f"{ch.attack} {ch.required_evidence}", PASSAGES_PER_ATTACK)
        verdicts: list[Verdict] = []
        incomplete = False
        metrics_list: list[CallMetrics | None] = []
        for i in range(0, len(chosen), BATCH_SIZE):
            batch = chosen[i : i + BATCH_SIZE]
            payload = {
                "pairs": [
                    {"claim_id": ch.id, "claim_text": ch.attack, "passage_id": p.id} for p in batch
                ],
                "untrusted": [{"id": p.id, "text": p.text} for p in batch],
            }
            try:
                res = await gateway.llm(LLMRole.VERIFIER, "verifier.v1", VerdictBatch, payload)
            except BudgetExceeded as exc:
                fatal = fatal or exc
                incomplete = True
                break
            except GatewayError as exc:
                if exc.failure not in (FailureType.STEP_FAILED, FailureType.RATE_LIMITED):
                    fatal = fatal or exc
                incomplete = True
                break
            wanted = {p.id for p in batch}
            seen: set[str] = set()
            for v in res.value.verdicts:
                if v.passage_id in wanted and v.passage_id not in seen:
                    seen.add(v.passage_id)
                    verdicts.append(v.verdict)
            if seen != wanted:
                incomplete = True  # the judge skipped a passage: do not conclude from a gap
            metrics_list.append(res.metrics)
        outcome = outcome_by_rule(verdicts)
        if incomplete and outcome is not ChallengeOutcome.WEAKENED:
            return
        repo.set_challenge_outcome(conn, ch.id, outcome.value)
        em.emit(
            EventType.CHALLENGE_OUTCOME,
            ChallengeOutcomePayload(challenge_id=ch.id, outcome=outcome),
            round=round,
            metrics=metrics_list[0] if metrics_list else None,
        )
        done.append(ch)

    await asyncio.gather(*(one(c) for c in pending))
    if fatal is not None:
        raise fatal
    return done
