import importlib

from fastapi.testclient import TestClient

from backend.app import create_app
from contracts.config import Settings


def test_backend_modules_import():
    for mod in (
        "backend.controller", "backend.gateway", "backend.gateway.search", "backend.gateway.fetch",
        "backend.gateway.llm", "backend.gateway.record_replay", "backend.gateway.ssrf",
        "backend.pipeline.plan", "backend.intel.stop", "backend.synth.writer",
    ):  # fmt: skip
        importlib.import_module(mod)


def test_app_boots_and_health_ok(tmp_path):
    settings = Settings(db_path=tmp_path / "t.db", env="test")
    with TestClient(create_app(settings)) as client:
        r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["service"] == "sarvam"
    assert body["db_journal_mode"] == "wal"


def test_cors_allows_dev_frontend(tmp_path):
    settings = Settings(db_path=tmp_path / "t.db", env="test")
    with TestClient(create_app(settings)) as client:
        r = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"
