"""Run controller (SSOT section 7). Plain code, no orchestration framework.

`run_m0` is the linear M0 driver (decision B-08). The controller owns budgets, wrap-up and failure
handling; every failure becomes a typed event. T14 later extends or replaces it with the full
lifecycle.
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
    RunCompletedPayload,
    RunFailedPayload,
)
from contracts.models import FailureType, Mode, Phase, Run, TerminationReason

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
    termination: TerminationReason | None,
) -> None:
    """SYNTHESIZE: write, clean, render deterministically, prove every citation, store, emit."""
    note = f"Wrap-up ({termination.value})." if termination else None
    reason = (
        f"Wrap-up ({termination.value}): writing the report from the evidence already stored."
        if termination
        else "Writing the report from the quote-verified claims."
    )
    em.emit(EventType.PHASE_ENTERED, PhaseEnteredPayload(phase=Phase.SYNTHESIZE, reason=reason))
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
        EventType.REPORT_DRAFT, ReportDraftPayload(version=report.version), metrics=result.metrics
    )
    em.emit(
        EventType.REPORT_VERIFIED,
        ReportVerifiedPayload(
            version=report.version, dropped_count=len(result.dropped), certainty_state=None
        ),
    )


async def run_m0(
    run_id: str,
    *,
    settings: Settings,
    handle: RunHandle | None = None,
    deps: RunnerDeps | None = None,
) -> None:
    """Drive one run to a terminal event. Uses its own DB connection (decision B-10).

    PLAN, DISCOVER, ACQUIRE, EXTRACT, CLAIMS, SYNTHESIZE in order. A stop request, the soft time
    limit, a budget limit or a provider outage after planning takes the wrap-up path: skip the
    remaining stages and synthesize from the evidence already stored (SSOT 7.1).
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

        async def extract() -> None:
            run_extract(conn, em, settings, run_id)

        stages = (
            lambda: run_discover(gateway, conn, em, settings, run_id, run.scope),
            lambda: run_acquire(gateway, conn, em, settings, run_id),
            extract,
            lambda: run_claims(gateway, conn, em, settings, run_id),
        )
        termination: TerminationReason | None = None
        for stage in stages:
            termination = _wrapup_reason(gateway)
            if termination:
                break
            try:
                await stage()
            except BudgetExceeded as exc:
                termination = _budget_reason(exc)
                break
            except GatewayError:  # provider outage (BLOCKED): wrap up with current evidence
                termination = TerminationReason.BLOCKED
                break

        await synthesize(gateway, conn, em, settings, run, termination)
        em.emit(
            EventType.RUN_COMPLETED,
            RunCompletedPayload(stop_state=None, termination_reason=termination),
        )
        repo.set_run_status(
            conn,
            run_id,
            "completed",
            termination_reason=termination.value if termination else None,
            ended=True,
        )
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
