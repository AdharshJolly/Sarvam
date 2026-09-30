"""LLM operation stats and cost honesty (budget semantics, reported vs estimated vs unavailable)."""

import asyncio

import pytest
from pydantic import BaseModel

from backend.gateway import BudgetExceeded, CallMetrics, GatewayError
from backend.gateway.core import ToolGateway
from backend.gateway.llm import LLMCompletion, LLMRole, render_payload
from contracts.config import Settings
from contracts.models import Budget, FailureType, Mode
from tests.support.fakes import FakeLLM


class Pong(BaseModel):
    ok: bool


class UsageLLM:
    """Returns scripted texts with explicit input/output token usage and optional cost."""

    def __init__(self, texts, *, tin=100, tout=50, cost=None, errors=()):
        self.texts, self.tin, self.tout, self.cost = list(texts), tin, tout, cost
        self.errors = list(errors)
        self.requests = 0

    async def complete(self, model, messages, *, temperature=0.0, max_tokens=None):
        self.requests += 1
        if self.errors:
            raise self.errors.pop(0)
        text = self.texts.pop(0) if len(self.texts) > 1 else self.texts[0]
        m = CallMetrics(
            "llm",
            "p",
            model,
            7,
            tokens=self.tin + self.tout,
            cost_usd=self.cost,
            input_tokens=self.tin,
            output_tokens=self.tout,
        )
        return LLMCompletion(text, m)


def gw_for(llm, budget=None, **settings):
    async def nosleep(_):
        pass

    return ToolGateway(
        settings=Settings(env="test", llm_model_fast="fm", llm_model_strong="sm", **settings),
        budget=budget or Budget(),
        mode=Mode.LIVE,
        llm=llm,
        sleep=nosleep,
        run_id="R1",
    )


def call(gw, role=LLMRole.PLANNER):
    return asyncio.run(gw.llm(role, "planner.v1", Pong, {"q": 1}))


def test_op_stats_distinguish_operation_validation_attempt_and_provider_request():
    llm = UsageLLM(["not json", '{"ok": true}'])
    gw = gw_for(llm)
    call(gw)
    (op,) = gw.llm_ops
    assert op.run_id == "R1" and op.role == "planner" and op.prompt_id == "planner.v1"
    assert op.validation_attempts == 2 and op.provider_requests == 2 and op.provider_retries == 0
    assert (op.input_tokens, op.output_tokens, op.total_tokens) == (200, 100, 300)
    assert op.status == "ok"
    # max_llm_calls counts validation attempts, not logical operations
    assert gw.usage().llm_calls == 2


def test_provider_retries_are_counted_but_do_not_consume_max_llm_calls():
    llm = UsageLLM(['{"ok": true}'], errors=[GatewayError(FailureType.RATE_LIMITED, "429")])
    gw = gw_for(llm)
    call(gw)
    (op,) = gw.llm_ops
    assert op.provider_requests == 2 and op.provider_retries == 1 and op.validation_attempts == 1
    assert gw.usage().llm_calls == 1


def test_failed_operation_is_recorded_with_status():
    gw = gw_for(UsageLLM(["nope"]))
    with pytest.raises(GatewayError):
        call(gw)
    (op,) = gw.llm_ops
    assert op.status == "STEP_FAILED" and op.validation_attempts == 3


def test_reported_cost_is_used_and_labelled_reported():
    gw = gw_for(UsageLLM(['{"ok": true}'], cost=0.01))
    call(gw)
    b = gw.cost_breakdown()
    assert b.reported_usd == 0.01 and b.estimated_usd == 0.0 and b.unavailable_ops == 0
    assert gw.usage().cost_usd == 0.01


def test_estimated_cost_from_configured_pricing_is_not_reported_as_actual():
    gw = gw_for(UsageLLM(['{"ok": true}']), llm_price_strong=(1.0, 2.0))  # USD per 1M tokens
    call(gw)
    b = gw.cost_breakdown()
    assert b.reported_usd == 0.0
    assert b.estimated_usd == pytest.approx((100 * 1.0 + 50 * 2.0) / 1e6)
    assert gw.llm_ops[0].cost_source == "estimated"
    assert gw.usage().cost_usd == pytest.approx(b.estimated_usd)  # enforced against MAX_COST_USD


def test_unavailable_cost_is_not_counted_and_warns_once():
    gw = gw_for(UsageLLM(['{"ok": true}']))
    warnings = []
    gw._on_warning = warnings.append
    call(gw)
    call(gw)
    assert gw.llm_ops[0].cost_source == "unavailable" and gw.llm_ops[0].cost_usd is None
    assert gw.cost_breakdown().unavailable_ops == 2 and gw.usage().cost_usd == 0.0
    assert [w.limit for w in warnings].count("cost_unavailable") == 1


def test_max_cost_below_at_above():
    mk = lambda: gw_for(UsageLLM(['{"ok": true}'], cost=0.4), Budget(max_cost_usd=1.0))  # noqa: E731
    gw = mk()
    call(gw)  # 0.4 < 1.0: below, next call allowed
    call(gw)  # 0.8 < 1.0
    call(gw)  # starts at 0.8, ends at 1.2: the budget is checked before a call, so this ran
    with pytest.raises(BudgetExceeded) as ei:  # above
        call(gw)
    assert ei.value.limit == "max_cost_usd"
    at = gw_for(UsageLLM(['{"ok": true}'], cost=0.5), Budget(max_cost_usd=1.0))
    call(at)
    call(at)  # exactly 1.0
    with pytest.raises(BudgetExceeded):
        call(at)  # at the limit: blocked


def test_compact_payload_is_shorter_and_equivalent():
    payload = {"a": [1, 2, 3], "b": {"c": "d"}, "untrusted": [{"id": "P1", "text": "x"}]}
    pretty, compact = render_payload(payload), render_payload(payload, compact=True)
    assert len(compact) < len(pretty) and '"a":[1,2,3]' in compact
    assert '<source id="P1" untrusted="true">' in compact


def test_fakellm_still_works_without_usage_split():
    gw = gw_for(FakeLLM({"planner.v1": {"ok": True}}, tokens=10))
    call(gw)
    op = gw.llm_ops[0]
    assert op.total_tokens == 10 and op.input_tokens is None
