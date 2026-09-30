import time

from fastapi.testclient import TestClient

from backend.app import create_app
from backend.controller import RunnerDeps, run_m0
from backend.store import repo
from backend.store.db import init_db
from backend.store.emit import Emitter
from contracts.config import Settings
from contracts.events import EventType
from tests.support.data import plan_dict
from tests.support.fakes import FakeFetcher, FakeLLM, FakeSearch


def wait_for_status(client, rid, statuses=("completed", "failed"), timeout=8.0) -> dict:
    end = time.time() + timeout
    while time.time() < end:
        body = client.get(f"/api/runs/{rid}").json()
        if body["run"]["status"] in statuses:
            return body
        time.sleep(0.05)
    raise AssertionError(f"run {rid} did not reach {statuses}")


def event_types(client, rid) -> list[str]:
    state = client.get(f"/api/runs/{rid}/state").json()
    assert state["last_event_id"] > 0
    with client.stream("GET", f"/api/runs/{rid}/events") as r:
        text = r.read().decode()
    return [
        line.split('"type":"')[1].split('"')[0] for line in text.splitlines() if '"type"' in line
    ]


def test_test_env_without_runner_does_no_work(tmp_path):
    with TestClient(create_app(Settings(db_path=tmp_path / "t.db", env="test"))) as c:
        rid = c.post("/api/runs", json={"question": "q"}).json()["id"]
        time.sleep(0.2)
        assert c.get(f"/api/runs/{rid}").json()["run"]["status"] == "queued"
        assert c.app.state.runs == {}
        assert c.get(f"/api/runs/{rid}/state").json()["last_event_id"] == 1  # only run.started


def test_injected_runner_plans_and_completes(tmp_path):
    settings = Settings(
        db_path=tmp_path / "t.db", env="test", llm_model_fast="f", llm_model_strong="s"
    )
    deps = RunnerDeps(
        search=FakeSearch(), fetcher=FakeFetcher(), llm=FakeLLM({"planner.v1": plan_dict(4)})
    )

    async def runner(run_id, settings, handle):
        await run_m0(run_id, settings=settings, handle=handle, deps=deps)

    with TestClient(create_app(settings, runner=runner)) as c:
        rid = c.post("/api/runs", json={"question": "Should we launch X?"}).json()["id"]
        summary = wait_for_status(c, rid)
        assert summary["run"]["status"] == "completed" and summary["phase"] == "PLAN"
        assert summary["usage"]["llm_calls"] == 1
        types = event_types(c, rid)
        assert types[:3] == ["run.started", "phase.entered", "plan.created"]
        assert types[-1] == "run.completed"
        plan = c.get(f"/api/runs/{rid}/state").json()["plan"]
        assert len(plan["dimensions"]) == 4


def test_missing_keys_in_live_mode_fail_with_a_typed_blocked_event(tmp_path):
    settings = Settings(db_path=tmp_path / "t.db", env="development")  # no keys configured
    with TestClient(create_app(settings)) as c:
        rid = c.post("/api/runs", json={"question": "q"}).json()["id"]
        summary = wait_for_status(c, rid)
        assert summary["run"]["status"] == "failed"
        events = [e for e in _events(c, rid) if e["type"] == "run.failed"]
        assert events[0]["payload"] == {
            "failure": "BLOCKED",
            "message": "SARVAM_LLM_API_KEY is not set",
        }


def test_planner_failure_becomes_run_failed_not_a_crash(tmp_path):
    settings = Settings(
        db_path=tmp_path / "t.db", env="test", llm_model_fast="f", llm_model_strong="s"
    )
    deps = RunnerDeps(
        search=FakeSearch(), fetcher=FakeFetcher(), llm=FakeLLM({"planner.v1": "junk"})
    )
    with TestClient(create_app(settings, runner=partial_runner(deps))) as c:
        rid = c.post("/api/runs", json={"question": "q"}).json()["id"]
        assert wait_for_status(c, rid)["run"]["status"] == "failed"
        failed = [e for e in _events(c, rid) if e["type"] == "run.failed"][0]
        assert failed["payload"]["failure"] == "STEP_FAILED"


def partial_runner(deps):
    async def runner(run_id, settings, handle):
        await run_m0(run_id, settings=settings, handle=handle, deps=deps)

    return runner


def _events(client, rid) -> list[dict]:
    import json

    with client.stream("GET", f"/api/runs/{rid}/events") as r:
        text = r.read().decode()
    return [json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")]


def test_stale_running_runs_are_failed_on_startup(tmp_path):
    db = tmp_path / "t.db"
    conn = init_db(db)
    conn.execute(
        "INSERT INTO runs (id, question, mode, budget_json, status, started_at)"
        " VALUES ('Rold','q','LIVE','{}','running','2026-01-01T00:00:00+00:00')"
    )
    conn.commit()
    Emitter(conn, "Rold").emit(
        EventType.RUN_STARTED, {"question": "q", "mode": "LIVE", "budget": {}}
    )
    conn.close()
    with TestClient(create_app(Settings(db_path=db, env="test"))) as c:
        assert c.get("/api/runs/Rold").json()["run"]["status"] == "failed"
        failed = [e for e in _events(c, "Rold") if e["type"] == "run.failed"][0]
        assert failed["payload"] == {"failure": "BLOCKED", "message": "server restarted"}
    assert repo.get_run(init_db(db), "Rold").status == "failed"
