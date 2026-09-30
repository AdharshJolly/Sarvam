import asyncio

import pytest
from pydantic import BaseModel

from backend.gateway import BudgetExceeded, BudgetWarning, GatewayError
from backend.gateway.core import ToolGateway
from backend.gateway.llm import LLMRole
from backend.gateway.search import SearchHit
from contracts.config import Settings
from contracts.models import Budget, FailureType, Mode
from tests.support.fakes import FakeFetcher, FakeLLM, FakeSearch, html_result


class Pong(BaseModel):
    ok: bool


HIT = SearchHit(url="https://a.example", title="A", snippet="s", cleaned_text="t")


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


def make(
    budget=None, *, search=None, fallback=None, llm=None, fetcher=None, clock=None, sleeps=None
):
    async def sleep(seconds):
        if sleeps is not None:
            sleeps.append(seconds)

    warnings: list[BudgetWarning] = []
    gw = ToolGateway(
        settings=Settings(env="test", llm_model_fast="fast-m", llm_model_strong="strong-m"),
        budget=budget or Budget(),
        mode=Mode.LIVE,
        search=search or FakeSearch(default=[HIT]),
        fallback_search=fallback,
        fetcher=fetcher
        or FakeFetcher({"https://a.example": html_result("https://a.example", "<p>x</p>")}),
        llm=llm or FakeLLM({"planner.v1": {"ok": True}}, cost_usd=None),
        on_warning=warnings.append,
        clock=clock or Clock(),
        sleep=sleep,
    )
    return gw, warnings


def run(coro):
    return asyncio.run(coro)


def test_budget_exceeded_is_typed_blocked_with_the_limit_name():
    err = BudgetExceeded("max_searches")
    assert err.failure is FailureType.BLOCKED and err.limit == "max_searches"


def test_search_limit():
    gw, _ = make(Budget(max_searches=2))

    async def go():
        await gw.search("q1")
        await gw.search("q2")
        await gw.search("q3")

    with pytest.raises(BudgetExceeded) as ei:
        run(go())
    assert ei.value.limit == "max_searches" and gw.usage().searches == 2


def test_fetch_limit():
    gw, _ = make(Budget(max_fetches=1))

    async def go():
        await gw.fetch("https://a.example")
        await gw.fetch("https://a.example")

    with pytest.raises(BudgetExceeded) as ei:
        run(go())
    assert ei.value.limit == "max_fetches"


def test_llm_call_limit_counts_every_attempt():
    gw, _ = make(Budget(max_llm_calls=2), llm=FakeLLM({"planner.v1": ["bad", "bad", "bad"]}))
    with pytest.raises(BudgetExceeded) as ei:
        run(gw.llm(LLMRole.PLANNER, "planner.v1", Pong, {}))
    assert ei.value.limit == "max_llm_calls" and gw.usage().llm_calls == 2


def test_cost_limit_uses_reported_cost_only():
    llm = FakeLLM({"planner.v1": {"ok": True}}, cost_usd=1.0)
    gw, _ = make(Budget(max_cost_usd=1.5), llm=llm)

    async def go():
        for _ in range(3):
            await gw.llm(LLMRole.PLANNER, "planner.v1", Pong, {})

    with pytest.raises(BudgetExceeded) as ei:
        run(go())
    assert ei.value.limit == "max_cost_usd" and gw.usage().cost_usd == 2.0
    free, _ = make(Budget(max_cost_usd=0.01))  # provider reports no cost: never blocks on cost
    run(free.llm(LLMRole.PLANNER, "planner.v1", Pong, {}))
    assert free.usage().cost_usd == 0.0


def test_warning_fires_once_at_80_percent():
    gw, warnings = make(Budget(max_searches=5))

    async def go():
        for i in range(5):
            await gw.search(f"q{i}")

    run(go())
    assert [(w.limit, w.used, w.max) for w in warnings] == [("max_searches", 4.0, 5.0)]


def test_soft_time_flips_flag_and_hard_time_raises():
    clock = Clock()
    gw, _ = make(Budget(max_wall_seconds_soft=10, max_wall_seconds_hard=20), clock=clock)
    assert not gw.soft_time_exceeded()
    clock.t = 10
    assert gw.soft_time_exceeded()
    run(gw.search("still allowed after soft limit"))
    clock.t = 20
    with pytest.raises(BudgetExceeded) as ei:
        run(gw.search("q"))
    assert ei.value.limit == "wall_hard"


def test_rate_limit_backs_off_three_times_then_uses_fallback():
    primary = FakeSearch(default=[], script={"q": GatewayError(FailureType.RATE_LIMITED, "429")})
    fallback = FakeSearch(default=[HIT], name="fallback")
    sleeps: list[float] = []
    gw, _ = make(search=primary, fallback=fallback, sleeps=sleeps)
    res = run(gw.search("q"))
    assert res.value == [HIT] and res.metrics.provider == "fallback"
    assert sleeps == [0.5, 1.0, 2.0] and len(primary.calls) == 4 and fallback.calls == ["q"]
    assert gw.usage().searches == 1  # one logical search, however many provider attempts


def test_rate_limit_without_fallback_raises_blocked():
    primary = FakeSearch(script={"q": GatewayError(FailureType.RATE_LIMITED, "429")})
    gw, _ = make(search=primary, sleeps=[])
    with pytest.raises(GatewayError) as ei:
        run(gw.search("q"))
    assert ei.value.failure is FailureType.BLOCKED and "search unavailable" in ei.value.message


def test_bad_credentials_are_not_retried_but_fall_back():
    primary = FakeSearch(script={"q": GatewayError(FailureType.BLOCKED, "rejected credentials")})
    fallback = FakeSearch(default=[HIT], name="fb")
    sleeps: list[float] = []
    gw, _ = make(search=primary, fallback=fallback, sleeps=sleeps)
    assert run(gw.search("q")).value == [HIT]
    assert primary.calls == ["q"] and sleeps == []


def test_results_carry_metrics_and_stop_flag_exists():
    gw, _ = make()
    res = run(gw.search("q"))
    assert res.metrics.kind == "search" and res.metrics.latency_ms >= 0
    fetched = run(gw.fetch("https://a.example"))
    assert fetched.metrics.kind == "fetch" and b"x" in fetched.value.body
    assert not gw.stop_requested.is_set()
    gw.stop_requested.set()
    assert gw.stop_requested.is_set()


def test_fetch_errors_stay_typed():
    gw, _ = make(fetcher=FakeFetcher())
    with pytest.raises(GatewayError) as ei:
        run(gw.fetch("https://unknown.example"))
    assert ei.value.failure is FailureType.SOURCE_UNAVAILABLE


def test_replay_mode_requires_a_replay_recorder():
    with pytest.raises(GatewayError) as ei:
        ToolGateway(settings=Settings(env="test"), budget=Budget(), mode=Mode.REPLAY)
    assert ei.value.failure is FailureType.BLOCKED
