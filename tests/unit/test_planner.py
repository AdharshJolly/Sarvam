import asyncio

import pytest

from backend.gateway import GatewayError
from backend.gateway.core import ToolGateway
from backend.pipeline.plan import find_violations, normalise, plan_question, run_plan
from backend.store import repo
from backend.store.db import init_db
from backend.store.emit import Emitter
from backend.store.events import read_events
from contracts.config import Settings, Thresholds
from contracts.events import EventType
from contracts.models import Budget, FailureType, Mode, Plan, Scope
from tests.support.data import plan_dict
from tests.support.fakes import FakeLLM

SETTINGS = Settings(env="test", llm_model_fast="fast-m", llm_model_strong="strong-m")
BUDGET = Budget()


def gateway(llm):
    return ToolGateway(settings=SETTINGS, budget=BUDGET, mode=Mode.LIVE, llm=llm)


def plan_of(llm):
    return asyncio.run(plan_question(gateway(llm), "Should we launch X?", Scope(), BUDGET))


def test_valid_plan_is_normalised_and_budget_overwritten():
    plan, metrics = plan_of(FakeLLM({"planner.v1": plan_dict(5)}, tokens=42, cost_usd=0.01))
    assert [d.id for d in plan.dimensions] == ["D1", "D2", "D3", "D4", "D5"]
    assert [s.id for s in plan.dimensions[0].slots] == ["D1S1", "D1S2"]
    tasks = [t.id for d in plan.dimensions for s in d.slots for t in s.tasks]
    assert tasks == [f"T{i}" for i in range(1, 11)]
    assert plan.dimensions[0].slots[0].attributes == ["monthly_price_inr", "fleet_size"]
    assert plan.budget == BUDGET  # the model's 999 is ignored
    assert metrics.role == "planner" and metrics.tokens == 42


def test_invalid_plan_gets_one_repair_attempt_with_the_violations():
    llm = FakeLLM({"planner.v1": [plan_dict(3), plan_dict(4)]}, tokens=10)
    plan, metrics = plan_of(llm)
    assert len(plan.dimensions) == 4 and len(llm.calls) == 2
    assert "violations" in llm.calls[1]["messages"][1]["content"]
    assert "expected 4 to 5 dimensions, got 3" in llm.calls[1]["messages"][1]["content"]
    assert metrics.tokens == 20  # both attempts are accounted for


def test_plan_still_invalid_after_repair_is_a_typed_step_failure():
    with pytest.raises(GatewayError) as ei:
        plan_of(FakeLLM({"planner.v1": plan_dict(3)}))
    assert ei.value.failure is FailureType.STEP_FAILED and "still invalid" in ei.value.message


def test_violation_rules():
    t = Thresholds()
    good = Plan.model_validate(plan_dict(5))
    assert find_violations(good, t) == []
    assert any("got 6" in v for v in find_violations(Plan.model_validate(plan_dict(6)), t))
    few_critical = Plan.model_validate(plan_dict(4, critical_each=False))
    assert any("critical" in v for v in find_violations(few_critical, t))
    assert any("exceed" in v for v in find_violations(good, Thresholds(max_initial_tasks=8)))
    one_slot = plan_dict(4)
    one_slot["dimensions"][0]["slots"].pop()
    assert any("exactly 2 slots" in v for v in find_violations(Plan.model_validate(one_slot), t))
    no_task = plan_dict(4)
    no_task["dimensions"][1]["slots"][0]["tasks"] = []
    assert any("no task" in v for v in find_violations(Plan.model_validate(no_task), t))
    dup = plan_dict(4)
    dup["dimensions"][1]["name"] = dup["dimensions"][0]["name"]
    assert any("duplicate" in v for v in find_violations(Plan.model_validate(dup), t))


def test_extra_tasks_are_trimmed_to_one_per_slot():
    raw = plan_dict(4)
    raw["dimensions"][0]["slots"][0]["tasks"].append({"id": "extra", "query": "second query"})
    plan = normalise(Plan.model_validate(raw), BUDGET)
    assert all(len(s.tasks) == 1 for d in plan.dimensions for s in d.slots)


def test_run_plan_persists_rows_and_emits_phase_then_plan_created(tmp_path):
    conn = init_db(tmp_path / "t.db")
    conn.execute(
        "INSERT INTO runs (id, question, mode, budget_json, started_at) VALUES (?,?,?,?,?)",
        ("R1", "q", "LIVE", BUDGET.model_dump_json(), "2026-01-01T00:00:00+00:00"),
    )
    conn.commit()
    llm = FakeLLM({"planner.v1": plan_dict(4)}, tokens=33, cost_usd=0.02)
    plan = asyncio.run(
        run_plan(gateway(llm), conn, Emitter(conn, "R1"), "R1", "q", Scope(), BUDGET)
    )
    events = list(read_events(conn, "R1"))
    assert [e.type for e in events] == [EventType.PHASE_ENTERED, EventType.PLAN_CREATED]
    assert events[0].payload["phase"] == "PLAN" and events[0].payload["reason"]
    assert (events[1].tokens, events[1].cost_usd) == (33, 0.02)
    assert repo.get_plan(conn, "R1") == plan
    tasks = repo.list_tasks(conn, "R1", status="pending")
    assert len(tasks) == 8 and all(t.kind == "initial" and t.round == 0 for t in tasks)
    assert len(repo.list_slots(conn, "R1")) == 8
