"""ToolGateway: the ONLY path to search, fetch and LLM (SSOT section 6.1, ADR-102/108).

No pipeline, intel or synth module may import an HTTP client or an LLM provider SDK. They receive
a gateway and call gateway.search / gateway.fetch / gateway.llm. The gateway (implemented in T02)
enforces budgets, the SSRF guard, concurrency limits, typed errors and record/replay.
"""

from __future__ import annotations

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
