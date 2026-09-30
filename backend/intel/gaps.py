"""Gap task generator (SSOT FR-14). Pure and deterministic: no LLM writes these queries.

Every critical slot that is not GREEN gets one follow-up task, using the first query strategy that
has not been tried for that slot. Which strategies are tried is read from the stored task queries:
a strategy counts as tried when its query is (nearly) the same word set as an existing query.
The ladder depends on why the slot is not GREEN.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from backend.intel.coverage import CellResult, CoverageSlot
from contracts.models import CoverageState, Scope

SIMILARITY_TRIED = 0.8  # token-set Jaccard at which a query counts as already tried

LADDERS: dict[str, tuple[str, ...]] = {
    "red": ("attributes", "primary_source", "independent_verification", "recent"),
    "conflict": ("conflict_resolution", "primary_source", "independent_verification", "recent"),
    "thin": ("independent_verification", "primary_source", "attributes", "recent"),
}
_STOP = {"a", "an", "and", "are", "for", "in", "of", "on", "or", "the", "to", "with"}


@dataclass(frozen=True)
class GapTask:
    slot_id: str
    query: str
    strategy: str
    reason: str


def _tokens(text: str) -> frozenset[str]:
    return frozenset(w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in _STOP)


def is_tried(query: str, existing: list[str]) -> bool:
    q = _tokens(query)
    for other in existing:
        o = _tokens(other)
        if q and o and len(q & o) / len(q | o) >= SIMILARITY_TRIED:
            return True
    return False


def _place(scope: Scope) -> str:
    return " ".join(x for x in (scope.geography, scope.time_horizon) if x)


def build_query(strategy: str, slot_name: str, attributes: list[str], scope: Scope) -> str:
    attrs = " ".join(a.replace("_", " ") for a in attributes[:3])
    place = _place(scope)
    templates = {
        "attributes": f"{slot_name} {attrs}",
        "primary_source": f"{slot_name} official source regulator notification company filing",
        "independent_verification": f"{slot_name} independent analysis report review",
        "conflict_resolution": f"{slot_name} {attrs} official confirmed figure rate card",
        "recent": f"{slot_name} latest data update",
    }
    return " ".join(f"{templates[strategy]} {place}".split())


def ladder_for(cell: CellResult) -> tuple[str, ...]:
    if cell.state is CoverageState.RED:
        return LADDERS["red"]
    if cell.open_conflicts > 0:
        return LADDERS["conflict"]
    return LADDERS["thin"]


def generate_gap_tasks(
    slots: list[CoverageSlot],
    attributes: dict[str, list[str]],
    cells: list[CellResult],
    existing_queries: dict[str, list[str]],
    scope: Scope,
) -> list[GapTask]:
    """One task per critical, non-GREEN slot; none when every strategy was already tried."""
    by_slot = {c.slot_id: c for c in cells}
    tasks: list[GapTask] = []
    for slot in slots:
        cell = by_slot.get(slot.id)
        if cell is None or not slot.critical or cell.state is CoverageState.GREEN:
            continue
        tried = list(existing_queries.get(slot.id, []))
        for strategy in ladder_for(cell):
            query = build_query(strategy, slot.name, attributes.get(slot.id, []), scope)
            if not is_tried(query, tried):
                tasks.append(
                    GapTask(
                        slot.id,
                        query,
                        strategy,
                        f"Gap: {slot.name} is {cell.state.value} ({cell.reason.rstrip('.')}); "
                        f"trying the {strategy.replace('_', ' ')} strategy.",
                    )
                )
                break
    return tasks
