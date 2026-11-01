import importlib

from fastapi.testclient import TestClient
from pydantic import SecretStr

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


def _health(tmp_path, **overrides):
    settings = Settings(db_path=tmp_path / "t.db", env="test", **overrides)
    with TestClient(create_app(settings)) as client:
        return client.get("/api/health").json()


def test_health_reports_live_unavailable_without_provider_keys(tmp_path):
    body = _health(tmp_path, mode="replay")
    assert body["live_available"] is False
    assert body["default_mode"] == "REPLAY"


def test_health_needs_both_llm_and_search_keys_for_live(tmp_path):
    only_llm = _health(tmp_path, llm_api_key=SecretStr("k"), search_provider="tavily")
    assert only_llm["live_available"] is False
    both = _health(
        tmp_path,
        llm_api_key=SecretStr("k"),
        search_api_key=SecretStr("s"),
        search_provider="tavily",
        mode="live",
    )
    assert both["live_available"] is True
    assert both["default_mode"] == "LIVE"


def test_health_never_offers_live_as_default_when_unavailable(tmp_path):
    # mode=live but no keys: a LIVE run would fail BLOCKED, so the form should start on REPLAY.
    assert _health(tmp_path, mode="live")["default_mode"] == "REPLAY"


def test_cors_allows_dev_frontend(tmp_path):
    settings = Settings(db_path=tmp_path / "t.db", env="test")
    with TestClient(create_app(settings)) as client:
        r = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"
