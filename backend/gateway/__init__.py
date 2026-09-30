"""ToolGateway: the ONLY path to search, fetch and LLM (SSOT section 6.1, ADR-102/108).

No pipeline, intel or synth module may import an HTTP client or an LLM provider SDK. They receive
a gateway and call gateway.search / gateway.fetch / gateway.llm. The gateway (implemented in T02)
enforces budgets, the SSRF guard, concurrency limits, typed errors and record/replay.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import httpx

from contracts.models import FailureType


class GatewayError(Exception):
    """Typed gateway failure (SSOT section 18). Never swallowed silently (NFR-04)."""

    def __init__(self, failure: FailureType, message: str = "") -> None:
        super().__init__(f"{failure.value}: {message}" if message else failure.value)
        self.failure = failure
        self.message = message


class BudgetExceeded(GatewayError):
    """A hard limit was hit; the controller reacts by taking the wrap-up path (SSOT 7.1)."""

    def __init__(self, limit: str) -> None:
        super().__init__(FailureType.BLOCKED, f"budget exceeded: {limit}")
        self.limit = limit


@dataclass(frozen=True)
class CallMetrics:
    """Usage of one provider call (NFR-09): latency always; tokens and cost where reported.

    Carried by the event envelope fields step_ms, tokens and cost_usd. Never holds secrets.
    """

    kind: str  # "search" | "llm"
    provider: str
    model: str | None
    latency_ms: int
    tokens: int | None = None
    cost_usd: float | None = None
    role: str | None = None  # LLM calls: planner, extractor, ...
    prompt_id: str | None = None  # LLM calls: e.g. planner.v1


@dataclass(frozen=True)
class BudgetWarning:
    """A limit reached 80 percent of its maximum (emitted once per limit as budget.warning)."""

    limit: str
    used: float
    max: float


MetricsSink = Callable[[CallMetrics], None]


def http_failure(provider: str, exc: Exception) -> GatewayError:
    """Map an httpx failure to a typed GatewayError. Messages never include request headers."""
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        if code == 429:
            return GatewayError(FailureType.RATE_LIMITED, f"{provider} returned HTTP 429")
        if code in (401, 403):
            return GatewayError(FailureType.BLOCKED, f"{provider} rejected credentials ({code})")
        return GatewayError(FailureType.STEP_FAILED, f"{provider} returned HTTP {code}")
    return GatewayError(FailureType.STEP_FAILED, f"{provider} request failed: {type(exc).__name__}")
