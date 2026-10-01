"""ToolGateway: the only path to search, fetch and LLM (SSOT 6.1, FR-03, ADR-102/108).

Enforces budgets (hard limits raise BudgetExceeded; 80 percent raises a one-time warning), bounded
concurrency, search backoff and fallback, structured LLM output with validation retries, and
record/replay. Pipeline code receives a gateway; it never imports an HTTP client or provider SDK.
"""

from __future__ import annotations

import asyncio
import base64
import time
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass, field
from typing import Any, Generic, TypeVar

from pydantic import BaseModel

from backend.gateway import BudgetExceeded, BudgetWarning, CallMetrics, GatewayError
from backend.gateway.fetch import Fetcher, FetchResult
from backend.gateway.llm import (
    ROLE_SETTINGS,
    LLMRole,
    LLMTier,
    build_messages,
    correction_message,
    max_tokens_for,
    model_for,
    parse_structured,
)
from backend.gateway.record_replay import RecordMode, RecordReplay
from backend.gateway.search import SearchHit, SearchProvider
from contracts.config import Settings
from contracts.models import Budget, BudgetUsage, FailureType, Mode

T = TypeVar("T")

SEARCH_BACKOFF_SECONDS = (0.5, 1.0, 2.0)
LLM_RATE_LIMIT_RETRIES = 3
# Waits when a 429 carries no Retry-After hint. Per-minute request limits (for example Gemini's free
# tier) need waits of tens of seconds, so these are longer than the search backoff.
LLM_RATE_LIMIT_BACKOFF = (5.0, 15.0, 30.0)
LLM_RATE_LIMIT_MAX_WAIT = 60.0  # seconds; provider hints are honoured up to this cap
LLM_MAX_ATTEMPTS = 3  # first try plus 2 validation retries (SSOT 10)
WARN_FRACTION = 0.8


# USD per 1M tokens (input, output): Gemini list prices read 1 Oct 2026, used only when no
# SARVAM_LLM_PRICE_* is set and the provider reports no cost. Always shown as an estimate.
DEFAULT_MODEL_PRICES: dict[str, tuple[float, float]] = {
    "gemini-3.1-flash-lite": (0.25, 1.50),
    "gemini-3.6-flash": (0.75, 3.75),
}


@dataclass
class LLMOpStats:
    """One logical LLM operation (a gateway.llm call); validation attempts and provider requests
    are kept distinct. `max_llm_calls` counts validation_attempts (see ToolGateway.llm)."""

    run_id: str | None
    role: str
    prompt_id: str
    model: str
    provider: str = "llm"
    validation_attempts: int = 0  # each consumes max_llm_calls
    provider_requests: int = 0  # provider requests incl. 429/5xx retries
    provider_retries: int = 0  # provider requests beyond one per validation attempt
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    cost_usd: float | None = None  # reported or estimated, per cost_source
    cost_source: str = "unavailable"  # "reported" | "estimated" | "unavailable"
    latency_ms: int = 0
    status: str = "ok"  # "ok" or the typed failure value
    meta: dict[str, int] = field(default_factory=dict)  # caller-supplied shape, e.g. batch sizes


@dataclass(frozen=True)
class CostBreakdown:
    reported_usd: float
    estimated_usd: float
    unavailable_ops: int  # operations with neither provider cost nor a configured price


@dataclass(frozen=True)
class GatewayResult(Generic[T]):
    value: T
    metrics: CallMetrics


class ToolGateway:
    def __init__(
        self,
        *,
        settings: Settings,
        budget: Budget,
        mode: Mode,
        search: SearchProvider | None = None,
        fallback_search: SearchProvider | None = None,
        fetcher: Fetcher | None = None,
        llm: Any = None,
        recorder: RecordReplay | None = None,
        on_warning: Callable[[BudgetWarning], None] | None = None,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        run_id: str | None = None,
    ) -> None:
        self.settings = settings
        self.run_id = run_id
        self.llm_ops: list[LLMOpStats] = []
        self._cost_reported = 0.0
        self._cost_estimated = 0.0
        self._cost_unavailable = 0
        self.budget = budget
        self.mode = mode
        self._search = search
        self._fallback = fallback_search
        self._fetcher = fetcher
        self._llm = llm
        self._recorder = recorder
        self._on_warning = on_warning
        self._clock = clock
        self._sleep = sleep
        self._started = clock()
        self._searches = 0
        self._fetches = 0
        self._llm_calls = 0
        self._cost = 0.0
        self._warned: set[str] = set()
        self._fetch_sem = asyncio.Semaphore(settings.fetch_concurrency)
        self._llm_sem = asyncio.Semaphore(settings.llm_concurrency)
        self.stop_requested = asyncio.Event()
        if mode is Mode.REPLAY and (recorder is None or recorder.mode is not RecordMode.REPLAY):
            raise GatewayError(FailureType.BLOCKED, "REPLAY mode needs a replay recorder")

    # ------------------------------------------------------------ budgets

    def elapsed(self) -> float:
        return self._clock() - self._started

    def soft_time_exceeded(self) -> bool:
        return self.elapsed() >= self.budget.max_wall_seconds_soft

    def usage(self) -> BudgetUsage:
        return BudgetUsage(
            searches=self._searches,
            fetches=self._fetches,
            llm_calls=self._llm_calls,
            cost_usd=round(self._cost, 6),
            elapsed_seconds=round(self.elapsed(), 3),
            tokens=sum(op.total_tokens or 0 for op in self.llm_ops),
            cost_known=(self._cost_reported + self._cost_estimated) > 0,
        )

    def cost_breakdown(self) -> CostBreakdown:
        return CostBreakdown(
            round(self._cost_reported, 6), round(self._cost_estimated, 6), self._cost_unavailable
        )

    def _estimate_cost(self, role: LLMRole, tin: int | None, tout: int | None) -> float | None:
        """Local estimate from token usage and configured USD-per-1M prices; None if impossible."""
        st = self.settings
        strong = ROLE_SETTINGS[role].tier is LLMTier.STRONG
        price = st.llm_price_strong if strong else st.llm_price_fast
        if price is None:
            model = st.llm_model_strong if strong else st.llm_model_fast
            price = DEFAULT_MODEL_PRICES.get(model)  # labelled "estimated"; env prices win
        if price is None or tin is None or tout is None:
            return None
        return (tin * price[0] + tout * price[1]) / 1_000_000

    def _warn(self, limit: str, used: float, maximum: float) -> None:
        if maximum > 0 and used >= WARN_FRACTION * maximum and limit not in self._warned:
            self._warned.add(limit)
            if self._on_warning:
                self._on_warning(BudgetWarning(limit, float(used), float(maximum)))

    def _before(self, limit: str, used: int, maximum: int) -> None:
        """Raise BudgetExceeded if the call must not start; otherwise allow and warn at 80%."""
        b = self.budget
        if self.elapsed() >= b.max_wall_seconds_hard:
            raise BudgetExceeded("wall_hard")
        if self._cost >= b.max_cost_usd:
            raise BudgetExceeded("max_cost_usd")
        if used >= maximum:
            raise BudgetExceeded(limit)
        self._warn("max_wall_seconds_soft", self.elapsed(), b.max_wall_seconds_soft)
        self._warn("max_cost_usd", self._cost, b.max_cost_usd)
        self._warn(limit, used + 1, maximum)

    def _need(self, what: str, obj: object | None) -> Any:
        if obj is None:
            raise GatewayError(FailureType.BLOCKED, f"no {what} available (not configured)")
        return obj

    async def _record(
        self, kind: str, key: dict[str, Any], live: Callable[[], Awaitable[dict[str, Any]]]
    ) -> dict[str, Any]:
        if self._recorder is None:
            return await live()
        return await self._recorder.call(kind, key, live)

    # ------------------------------------------------------------ search

    def _search_targets(self) -> list[tuple[str, SearchProvider | None]]:
        primary = getattr(self._search, "name", None) or self.settings.search_provider
        targets: list[tuple[str, SearchProvider | None]] = [(primary, self._search)]
        fb = getattr(self._fallback, "name", None) or self.settings.search_fallback_provider
        if fb:
            targets.append((fb, self._fallback))
        return targets

    async def _search_once(
        self, name: str, provider: SearchProvider | None, query: str, max_results: int
    ) -> dict[str, Any]:
        async def live() -> dict[str, Any]:
            prov = self._need("search provider", provider)
            start = time.perf_counter()
            hits = await prov.search(query, max_results=max_results)
            return {
                "hits": [asdict(h) for h in hits],
                "latency_ms": int((time.perf_counter() - start) * 1000),
            }

        key = {"provider": name, "query": query, "max_results": max_results}
        return await self._record("search", key, live)

    async def _search_with_backoff(
        self, name: str, provider: SearchProvider | None, query: str, max_results: int
    ) -> dict[str, Any]:
        last: GatewayError | None = None
        for attempt in range(len(SEARCH_BACKOFF_SECONDS) + 1):
            try:
                return await self._search_once(name, provider, query, max_results)
            except BudgetExceeded:
                raise
            except GatewayError as exc:
                last = exc
                if exc.failure not in (FailureType.RATE_LIMITED, FailureType.STEP_FAILED):
                    break  # credentials or configuration: retrying the same provider is pointless
                if attempt < len(SEARCH_BACKOFF_SECONDS) and self.mode is not Mode.REPLAY:
                    await self._sleep(SEARCH_BACKOFF_SECONDS[attempt])
        assert last is not None
        raise last

    async def search(self, query: str, *, max_results: int = 8) -> GatewayResult[list[SearchHit]]:
        self._before("max_searches", self._searches, self.budget.max_searches)
        self._searches += 1
        last: GatewayError | None = None
        for name, provider in self._search_targets():
            try:
                raw = await self._search_with_backoff(name, provider, query, max_results)
            except GatewayError as exc:
                last = exc
                continue
            hits = [SearchHit(**h) for h in raw["hits"]]
            return GatewayResult(hits, CallMetrics("search", name, None, raw["latency_ms"]))
        detail = last.message or last.failure.value if last else "no provider"
        raise GatewayError(FailureType.BLOCKED, f"search unavailable: {detail}")

    # ------------------------------------------------------------ fetch

    async def fetch(self, url: str) -> GatewayResult[FetchResult]:
        self._before("max_fetches", self._fetches, self.budget.max_fetches)
        self._fetches += 1

        async def live() -> dict[str, Any]:
            fetcher = self._need("fetcher", self._fetcher)
            start = time.perf_counter()
            res = await fetcher.fetch(url)
            return {
                "url": res.url,
                "final_url": res.final_url,
                "status_code": res.status_code,
                "content_type": res.content_type,
                "body_b64": base64.b64encode(res.body).decode("ascii"),
                "encoding": res.encoding,
                "latency_ms": int((time.perf_counter() - start) * 1000),
            }

        async with self._fetch_sem:
            raw = await self._record("fetch", {"url": url}, live)
        result = FetchResult(
            url=raw["url"],
            final_url=raw["final_url"],
            status_code=raw["status_code"],
            content_type=raw["content_type"],
            body=base64.b64decode(raw["body_b64"]),
            encoding=raw["encoding"],
        )
        return GatewayResult(result, CallMetrics("fetch", "http", None, raw["latency_ms"]))

    # ------------------------------------------------------------ llm

    async def llm(
        self,
        role: LLMRole,
        prompt_id: str,
        schema: type[BaseModel] | Any,
        payload: dict[str, Any],
        *,
        meta: dict[str, int] | None = None,
    ) -> GatewayResult[Any]:
        """Structured LLM call: validate against `schema`, retry twice with the error appended.

        Budget semantics: every validation attempt passes `_before` and consumes one max_llm_calls.
        Provider-level 429/5xx retries inside one attempt are not counted there (see LLMOpStats).
        """
        cfg = ROLE_SETTINGS[role]
        model = model_for(role, self.settings)
        messages = build_messages(
            prompt_id, schema, payload, compact=self.settings.llm_compact_json
        )
        op = LLMOpStats(self.run_id, role.value, prompt_id, model, meta=dict(meta or {}))
        self.llm_ops.append(op)
        last_error: Exception | None = None
        try:
            for _ in range(LLM_MAX_ATTEMPTS):
                self._before("max_llm_calls", self._llm_calls, self.budget.max_llm_calls)
                self._llm_calls += 1
                op.validation_attempts += 1
                raw = await self._llm_attempt(
                    model, messages, cfg.temperature, max_tokens_for(role, self.settings), op
                )
                m = raw["metrics"]
                op.provider = m["provider"]
                op.latency_ms += m["latency_ms"]
                tin, tout = m.get("input_tokens"), m.get("output_tokens")
                if m["tokens"] is not None:
                    op.total_tokens = (op.total_tokens or 0) + m["tokens"]
                if tin is not None:
                    op.input_tokens = (op.input_tokens or 0) + tin
                if tout is not None:
                    op.output_tokens = (op.output_tokens or 0) + tout
                self._account_cost(op, role, m["cost_usd"], tin, tout)
                try:
                    value = parse_structured(raw["text"], schema)
                except ValueError as exc:  # pydantic.ValidationError is a ValueError
                    last_error = exc
                    messages = [
                        *messages,
                        {"role": "assistant", "content": raw["text"]},
                        {"role": "user", "content": correction_message(exc)},
                    ]
                    continue
                metrics = CallMetrics(
                    "llm",
                    op.provider,
                    m["model"],
                    op.latency_ms,
                    tokens=op.total_tokens,
                    cost_usd=op.cost_usd,
                    role=role.value,
                    prompt_id=prompt_id,
                    input_tokens=op.input_tokens,
                    output_tokens=op.output_tokens,
                )
                return GatewayResult(value, metrics)
            raise GatewayError(
                FailureType.STEP_FAILED,
                f"{role.value} output failed validation after {LLM_MAX_ATTEMPTS} attempts: "
                f"{str(last_error)[:300]}",
            )
        except GatewayError as exc:
            op.status = "BUDGET" if isinstance(exc, BudgetExceeded) else exc.failure.value
            raise

    def _account_cost(
        self,
        op: LLMOpStats,
        role: LLMRole,
        reported: float | None,
        tin: int | None,
        tout: int | None,
    ) -> None:
        """Reported cost wins; else a local estimate from configured prices; else unavailable.
        Only reported and estimated cost count against MAX_COST_USD."""
        if reported is not None:
            self._cost_reported += reported
            self._cost += reported
            op.cost_usd = (op.cost_usd or 0.0) + reported
            op.cost_source = "reported"
            return
        est = self._estimate_cost(role, tin, tout)
        if est is not None:
            self._cost_estimated += est
            self._cost += est
            op.cost_usd = (op.cost_usd or 0.0) + est
            if op.cost_source != "reported":
                op.cost_source = "estimated"
            return
        if op.validation_attempts == 1:
            self._cost_unavailable += 1  # once per operation
        if self._on_warning and "cost_unavailable" not in self._warned:
            self._warned.add("cost_unavailable")
            self._on_warning(BudgetWarning("cost_unavailable", float(self._cost_unavailable), 0.0))

    async def _llm_attempt(
        self,
        model: str,
        messages: list[dict[str, str]],
        temperature: float,
        max_tokens: int,
        op: LLMOpStats,
    ) -> dict[str, Any]:
        async def live() -> dict[str, Any]:
            llm = self._need("LLM client", self._llm)
            for attempt in range(LLM_RATE_LIMIT_RETRIES + 1):
                op.provider_requests += 1
                if attempt:
                    op.provider_retries += 1
                try:
                    comp = await llm.complete(
                        model, messages, temperature=temperature, max_tokens=max_tokens
                    )
                    break
                except GatewayError as exc:
                    retryable = exc.failure is FailureType.RATE_LIMITED or exc.transient
                    if not retryable or attempt == LLM_RATE_LIMIT_RETRIES:
                        raise
                    wait = min(
                        max(exc.retry_after or 0.0, LLM_RATE_LIMIT_BACKOFF[min(attempt, 2)]),
                        LLM_RATE_LIMIT_MAX_WAIT,
                    )
                    await self._sleep(wait)
            m = comp.metrics
            return {
                "text": comp.text,
                "metrics": {
                    "provider": m.provider,
                    "model": m.model or model,
                    "latency_ms": m.latency_ms,
                    "tokens": m.tokens,
                    "cost_usd": m.cost_usd,
                    "input_tokens": m.input_tokens,
                    "output_tokens": m.output_tokens,
                },
            }

        key = {"model": model, "messages": messages, "temperature": temperature}
        async with self._llm_sem:
            return await self._record("llm", key, live)
