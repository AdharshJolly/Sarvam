"""Admin portal API (ADR B-36): role gate, aggregations, and the Phase 0 run-visibility fixes."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.store.db import SCHEMA_VERSION, init_db
from contracts.config import Settings

ADMIN_EMAIL = "root@sarvam.ai"


@pytest.fixture
def client(tmp_path):
    settings = Settings(
        db_path=tmp_path / "t.db",
        env="test",
        admin_emails=(ADMIN_EMAIL,),
    )
    with TestClient(create_app(settings)) as c:
        yield c


def _register(client, email, name="Someone"):
    r = client.post(
        "/api/auth/register",
        json={"email": email, "password": "password123", "display_name": name},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    return body["user"], {"Authorization": f"Bearer {body['token']}"}


def _seed_run(
    conn,
    run_id,
    *,
    user_id=None,
    mode="LIVE",
    status="completed",
    stop_state=None,
    reason=None,
    started=None,
):
    started = started or datetime.now(UTC)
    conn.execute(
        "INSERT INTO runs (id, user_id, question, mode, budget_json, status, stop_state,"
        " termination_reason, started_at, ended_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (
            run_id,
            user_id,
            f"question {run_id}",
            mode,
            "{}",
            status,
            stop_state,
            reason,
            started.isoformat(),
            started.isoformat(),
        ),
    )


def _seed_event(conn, run_id, type_, *, cost=None, tokens=None, ts=None, payload=None):
    ts = ts or datetime.now(UTC)
    conn.execute(
        "INSERT INTO events (run_id, ts, round, type, tokens, cost_usd, payload_json)"
        " VALUES (?,?,?,?,?,?,?)",
        (run_id, ts.isoformat(), 0, type_, tokens, cost, json.dumps(payload or {})),
    )


# ------------------------------------------------------------------ role gate


ADMIN_PATHS = [
    "/api/admin/overview",
    "/api/admin/runs",
    "/api/admin/runs/r1",
    "/api/admin/users",
    "/api/admin/costs",
    "/api/admin/activity",
    "/api/admin/health",
]


@pytest.mark.parametrize("path", ADMIN_PATHS)
def test_admin_routes_reject_anonymous(client, path):
    assert client.get(path).status_code == 401


@pytest.mark.parametrize("path", ADMIN_PATHS)
def test_admin_routes_reject_non_admin(client, path):
    _, headers = _register(client, "plain@sarvam.ai")
    assert client.get(path, headers=headers).status_code == 403


def test_admin_email_is_promoted_on_register_and_login(client):
    user, headers = _register(client, ADMIN_EMAIL.upper())  # case-insensitive match
    assert user["role"] == "admin"
    assert client.get("/api/auth/me", headers=headers).json()["role"] == "admin"
    assert client.get("/api/admin/overview", headers=headers).status_code == 200
    login = client.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": "password123"})
    assert login.json()["user"]["role"] == "admin"


def test_regular_users_default_to_user_role(client):
    user, _ = _register(client, "plain@sarvam.ai")
    assert user["role"] == "user"


def test_schema_version_and_role_column(tmp_path):
    conn = init_db(tmp_path / "x.db")
    assert SCHEMA_VERSION == 4
    cols = [c[1] for c in conn.execute("PRAGMA table_info(users)").fetchall()]
    assert "role" in cols


def test_v2_database_is_migrated_with_role_column(tmp_path):
    import sqlite3

    path = tmp_path / "old.db"
    raw = sqlite3.connect(path)
    raw.executescript(
        "CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,"
        " display_name TEXT NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL,"
        " created_at TEXT NOT NULL, last_login_at TEXT);"
        "INSERT INTO users VALUES ('u1','a@b.c','A','h','s','2026-01-01T00:00:00+00:00',NULL);"
        "PRAGMA user_version=2;"
    )
    raw.commit()
    raw.close()
    conn = init_db(path)
    assert conn.execute("SELECT role FROM users WHERE id='u1'").fetchone()[0] == "user"


# ------------------------------------------------------------ Phase 0 fixes


def test_anonymous_run_list_hides_owned_runs(client):
    conn = client.app.state.db
    user, _ = _register(client, "owner@sarvam.ai")
    _seed_run(conn, "owned", user_id=user["id"])
    _seed_run(conn, "shared", user_id=None)
    conn.commit()
    ids = {r["id"] for r in client.get("/api/runs").json()}
    assert ids == {"shared"}


def test_stop_run_requires_ownership(client):
    conn = client.app.state.db
    owner, _ = _register(client, "owner@sarvam.ai")
    _, other_headers = _register(client, "other@sarvam.ai")
    _seed_run(conn, "r_owned", user_id=owner["id"], status="running")
    conn.commit()
    assert client.post("/api/runs/r_owned/stop").status_code == 403
    assert client.post("/api/runs/r_owned/stop", headers=other_headers).status_code == 403


# -------------------------------------------------------------- aggregations


@pytest.fixture
def seeded(client):
    conn = client.app.state.db
    user, _ = _register(client, "alice@sarvam.ai", "Alice")
    _, admin_headers = _register(client, ADMIN_EMAIL, "Root")
    now = datetime.now(UTC)
    _seed_run(
        conn,
        "r1",
        user_id=user["id"],
        status="completed",
        stop_state="SUFFICIENT",
        reason="criteria_met",
        started=now,
    )
    _seed_run(
        conn,
        "r2",
        user_id=user["id"],
        mode="REPLAY",
        status="completed",
        stop_state="INSUFFICIENT",
        reason="budget",
        started=now - timedelta(days=2),
    )
    _seed_run(conn, "r3", user_id=None, status="failed", started=now - timedelta(days=40))
    _seed_event(conn, "r1", "claim.created", cost=0.25, tokens=100, ts=now)
    _seed_event(conn, "r1", "claim.verified", cost=0.75, tokens=300, ts=now)
    _seed_event(conn, "r2", "claim.created", cost=1.0, tokens=50, ts=now - timedelta(days=2))
    _seed_event(
        conn,
        "r3",
        "run.failed",
        ts=now - timedelta(days=40),
        payload={"failure": "STEP_FAILED", "message": "boom"},
    )
    conn.commit()
    return admin_headers, user


def test_overview_counts_and_totals(client, seeded):
    headers, _ = seeded
    body = client.get("/api/admin/overview", headers=headers).json()
    assert body["users"] == 2 and body["admins"] == 1
    assert body["runs"] == 3
    assert body["runs_by_status"] == {"completed": 2, "failed": 1}
    assert body["runs_by_mode"] == {"LIVE": 2, "REPLAY": 1}
    assert body["stop_states"] == {"SUFFICIENT": 1, "INSUFFICIENT": 1}
    assert body["total_cost_usd"] == pytest.approx(2.0)
    assert body["total_tokens"] == 450
    assert body["insufficient_runs"] == 1


def test_runs_list_filters_and_cost(client, seeded):
    headers, user = seeded
    rows = client.get("/api/admin/runs", headers=headers).json()
    assert rows["total"] == 3
    by_id = {r["id"]: r for r in rows["items"]}
    assert by_id["r1"]["cost_usd"] == pytest.approx(1.0)
    assert by_id["r1"]["user_email"] == "alice@sarvam.ai"
    assert by_id["r3"]["user_email"] is None
    live = client.get("/api/admin/runs?mode=REPLAY", headers=headers).json()
    assert [r["id"] for r in live["items"]] == ["r2"]
    failed = client.get("/api/admin/runs?status=failed", headers=headers).json()
    assert [r["id"] for r in failed["items"]] == ["r3"]
    mine = client.get(f"/api/admin/runs?user_id={user['id']}", headers=headers).json()
    assert mine["total"] == 2
    page = client.get("/api/admin/runs?limit=1&offset=1", headers=headers).json()
    assert page["total"] == 3 and len(page["items"]) == 1
    assert client.get("/api/admin/runs?limit=0", headers=headers).status_code == 422


def test_run_detail_and_404(client, seeded):
    headers, _ = seeded
    detail = client.get("/api/admin/runs/r1", headers=headers).json()
    assert detail["run"]["id"] == "r1"
    assert detail["cost_usd"] == pytest.approx(1.0)
    assert detail["event_count"] == 2
    assert set(detail["claims_by_status"]) == set()
    assert client.get("/api/admin/runs/nope", headers=headers).status_code == 404


def test_users_list_never_leaks_secrets(client, seeded):
    headers, user = seeded
    raw = client.get("/api/admin/users", headers=headers)
    text = raw.text
    assert "password_hash" not in text and "salt" not in text and "token" not in text
    by_email = {u["email"]: u for u in raw.json()}
    assert by_email["alice@sarvam.ai"]["run_count"] == 2
    assert by_email["alice@sarvam.ai"]["cost_usd"] == pytest.approx(2.0)
    assert by_email[ADMIN_EMAIL]["role"] == "admin"


def test_costs_honours_days_and_groups_by_event_type(client, seeded):
    headers, _ = seeded
    seven = client.get("/api/admin/costs?days=7", headers=headers).json()
    assert seven["days"] == 7
    assert seven["total_cost_usd"] == pytest.approx(2.0)
    assert len(seven["daily"]) == 7
    by_type = {t["type"]: t for t in seven["by_event_type"]}
    assert by_type["claim.created"]["cost_usd"] == pytest.approx(1.25)
    assert by_type["claim.verified"]["tokens"] == 300
    assert client.get("/api/admin/costs?days=5", headers=headers).status_code == 422


def test_activity_feed_is_paginated_by_since_id(client, seeded):
    headers, _ = seeded
    feed = client.get("/api/admin/activity?limit=2", headers=headers).json()
    assert len(feed["items"]) == 2
    ids = [e["id"] for e in feed["items"]]
    assert ids == sorted(ids, reverse=True)  # newest first
    newer = client.get(f"/api/admin/activity?since_id={ids[0]}", headers=headers).json()
    assert newer["items"] == []
    typed = client.get("/api/admin/activity?type=run.failed", headers=headers).json()
    assert [e["type"] for e in typed["items"]] == ["run.failed"]


def test_health_reports_db_and_failures(client, seeded):
    headers, _ = seeded
    body = client.get("/api/admin/health", headers=headers).json()
    assert body["db_ok"] is True
    assert body["db_foreign_keys"] is True
    assert body["db_journal_mode"] in ("wal", "memory")
    assert body["schema_version"] == SCHEMA_VERSION
    assert body["failures"] == {"STEP_FAILED": 1}
    assert body["mode"] in ("live", "replay")
    assert body["status"] in ("healthy", "degraded")
