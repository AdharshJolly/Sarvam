"""Gate G0 (SSOT 13.3): repo boots; POST /api/runs creates a run row and event; gateway reaches the
search provider and the LLM with real keys; cost and latency logged; contracts and fixtures
committed and frozen.

Real-provider tests need SARVAM_* credentials (environment or .env). Without them they are
reported as SKIPPED with a "BLOCKED" reason (run `pytest tests/gates/g0 -rs`); they never pass
without a real call.
"""

import asyncio
import json
import re
import subprocess
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.gateway import CallMetrics
from backend.gateway.llm import OpenAICompatLLM, llm_from_settings
from backend.gateway.search import search_from_settings
from backend.store.events import append_event, read_events
from contracts import schema_export
from contracts.config import Settings
from contracts.events import EventType

ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(Settings(db_path=tmp_path / "g0.db", env="test"))) as c:
        yield c


# --- 1. repository boots ---
def test_g0_repo_boots(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok" and body["db_journal_mode"] == "wal"


def test_g0_env_example_documents_every_setting():
    names = set(
        re.findall(
            r"^(?:#\s*)?((?:SARVAM|VITE)_[A-Z_]+)=", (ROOT / ".env.example").read_text(), re.M
        )
    )
    required = {
        "SARVAM_LLM_API_KEY", "SARVAM_SEARCH_API_KEY", "SARVAM_LLM_PROVIDER",
        "SARVAM_SEARCH_PROVIDER", "SARVAM_LLM_MODEL_FAST", "SARVAM_LLM_MODEL_STRONG",
        "SARVAM_DB_PATH", "SARVAM_MAX_SEARCHES", "SARVAM_MAX_FETCHES", "SARVAM_MAX_LLM_CALLS",
        "SARVAM_MAX_COST_USD", "SARVAM_MAX_WALL_SECONDS_SOFT", "SARVAM_MAX_WALL_SECONDS_HARD",
        "SARVAM_MAX_FOLLOWUP_ROUNDS", "SARVAM_FETCH_CONCURRENCY", "SARVAM_LLM_CONCURRENCY",
    }  # fmt: skip
    assert required <= names


# --- 2. POST /api/runs creates a run row and the run.started event ---
def test_g0_post_runs_creates_row_and_run_started(client):
    r = client.post("/api/runs", json={"question": "G0 acceptance question"})
    assert r.status_code == 201
    run_id = r.json()["id"]
    conn = client.app.state.db
    assert conn.execute("SELECT COUNT(*) FROM runs WHERE id=?", (run_id,)).fetchone()[0] == 1
    assert [e.type for e in read_events(conn, run_id)] == [EventType.RUN_STARTED]


# --- 3. cost and latency are captured and fit the event envelope ---
def test_g0_call_metrics_map_onto_event_envelope(client):
    def handler(req):
        body = {
            "choices": [{"message": {"content": "pong"}}],
            "usage": {"total_tokens": 9, "cost": 0.001},
        }
        return httpx.Response(200, json=body)

    seen: list[CallMetrics] = []
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    llm = OpenAICompatLLM("openai", "k", client=http, on_call=seen.append)
    asyncio.run(llm.complete("m", [{"role": "user", "content": "ping"}]))
    m = seen[0]
    assert m.latency_ms >= 0 and m.tokens == 9 and m.cost_usd == 0.001
    run_id = client.post("/api/runs", json={"question": "q"}).json()["id"]
    conn = client.app.state.db
    ev = append_event(
        conn,
        run_id,
        EventType.PHASE_ENTERED,
        payload={"phase": "PLAN", "reason": "metrics envelope check"},
        step_ms=m.latency_ms,
        tokens=m.tokens,
        cost_usd=m.cost_usd,
    )
    stored = [e for e in read_events(conn, run_id, after_id=ev.id - 1)][0]
    assert (stored.step_ms, stored.tokens, stored.cost_usd) == (m.latency_ms, 9, 0.001)


# --- 4. real provider connectivity (environment-blocked without keys) ---
def _live_settings() -> Settings:
    return Settings.from_env()


def test_g0_real_search_provider():
    s = _live_settings()
    if not (s.search_provider and s.search_api_key.get_secret_value()):
        pytest.skip("BLOCKED: SARVAM_SEARCH_PROVIDER / SARVAM_SEARCH_API_KEY not configured")
    seen: list[CallMetrics] = []
    hits = asyncio.run(
        search_from_settings(s, on_call=seen.append).search("electric scooter India")
    )
    assert hits and all(h.url.startswith("http") for h in hits)
    assert len(seen) == 1 and seen[0].latency_ms > 0


def test_g0_real_llm_provider():
    s = _live_settings()
    if not (s.llm_provider and s.llm_api_key.get_secret_value() and s.llm_model_fast):
        pytest.skip("BLOCKED: SARVAM_LLM_PROVIDER / SARVAM_LLM_API_KEY / MODEL_FAST not configured")
    seen: list[CallMetrics] = []
    llm = llm_from_settings(s, on_call=seen.append)
    out = asyncio.run(
        llm.complete(
            s.llm_model_fast, [{"role": "user", "content": "Reply with: pong"}], max_tokens=256
        )
    )
    assert out.text.strip()
    assert seen[0].latency_ms > 0 and seen[0].model
    assert seen[0].tokens is None or seen[0].tokens > 0


# --- 5. contracts frozen ---
def test_g0_contracts_frozen():
    assert schema_export.SCHEMA_PATH.read_text(encoding="utf-8") == schema_export.render()
    schema = json.loads(schema_export.SCHEMA_PATH.read_text(encoding="utf-8"))
    types_ts = (ROOT / "contracts/generated/types.ts").read_text(encoding="utf-8")
    missing = [n for n in schema["$defs"] if not re.search(rf"\b(interface|type) {n}\b", types_ts)]
    assert not missing, f"types.ts is stale for: {missing}; run `make contracts`"


# --- 6. fixtures folder committed and frozen ---
def test_g0_fixtures_folder_committed():
    tracked = subprocess.run(
        ["git", "ls-files", "fixtures", "cache/recorded"], cwd=ROOT, capture_output=True, text=True
    ).stdout.split()
    assert "fixtures/questions.yaml" in tracked
    # T08 replaced the placeholders with the real corpus and its expected results (SSOT 16.2)
    corpus = [f"fixtures/corpus/F{i:02d}.html" for i in range(1, 15)]
    expected = [
        f"fixtures/expected/{n}.json"
        for n in ("plan", "claims", "sources", "origins", "conflicts", "coverage")
    ]
    assert set(corpus + expected + ["fixtures/corpus/manifest.json"]) <= set(tracked)
    # cache/ is local-only: recordings are never tracked and no placeholder is needed
    assert not [t for t in tracked if t.startswith("cache/")]
    ignored = subprocess.run(
        ["git", "check-ignore", "-q", "cache/recorded/fetch-0000000000000000.json"], cwd=ROOT
    )
    assert ignored.returncode == 0, "cache/ must be git-ignored"
    text = (ROOT / "fixtures/questions.yaml").read_text(encoding="utf-8")
    assert len(re.findall(r"^\s+- id: Q\d", text, re.M)) == 5  # SSOT 16.4: five golden questions


def test_g0_recorder_creates_missing_record_dir(tmp_path):
    from backend.gateway.record_replay import RecordMode, RecordReplay

    target = tmp_path / "fresh" / "recorded"  # a fresh checkout has no cache/recorded
    RecordReplay(target, RecordMode.RECORD)._write(target / "x.json", {"ok": True})
    assert (target / "x.json").exists()


# --- 7. secrets ---
def test_g0_no_hardcoded_secrets_in_tracked_files():
    files = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True
    ).stdout.split()
    pattern = re.compile(
        r"sk-[A-Za-z0-9]{20,}|tvly-[A-Za-z0-9]{16,}|api[_-]?key\s*=\s*[\"'][A-Za-z0-9]{20,}"
    )
    offenders = []
    for f in files:
        if f.endswith((".docx", ".lock", ".png", ".ico")) or f.startswith("tests/"):
            continue
        try:
            text = (ROOT / f).read_text(encoding="utf-8")
        except (UnicodeDecodeError, FileNotFoundError):
            continue
        if pattern.search(text):
            offenders.append(f)
    assert not offenders, offenders
    assert ".env" not in files
