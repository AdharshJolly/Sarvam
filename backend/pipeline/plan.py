"""Planner (SSOT 9.1, task T03): LLM proposes, deterministic code validates and normalises.

The model never decides ids or budgets. Limits (decision B-12): 4 to 5 dimensions, exactly 2
slots per dimension, exactly 1 task per slot, at most `max_initial_tasks` tasks, at least 3
critical slots.
"""

from __future__ import annotations

import re
import sqlite3
from dataclasses import replace

from backend.gateway import CallMetrics, GatewayError
from backend.gateway.core import ToolGateway
from backend.gateway.llm import LLMRole
from backend.store import repo
from backend.store.emit import Emitter
from contracts.config import Thresholds
from contracts.events import EventType, PhaseEnteredPayload, PlanCreatedPayload
from contracts.models import (
    Budget,
    FailureType,
    Phase,
    Plan,
    PlanDimension,
    PlanSlot,
    PlanTask,
    Scope,
)

DEFAULT_DIMENSIONS = ["demand", "competition", "economics", "regulation", "operations", "risks"]
MIN_DIMENSIONS, MAX_DIMENSIONS = 4, 5
SLOTS_PER_DIMENSION = 2
MIN_CRITICAL_SLOTS = 3


def sanitise_attribute(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")


def find_violations(plan: Plan, thresholds: Thresholds) -> list[str]:
    """Structural problems that cannot be fixed silently and need a repair attempt."""
    out: list[str] = []
    dims = plan.dimensions
    if not MIN_DIMENSIONS <= len(dims) <= MAX_DIMENSIONS:
        out.append(f"expected {MIN_DIMENSIONS} to {MAX_DIMENSIONS} dimensions, got {len(dims)}")
    names: set[str] = set()
    tasks = critical = 0
    for d in dims:
        if not d.name.strip():
            out.append("a dimension has an empty name")
        if d.name.strip().lower() in names:
            out.append(f"duplicate dimension name: {d.name!r}")
        names.add(d.name.strip().lower())
        if len(d.slots) != SLOTS_PER_DIMENSION:
            out.append(f"dimension {d.name!r} must have exactly 2 slots, got {len(d.slots)}")
        for s in d.slots:
            if not s.name.strip() or not s.description.strip():
                out.append(f"a slot in dimension {d.name!r} has an empty name or description")
            if s.name.strip().lower() in names:
                out.append(f"duplicate name: {s.name!r}")
            names.add(s.name.strip().lower())
            live = [t for t in s.tasks if t.query.strip()]
            if not live:
                out.append(f"slot {s.name!r} has no task with a query")
            tasks += 1 if live else 0
            critical += int(s.critical)
    if tasks > thresholds.max_initial_tasks:
        out.append(f"{tasks} tasks exceed the limit of {thresholds.max_initial_tasks}")
    if critical < MIN_CRITICAL_SLOTS:
        out.append(f"at least {MIN_CRITICAL_SLOTS} critical slots are required, got {critical}")
    return out


def normalise(plan: Plan, budget: Budget) -> Plan:
    """Renumber ids, keep one task per slot, clean attributes, overwrite the budget."""
    task_no = 0
    dims: list[PlanDimension] = []
    for di, d in enumerate(plan.dimensions, start=1):
        slots: list[PlanSlot] = []
        for si, s in enumerate(d.slots, start=1):
            task_no += 1
            query = next((t.query.strip() for t in s.tasks if t.query.strip()), "")
            attrs = list(dict.fromkeys(a for a in map(sanitise_attribute, s.attributes) if a))
            slots.append(
                PlanSlot(
                    id=f"D{di}S{si}",
                    name=s.name.strip(),
                    description=s.description.strip(),
                    critical=s.critical,
                    attributes=attrs,
                    min_independent=max(1, s.min_independent),
                    primary_ok=s.primary_ok,
                    tasks=[PlanTask(id=f"T{task_no}", query=query)],
                )
            )
        dims.append(
            PlanDimension(
                id=f"D{di}",
                name=d.name.strip(),
                description=d.description.strip(),
                critical=d.critical or any(s.critical for s in slots),
                slots=slots,
            )
        )
    return Plan(dimensions=dims, budget=budget)


def _merge(a: CallMetrics, b: CallMetrics) -> CallMetrics:
    def add(x: float | None, y: float | None) -> float | None:
        return None if x is None and y is None else (x or 0) + (y or 0)

    return replace(
        b,
        latency_ms=a.latency_ms + b.latency_ms,
        tokens=add(a.tokens, b.tokens),  # type: ignore[arg-type]
        cost_usd=add(a.cost_usd, b.cost_usd),
    )


async def plan_question(
    gateway: ToolGateway,
    question: str,
    scope: Scope,
    budget: Budget,
    thresholds: Thresholds | None = None,
) -> tuple[Plan, CallMetrics]:
    """Ask the planner, validate in code, allow one repair attempt, else STEP_FAILED."""
    t = thresholds or Thresholds()
    payload: dict = {
        "question": question,
        "scope": scope.model_dump(),
        "default_dimensions": DEFAULT_DIMENSIONS,
        "rules": {
            "dimensions": f"{MIN_DIMENSIONS} to {MAX_DIMENSIONS}",
            "slots_per_dimension": SLOTS_PER_DIMENSION,
            "tasks_per_slot": 1,
            "max_total_tasks": t.max_initial_tasks,
            "min_critical_slots": MIN_CRITICAL_SLOTS,
        },
    }
    first = await gateway.llm(LLMRole.PLANNER, "planner.v1", Plan, payload)
    violations = find_violations(first.value, t)
    if not violations:
        return normalise(first.value, budget), first.metrics
    payload["previous_plan"] = first.value.model_dump(mode="json")
    payload["violations"] = violations
    second = await gateway.llm(LLMRole.PLANNER, "planner.v1", Plan, payload)
    remaining = find_violations(second.value, t)
    if remaining:
        raise GatewayError(
            FailureType.STEP_FAILED,
            "planner output still invalid after repair: " + "; ".join(remaining),
        )
    return normalise(second.value, budget), _merge(first.metrics, second.metrics)


async def run_plan(
    gateway: ToolGateway,
    conn: sqlite3.Connection,
    emitter: Emitter,
    run_id: str,
    question: str,
    scope: Scope,
    budget: Budget,
) -> Plan:
    """PLAN phase: announce, plan, persist dimensions/slots/tasks, emit plan.created."""
    emitter.emit(
        EventType.PHASE_ENTERED,
        PhaseEnteredPayload(
            phase=Phase.PLAN,
            reason="Planning: turning the question into dimensions and evidence slots.",
        ),
    )
    plan, metrics = await plan_question(
        gateway, question, scope, budget, gateway.settings.thresholds
    )
    repo.insert_plan(conn, run_id, plan)
    emitter.emit(EventType.PLAN_CREATED, PlanCreatedPayload(plan=plan), metrics=metrics)
    return plan
