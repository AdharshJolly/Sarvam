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

from backend.gateway import BudgetWarning, GatewayError
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
from backend.pipeline.plan import run_plan
from backend.store import repo
from backend.store.db import connect
from backend.store.emit import Emitter
from contracts.config import Settings
from contracts.events import (
    BudgetWarningPayload,
    EventType,
    RunCompletedPayload,
    RunFailedPayload,
)
from contracts.models import FailureType, Mode, Run, TerminationReason

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


async def run_m0(
    run_id: str,
    *,
    settings: Settings,
    handle: RunHandle | None = None,
    deps: RunnerDeps | None = None,
) -> None:
    """Drive one run to a terminal event. Uses its own DB connection (decision B-10)."""
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

        await run_plan(gateway, conn, em, run_id, run.question, run.scope, run.budget)

        # Interim M0 end state until the discover/acquire/extract/claims/synthesize stages land.
        reason = TerminationReason.USER_STOPPED if gateway.stop_requested.is_set() else None
        em.emit(
            EventType.RUN_COMPLETED,
            RunCompletedPayload(stop_state=None, termination_reason=reason),
        )
        repo.set_run_status(
            conn,
            run_id,
            "completed",
            termination_reason=reason.value if reason else None,
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
