"""Gate G1 (SSOT 13.3, offline and deterministic): a question goes in through POST /api/runs and
comes out as a plan, sources, passages, quote-verified claims and a report whose citations all
resolve to stored passages, streamed as events.

The live variant lives in test_g1_live.py (skipped, reported as BLOCKED, without credentials).
"""

import re

from fastapi.testclient import TestClient

from backend.app import create_app
from backend.pipeline.claims import quote_in_passage
from backend.store import repo
from contracts.config import Settings
from contracts.models import ReportView, RunState
from tests.support.m0 import read_events, runner_for, scenario_deps, wait_for_status


def settings(tmp_path) -> Settings:
    return Settings(
        env="test",
        db_path=tmp_path / "g1.db",
        artifact_dir=tmp_path / "art",
        llm_model_fast="fast-m",
        llm_model_strong="strong-m",
    )


def test_g1_end_to_end_pipeline_with_resolving_citations(tmp_path):
    deps = scenario_deps()
    with TestClient(create_app(settings(tmp_path), runner=runner_for(deps))) as client:
        q = "Should a company launch an electric scooter subscription service in Bengaluru in 2027?"
        rid = client.post("/api/runs", json={"question": q}).json()["id"]
        summary = wait_for_status(client, rid)
        events = read_events(client, rid)
        conn = client.app.state.db

        # 1. event order: the documented lifecycle, ending in a report and run.completed
        types = [e["type"] for e in events]
        assert types[:3] == ["run.started", "phase.entered", "plan.created"]
        phases = [e["payload"]["phase"] for e in events if e["type"] == "phase.entered"]
        # round 0 walks PLAN to ANALYZE; the follow-up round (T14) and the stop policy come after
        assert phases[:7] == [
            "PLAN",
            "DISCOVER",
            "ACQUIRE",
            "EXTRACT",
            "CLAIMS",
            "VERIFY",
            "ANALYZE",
        ]
        assert phases[-1] == "SYNTHESIZE"
        order = [
            "plan.created",
            "task.started",
            "source.found",
            "source.fetched",
            "passages.created",
            "claim.created",
            "report.draft",
            "report.verified",
            "run.completed",
        ]
        firsts = [types.index(t) for t in order]
        assert firsts == sorted(firsts), dict(zip(order, firsts, strict=True))
        assert types[-1] == "run.completed" and "run.failed" not in types
        assert all(e["payload"].get("reason") for e in events if e["type"] == "phase.entered")

        # 2. sources carry a type and an authority tier
        state = RunState.model_validate(client.get(f"/api/runs/{rid}/state").json())
        assert len(state.sources) == 4 and all(s.status == "fetched" for s in state.sources)
        assert {s.authority_tier for s in state.sources} == {1, 2, 3}
        assert {s.source_type.value for s in state.sources} >= {"company_primary", "news", "blog"}

        # 3. every stored claim is quote-verified against its own stored passage (metric: 100%)
        assert state.claims and all(c.quote_verified for c in state.claims)
        for claim in state.claims:
            passage = repo.get_passage(conn, claim.passage_id)
            assert quote_in_passage(claim.quote, passage.text).ok
        rejected = [e for e in events if e["type"] == "claim.rejected"]
        assert rejected and all(e["payload"]["failure"] == "CLAIM_REJECTED" for e in rejected)
        assert {e["payload"]["reason"] for e in rejected} == {"quote_not_in_passage"}

        # 4. 100% of [Cn] resolve claim -> passage -> a passage that contains the quote
        report = ReportView.model_validate(client.get(f"/api/runs/{rid}/report").json())
        cited = set(re.findall(r"\[(C\d+)\]", report.markdown))
        assert cited and cited <= {c.id for c in state.claims}
        for cid in cited:
            claim = repo.get_claim(conn, cid)
            assert quote_in_passage(claim.quote, repo.get_passage(conn, claim.passage_id).text).ok
        assert {c.claim_id for c in report.citations} == cited
        assert all(c.url.startswith("https://") and c.passage_id for c in report.citations)

        # 5. the writer's uncited sentence and invented citation were dropped, not shipped
        assert sorted(report.dropped_sentences) == ["An invented citation.", "An uncited sentence."]
        assert "C9999" not in report.markdown and "uncited sentence" not in report.markdown
        assert "## Sources index" in report.markdown and "| S" in report.markdown
        assert "**Assurance state: " in report.markdown  # from the stop decision (T14)

        # 6. run summary
        assert summary["run"]["status"] == "completed"
        assert summary["run"]["termination_reason"] == "no_marginal_gain"
        assert summary["phase"] == "SYNTHESIZE"


def test_g1_low_budget_run_wraps_up_with_a_report_and_never_exceeds_a_limit(tmp_path):
    deps = scenario_deps()
    with TestClient(create_app(settings(tmp_path), runner=runner_for(deps))) as client:
        body = {"question": "q", "budget": {"max_searches": 2, "max_fetches": 2}}
        rid = client.post("/api/runs", json=body).json()["id"]
        summary = wait_for_status(client, rid)
        events = read_events(client, rid)
        assert summary["run"]["status"] == "completed"
        assert summary["run"]["termination_reason"] == "budget"
        assert summary["usage"]["searches"] <= 2 and summary["usage"]["fetches"] <= 2
        phases = [e["payload"]["phase"] for e in events if e["type"] == "phase.entered"]
        assert phases[0] == "PLAN" and phases[-1] == "SYNTHESIZE"
        assert "ACQUIRE" not in phases  # wrap-up skipped the remaining stages
        synth = [e for e in events if e["type"] == "phase.entered"][-1]
        assert "Wrap-up (budget)" in synth["payload"]["reason"]
        report = client.get(f"/api/runs/{rid}/report").json()
        assert "Run ended early: budget" in report["markdown"]
        assert events[-1]["type"] == "run.completed"
        assert events[-1]["payload"]["termination_reason"] == "budget"
