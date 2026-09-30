"""Gate G3 (SSOT 13.3, offline and deterministic): the full lifecycle runs on the fixture corpus.

G3 must be true: at least one challenge round with follow-up research, a stop state with a reason,
a verified report, and the four visible moments working. Two fixture pages are held back from
round 0, so a follow-up search is what finds them: the coverage matrix changes between rounds, a
new conflict appears, and the stop policy decides from the stored tables.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.intel.stop import recompute_stop
from contracts.config import Settings, Thresholds
from contracts.models import ReportView, RunState, StopDecision
from tests.support.corpus_run import corpus_deps
from tests.support.m0 import read_events, runner_for, wait_for_status

QUESTION = "Should a company launch an electric scooter subscription service in Bengaluru in 2027?"
HELD_BACK = frozenset({"F08", "F10"})
CHALLENGE_PAGES = frozenset({"F08"})  # found by the challenge search; F10 by the D4S1 gap search


def settings(tmp_path) -> Settings:
    return Settings(
        env="test",
        db_path=tmp_path / "g3.db",
        artifact_dir=tmp_path / "art",
        llm_model_fast="fast-m",
        llm_model_strong="strong-m",
        thresholds=Thresholds(sources_per_task=8),
    )


@pytest.fixture()
def run(tmp_path):
    deps = corpus_deps(withhold=HELD_BACK, challenge_pages=CHALLENGE_PAGES)
    with TestClient(create_app(settings(tmp_path), runner=runner_for(deps))) as client:
        rid = client.post(
            "/api/runs", json={"question": QUESTION, "budget": {"max_searches": 40}}
        ).json()["id"]
        summary = wait_for_status(client, rid)
        events = read_events(client, rid)
        state = RunState.model_validate(client.get(f"/api/runs/{rid}/state").json())
        yield client, rid, summary, events, state, deps


def phases(events, round=None):
    return [
        e["payload"]["phase"]
        for e in events
        if e["type"] == "phase.entered" and (round is None or e["round"] == round)
    ]


def test_g3_the_full_lifecycle_runs_a_challenge_round_and_ends_with_a_state_and_reason(run):
    _, _, summary, events, state, _ = run
    assert summary["run"]["status"] == "completed"
    assert phases(events, 0) == [
        "PLAN", "DISCOVER", "ACQUIRE", "EXTRACT", "CLAIMS", "VERIFY", "ANALYZE",
    ]  # fmt: skip
    assert phases(events, 1) == [
        "CHALLENGE", "DISCOVER", "ACQUIRE", "EXTRACT", "CLAIMS", "VERIFY", "ANALYZE",
    ]  # fmt: skip
    tail = [p for p in phases(events)][-2:]
    assert tail == ["STOP_POLICY", "SYNTHESIZE"]
    types = [e["type"] for e in events]
    assert (
        types.index("challenge.created")
        < types.index("round.started")
        < types.index("challenge.outcome")
    )
    assert types.index("stop.decided") < types.index("report.draft") < types.index("run.completed")
    assert "run.failed" not in types and types[-1] == "run.completed"
    assert state.stop is not None and state.stop.challenge_rounds_completed >= 1
    assert summary["run"]["stop_state"] == state.stop.state.value
    assert summary["run"]["termination_reason"] == state.stop.termination_reason.value


def test_g3_follow_up_rounds_research_only_new_sources_and_claims(run):
    _, _, _, events, state, _ = run
    found_round = {
        e["payload"]["source"]["id"]: e["round"] for e in events if e["type"] == "source.found"
    }
    assert {r for r in found_round.values()} >= {0, 1}  # round 1 found pages round 0 did not
    passage_source = {}
    for e in events:
        if e["type"] == "passages.created":
            passage_source[e["payload"]["source_id"]] = e["round"]
    assert passage_source == {sid: r for sid, r in found_round.items() if sid in passage_source}
    by_id = {c.id: c for c in state.claims}
    claim_round = {
        e["payload"]["claim"]["id"]: e["round"] for e in events if e["type"] == "claim.created"
    }
    source_of_passage = {}
    for source in state.sources:
        source_of_passage[source.id] = found_round[source.id]
    conn_claims = {c.id: c for c in state.claims}
    assert set(claim_round) >= set(conn_claims)
    assert by_id and any(r == 1 for r in claim_round.values())


def test_g3_the_matrix_changes_between_rounds_and_a_new_conflict_appears(run):
    _, _, _, events, state, _ = run
    by_round: dict[int, dict[str, str]] = {}
    for c in state.coverage:
        by_round.setdefault(c.round, {})[c.slot_id] = c.state.value
    assert {0, 1} <= set(by_round)
    assert by_round[0]["D4S1"] == "RED" and by_round[1]["D4S1"] == "AMBER"  # follow-up evidence
    assert by_round[0]["D2S1"] == "GREEN" and by_round[1]["D2S1"] == "AMBER"  # and a new conflict
    conflicts = [e for e in events if e["type"] == "conflict.detected"]
    assert conflicts and all(e["round"] >= 1 for e in conflicts if "1,599" in str(e["payload"]))
    assert any(c.status.value == "open" for c in state.conflicts)


def test_g3_challenges_carry_a_hypothesis_tasks_and_a_rule_based_outcome(run):
    _, _, _, events, state, _ = run
    assert state.challenges
    for challenge in state.challenges:
        assert challenge.attack and challenge.outcome is not None
        assert challenge.followup_task_ids
    tasks = {t.id: t for t in state.tasks}
    for challenge in state.challenges:
        assert all(tasks[t].kind.value == "challenge" for t in challenge.followup_task_ids)
    assert any(t.kind.value == "gap" and t.round == 1 for t in state.tasks)
    outcomes = [e for e in events if e["type"] == "challenge.outcome"]
    assert {e["payload"]["challenge_id"] for e in outcomes} == {c.id for c in state.challenges}


def test_g3_the_stop_state_is_a_pure_function_of_the_stored_tables(run):
    client, rid, _, events, state, _ = run
    conn = client.app.state.db
    stored = StopDecision.model_validate(
        next(e for e in events if e["type"] == "stop.decided")["payload"]["decision"]
    )
    assert recompute_stop(conn, rid) == stored == state.stop
    assert state.stop.state.value == "INSUFFICIENT"  # D1S2 (insurance) has no supporting origin
    assert state.stop.termination_reason.value == "no_marginal_gain"  # round 2 found nothing new
    assert state.stop.critical_slots.red >= 1 and state.stop.caveats


def test_g3_the_report_is_verified_and_cites_only_stored_evidence(run):
    client, rid, _, events, state, _ = run
    report = ReportView.model_validate(client.get(f"/api/runs/{rid}/report").json())
    assert report.citations and report.certainty_state == state.stop.state.value
    verified = next(e for e in events if e["type"] == "report.verified")
    assert verified["payload"]["certainty_state"] == state.stop.state.value


def test_g3_the_report_carries_the_state_labels_conflicts_and_what_could_change(run):
    client, rid, _, _, state, _ = run
    md = ReportView.model_validate(client.get(f"/api/runs/{rid}/report").json()).markdown
    for heading in (
        "## Decision summary",
        "## Coverage matrix",
        "## Findings by dimension",
        "## Conflicts and unresolved items",
        "## What could change the conclusion",
        "## Sources index",
        "## Method and run metadata",
    ):
        assert heading in md
    assert f"**Assurance state: {state.stop.state.value}**" in md
    assert "{{certainty:supported}}" in md and "{{certainty:contested}}" in md
    assert "conflict (open," in md  # the price the challenge search found disagrees with the rest
    assert all(c.attack.rstrip(".") in md for c in state.challenges)
    findings = [
        line for line in md.splitlines() if line.startswith("- ") and "{{certainty:" in line
    ]
    assert findings and all("[C" in line for line in findings)  # every finding cites a claim


def test_g3_budgets_hold_across_rounds(run):
    _, _, summary, _, _, _ = run
    usage = summary["usage"]
    assert usage["searches"] <= 40 and usage["llm_calls"] <= 250 and usage["fetches"] <= 40


def test_g3_a_forced_low_budget_run_still_decides_and_says_the_challenge_was_not_completed(
    tmp_path,
):
    deps = corpus_deps(withhold=HELD_BACK, challenge_pages=CHALLENGE_PAGES)
    with TestClient(create_app(settings(tmp_path), runner=runner_for(deps))) as client:
        rid = client.post(
            "/api/runs", json={"question": QUESTION, "budget": {"max_llm_calls": 4}}
        ).json()["id"]
        summary = wait_for_status(client, rid)
        events = read_events(client, rid)
        state = RunState.model_validate(client.get(f"/api/runs/{rid}/state").json())
    assert summary["run"]["termination_reason"] == "budget"
    assert summary["usage"]["llm_calls"] <= 4
    assert state.stop is not None and state.stop.state.value == "INSUFFICIENT"
    assert any("challenge round was not completed" in c for c in state.stop.caveats)
    assert [e["type"] for e in events][-1] == "run.completed"
    assert "challenge.created" not in [e["type"] for e in events]


def test_g3_a_user_stop_before_any_work_still_produces_a_decision_and_a_report(tmp_path):
    import asyncio

    from backend.controller import RunHandle, run_research
    from backend.store import repo
    from backend.store.db import init_db

    st = settings(tmp_path)
    conn = init_db(st.db_path)
    from contracts.models import Budget

    conn.execute(
        "INSERT INTO runs (id, question, mode, budget_json, status, started_at)"
        " VALUES ('R1', ?, 'LIVE', ?, 'queued', '2026-01-01T00:00:00+00:00')",
        (QUESTION, Budget().model_dump_json()),
    )
    conn.commit()
    handle = RunHandle()
    handle.stop_event.set()
    asyncio.run(run_research("R1", settings=st, handle=handle, deps=corpus_deps()))
    run = repo.get_run(conn, "R1")
    assert run.termination_reason.value == "user_stopped" and run.stop_state is not None
    assert repo.build_report_view(conn, "R1") is not None
    assert recompute_stop(conn, "R1") is not None
