import json

import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.store import repo
from backend.store.emit import Emitter
from contracts.config import Settings
from contracts.events import EventType


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(Settings(db_path=tmp_path / "t.db", env="test"))) as c:
        yield c


def seeded_run(client, *, terminal=True) -> tuple[str, list[int]]:
    rid = client.post("/api/runs", json={"question": "q"}).json()["id"]
    conn = client.app.state.db
    em = Emitter(conn, rid)
    ids = [
        em.emit(EventType.PHASE_ENTERED, {"phase": "PLAN", "reason": "Planning."}).id,
        em.emit(EventType.REPORT_DRAFT, {"version": 1}).id,
    ]
    if terminal:
        ids.append(em.emit(EventType.RUN_COMPLETED, {}).id)
        repo.set_run_status(conn, rid, "completed", ended=True)
    return rid, ids


def read(client, url, **kw):
    with client.stream("GET", url, **kw) as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        assert r.headers["cache-control"] == "no-cache"
        return r.read().decode()


def frames(body: str) -> list[tuple[int, dict]]:
    out = []
    for block in body.strip().split("\n\n"):
        lines = block.split("\n")
        assert lines[0].startswith("id: ") and lines[1].startswith("data: "), block
        assert len(lines) == 2
        out.append((int(lines[0][4:]), json.loads(lines[1][6:])))
    return out


def test_framing_is_id_and_data_only_and_closes_after_run_completed(client):
    rid, ids = seeded_run(client)
    body = read(client, f"/api/runs/{rid}/events")
    assert "event:" not in body
    got = frames(body)
    started = 1  # the run.started event written by POST /runs
    assert [i for i, _ in got] == [started, *ids]
    assert [e["type"] for _, e in got] == [
        "run.started",
        "phase.entered",
        "report.draft",
        "run.completed",
    ]
    assert all(set(e) >= {"id", "run_id", "ts", "round", "type", "payload"} for _, e in got)


def test_resume_from_last_event_id_header_and_after_query(client):
    rid, ids = seeded_run(client)
    by_header = frames(
        read(client, f"/api/runs/{rid}/events", headers={"Last-Event-ID": str(ids[0])})
    )
    assert [i for i, _ in by_header] == ids[1:]
    by_query = frames(read(client, f"/api/runs/{rid}/events?after={ids[1]}"))
    assert [i for i, _ in by_query] == ids[2:]
    both = frames(
        read(client, f"/api/runs/{rid}/events?after=1", headers={"Last-Event-ID": str(ids[1])})
    )
    assert [i for i, _ in both] == ids[2:]  # the larger position wins


def test_finished_run_with_nothing_new_closes_immediately(client):
    rid, ids = seeded_run(client)
    assert read(client, f"/api/runs/{rid}/events?after={ids[-1]}") == ""


def test_unknown_run_is_404(client):
    assert client.get("/api/runs/Rnope/events").status_code == 404


def test_failed_run_stream_ends_on_run_failed(client):
    rid = client.post("/api/runs", json={"question": "q"}).json()["id"]
    Emitter(client.app.state.db, rid).emit(
        EventType.RUN_FAILED, {"failure": "BLOCKED", "message": "no key"}
    )
    body = read(client, f"/api/runs/{rid}/events")
    assert [e["type"] for _, e in frames(body)] == ["run.started", "run.failed"]
