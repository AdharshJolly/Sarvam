"""GET /api/auth/me/usage: a normal account can see its own runs, spend and quota."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from contracts.config import Settings


@pytest.fixture
def client(tmp_path):
    settings = Settings(db_path=tmp_path / "t.db", env="test", admin_emails=("root@sarvam.ai",))
    with TestClient(create_app(settings)) as c:
        yield c


def _reg(client, email):
    r = client.post(
        "/api/auth/register",
        json={"email": email, "password": "password123", "display_name": "Someone"},
    )
    body = r.json()
    return body["user"], {"Authorization": f"Bearer {body['token']}"}


def _run(conn, run_id, user_id, cost=0.0, hidden=0):
    now = datetime.now(UTC).isoformat()
    conn.execute(
        "INSERT INTO runs (id, user_id, question, mode, budget_json, status, started_at, hidden)"
        " VALUES (?,?,?,?,?,?,?,?)",
        (run_id, user_id, "q", "LIVE", "{}", "completed", now, hidden),
    )
    conn.execute(
        "INSERT INTO events (run_id, ts, round, type, tokens, cost_usd, payload_json)"
        " VALUES (?,?,?,?,?,?,?)",
        (run_id, now, 0, "claim.created", 1, cost, "{}"),
    )
    conn.commit()


def test_usage_requires_authentication(client):
    assert client.get("/api/auth/me/usage").status_code == 401


def test_usage_for_a_new_account_is_empty_and_unlimited(client):
    _, headers = _reg(client, "new@sarvam.ai")
    body = client.get("/api/auth/me/usage", headers=headers).json()
    assert body == {"run_count": 0, "cost_usd": 0.0, "quota_usd": None, "remaining_usd": None}


def test_usage_counts_only_my_runs_and_reports_quota_left(client):
    me, headers = _reg(client, "me@sarvam.ai")
    other, _ = _reg(client, "other@sarvam.ai")
    conn = client.app.state.db
    _run(conn, "r1", me["id"], 0.75)
    _run(conn, "r2", me["id"], 0.25, hidden=1)  # hidden runs still count: the money was spent
    _run(conn, "r3", other["id"], 9.0)
    conn.execute("UPDATE users SET quota_usd = 3 WHERE id = ?", (me["id"],))
    conn.commit()
    body = client.get("/api/auth/me/usage", headers=headers).json()
    assert body["run_count"] == 2
    assert body["cost_usd"] == pytest.approx(1.0)
    assert body["quota_usd"] == 3
    assert body["remaining_usd"] == pytest.approx(2.0)


def test_remaining_never_goes_negative(client):
    me, headers = _reg(client, "me@sarvam.ai")
    conn = client.app.state.db
    _run(conn, "r1", me["id"], 5.0)
    conn.execute("UPDATE users SET quota_usd = 2 WHERE id = ?", (me["id"],))
    conn.commit()
    assert client.get("/api/auth/me/usage", headers=headers).json()["remaining_usd"] == 0


def test_profile_update_and_delete_work_cross_origin(client):
    """The browser sends a CORS preflight for PATCH/DELETE; both must be allowed."""
    for method in ("PATCH", "DELETE"):
        r = client.options(
            "/api/auth/me",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": method,
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )
        assert r.status_code == 200, (method, r.text)
        assert method in r.headers["access-control-allow-methods"]
