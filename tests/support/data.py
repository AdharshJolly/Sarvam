"""Shared canned data for offline tests (plans, run helpers)."""

from __future__ import annotations

from contracts.models import Budget

DIMENSIONS = ["Demand", "Competition", "Economics", "Regulation", "Operations"]


def plan_dict(dims: int = 5, *, critical_each: bool = True, budget: dict | None = None) -> dict:
    """A structurally valid planner answer with deliberately messy ids and attribute names."""
    out = []
    for i in range(dims):
        name = DIMENSIONS[i] if i < len(DIMENSIONS) else f"Extra {i}"
        slots = []
        for j in range(2):
            slots.append(
                {
                    "id": f"x{i}{j}",
                    "name": f"{name} slot {j + 1}",
                    "description": f"What a good source says about {name.lower()} {j + 1}",
                    "critical": critical_each and j == 0,
                    "attributes": ["Monthly Price (INR)", "monthly_price_inr", "Fleet Size"]
                    if j == 0
                    else [],
                    "min_independent": 2,
                    "primary_ok": name == "Regulation" and j == 0,
                    "tasks": [
                        {
                            "id": f"tt{i}{j}",
                            "query": f"electric scooter subscription {name} {j + 1}",
                        }
                    ],
                }
            )
        out.append(
            {
                "id": f"dd{i}",
                "name": name,
                "description": f"{name} of the market",
                "critical": critical_each,
                "slots": slots,
            }
        )
    return {"dimensions": out, "budget": budget or {"max_searches": 999}}


def default_budget() -> Budget:
    return Budget()
