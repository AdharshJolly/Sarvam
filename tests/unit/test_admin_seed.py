"""`python -m backend.admin.seed`: create or promote the preset admin account."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend import auth
from backend.admin import seed
from backend.app import create_app
from backend.store.db import init_db
from contracts.config import Settings


def test_creates_admin_with_generated_password(tmp_path):
    conn = init_db(tmp_path / "s.db")
    result = seed.ensure_admin(conn, "admin@sarvam.local", "Sarvam Admin", None)
    assert result.created and result.password and len(result.password) >= 16
    row = conn.execute(
        "SELECT role, disabled FROM users WHERE email='admin@sarvam.local'"
    ).fetchone()
    assert row["role"] == "admin" and row["disabled"] == 0
    # no stray session token is left behind by creating the account
    assert conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 0
    user, _ = auth.login_user(conn, "admin@sarvam.local", result.password)
    assert user.role == "admin"


def test_uses_a_given_password(tmp_path):
    conn = init_db(tmp_path / "s.db")
    result = seed.ensure_admin(conn, "a@b.co", "A", "a-long-secret-1")
    assert result.password == "a-long-secret-1"
    auth.login_user(conn, "a@b.co", "a-long-secret-1")


def test_rerun_keeps_password_and_does_not_create_twice(tmp_path):
    conn = init_db(tmp_path / "s.db")
    first = seed.ensure_admin(conn, "admin@sarvam.local", "Sarvam Admin", None)
    again = seed.ensure_admin(conn, "admin@sarvam.local", "Sarvam Admin", None)
    assert first.created and not again.created and again.password is None
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
    auth.login_user(conn, "admin@sarvam.local", first.password)  # old password still works


def test_promotes_and_reenables_an_existing_account(tmp_path):
    conn = init_db(tmp_path / "s.db")
    auth.register_user(conn, "me@x.io", "password123", "Me")
    conn.execute("UPDATE users SET disabled = 1 WHERE email = 'me@x.io'")
    conn.commit()
    result = seed.ensure_admin(conn, "me@x.io", "Me", None)
    assert not result.created and result.promoted
    row = conn.execute("SELECT role, disabled FROM users WHERE email='me@x.io'").fetchone()
    assert row["role"] == "admin" and row["disabled"] == 0
    auth.login_user(conn, "me@x.io", "password123")


def test_reset_password_changes_it(tmp_path):
    conn = init_db(tmp_path / "s.db")
    seed.ensure_admin(conn, "admin@sarvam.local", "Sarvam Admin", "first-password-1")
    result = seed.ensure_admin(
        conn, "admin@sarvam.local", "Sarvam Admin", "second-password-2", reset_password=True
    )
    assert result.password == "second-password-2"
    with pytest.raises(auth.AuthError):
        auth.login_user(conn, "admin@sarvam.local", "first-password-1")
    auth.login_user(conn, "admin@sarvam.local", "second-password-2")


def test_rejects_bad_input(tmp_path):
    conn = init_db(tmp_path / "s.db")
    with pytest.raises(auth.AuthError):
        seed.ensure_admin(conn, "not-an-email", "X", None)
    with pytest.raises(auth.AuthError):
        seed.ensure_admin(conn, "a@b.co", "X", "short")


def test_seeded_admin_can_use_the_console_over_http(tmp_path):
    db = tmp_path / "s.db"
    conn = init_db(db)
    result = seed.ensure_admin(conn, "admin@sarvam.local", "Sarvam Admin", None)
    conn.close()
    with TestClient(create_app(Settings(db_path=db, env="test"))) as client:
        login = client.post(
            "/api/auth/login", json={"email": "admin@sarvam.local", "password": result.password}
        )
        assert login.status_code == 200 and login.json()["user"]["role"] == "admin"
        token = login.json()["token"]
        ok = client.get("/api/admin/overview", headers={"Authorization": f"Bearer {token}"})
        assert ok.status_code == 200
