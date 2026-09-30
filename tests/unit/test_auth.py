"""Unit tests for user registration, authentication, sessions, and protected routes."""

from fastapi.testclient import TestClient

from backend.app import create_app
from backend.store.db import init_db
from contracts.config import Settings


def test_auth_registration_and_login(tmp_path):
    settings = Settings(db_path=str(tmp_path / "test.db"), env="test")
    app = create_app(settings)
    with TestClient(app) as client:
        # 1. Register new user
        reg_resp = client.post(
            "/api/auth/register",
            json={
                "email": "researcher@sarvam.ai",
                "password": "securepassword123",
                "display_name": "Dr. Research",
            },
        )
        assert reg_resp.status_code == 201, reg_resp.text
        data = reg_resp.json()
        token = data["token"]
        assert token
        assert data["user"]["email"] == "researcher@sarvam.ai"
        assert data["user"]["display_name"] == "Dr. Research"

        # 2. Prevent duplicate email registration
        dup_resp = client.post(
            "/api/auth/register",
            json={
                "email": "researcher@sarvam.ai",
                "password": "anotherpassword",
                "display_name": "Clone",
            },
        )
        assert dup_resp.status_code == 400

        # 3. Access /api/auth/me with Bearer token
        me_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_resp.status_code == 200
        assert me_resp.json()["email"] == "researcher@sarvam.ai"

        # 4. Access /api/auth/me without token fails with 401
        anon_resp = client.get("/api/auth/me")
        assert anon_resp.status_code == 401

        # 5. Login with invalid password fails with 401
        bad_login = client.post(
            "/api/auth/login",
            json={"email": "researcher@sarvam.ai", "password": "wrongpassword"},
        )
        assert bad_login.status_code == 401

        # 6. Login with correct password succeeds
        login_resp = client.post(
            "/api/auth/login",
            json={"email": "researcher@sarvam.ai", "password": "securepassword123"},
        )
        assert login_resp.status_code == 200
        new_token = login_resp.json()["token"]
        assert new_token

        # 7. Create a run with authenticated user
        run_resp = client.post(
            "/api/runs",
            json={"question": "What is the impact of HBM3e on semiconductor packaging?", "mode": "LIVE"},
            headers={"Authorization": f"Bearer {new_token}"},
        )
        assert run_resp.status_code == 201
        run_data = run_resp.json()
        assert run_data["user_id"] == data["user"]["id"]

        # 8. List runs includes the newly created run
        runs_list_resp = client.get("/api/runs", headers={"Authorization": f"Bearer {new_token}"})
        assert runs_list_resp.status_code == 200
        run_ids = [r["id"] for r in runs_list_resp.json()]
        assert run_data["id"] in run_ids

        # 9. Logout invalidates token
        logout_resp = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {new_token}"})
        assert logout_resp.status_code == 200
        post_logout_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_token}"})
        assert post_logout_me.status_code == 401

        # 10. Login again and update profile details
        rel_resp = client.post(
            "/api/auth/login",
            json={"email": "researcher@sarvam.ai", "password": "securepassword123"},
        )
        assert rel_resp.status_code == 200
        active_token = rel_resp.json()["token"]

        patch_resp = client.patch(
            "/api/auth/me",
            json={"display_name": "Senior Investigator", "password": "newpassword456"},
            headers={"Authorization": f"Bearer {active_token}"},
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["display_name"] == "Senior Investigator"

        # Verify old password fails, new password succeeds
        fail_old = client.post(
            "/api/auth/login",
            json={"email": "researcher@sarvam.ai", "password": "securepassword123"},
        )
        assert fail_old.status_code == 401

        succ_new = client.post(
            "/api/auth/login",
            json={"email": "researcher@sarvam.ai", "password": "newpassword456"},
        )
        assert succ_new.status_code == 200
        del_token = succ_new.json()["token"]

        # 11. Delete account and purge data
        del_resp = client.delete(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {del_token}"},
        )
        assert del_resp.status_code == 200
        assert del_resp.json()["ok"] is True

        # After deletion, accessing /me fails and login fails
        post_del_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {del_token}"})
        assert post_del_me.status_code == 401

        post_del_login = client.post(
            "/api/auth/login",
            json={"email": "researcher@sarvam.ai", "password": "newpassword456"},
        )
        assert post_del_login.status_code == 401

