"""T12 on the fixture corpus: the ANALYZE pass reproduces expected/coverage.json (SSOT 16.1)."""

from __future__ import annotations

import asyncio

import pytest

from backend.intel.analyze import create_gap_tasks, run_analyze
from backend.store import repo
from backend.store.events import read_events
from contracts.events import EventType
from contracts.models import Scope, Verdict
from tests.support.corpus import RUN_ID, build_corpus, expected, explainer_script


@pytest.fixture()
def corpus(tmp_path):
    return build_corpus(tmp_path)


def analyse(corpus, round=0):
    gateway, llm = corpus.llm_gateway({"explainer.v1": explainer_script(corpus)})
    result = asyncio.run(
        run_analyze(gateway, corpus.conn, corpus.em, corpus.settings, RUN_ID, round=round)
    )
    return result, llm


def test_every_cell_matches_the_expected_json(corpus):
    (cells, _), _ = analyse(corpus)
    want = expected("coverage")["cells"]
    got = {c.slot_id: c for c in cells}
    assert set(got) == set(want)
    for slot_id, spec in want.items():
        cell = got[slot_id]
        assert cell.state.value == spec["state"], slot_id
        assert cell.independent_origins == spec["independent_origins"], slot_id
        assert cell.open_conflicts == spec["open_conflicts"], slot_id
        for fragment in spec["reason_contains"]:
            assert fragment in cell.reason.lower(), (slot_id, cell.reason)


def test_dimension_rollups_match_the_expected_json(corpus):
    (_, rollups), _ = analyse(corpus)
    assert {r.dimension_id: r.state.value for r in rollups} == expected("coverage")["rollups"]


def test_the_explained_conflicts_do_not_downgrade_but_the_open_one_does(corpus):
    (cells, _), _ = analyse(corpus)
    states = {c.slot_id: c.state.value for c in cells}
    assert states["D2S2"] == "GREEN"  # unit trap, explained by rule
    assert states["D3S1"] == "AMBER"  # one origin: the explained definition conflict is not why
    assert states["D2S1"] == "AMBER"  # genuine open conflict


def test_coverage_is_stored_versioned_by_round_and_emitted_once(corpus):
    analyse(corpus)
    stored = repo.list_coverage(corpus.conn, RUN_ID, round=0)
    assert len(stored) == 8 and {c.round for c in stored} == {0}
    events = [e for e in read_events(corpus.conn, RUN_ID) if e.type is EventType.COVERAGE_UPDATED]
    assert len(events) == 1 and events[0].round == 0
    payload = events[0].payload
    assert len(payload["cells"]) == 8 and len(payload["rollups"]) == 4
    # idempotent: a second pass neither changes the rows nor emits another event
    analyse(corpus)
    again = [e for e in read_events(corpus.conn, RUN_ID) if e.type is EventType.COVERAGE_UPDATED]
    assert len(again) == 1
    # a later round is a separate version of the matrix
    analyse(corpus, round=1)
    assert len(repo.list_coverage(corpus.conn, RUN_ID)) == 16


def test_analyze_announces_its_phase_and_emits_origin_conflict_and_coverage_events(corpus):
    analyse(corpus)
    types = [e.type for e in read_events(corpus.conn, RUN_ID)]
    phases = [
        e.payload["phase"]
        for e in read_events(corpus.conn, RUN_ID)
        if e.type is EventType.PHASE_ENTERED
    ]
    assert phases[-1] == "ANALYZE"
    assert types.count(EventType.ORIGIN_UPDATED) == 9
    assert types.count(EventType.CONFLICT_DETECTED) == 3
    assert types.count(EventType.COVERAGE_UPDATED) == 1
    last = [
        t
        for t in types
        if t in (EventType.ORIGIN_UPDATED, EventType.CONFLICT_DETECTED, EventType.COVERAGE_UPDATED)
    ]
    assert last[-1] is EventType.COVERAGE_UPDATED  # coverage is emitted after its inputs


def test_the_run_state_snapshot_hydrates_the_matrix_origins_conflicts_and_rollups(corpus):
    analyse(corpus)
    state = repo.build_run_state(corpus.conn, RUN_ID)
    assert len(state.coverage) == 8 and len(state.origins) == 9 and len(state.conflicts) == 3
    (round0,) = state.rollups
    assert (
        round0.round == 0
        and {r.dimension_id: r.state.value for r in round0.rollups}
        == expected("coverage")["rollups"]
    )
    assert all(c.status.value != "rejected" for c in state.claims)
    assert len(state.claims) == 15  # F13's irrelevant claim is dropped from the snapshot


def test_gap_tasks_target_exactly_the_critical_non_green_slots_with_the_expected_strategy(corpus):
    analyse(corpus)
    scope = Scope(geography="Bengaluru")
    before = len(repo.list_tasks(corpus.conn, RUN_ID))
    tasks = create_gap_tasks(corpus.conn, RUN_ID, scope, round=1)
    want = expected("coverage")["gap_tasks"]
    assert {t.slot_id for t in tasks} == set(want)
    assert len(repo.list_tasks(corpus.conn, RUN_ID)) == before + len(want)
    for task in tasks:
        assert task.kind.value == "gap" and task.round == 1 and task.status == "pending"
        assert "Bengaluru" in task.query_text
    assert not {t.slot_id for t in tasks} & set(expected("coverage")["no_gap_tasks_for"])


def test_a_second_gap_round_uses_a_strategy_not_already_tried(corpus):
    analyse(corpus)
    scope = Scope(geography="Bengaluru")
    first = {t.slot_id: t.query_text for t in create_gap_tasks(corpus.conn, RUN_ID, scope, round=1)}
    second = {
        t.slot_id: t.query_text for t in create_gap_tasks(corpus.conn, RUN_ID, scope, round=2)
    }
    assert set(second) == set(first)
    for slot_id in first:
        assert second[slot_id] != first[slot_id]


def test_coverage_improves_when_a_second_independent_origin_arrives(tmp_path):
    base = build_corpus(tmp_path, only={"F10", "F07", "F01"})
    (cells, _), _ = analyse(base)
    before = {c.slot_id: c.state.value for c in cells}
    assert before["D4S1"] == "AMBER"
    # a second independent fleet source (F10 duplicated on another domain) makes the slot GREEN
    extra = repo.insert_source(
        base.conn,
        RUN_ID,
        url="https://fleet-news.example/zipwheel",
        canonical_url="https://fleet-news.example/zipwheel",
        domain="fleet-news.example",
        publisher="fleet-news.example",
        source_type="unknown",
        authority_tier=3,
        task_id=None,
    )
    passage = repo.insert_passages(
        base.conn,
        extra.id,
        [("Independent report: Zipwheel now runs five hundred scooters in the city.", 0, 76)],
    )[0]
    repo.update_source(base.conn, extra.id, status="fetched")
    claim = repo.insert_claim(
        base.conn,
        RUN_ID,
        slot_id="D4S1",
        text="Zipwheel runs 500 scooters.",
        quote="Zipwheel now runs five hundred scooters",
        passage_id=passage.id,
        round=1,
        entity="Zipwheel fleet",
        attribute="fleet_size",
        value_num=500,
        unit="vehicles",
    )
    repo.record_verdict(base.conn, claim.id, Verdict.SUPPORTS)
    (cells, _), _ = analyse(base, round=1)
    assert {c.slot_id: c.state.value for c in cells}["D4S1"] == "GREEN"
