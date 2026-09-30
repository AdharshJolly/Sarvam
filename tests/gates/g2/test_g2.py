"""Gate G2 (SSOT 13.3, offline and deterministic): the intelligence layer works on a real run.

G2 must be true: fixture tests pass for verifier, origins, conflicts and coverage (tests/fixtures,
run by `make fixtures`); the matrix renders from a real run; the verifier is a separate call.
This gate drives the 14-document corpus through POST /api/runs and the real controller and checks
the same outcomes from the API and the event stream, exactly as the UI consumes them.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.store import repo
from contracts.config import Settings, Thresholds
from contracts.models import ClaimEvidence, ReportView, RunState
from tests.support.corpus import expected
from tests.support.corpus_run import corpus_deps
from tests.support.m0 import read_events, runner_for, wait_for_status

QUESTION = "Should a company launch an electric scooter subscription service in Bengaluru in 2027?"


def settings(tmp_path) -> Settings:
    return Settings(
        env="test",
        db_path=tmp_path / "g2.db",
        artifact_dir=tmp_path / "art",
        llm_model_fast="fast-m",
        llm_model_strong="strong-m",
        thresholds=Thresholds(sources_per_task=8),  # slot D2S1 alone has seven relevant pages
    )


@pytest.fixture()
def run(tmp_path):
    deps = corpus_deps()
    with TestClient(create_app(settings(tmp_path), runner=runner_for(deps))) as client:
        rid = client.post("/api/runs", json={"question": QUESTION}).json()["id"]
        summary = wait_for_status(client, rid)
        events = read_events(client, rid)
        state = RunState.model_validate(client.get(f"/api/runs/{rid}/state").json())
        yield client, rid, summary, events, state, deps


def test_g2_the_lifecycle_runs_verify_and_analyze_between_claims_and_synthesis(run):
    _, _, summary, events, _, _ = run
    assert summary["run"]["status"] == "completed"
    phases = [e["payload"]["phase"] for e in events if e["type"] == "phase.entered"]
    assert phases[:7] == [
        "PLAN", "DISCOVER", "ACQUIRE", "EXTRACT", "CLAIMS", "VERIFY", "ANALYZE",
    ]  # fmt: skip
    assert phases[-1] == "SYNTHESIZE"
    types = [e["type"] for e in events]
    order = [
        "claim.created",
        "claim.verified",
        "origin.updated",
        "coverage.updated",
        "report.draft",
    ]
    firsts = [types.index(t) for t in order]
    assert firsts == sorted(firsts)
    assert "run.failed" not in types and types[-1] == "run.completed"


def test_g2_the_verifier_is_a_separate_call_with_its_own_prompt(run):
    *_, deps = run
    by_prompt: dict[str, int] = {}
    for call in deps.llm.calls:
        by_prompt[call["prompt_id"]] = by_prompt.get(call["prompt_id"], 0) + 1
    assert by_prompt["verifier.v1"] >= 3 and by_prompt["extractor.v1"] >= 1
    for call in deps.llm.calls:
        if call["prompt_id"] != "verifier.v1":
            continue
        head = json.loads(call["messages"][1]["content"].split("\n\n<source")[0])
        assert len(head["pairs"]) <= 5  # batches of about five
        assert all(set(p) == {"claim_id", "claim_text", "passage_id"} for p in head["pairs"])
        assert "slot" not in head and "allowed_attributes" not in head  # nothing of the extractor's


def test_g2_the_coverage_matrix_renders_from_the_real_run(run):
    _, _, _, events, state, _ = run
    want = expected("coverage")
    assert {c.slot_id: c.state.value for c in state.coverage if c.round == 0} == {
        slot: spec["state"] for slot, spec in want["cells"].items()
    }
    round0_cells = [c for c in state.coverage if c.round == 0]
    assert len(round0_cells) == 8 and all(c.reason for c in round0_cells)
    round0 = next(r for r in state.rollups if r.round == 0)
    assert {r.dimension_id: r.state.value for r in round0.rollups} == want["rollups"]
    cov = [e for e in events if e["type"] == "coverage.updated" and e["round"] == 0]
    assert len(cov) == 1 and len(cov[0]["payload"]["cells"]) == 8


def test_g2_origin_collapse_is_visible_and_independence_is_honest(run):
    _, _, _, _, state, _ = run
    sizes = sorted(len(o.member_source_ids) for o in state.origins)
    assert sizes == [1, 1, 1, 1, 1, 1, 1, 1, 5]  # 13 fetched pages, 9 origins: the copy counts once
    release = next(o for o in state.origins if len(o.member_source_ids) == 5)
    assert release.method.value == "near_duplicate" and release.label == "VoltRide Mobility"
    by_id = {s.id: s for s in state.sources}
    assert {by_id[s].origin_id for s in release.member_source_ids} == {release.id}
    assert [s for s in state.sources if s.status.value == "SOURCE_UNAVAILABLE"]  # F14, typed
    assert all(o.method.value == "none" for o in state.origins if o is not release)


def test_g2_conflicts_are_found_explained_and_never_drop_a_claim(run):
    _, _, _, events, state, deps = run
    kinds = sorted((c.kind.value, c.status.value) for c in state.conflicts)
    assert kinds == [("definition", "explained"), ("genuine", "open"), ("unit_error", "explained")]
    claims = {c.id: c for c in state.claims}
    for conflict in state.conflicts:
        assert conflict.claim_a in claims and conflict.claim_b in claims  # both sides kept
        assert conflict.explanation
    open_conflict = next(c for c in state.conflicts if c.status.value == "open")
    assert claims[open_conflict.claim_a].status.value == "contested"
    assert sum(c["prompt_id"] == "explainer.v1" for c in deps.llm.calls) == 2  # the unit trap: none


def test_g2_every_stored_claim_was_judged_and_dropped_ones_are_out_of_the_snapshot(run):
    client, rid, _, events, state, _ = run
    verified = {
        e["payload"]["claim_id"]: e["payload"]["verdict"]
        for e in events
        if e["type"] == "claim.verified"
    }
    assert set(verified) >= {c.id for c in state.claims}
    assert all(c.status.value in ("supported", "partial", "contested") for c in state.claims)
    dropped = {cid for cid, v in verified.items() if v in ("irrelevant", "contradicts")}
    assert not dropped & {c.id for c in state.claims}


def test_g2_the_evidence_drawer_shows_the_verdict_and_the_origin(run):
    client, rid, _, _, state, _ = run
    claim = next(c for c in state.claims if "1,299" in c.text and c.status.value == "contested")
    ev = ClaimEvidence.model_validate(client.get(f"/api/runs/{rid}/claims/{claim.id}").json())
    assert ev.verdict is not None and ev.verdict_rationale
    assert ev.origin is not None and ev.quote_start is not None
    assert (
        ev.passage.text[ev.quote_start : ev.quote_end]
        .lower()
        .startswith(("monthly", "the", "entry"))
    )
    lone = next(c for c in state.claims if "permit fee" in c.text)
    ev2 = ClaimEvidence.model_validate(client.get(f"/api/runs/{rid}/claims/{lone.id}").json())
    assert ev2.independence == "unestablished"  # a single source with no shared-origin signal


def test_g2_the_report_cites_only_judged_claims(run):
    client, rid, _, events, state, _ = run
    report = ReportView.model_validate(client.get(f"/api/runs/{rid}/report").json())
    judged = {c.id: c for c in state.claims}
    assert report.citations and {c.claim_id for c in report.citations} <= set(judged)
    conn = client.app.state.db
    assert {repo.get_claim(conn, c.claim_id).status.value for c in report.citations} <= {
        "supported", "partial", "contested",
    }  # fmt: skip


def test_g2_a_forced_low_budget_run_still_scores_coverage_within_its_limits(tmp_path):
    deps = corpus_deps()
    with TestClient(create_app(settings(tmp_path), runner=runner_for(deps))) as client:
        rid = client.post(
            "/api/runs", json={"question": QUESTION, "budget": {"max_llm_calls": 4}}
        ).json()["id"]
        summary = wait_for_status(client, rid)
        state = RunState.model_validate(client.get(f"/api/runs/{rid}/state").json())
        assert summary["run"]["termination_reason"] == "budget"
        assert summary["usage"]["llm_calls"] <= 4
        assert len(state.coverage) == 8  # the matrix exists even though the run ended early
