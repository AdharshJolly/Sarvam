"""Admin portal Phase 2/3: user management, quotas, run controls, settings, audit, CSV export."""

from __future__ import annotations

import csv
import io
import json
import sqlite3
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.controller import RunHandle
from backend.store.db import SCHEMA_VERSION, init_db
from contracts.config import Settings

ADMIN = "root@sarvam.ai"


@pytest.fixture
def client(tmp_path):
    settings = Settings(db_path=tmp_path / "t.db", env="test", admin_emails=(ADMIN,))
    with TestClient(create_app(settings)) as c:
        yield c


def _reg(client, email, name="Someone"):
    r = client.post(
        "/api/auth/register",
        json={"email": email, "password": "password123", "display_name": name},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    return body["user"], {"Authorization": f"Bearer {body['token']}"}


def _run(conn, run_id, *, user_id=None, status="completed"):
    now = datetime.now(UTC).isoformat()
    conn.execute(
        "INSERT INTO runs (id, user_id, question, mode, budget_json, status, started_at)"
        " VALUES (?,?,?,?,?,?,?)",
        (run_id, user_id, f"q {run_id}", "LIVE", "{}", status, now),
    )
    conn.commit()


def _cost(conn, run_id, cost):
    conn.execute(
        "INSERT INTO events (run_id, ts, round, type, tokens, cost_usd, payload_json)"
        " VALUES (?,?,?,?,?,?,?)",
        (run_id, datetime.now(UTC).isoformat(), 0, "claim.created", 10, cost, "{}"),
    )
    conn.commit()


@pytest.fixture
def world(client):
    admin, ah = _reg(client, ADMIN, "Root")
    alice, alh = _reg(client, "alice@sarvam.ai", "Alice")
    return admin, ah, alice, alh


# ------------------------------------------------------------------ schema


def test_schema_v4_columns_and_tables(tmp_path):
    conn = init_db(tmp_path / "x.db")
    assert SCHEMA_VERSION == 4
    ucols = {c[1] for c in conn.execute("PRAGMA table_info(users)")}
    assert {"disabled", "quota_usd"} <= ucols
    assert "hidden" in {c[1] for c in conn.execute("PRAGMA table_info(runs)")}
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"settings", "admin_actions"} <= tables


def test_v3_database_migrates(tmp_path):
    path = tmp_path / "old.db"
    raw = sqlite3.connect(path)
    raw.executescript(
        "CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,"
        " display_name TEXT NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL,"
        " created_at TEXT NOT NULL, last_login_at TEXT, role TEXT NOT NULL DEFAULT 'user');"
        "CREATE TABLE runs (id TEXT PRIMARY KEY, user_id TEXT, question TEXT NOT NULL,"
        " scope_json TEXT NOT NULL DEFAULT '{}', mode TEXT NOT NULL, budget_json TEXT NOT NULL,"
        " status TEXT NOT NULL DEFAULT 'queued', stop_state TEXT, termination_reason TEXT,"
        " started_at TEXT NOT NULL, ended_at TEXT);"
        "INSERT INTO users VALUES"
        " ('u1','a@b.c','A','h','s','2026-01-01T00:00:00+00:00',NULL,'user');"
        "PRAGMA user_version=3;"
    )
    raw.commit()
    raw.close()
    conn = init_db(path)
    row = conn.execute("SELECT disabled, quota_usd FROM users WHERE id='u1'").fetchone()
    assert row["disabled"] == 0 and row["quota_usd"] is None


# ------------------------------------------------------------- user management


def test_non_admin_cannot_use_management_endpoints(client, world):
    _, _, alice, alh = world
    assert (
        client.patch(
            f"/api/admin/users/{alice['id']}", json={"role": "admin"}, headers=alh
        ).status_code
        == 403
    )
    assert client.delete(f"/api/admin/users/{alice['id']}", headers=alh).status_code == 403
    assert client.post("/api/admin/runs/x/stop", headers=alh).status_code == 403
    assert client.get("/api/admin/settings", headers=alh).status_code == 403
    assert client.put("/api/admin/settings", json={}, headers=alh).status_code == 403
    assert client.get("/api/admin/audit", headers=alh).status_code == 403
    assert client.get("/api/admin/export/runs.csv", headers=alh).status_code == 403
    assert client.patch("/api/admin/users/x", json={}).status_code == 401


def test_promote_and_demote_user(client, world):
    _, ah, alice, alh = world
    r = client.patch(f"/api/admin/users/{alice['id']}", json={"role": "admin"}, headers=ah)
    assert r.status_code == 200 and r.json()["role"] == "admin"
    assert client.get("/api/admin/overview", headers=alh).status_code == 200
    r = client.patch(f"/api/admin/users/{alice['id']}", json={"role": "user"}, headers=ah)
    assert r.json()["role"] == "user"
    assert client.get("/api/admin/overview", headers=alh).status_code == 403


def test_cannot_demote_or_disable_self_and_last_admin_is_protected(client, world):
    admin, ah, alice, _ = world
    assert (
        client.patch(
            f"/api/admin/users/{admin['id']}", json={"role": "user"}, headers=ah
        ).status_code
        == 409
    )
    assert (
        client.patch(
            f"/api/admin/users/{admin['id']}", json={"disabled": True}, headers=ah
        ).status_code
        == 409
    )
    assert client.delete(f"/api/admin/users/{admin['id']}", headers=ah).status_code == 409
    # promote alice, then alice (an admin) may not remove the only OTHER admin's protection:
    client.patch(f"/api/admin/users/{alice['id']}", json={"role": "admin"}, headers=ah)
    alice_h = {
        "Authorization": "Bearer "
        + client.post(
            "/api/auth/login", json={"email": "alice@sarvam.ai", "password": "password123"}
        ).json()["token"]
    }
    # two admins now: alice may demote root, but then alice is the last one and is protected
    assert (
        client.patch(
            f"/api/admin/users/{admin['id']}", json={"role": "user"}, headers=alice_h
        ).status_code
        == 200
    )
    assert (
        client.patch(
            f"/api/admin/users/{alice['id']}", json={"disabled": True}, headers=alice_h
        ).status_code
        == 409
    )


def test_last_enabled_admin_counts_enabled_only(client, world):
    admin, ah, alice, _ = world
    client.patch(f"/api/admin/users/{alice['id']}", json={"role": "admin"}, headers=ah)
    client.patch(f"/api/admin/users/{alice['id']}", json={"disabled": True}, headers=ah)
    # alice is a disabled admin: root is the only ENABLED admin, still protected from self-removal
    assert (
        client.patch(
            f"/api/admin/users/{admin['id']}", json={"role": "user"}, headers=ah
        ).status_code
        == 409
    )


def test_disable_blocks_login_and_kills_sessions_then_enable_restores(client, world):
    _, ah, alice, alh = world
    assert client.get("/api/auth/me", headers=alh).status_code == 200
    r = client.patch(f"/api/admin/users/{alice['id']}", json={"disabled": True}, headers=ah)
    assert r.status_code == 200 and r.json()["disabled"] is True
    assert client.get("/api/auth/me", headers=alh).status_code == 401
    bad = client.post(
        "/api/auth/login", json={"email": "alice@sarvam.ai", "password": "password123"}
    )
    assert bad.status_code == 401 and "disabled" in bad.json()["detail"].lower()
    client.patch(f"/api/admin/users/{alice['id']}", json={"disabled": False}, headers=ah)
    ok = client.post(
        "/api/auth/login", json={"email": "alice@sarvam.ai", "password": "password123"}
    )
    assert ok.status_code == 200


def test_patch_validation_and_404(client, world):
    _, ah, alice, _ = world
    assert (
        client.patch("/api/admin/users/nope", json={"role": "user"}, headers=ah).status_code == 404
    )
    assert (
        client.patch(
            f"/api/admin/users/{alice['id']}", json={"role": "root"}, headers=ah
        ).status_code
        == 422
    )
    assert (
        client.patch(
            f"/api/admin/users/{alice['id']}", json={"quota_usd": -1}, headers=ah
        ).status_code
        == 422
    )
    assert (
        client.patch(f"/api/admin/users/{alice['id']}", json={"bogus": 1}, headers=ah).status_code
        == 422
    )
    assert client.patch(f"/api/admin/users/{alice['id']}", json={}, headers=ah).status_code == 422


def test_delete_user_anonymises_runs(client, world):
    _, ah, alice, _ = world
    _run(client.app.state.db, "r1", user_id=alice["id"])
    assert client.delete(f"/api/admin/users/{alice['id']}", headers=ah).status_code == 200
    conn = client.app.state.db
    assert conn.execute("SELECT COUNT(*) FROM users WHERE id=?", (alice["id"],)).fetchone()[0] == 0
    assert conn.execute("SELECT user_id FROM runs WHERE id='r1'").fetchone()[0] is None
    assert client.delete("/api/admin/users/nope", headers=ah).status_code == 404


# ---------------------------------------------------------------------- quota


def test_quota_blocks_new_runs_when_spent(client, world):
    _, ah, alice, alh = world
    conn = client.app.state.db
    _run(conn, "r1", user_id=alice["id"])
    _cost(conn, "r1", 1.5)
    r = client.patch(f"/api/admin/users/{alice['id']}", json={"quota_usd": 1.0}, headers=ah)
    assert r.json()["quota_usd"] == 1.0
    blocked = client.post("/api/runs", json={"question": "q", "mode": "LIVE"}, headers=alh)
    assert blocked.status_code == 403 and "quota" in blocked.json()["detail"].lower()
    client.patch(f"/api/admin/users/{alice['id']}", json={"quota_usd": 10}, headers=ah)
    assert (
        client.post("/api/runs", json={"question": "q", "mode": "LIVE"}, headers=alh).status_code
        == 201
    )
    client.patch(f"/api/admin/users/{alice['id']}", json={"quota_usd": None}, headers=ah)
    users = {u["email"]: u for u in client.get("/api/admin/users", headers=ah).json()}
    assert users["alice@sarvam.ai"]["quota_usd"] is None


# ------------------------------------------------------------------ run control


def test_admin_stop_run_uses_live_handle(client, world):
    _, ah, alice, alh = world
    conn = client.app.state.db
    _run(conn, "r1", user_id=alice["id"], status="running")
    assert client.post("/api/admin/runs/r1/stop", headers=ah).status_code == 409  # no live task
    handle = RunHandle()

    class _T:
        def done(self):
            return False

    handle.task = _T()  # type: ignore[assignment]
    client.app.state.runs["r1"] = handle
    r = client.post("/api/admin/runs/r1/stop", headers=ah)
    assert r.status_code == 202 and handle.stop_event.is_set()
    _run(conn, "r2", user_id=alice["id"], status="completed")
    assert client.post("/api/admin/runs/r2/stop", headers=ah).status_code == 409
    assert client.post("/api/admin/runs/nope/stop", headers=ah).status_code == 404
    client.app.state.runs.pop("r1")  # fake task cannot be cancelled at shutdown


def test_admin_can_stop_other_users_run_via_public_endpoint_too(client, world):
    _, ah, alice, _ = world
    conn = client.app.state.db
    _run(conn, "r1", user_id=alice["id"], status="running")
    handle = RunHandle()

    class _T:
        def done(self):
            return False

    handle.task = _T()  # type: ignore[assignment]
    client.app.state.runs["r1"] = handle
    assert client.post("/api/runs/r1/stop", headers=ah).status_code == 202
    client.app.state.runs.pop("r1")


def test_hide_and_unhide_run(client, world):
    _, ah, alice, alh = world
    conn = client.app.state.db
    _run(conn, "r1", user_id=alice["id"])
    _run(conn, "r2", user_id=alice["id"])
    r = client.patch("/api/admin/runs/r1", json={"hidden": True}, headers=ah)
    assert r.status_code == 200 and r.json()["run"]["hidden"] is True
    assert {x["id"] for x in client.get("/api/runs", headers=alh).json()} == {"r2"}
    default = client.get("/api/admin/runs", headers=ah).json()
    assert {x["id"] for x in default["items"]} == {"r2"} and default["total"] == 1
    shown = client.get("/api/admin/runs?include_hidden=true", headers=ah).json()
    assert {x["id"] for x in shown["items"]} == {"r1", "r2"}
    client.patch("/api/admin/runs/r1", json={"hidden": False}, headers=ah)
    assert {x["id"] for x in client.get("/api/runs", headers=alh).json()} == {"r1", "r2"}
    assert (
        client.patch("/api/admin/runs/nope", json={"hidden": True}, headers=ah).status_code == 404
    )
    assert client.patch("/api/admin/runs/r1", json={}, headers=ah).status_code == 422


# -------------------------------------------------------------------- settings


def test_settings_default_budget_roundtrip_and_applies_to_new_runs(client, world):
    _, ah, _, alh = world
    base = client.get("/api/admin/settings", headers=ah).json()
    assert base["customized"] is False and base["default_budget"]["max_searches"] == 24
    new = {**base["default_budget"], "max_searches": 7, "max_cost_usd": 1.5}
    r = client.put("/api/admin/settings", json={"default_budget": new}, headers=ah)
    assert r.status_code == 200 and r.json()["customized"] is True
    assert (
        client.get("/api/admin/settings", headers=ah).json()["default_budget"]["max_searches"] == 7
    )
    run = client.post("/api/runs", json={"question": "q", "mode": "LIVE"}, headers=alh).json()
    assert run["budget"]["max_searches"] == 7 and run["budget"]["max_cost_usd"] == 1.5
    over = client.post(
        "/api/runs",
        json={"question": "q", "mode": "LIVE", "budget": {"max_searches": 3}},
        headers=alh,
    ).json()
    assert over["budget"]["max_searches"] == 3 and over["budget"]["max_cost_usd"] == 1.5
    reset = client.delete("/api/admin/settings", headers=ah)
    assert (
        reset.json()["customized"] is False and reset.json()["default_budget"]["max_searches"] == 24
    )


@pytest.mark.parametrize(
    "patch",
    [
        {"max_searches": 0},
        {"max_fetches": -1},
        {"max_cost_usd": 0},
        {"max_wall_seconds_soft": 700, "max_wall_seconds_hard": 600},
        {"max_followup_rounds": -1},
    ],
)
def test_settings_rejects_invalid_budget(client, world, patch):
    _, ah, _, _ = world
    base = client.get("/api/admin/settings", headers=ah).json()["default_budget"]
    r = client.put("/api/admin/settings", json={"default_budget": {**base, **patch}}, headers=ah)
    assert r.status_code == 422, r.text
    assert client.get("/api/admin/settings", headers=ah).json()["customized"] is False


# ----------------------------------------------------------------------- audit


def test_every_mutation_is_audited_and_log_is_append_only(client, world):
    admin, ah, alice, _ = world
    conn = client.app.state.db
    _run(conn, "r1", user_id=alice["id"])
    client.patch(f"/api/admin/users/{alice['id']}", json={"role": "admin"}, headers=ah)
    client.patch(f"/api/admin/users/{alice['id']}", json={"quota_usd": 5}, headers=ah)
    client.patch("/api/admin/runs/r1", json={"hidden": True}, headers=ah)
    base = client.get("/api/admin/settings", headers=ah).json()["default_budget"]
    client.put(
        "/api/admin/settings", json={"default_budget": {**base, "max_searches": 9}}, headers=ah
    )
    client.delete("/api/admin/settings", headers=ah)
    client.delete(f"/api/admin/users/{alice['id']}", headers=ah)
    # rejected actions must not be logged
    client.patch(f"/api/admin/users/{admin['id']}", json={"role": "user"}, headers=ah)

    feed = client.get("/api/admin/audit", headers=ah).json()["items"]
    actions = [a["action"] for a in feed]
    assert actions == [
        "user.delete",
        "settings.reset",
        "settings.update",
        "run.hide",
        "user.update",
        "user.update",
    ]
    assert all(a["actor_email"] == ADMIN for a in feed)
    assert feed[-1]["detail"] == {"role": "admin"}
    ids = [a["id"] for a in feed]
    assert ids == sorted(ids, reverse=True)
    newer = client.get(f"/api/admin/audit?since_id={ids[0]}", headers=ah).json()["items"]
    assert newer == []
    assert client.get("/api/admin/audit?limit=2", headers=ah).json()["items"][0]["id"] == ids[0]
    assert len(client.get("/api/admin/audit?limit=2", headers=ah).json()["items"]) == 2


# ------------------------------------------------------------------ csv export


def _rows(resp):
    return list(csv.reader(io.StringIO(resp.text)))


def test_runs_csv_export_filters_and_neutralises_formulas(client, world):
    _, ah, alice, _ = world
    conn = client.app.state.db
    _run(conn, "r1", user_id=alice["id"])
    conn.execute(
        "UPDATE runs SET question = ? WHERE id = 'r1'", ('=HYPERLINK("http://x","y"), more',)
    )
    _run(conn, "r2", user_id=None, status="failed")
    _cost(conn, "r1", 0.5)
    conn.commit()
    resp = client.get("/api/admin/export/runs.csv", headers=ah)
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert "attachment" in resp.headers["content-disposition"]
    rows = _rows(resp)
    assert rows[0][:4] == ["id", "question", "mode", "status"]
    by_id = {r[0]: r for r in rows[1:]}
    assert set(by_id) == {"r1", "r2"}
    assert by_id["r1"][1].startswith("'=")  # formula injection neutralised
    assert "password" not in resp.text.lower()
    failed = _rows(client.get("/api/admin/export/runs.csv?status=failed", headers=ah))
    assert [r[0] for r in failed[1:]] == ["r2"]


def test_costs_csv_export_has_one_row_per_day(client, world):
    _, ah, _, _ = world
    rows = _rows(client.get("/api/admin/export/costs.csv?days=7", headers=ah))
    assert rows[0] == ["date", "cost_usd", "tokens"]
    assert len(rows) == 8
    assert client.get("/api/admin/export/costs.csv?days=5", headers=ah).status_code == 422


def test_export_is_audited(client, world):
    _, ah, _, _ = world
    client.get("/api/admin/export/runs.csv", headers=ah)
    feed = client.get("/api/admin/audit", headers=ah).json()["items"]
    assert feed[0]["action"] == "export.runs"


def test_admin_user_rows_expose_new_fields(client, world):
    _, ah, alice, _ = world
    users = {u["email"]: u for u in client.get("/api/admin/users", headers=ah).json()}
    assert users["alice@sarvam.ai"]["disabled"] is False
    assert users["alice@sarvam.ai"]["quota_usd"] is None
    run_rows = client.get("/api/admin/runs", headers=ah).json()
    assert run_rows["items"] == [] or "hidden" in run_rows["items"][0]
    json.dumps(users)
