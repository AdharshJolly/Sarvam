"""T12: coverage states, reasons, dimension rollups and gap tasks (SSOT 9.8, FR-13, FR-14)."""

from __future__ import annotations

import pytest

from backend.intel.coverage import (
    CoverageClaim,
    CoverageDimension,
    CoverageSlot,
    compute_cell,
    compute_coverage,
    rollup_dimensions,
)
from backend.intel.gaps import (
    build_query,
    generate_gap_tasks,
    is_tried,
    ladder_for,
)
from contracts.models import CoverageState, Scope

G, A, R = CoverageState.GREEN, CoverageState.AMBER, CoverageState.RED


def slot(sid="S1", *, critical=True, min_independent=2, primary_ok=False, dim="D1", name="Pricing"):
    return CoverageSlot(sid, dim, name, critical, min_independent, primary_ok)


def claim(n, origin, *, verdict="supports", tier=3, established=True, source=None, slot_id="S1"):
    return CoverageClaim(f"C{n}", slot_id, source or f"S{n}", origin, established, verdict, tier)


# ---------------------------------------------------------------- cells


def test_no_claims_is_red_and_says_nothing_was_extracted():
    cell = compute_cell(slot(), [], 0)
    assert cell.state is R and cell.independent_origins == 0
    assert (
        "no supporting evidence" in cell.reason.lower() and "no claim was extracted" in cell.reason
    )


def test_only_irrelevant_or_contradicted_claims_is_red_and_counts_them():
    cell = compute_cell(
        slot(), [claim(1, "O1", verdict="irrelevant"), claim(2, "O2", verdict="contradicts")], 0
    )
    assert cell.state is R and "2 claims extracted" in cell.reason


def test_two_independent_supporting_origins_is_green():
    cell = compute_cell(slot(), [claim(1, "O1"), claim(2, "O2")], 0)
    assert cell.state is G and cell.independent_origins == 2 and cell.supporting_claims == 2
    assert "2 independent origins" in cell.reason


def test_many_sources_of_one_origin_count_once_and_are_amber():
    cell = compute_cell(slot(), [claim(i, "O1") for i in range(1, 5)], 0)
    assert cell.state is A and cell.independent_origins == 1
    assert "4 sources, 1 origin" in cell.reason


def test_min_independent_is_respected():
    three = slot(min_independent=3)
    assert compute_cell(three, [claim(1, "O1"), claim(2, "O2")], 0).state is A
    assert compute_cell(three, [claim(1, "O1"), claim(2, "O2"), claim(3, "O3")], 0).state is G
    assert compute_cell(slot(min_independent=1), [claim(1, "O1")], 0).state is G


def test_one_tier1_origin_is_enough_only_for_primary_ok_slots():
    tier1 = [claim(1, "O1", tier=1)]
    assert compute_cell(slot(primary_ok=True), tier1, 0).state is G
    assert "tier-1" in compute_cell(slot(primary_ok=True), tier1, 0).reason
    assert compute_cell(slot(primary_ok=False), tier1, 0).state is A
    assert compute_cell(slot(primary_ok=True), [claim(1, "O1", tier=2)], 0).state is A
    # a partial verdict from a tier-1 origin does not satisfy primary_ok
    assert (
        compute_cell(slot(primary_ok=True), [claim(1, "O1", tier=1, verdict="partial")], 0).state
        is A
    )


def test_an_open_conflict_downgrades_even_a_well_supported_cell():
    cell = compute_cell(slot(), [claim(1, "O1"), claim(2, "O2"), claim(3, "O3")], 1)
    assert cell.state is A and cell.open_conflicts == 1 and "open conflict" in cell.reason
    primary = compute_cell(slot(primary_ok=True), [claim(1, "O1", tier=1)], 1)
    assert primary.state is A


def test_only_partial_verdicts_is_amber():
    cell = compute_cell(
        slot(), [claim(1, "O1", verdict="partial"), claim(2, "O2", verdict="partial")], 0
    )
    assert cell.state is A and "partial" in cell.reason and cell.independent_origins == 2


def test_partial_origins_do_not_count_toward_green():
    cell = compute_cell(slot(), [claim(1, "O1"), claim(2, "O2", verdict="partial")], 0)
    assert cell.state is A and cell.independent_origins == 2


def test_unestablished_independence_still_counts_but_the_reason_says_so():
    cell = compute_cell(
        slot(), [claim(1, "O1", established=False), claim(2, "O2", established=False)], 0
    )
    assert cell.state is G and "unestablished" in cell.reason
    mixed = compute_cell(
        slot(), [claim(1, "O1", established=True), claim(2, "O2", established=False)], 0
    )
    assert "unestablished" not in mixed.reason


def test_compute_coverage_covers_every_slot_even_without_claims():
    slots = [slot("S1"), slot("S2")]
    cells = compute_coverage(
        slots, [claim(1, "O1", slot_id="S1"), claim(2, "O2", slot_id="S1")], {}
    )
    assert [(c.slot_id, c.state) for c in cells] == [("S1", G), ("S2", R)]


def test_open_conflicts_are_counted_per_slot():
    slots = [slot("S1"), slot("S2")]
    cells = compute_coverage(
        slots,
        [claim(1, "O1", slot_id="S1"), claim(2, "O2", slot_id="S1"), claim(3, "O3", slot_id="S2")],
        {"S1": 2},
    )
    assert cells[0].open_conflicts == 2 and cells[0].state is A
    assert cells[1].open_conflicts == 0


# ---------------------------------------------------------------- rollups

DIMS = [CoverageDimension("D1", "Demand"), CoverageDimension("D2", "Empty")]


def test_rollup_is_the_worst_critical_slot():
    slots = [slot("S1", critical=True), slot("S2", critical=True), slot("S3", critical=False)]
    states = {"S1": G, "S2": A, "S3": R}
    (r,) = rollup_dimensions(DIMS, slots, states)
    assert r.state is A and "Pricing" in r.reason and "AMBER" in r.reason


def test_non_critical_slots_do_not_drag_a_dimension_with_critical_slots_down():
    slots = [slot("S1", critical=True), slot("S2", critical=False)]
    assert rollup_dimensions(DIMS, slots, {"S1": G, "S2": R})[0].state is G


@pytest.mark.parametrize(
    "states,expected",
    [
        ([G, G, A], G),
        ([R, A, G], A),
        ([R, R, G], R),
        ([G], G),
        ([A, G], A),  # even count: the lower median
        ([R, G], R),
    ],
)
def test_without_critical_slots_the_rollup_is_the_lower_median(states, expected):
    slots = [slot(f"S{i}", critical=False) for i in range(len(states))]
    result = rollup_dimensions(DIMS, slots, {s.id: st for s, st in zip(slots, states, strict=True)})
    assert result[0].state is expected


def test_dimensions_without_slots_are_omitted():
    assert rollup_dimensions(DIMS, [slot("S1")], {"S1": G})[0].dimension_id == "D1"
    assert len(rollup_dimensions(DIMS, [slot("S1")], {"S1": G})) == 1


# ---------------------------------------------------------------- gaps

SCOPE = Scope(geography="Bengaluru", time_horizon="2027")


def cell_for(state, *, conflicts=0):
    from backend.intel.coverage import CellResult

    return CellResult("S1", state, 0, 0, conflicts, "why")


def test_ladder_depends_on_why_the_slot_is_not_green():
    assert ladder_for(cell_for(R))[0] == "attributes"
    assert ladder_for(cell_for(A, conflicts=1))[0] == "conflict_resolution"
    assert ladder_for(cell_for(A))[0] == "independent_verification"


def test_only_critical_non_green_slots_get_a_task():
    slots = [
        slot("S1", critical=True),
        slot("S2", critical=False),
        slot("S3", critical=True),
    ]
    cells = [
        cell_for(R),
        cell_for(R).__class__("S2", R, 0, 0, 0, "x"),
        cell_for(G).__class__("S3", G, 2, 2, 0, "y"),
    ]
    tasks = generate_gap_tasks(slots, {}, cells, {}, SCOPE)
    assert [t.slot_id for t in tasks] == ["S1"]
    assert "Bengaluru" in tasks[0].query and "2027" in tasks[0].query
    assert tasks[0].strategy == "attributes" and "RED" in tasks[0].reason


def test_a_strategy_already_tried_is_skipped_and_the_next_one_is_used():
    slots = [slot("S1")]
    cells = [cell_for(A)]
    first = generate_gap_tasks(slots, {"S1": ["monthly_price_inr"]}, cells, {}, SCOPE)[0]
    assert first.strategy == "independent_verification"
    again = generate_gap_tasks(
        slots, {"S1": ["monthly_price_inr"]}, cells, {"S1": [first.query]}, SCOPE
    )[0]
    assert again.strategy == "primary_source" and again.query != first.query
    third = generate_gap_tasks(slots, {"S1": []}, cells, {"S1": [first.query, again.query]}, SCOPE)[
        0
    ]
    assert third.strategy == "attributes"


def test_no_task_when_every_strategy_was_already_tried():
    slots, cells = [slot("S1")], [cell_for(A)]
    tried = [
        build_query(s, "Pricing", [], SCOPE)
        for s in ("independent_verification", "primary_source", "attributes", "recent")
    ]
    assert generate_gap_tasks(slots, {}, cells, {"S1": tried}, SCOPE) == []


def test_is_tried_ignores_case_order_and_stop_words():
    assert is_tried("Pricing of the Plan in Bengaluru", ["bengaluru plan pricing"])
    assert not is_tried("pricing plan official source", ["pricing plan"])
