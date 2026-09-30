"""Gate G1, live variant: run the canonical question (Q1) for real and report what it cost.

Opt-in because it calls real providers for up to 10 minutes: set SARVAM_LIVE_G1=1 (plus the normal
SARVAM_* keys in the environment or .env) and run `uv run pytest tests/gates/g1/test_g1_live.py -s`.
Without that it is SKIPPED and reported as BLOCKED, never passed.
"""

import os
import re
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.pipeline.claims import quote_in_passage
from backend.store import repo
from contracts.config import Settings
from tests.support.m0 import read_events, wait_for_status

Q1 = "Should a company launch an electric scooter subscription service in Bengaluru in 2027?"


def _ready(settings: Settings) -> str | None:
    if not os.environ.get("SARVAM_LIVE_G1"):
        return "BLOCKED: live G1 run is opt-in; set SARVAM_LIVE_G1=1 (real keys, up to 10 minutes)"
    need = [
        settings.llm_provider,
        settings.llm_api_key.get_secret_value(),
        settings.llm_model_fast,
        settings.llm_model_strong,
        settings.search_provider,
        settings.search_api_key.get_secret_value(),
    ]
    return None if all(need) else "BLOCKED: SARVAM_* provider keys or models are not configured"


def test_live_q1_run_reports_latency_calls_tokens_and_cost(tmp_path):
    base = Settings.from_env()
    why = _ready(base)
    if why:
        pytest.skip(why)
    settings = base.model_copy(
        update={
            "db_path": tmp_path / "live.db",
            "artifact_dir": tmp_path / "art",
            "env": "development",
        }
    )
    with TestClient(create_app(settings)) as client:
        rid = client.post("/api/runs", json={"question": Q1}).json()["id"]
        summary = wait_for_status(client, rid, timeout=settings.budget.max_wall_seconds_hard + 120)
        events = read_events(client, rid)
        conn = client.app.state.db

        assert summary["run"]["status"] == "completed", events[-1]["payload"]
        report = client.get(f"/api/runs/{rid}/report").json()
        cited = set(re.findall(r"\[(C\d+)\]", report["markdown"]))
        for cid in cited:  # 100% of citations resolve to a passage containing the quote
            claim = repo.get_claim(conn, cid)
            assert quote_in_passage(claim.quote, repo.get_passage(conn, claim.passage_id).text).ok

        def ts(e):
            return datetime.fromisoformat(e["ts"])

        t0 = ts(events[0])
        first_source = next((ts(e) for e in events if e["type"] == "source.found"), None)
        usage = summary["usage"]
        tokens = sum(e["tokens"] or 0 for e in events)
        cost = sum(e["cost_usd"] or 0 for e in events)
        counts = {t: sum(1 for e in events if e["type"] == t) for t in {e["type"] for e in events}}
        u = usage
        first = (first_source - t0).total_seconds() if first_source else None
        print("\n=== G1 live measurement (Q1) ===")
        print(
            f"first source.found after: {first:.1f} s" if first is not None else "no source.found"
        )
        print(f"completed after: {(ts(events[-1]) - t0).total_seconds():.1f} s")
        print(f"termination_reason: {summary['run']['termination_reason']}")
        print(f"searches/fetches/llm calls: {u['searches']}/{u['fetches']}/{u['llm_calls']}")
        print(f"tokens (from events): {tokens}")
        print(f"cost: ${cost:.4f}" if cost else "cost: not reported by provider")
        stored, rejected = counts.get("claim.created", 0), counts.get("claim.rejected", 0)
        print(f"claims stored: {stored}, rejected: {rejected}")
        dropped = len(report["dropped_sentences"])
        print(f"citations in report: {len(cited)}; dropped sentences: {dropped}")
