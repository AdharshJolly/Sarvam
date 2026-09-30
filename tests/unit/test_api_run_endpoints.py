import asyncio
import time

import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.controller import RunHandle
from backend.store import repo
from backend.store.emit import Emitter
from contracts.config import Settings
from contracts.events import EventType
from contracts.models import ClaimEvidence, Plan, ReportView, RunState, RunSummary
from tests.support.data import plan_dict


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(Settings(db_path=tmp_path / "t.db", env="test"))) as c:
        yield c


def new_run(client) -> str:
    return client.post("/api/runs", json={"question": "Should we launch X?"}).json()["id"]


def seed(client, run_id):
    conn = client.app.state.db
    repo.insert_plan(conn, run_id, Plan.model_validate(plan_dict(4)))
    src = repo.insert_source(
        conn,
        run_id,
        url="https://a.example/x",
        canonical_url="a.example/x",
        domain="a.example",
        publisher="a.example",
        source_type="news",
        authority_tier=2,
        task_id="T1",
    )
    psg = repo.insert_passages(conn, src.id, [("Plan X costs Rs 1,299 per month.", 0, 31)])[0]
    claim = repo.insert_claim(
        conn,
        run_id,
        slot_id="D1S1",
        text="Plan X costs 1299 per month",
        quote="Rs 1,299 per month",
        passage_id=psg.id,
    )
    return src, psg, claim


def test_summary_and_404(client):
    rid = new_run(client)
    body = client.get(f"/api/runs/{rid}").json()
    s = RunSummary.model_validate(body)
    assert s.run.id == rid and s.phase is None and s.usage.llm_calls == 0 and s.stop is None
    assert client.get("/api/runs/Rnope").status_code == 404
    assert client.get("/api/runs/Rnope/state").status_code == 404


def test_state_snapshot_contains_plan_sources_claims_and_last_event_id(client):
    rid = new_run(client)
    seed(client, rid)
    Emitter(client.app.state.db, rid).emit(
        EventType.PHASE_ENTERED, {"phase": "DISCOVER", "reason": "Searching."}
    )
    st = RunState.model_validate(client.get(f"/api/runs/{rid}/state").json())
    assert st.phase == "DISCOVER" and st.plan is not None and len(st.plan.dimensions) == 4
    assert len(st.tasks) == 8 and len(st.sources) == 1 and len(st.claims) == 1
    assert st.claims[0].status == "pending" and st.report_version is None
    assert st.last_event_id == 2  # run.started + phase.entered


def test_claim_evidence_drawer(client):
    rid = new_run(client)
    src, psg, claim = seed(client, rid)
    body = client.get(f"/api/runs/{rid}/claims/{claim.id}").json()
    ev = ClaimEvidence.model_validate(body)
    assert ev.claim.id == claim.id and ev.passage.id == psg.id and ev.source.id == src.id
    assert ev.independence == "unestablished" and ev.verdict is None
    assert client.get(f"/api/runs/{rid}/claims/C9999").status_code == 404
    other = new_run(client)  # a claim id from another run must not leak
    assert client.get(f"/api/runs/{other}/claims/{claim.id}").status_code == 404


def test_report_404_then_200_with_citations(client):
    rid = new_run(client)
    _, psg, claim = seed(client, rid)
    assert client.get(f"/api/runs/{rid}/report").status_code == 404
    repo.insert_report(
        client.app.state.db, rid, markdown=f"# Q\n- fact [{claim.id}]", dropped_sentences=["x"]
    )
    view = ReportView.model_validate(client.get(f"/api/runs/{rid}/report").json())
    assert view.version == 1 and view.dropped_sentences == ["x"]
    assert [(c.claim_id, c.passage_id) for c in view.citations] == [(claim.id, psg.id)]


def test_stop_is_409_when_not_running(client):
    rid = new_run(client)
    assert client.post(f"/api/runs/{rid}/stop").status_code == 409
    assert client.post("/api/runs/Rnope/stop").status_code == 404


def test_stop_sets_the_flag_on_a_running_run(tmp_path):
    started = {}

    async def waiting_runner(run_id, settings, handle: RunHandle):
        repo_conn_status(settings, run_id, "running")
        started["event"] = handle.stop_event
        await asyncio.wait_for(handle.stop_event.wait(), timeout=5)
        started["stopped"] = True

    def repo_conn_status(settings, run_id, status):
        from backend.store.db import connect

        c = connect(settings.db_path)
        repo.set_run_status(c, run_id, status)
        c.close()

    settings = Settings(db_path=tmp_path / "t.db", env="test")
    with TestClient(create_app(settings, runner=waiting_runner)) as c:
        rid = c.post("/api/runs", json={"question": "q"}).json()["id"]
        for _ in range(50):
            if c.get(f"/api/runs/{rid}").json()["run"]["status"] == "running":
                break
            time.sleep(0.05)
        r = c.post(f"/api/runs/{rid}/stop")
        assert r.status_code == 202 and r.json()["run"]["id"] == rid
        for _ in range(50):
            if started.get("stopped"):
                break
            time.sleep(0.05)
        assert started.get("stopped") is True
