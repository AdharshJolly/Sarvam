import sqlite3

import pytest

from backend.store.db import SCHEMA_VERSION, SchemaVersionError, init_db
from backend.store.events import append_event, read_events
from contracts.events import EventType

EXPECTED_TABLES = {
    "runs", "dimensions", "slots", "tasks", "sources", "passages", "claims", "evidence_links",
    "origins", "conflicts", "coverage", "challenges", "reports", "events",
}  # fmt: skip


def _run(conn, run_id="R1"):
    conn.execute(
        "INSERT INTO runs (id, question, mode, budget_json, started_at) VALUES (?, ?, ?, ?, ?)",
        (run_id, "q", "LIVE", "{}", "2026-01-01T00:00:00+00:00"),
    )
    conn.commit()


def test_init_creates_ssot_tables_wal_and_fk(tmp_path):
    conn = init_db(tmp_path / "t.db")
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert EXPECTED_TABLES <= tables
    assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    assert conn.execute("PRAGMA user_version").fetchone()[0] == SCHEMA_VERSION


def test_init_is_idempotent(tmp_path):
    init_db(tmp_path / "t.db").close()
    init_db(tmp_path / "t.db").close()


def test_wrong_schema_version_fails_loudly(tmp_path):
    path = tmp_path / "t.db"
    init_db(path).close()
    raw = sqlite3.connect(path)
    raw.execute("PRAGMA user_version=99")
    raw.close()
    with pytest.raises(SchemaVersionError):
        init_db(path)


def test_foreign_keys_enforced(tmp_path):
    conn = init_db(tmp_path / "t.db")
    with pytest.raises(sqlite3.IntegrityError):
        append_event(conn, "missing-run", EventType.RUN_STARTED)


def test_append_and_read_events_with_resume(tmp_path):
    conn = init_db(tmp_path / "t.db")
    _run(conn)
    e1 = append_event(conn, "R1", EventType.RUN_STARTED, payload={"a": 1})
    e2 = append_event(conn, "R1", EventType.PLAN_CREATED, round=0, step_ms=12)
    assert e2.id > e1.id
    assert [e.type for e in read_events(conn, "R1")] == [
        EventType.RUN_STARTED,
        EventType.PLAN_CREATED,
    ]
    assert [e.id for e in read_events(conn, "R1", after_id=e1.id)] == [e2.id]
    assert next(read_events(conn, "R1")).payload == {"a": 1}
