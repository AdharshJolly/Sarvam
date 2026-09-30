"""Run controller (SSOT section 7). Plain code, no orchestration framework.

`run_research` drives the ten-state lifecycle (SSOT 7): round 0 runs PLAN to ANALYZE, then each
follow-up round runs CHALLENGE and states 2 to 7 on the delta only, until the stop policy
(`intel/stop.py`, a pure function of the stored tables) ends the run; then SYNTHESIZE. The
controller owns budgets, rounds, wrap-up and failure handling; every failure becomes a typed event.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any

from backend.gateway import BudgetExceeded, BudgetWarning, GatewayError
from backend.gateway.core import ToolGateway
from backend.gateway.fetch import Fetcher, HttpFetcher
from backend.gateway.llm import llm_from_settings
from backend.gateway.record_replay import RecordMode, RecordReplay
from backend.gateway.search import (
    SearchProvider,
    search_fallback_from_settings,
    search_from_settings,
)
from backend.gateway.ssrf import DefaultSSRFGuard
from backend.intel.analyze import create_gap_tasks, run_analyze
from backend.intel.challenge import MAX_ATTACKS, resolve_challenges, run_challenge
from backend.intel.stop import (
    HARD_LIMITS,
    coverage_states,
    final_decision,
    latest_round,
    marginal_gain,
    next_termination,
    open_conflict_count,
    stop_cells,
)
from backend.intel.verify import run_verify
from backend.pipeline.acquire import run_acquire
from backend.pipeline.claims import run_claims
from backend.pipeline.discover import run_discover
from backend.pipeline.extract import run_extract
from backend.pipeline.plan import run_plan
from backend.store import repo
from backend.store.db import connect
from backend.store.emit import Emitter
from backend.synth.render import render_markdown, verify_citations
from backend.synth.writer import eligible_claims, write_draft
from contracts.config import Settings
from contracts.events import (
    BudgetWarningPayload,
    EventType,
    PhaseEnteredPayload,
    ReportDraftPayload,
    ReportVerifiedPayload,
    RoundStartedPayload,
    RunCompletedPayload,
    RunFailedPayload,
    StopDecidedPayload,
)
from contracts.models import FailureType, Mode, Phase, Run, StopDecision, TerminationReason

log = logging.getLogger("sarvam.controller")


@dataclass
class RunHandle:
    """Live handle for a running run: its task, gateway and stop flag (used by POST /stop)."""

    task: asyncio.Task | None = None
    gateway: ToolGateway | None = None
    stop_event: asyncio.Event = field(default_factory=asyncio.Event)


@dataclass
class RunnerDeps:
    """Injected providers for tests; anything left None is built from Settings."""

    search: SearchProvider | None = None
    fallback_search: SearchProvider | None = None
    fetcher: Fetcher | None = None
    llm: Any = None
    sleep: Any = None


def build_gateway(settings: Settings, run: Run, deps: RunnerDeps | None, on_warning) -> ToolGateway:
    """Assemble the gateway for one run. Missing credentials raise a typed BLOCKED error."""
    deps = deps or RunnerDeps()
    kwargs: dict[str, Any] = {}
    if deps.sleep is not None:
        kwargs["sleep"] = deps.sleep
    if run.mode is Mode.REPLAY:
        return ToolGateway(
            settings=settings,
            budget=run.budget,
            mode=Mode.REPLAY,
            recorder=RecordReplay(settings.record_dir, RecordMode.REPLAY),
            on_warning=on_warning,
            **kwargs,
        )
    llm = deps.llm or llm_from_settings(settings)
    search = deps.search or search_from_settings(settings)
    fallback = deps.fallback_search or search_fallback_from_settings(settings)
    fetcher = deps.fetcher or HttpFetcher(settings.ssrf, DefaultSSRFGuard(settings.ssrf))
    return ToolGateway(
        settings=settings,
        budget=run.budget,
        mode=Mode.LIVE,
        search=search,
        fallback_search=fallback,
        fetcher=fetcher,
        llm=llm,
        on_warning=on_warning,
        **kwargs,
    )


def _fail(conn, em: Emitter, run_id: str, failure: FailureType, message: str) -> None:
    em.emit(EventType.RUN_FAILED, RunFailedPayload(failure=failure, message=message))
    repo.set_run_status(conn, run_id, "failed", ended=True)


def _wrapup_reason(gateway: ToolGateway) -> TerminationReason | None:
    """Checked between stages: a stop request or the soft time limit triggers wrap-up."""
    if gateway.stop_requested.is_set():
        return TerminationReason.USER_STOPPED
    if gateway.soft_time_exceeded():
        return TerminationReason.TIMEOUT
    return None


def _budget_reason(exc: BudgetExceeded) -> TerminationReason:
    return TerminationReason.TIMEOUT if exc.limit.startswith("wall") else TerminationReason.BUDGET


async def synthesize(
    gateway: ToolGateway,
    conn,
    em: Emitter,
    settings: Settings,
    run: Run,
    decision: StopDecision,
    round: int = 0,
) -> None:
    """SYNTHESIZE: write, clean, render deterministically, prove every citation, store, emit."""
    reason_code = decision.termination_reason
    termination = reason_code if reason_code in HARD_LIMITS else None
    note = f"Wrap-up ({termination.value})." if termination else None
    reason = (
        f"Wrap-up ({termination.value}): writing the report from the evidence already stored."
        if termination
        else "Writing the report from the quote-verified claims."
    )
    em.emit(
        EventType.PHASE_ENTERED,
        PhaseEnteredPayload(phase=Phase.SYNTHESIZE, reason=reason),
        round=round,
    )
    claims = eligible_claims(conn, run.id)
    result = await write_draft(gateway, conn, run, claims, wrap_up_note=note)
    markdown = render_markdown(
        conn,
        run,
        result.draft,
        gateway.usage(),
        settings,
        claims,
        termination_reason=termination.value if termination else None,
        degraded_reason=result.degraded_reason,
    )
    verify_citations(conn, run.id, markdown)  # raises CitationError rather than ship a bad cite
    report = repo.insert_report(conn, run.id, markdown=markdown, dropped_sentences=result.dropped)
    em.emit(
        EventType.REPORT_DRAFT,
        ReportDraftPayload(version=report.version),
        round=round,
        metrics=result.metrics,
    )
    em.emit(
        EventType.REPORT_VERIFIED,
        ReportVerifiedPayload(
            version=report.version, dropped_count=len(result.dropped), certainty_state=None
        ),
        round=round,
    )


async def run_research(
    run_id: str,
    *,
    settings: Settings,
    handle: RunHandle | None = None,
    deps: RunnerDeps | None = None,
) -> None:
    """Drive one run to a terminal event. Uses its own DB connection (decision B-10).

    Round 0 is PLAN to ANALYZE. While the stop policy says "continue", a follow-up round creates gap
    and challenge tasks (CHALLENGE) and runs DISCOVER to ANALYZE on the delta only. A stop request,
    the soft time limit, a budget limit or a provider outage takes the wrap-up path from any point:
    coverage is scored from the evidence already stored (code only, no LLM) and the run goes to
    STOP POLICY and SYNTHESIZE (SSOT 7.1).
    """
    conn = connect(settings.db_path)
    em = Emitter(conn, run_id)
    try:
        run = repo.get_run(conn, run_id)
        if run is None:
            raise GatewayError(FailureType.BLOCKED, f"run {run_id} does not exist")
        repo.set_run_status(conn, run_id, "running")

        def warn(w: BudgetWarning) -> None:
            em.emit(
                EventType.BUDGET_WARNING,
                BudgetWarningPayload(limit=w.limit, used=w.used, max=w.max),
            )

        gateway = build_gateway(settings, run, deps, warn)
        if handle is not None:
            gateway.stop_requested = handle.stop_event
            handle.gateway = gateway

        # Without a plan there is nothing to wrap up: a planner failure is an unrecoverable failure.
        await run_plan(gateway, conn, em, run_id, run.question, run.scope, run.budget)

        analyzed: set[int] = set()

        async def run_stages(round: int) -> TerminationReason | None:
            async def extract() -> None:
                run_extract(conn, em, settings, run_id, round=round)

            async def resolve() -> None:
                if round > 0:
                    await resolve_challenges(gateway, conn, em, run_id, round=round)

            async def analyze() -> None:
                analyzed.add(round)  # set first: a budget error inside still computed coverage
                await run_analyze(gateway, conn, em, settings, run_id, round=round)

            stages = (
                lambda: run_discover(gateway, conn, em, settings, run_id, run.scope, round=round),
                lambda: run_acquire(gateway, conn, em, settings, run_id, round=round),
                extract,
                lambda: run_claims(gateway, conn, em, settings, run_id, round=round),
                lambda: run_verify(gateway, conn, em, settings, run_id, round=round),
                resolve,
                analyze,
            )
            for stage in stages:
                if (reason := _wrapup_reason(gateway)) is not None:
                    return reason
                try:
                    await stage()
                except BudgetExceeded as exc:
                    return _budget_reason(exc)
                except GatewayError:  # provider outage (BLOCKED): wrap up with current evidence
                    return TerminationReason.BLOCKED
            return None

        async def followup_round(round: int) -> TerminationReason | None:
            # The search budget pays for whole tasks: what it cannot pay for is not planned, and
            # a round it cannot pay for at all is a budget stop (the challenge is then incomplete).
            per_task = settings.thresholds.queries_per_task
            capacity = (run.budget.max_searches - gateway.usage().searches) // per_task
            if capacity < 1:
                return TerminationReason.BUDGET
            try:
                attacks = await run_challenge(
                    gateway,
                    conn,
                    em,
                    run_id,
                    run.question,
                    run.scope,
                    round=round,
                    max_attacks=min(MAX_ATTACKS, max(1, capacity // 2)),
                )
            except BudgetExceeded as exc:
                return _budget_reason(exc)
            except GatewayError:
                return TerminationReason.BLOCKED
            gaps = create_gap_tasks(
                conn, run_id, run.scope, round=round, limit=capacity - len(attacks)
            )
            em.emit(
                EventType.ROUND_STARTED,
                RoundStartedPayload(
                    round=round,
                    reason=(
                        f"Re-searching {len(gaps)} weak critical slot(s) and testing "
                        f"{len(attacks)} attack(s) on the conclusion."
                    ),
                    task_ids=[t.id for t in repo.list_tasks(conn, run_id, round=round)],
                ),
                round=round,
            )
            return await run_stages(round)

        round = 0
        termination = await run_stages(0)
        while termination is None:
            gain = (
                marginal_gain(
                    coverage_states(conn, run_id, round - 1), coverage_states(conn, run_id, round)
                )
                if round > 0
                else None
            )
            termination = next_termination(
                stop_cells(conn, run_id, round),
                open_conflict_count(conn, run_id),
                repo.list_challenges(conn, run_id),
                round=round,
                max_rounds=run.budget.max_followup_rounds,
                gain=gain,
                hard_limit=_wrapup_reason(gateway),
            )
            if termination is not None:
                break
            round += 1
            termination = await followup_round(round)

        if round not in analyzed:
            # Wrap-up: the matrix must still show the gaps (SSOT 7.1). Code only, no LLM calls.
            await run_analyze(
                gateway,
                conn,
                em,
                settings,
                run_id,
                round=round,
                explain=False,
                reason=f"Wrap-up ({termination.value}): scoring coverage from stored evidence.",
            )

        em.emit(
            EventType.PHASE_ENTERED,
            PhaseEnteredPayload(
                phase=Phase.STOP_POLICY, reason="Applying the stop rules to the stored evidence."
            ),
            round=round,
        )
        decision = final_decision(
            stop_cells(conn, run_id, latest_round(conn, run_id)),
            open_conflict_count(conn, run_id),
            repo.list_challenges(conn, run_id),
            termination,
        )
        em.emit(EventType.STOP_DECIDED, StopDecidedPayload(decision=decision), round=round)
        repo.set_run_status(
            conn,
            run_id,
            "running",
            termination_reason=decision.termination_reason.value,
            stop_state=decision.state.value,
        )

        await synthesize(gateway, conn, em, settings, run, decision, round)
        em.emit(
            EventType.RUN_COMPLETED,
            RunCompletedPayload(
                stop_state=decision.state, termination_reason=decision.termination_reason
            ),
            round=round,
        )
        repo.set_run_status(conn, run_id, "completed", ended=True)
    except GatewayError as exc:
        _fail(conn, em, run_id, exc.failure, exc.message or exc.failure.value)
    except asyncio.CancelledError:
        _fail(conn, em, run_id, FailureType.BLOCKED, "run cancelled (server shutting down)")
        raise
    except Exception as exc:  # noqa: BLE001 - recorded as a typed failure and logged, never hidden
        log.exception("run %s crashed", run_id)
        _fail(conn, em, run_id, FailureType.STEP_FAILED, f"unexpected {type(exc).__name__}")
    finally:
        conn.close()
