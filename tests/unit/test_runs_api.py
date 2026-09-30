import sqlite3

import pytest
from fastapi.testclient import TestClient

import backend.app as app_module
from backend.app import create_app
from backend.store.events import read_events
from contracts.config import Settings
from contracts.events import EventType
from contracts.models import Run


@pytest.fixture
def client(tmp_path):
    settings = Settings(db_path=tmp_path / "t.db", env="test")
    with TestClient(create_app(settings)) as c:
        yield c


def test_create_run_persists_row_and_run_started(client):
    r = client.post("/api/runs", json={"question": "Should we launch X?", "mode": "LIVE"})
    assert r.status_code == 201
    run = Run.model_validate(r.json())  # response honours the Run contract
    assert run.status == "queued" and run.mode == "LIVE" and run.budget.max_searches == 24
    conn = client.app.state.db
    row = conn.execute("SELECT * FROM runs WHERE id=?", (run.id,)).fetchone()
    assert row["question"] == "Should we launch X?" and row["status"] == "queued"
    events = list(read_events(conn, run.id))
    assert [e.type for e in events] == [EventType.RUN_STARTED]
    assert events[0].payload["question"] == "Should we launch X?"


def test_create_run_applies_scope_mode_and_budget_override(client):
    r = client.post(
        "/api/runs",
        json={
            "question": "q",
            "mode": "REPLAY",
            "scope": {"geography": "IN"},
            "budget": {"max_searches": 5},
        },
    )
    body = r.json()
    assert r.status_code == 201
    assert body["mode"] == "REPLAY" and body["scope"]["geography"] == "IN"
    assert body["budget"]["max_searches"] == 5 and body["budget"]["max_fetches"] == 40


def test_run_ids_are_unique(client):
    ids = {client.post("/api/runs", json={"question": "q"}).json()["id"] for _ in range(5)}
    assert len(ids) == 5


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"question": ""},
        {"question": "   "},
        {"question": "q", "mode": "bogus"},
        {"question": "q", "surprise": 1},
        {"question": "q", "budget": {"not_a_limit": 1}},
        {"question": "q", "budget": {"max_searches": "many"}},
    ],
)
def test_invalid_input_rejected_without_side_effects(client, body):
    r = client.post("/api/runs", json=body)
    assert r.status_code == 422
    assert client.app.state.db.execute("SELECT COUNT(*) FROM runs").fetchone()[0] == 0


def test_persistence_failure_returns_500_and_leaves_no_run(client, monkeypatch):
    def boom(*a, **k):
        raise sqlite3.OperationalError("disk I/O error")

    monkeypatch.setattr(app_module, "append_event", boom)
    r = client.post("/api/runs", json={"question": "q"})
    assert r.status_code == 500 and r.json()["detail"] == "run could not be persisted"
    conn = client.app.state.db
    assert conn.execute("SELECT COUNT(*) FROM runs").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM events").fetchone()[0] == 0
