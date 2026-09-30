"""Independent verification (SSOT 9.5, FR-10, task T09): a separate judge labels every claim.

The verifier is a separate gateway call with its own prompt. It sees only the claim text and the
stored passage, never the extractor's quote, reasoning or slot; retrieved text is untrusted data.
About five claim-passage pairs go into one call. `supports` and `partial` stay as evidence;
`contradicts` and `irrelevant` drop the claim (`rejected`), keeping the verdict for the audit trail.
Only claims that still lack a verdict are judged, so follow-up rounds process only the delta
(FR-16).
"""

from __future__ import annotations

import asyncio
import sqlite3
from dataclasses import dataclass
from typing import Any

from backend.gateway import BudgetExceeded, CallMetrics, GatewayError
from backend.gateway.core import ToolGateway
from backend.gateway.llm import LLMRole
from backend.store import repo
from backend.store.emit import Emitter
from contracts.events import (
    BudgetWarningPayload,
    ClaimVerifiedPayload,
    EventType,
    PhaseEnteredPayload,
)
from contracts.llm import VerdictBatch, VerdictOut
from contracts.models import Claim, FailureType, Passage, Phase

BATCH_SIZE = 5  # SSOT section 7, state 6: batch about 5 pairs per call
MAX_CALLS_PER_BATCH = 2  # the call itself, plus one for pairs the model skipped


@dataclass(frozen=True)
class Pair:
    claim: Claim
    passage: Passage

    @property
    def key(self) -> tuple[str, str]:
        return (self.claim.id, self.passage.id)


def build_payload(pairs: list[Pair]) -> dict[str, Any]:
    """The verifier's whole input: claim texts and the passages they must be judged against."""
    untrusted: list[dict[str, str]] = []
    seen: set[str] = set()
    for pair in pairs:
        if pair.passage.id not in seen:
            seen.add(pair.passage.id)
            untrusted.append({"id": pair.passage.id, "text": pair.passage.text})
    return {
        "pairs": [
            {
                "claim_id": p.claim.id,
                "claim_text": p.claim.text,
                "passage_id": p.passage.id,
            }
            for p in pairs
        ],
        "untrusted": untrusted,
    }


def accept(pairs: list[Pair], batch: VerdictBatch) -> dict[tuple[str, str], VerdictOut]:
    """Verdicts for requested pairs only. Unknown or repeated pairs are ignored: the model cannot
    add a verdict for a claim it was not asked about, nor change one it already gave."""
    wanted = {p.key for p in pairs}
    out: dict[tuple[str, str], VerdictOut] = {}
    for v in batch.verdicts:
        key = (v.claim_id, v.passage_id)
        if key in wanted and key not in out:
            out[key] = v
    return out


def _pairs(conn: sqlite3.Connection, claims: list[Claim]) -> list[Pair]:
    out: list[Pair] = []
    for claim in claims:
        passage = repo.get_passage(conn, claim.passage_id)
        if passage is not None:
            out.append(Pair(claim, passage))
    return out


async def run_verify(
    gateway: ToolGateway,
    conn: sqlite3.Connection,
    em: Emitter,
    settings: Any,
    run_id: str,
    *,
    round: int = 0,
    reason: str = "An independent judge checks every claim against its stored passage.",
) -> int:
    """VERIFY phase. Returns the number of verdicts stored.

    A call that fails validation after retries (STEP_FAILED) or is rate limited leaves its claims
    `pending`: they are not evidence until judged, and a `budget.warning` event names how many
    remain. BudgetExceeded and provider outages are re-raised after finished work is persisted.
    """
    em.emit(
        EventType.PHASE_ENTERED,
        PhaseEnteredPayload(phase=Phase.VERIFY, reason=reason),
        round=round,
    )
    todo = _pairs(conn, repo.list_unverified_claims(conn, run_id))
    size = getattr(settings, "verifier_batch_size", BATCH_SIZE)
    batches = [todo[i : i + size] for i in range(0, len(todo), size)]
    stored = 0
    fatal: GatewayError | None = None

    def store(pair: Pair, verdict: VerdictOut, metrics: CallMetrics | None) -> None:
        nonlocal stored
        repo.record_verdict(conn, pair.claim.id, verdict.verdict, verdict.rationale.strip())
        em.emit(
            EventType.CLAIM_VERIFIED,
            ClaimVerifiedPayload(
                claim_id=pair.claim.id,
                verdict=verdict.verdict,
                rationale=verdict.rationale.strip(),
            ),
            round=round,
            metrics=metrics,
        )
        stored += 1

    async def one(batch: list[Pair]) -> None:
        nonlocal fatal
        pending = batch
        for _ in range(MAX_CALLS_PER_BATCH):
            try:
                res = await gateway.llm(
                    LLMRole.VERIFIER, "verifier.v1", VerdictBatch, build_payload(pending)
                )
            except BudgetExceeded as exc:
                fatal = fatal or exc
                return
            except GatewayError as exc:
                if exc.failure in (FailureType.STEP_FAILED, FailureType.RATE_LIMITED):
                    return  # these claims stay pending and are counted in the warning below
                fatal = fatal or exc
                return
            got = accept(pending, res.value)
            metrics: CallMetrics | None = res.metrics
            for pair in pending:
                if pair.key in got:
                    store(pair, got[pair.key], metrics)
                    metrics = None  # the call's usage is recorded once
            pending = [p for p in pending if p.key not in got]
            if not pending:
                return

    await asyncio.gather(*(one(b) for b in batches))
    remaining = len(repo.list_unverified_claims(conn, run_id))
    if remaining:
        em.emit(
            EventType.BUDGET_WARNING,
            BudgetWarningPayload(limit="verifier_unverified_claims", used=remaining, max=len(todo)),
            round=round,
        )
    if fatal is not None:
        raise fatal
    return stored
