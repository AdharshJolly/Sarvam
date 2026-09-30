import asyncio
import json

from backend.controller import RunHandle, run_research
from backend.gateway import GatewayError
from backend.store import repo
from backend.store.db import init_db
from backend.store.events import read_events
from contracts.config import Settings
from contracts.events import EventType
from contracts.models import Budget, FailureType
from tests.support.m0 import extractor, scenario_deps


class Env:
    def __init__(self, tmp_path, budget=None):
        self.settings = Settings(
            env="test",
            db_path=tmp_path / "t.db",
            artifact_dir=tmp_path / "art",
            llm_model_fast="fast-m",
            llm_model_strong="strong-m",
        )
        self.conn = init_db(self.settings.db_path)
        b = budget or Budget()
        self.conn.execute(
            "INSERT INTO runs (id, question, mode, budget_json, status, started_at)"
            " VALUES ('R1','Should we launch X?','LIVE',?,'queued','2026-01-01T00:00:00+00:00')",
            (b.model_dump_json(),),
        )
        self.conn.commit()

    def run(self, deps, handle=None):
        asyncio.run(run_research("R1", settings=self.settings, deps=deps, handle=handle))
        run = repo.get_run(self.conn, "R1")
        events = list(read_events(self.conn, "R1"))
        return run, events, repo.build_report_view(self.conn, "R1")


def phases(events):
    return [e.payload["phase"] for e in events if e.type is EventType.PHASE_ENTERED]


def test_full_run_completes_cleanly(tmp_path):
    run, events, report = Env(tmp_path).run(scenario_deps())
    # the challenge round finds nothing new (same pages), so coverage does not improve
    assert run.status == "completed" and run.termination_reason == "no_marginal_gain"
    round_stages = ["DISCOVER", "ACQUIRE", "EXTRACT", "CLAIMS", "VERIFY", "ANALYZE"]
    assert phases(events) == [
        "PLAN",
        *round_stages,
        "CHALLENGE",
        *round_stages,
        "STOP_POLICY",
        "SYNTHESIZE",
    ]
    assert report.citations and events[-1].type is EventType.RUN_COMPLETED


def test_stop_request_takes_the_wrap_up_path(tmp_path):
    handle = RunHandle()
    handle.stop_event.set()
    run, events, report = Env(tmp_path).run(scenario_deps(), handle)
    assert run.status == "completed" and run.termination_reason == "user_stopped"
    assert phases(events) == ["PLAN", "ANALYZE", "STOP_POLICY", "SYNTHESIZE"]  # gaps still scored
    assert (
        "Wrap-up (user_stopped)"
        in [e for e in events if e.type is EventType.PHASE_ENTERED][-1].payload["reason"]
    )
    assert report is not None and "no findings" in report.markdown


def test_soft_time_limit_takes_the_wrap_up_path(tmp_path):
    env = Env(tmp_path, Budget(max_wall_seconds_soft=0))
    run, events, report = env.run(scenario_deps())
    assert run.termination_reason == "timeout"
    assert phases(events) == ["PLAN", "ANALYZE", "STOP_POLICY", "SYNTHESIZE"]
    assert report is not None and events[-1].payload["termination_reason"] == "timeout"


def test_llm_call_budget_exhaustion_wraps_up_and_still_reports(tmp_path):
    # planner uses 1 call; the extractor exhausts the rest; the writer falls back to evidence only
    env = Env(tmp_path, Budget(max_llm_calls=3))
    run, events, report = env.run(scenario_deps())
    assert run.termination_reason == "budget" and phases(events)[-1] == "SYNTHESIZE"
    assert report is not None and events[-1].type is EventType.RUN_COMPLETED


def test_provider_outage_after_planning_wraps_up_with_blocked(tmp_path):
    outage = GatewayError(FailureType.BLOCKED, "provider outage")

    deps = scenario_deps(llm_script={"extractor.v1": outage})
    run, events, report = Env(tmp_path).run(deps)
    assert run.status == "completed" and run.termination_reason == "blocked"
    assert phases(events)[-1] == "SYNTHESIZE" and report is not None


def test_extractor_step_failures_do_not_stop_the_run(tmp_path):
    deps = scenario_deps(llm_script={"extractor.v1": GatewayError(FailureType.STEP_FAILED, "bad")})
    run, events, report = Env(tmp_path).run(deps)
    assert run.status == "completed" and run.termination_reason == "no_marginal_gain"
    assert any(e.type is EventType.BUDGET_WARNING for e in events)  # repeated failures warn
    assert "no findings" in report.markdown


def test_zero_claims_is_a_valid_report_not_a_crash(tmp_path):
    deps = scenario_deps(llm_script={"extractor.v1": json.dumps({"claims": []})})
    run, events, report = Env(tmp_path).run(deps)
    assert run.status == "completed" and report.citations == []
    assert "no findings" in report.markdown and "No sources are cited" in report.markdown


def test_writer_failure_still_produces_a_cited_evidence_only_report(tmp_path):
    deps = scenario_deps(llm_script={"writer.v1": GatewayError(FailureType.STEP_FAILED, "bad")})
    run, events, report = Env(tmp_path).run(deps)
    assert run.status == "completed" and report.citations
    assert "could not be written" in report.markdown
    assert "Narrative writer unavailable" in report.markdown


def test_planner_failure_is_an_unrecoverable_typed_failure(tmp_path):
    deps = scenario_deps(llm_script={"planner.v1": "junk"})
    run, events, report = Env(tmp_path).run(deps)
    assert run.status == "failed" and report is None
    assert events[-1].type is EventType.RUN_FAILED
    assert events[-1].payload["failure"] == "STEP_FAILED"


SOURCE_BLOCK = (
    '\n\n<source id="P1" untrusted="true">\n'
    "Monthly plans start at Rs. 1,299 for a basic scooter today\n"
    "</source>"
)


def test_extractor_helper_used_by_scenarios_produces_one_bad_quote_per_call():
    msg = [
        {"role": "system", "content": "x"},
        {
            "role": "user",
            "content": json.dumps({"slot": {"id": "D1S1"}, "allowed_attributes": []})
            + SOURCE_BLOCK,
        },
    ]
    claims = json.loads(extractor(msg))["claims"]
    assert len(claims) == 2 and claims[0]["quote"] != claims[1]["quote"]


def types(events):
    return [e.type for e in events]


def test_full_run_verifies_then_clusters_then_scores_before_writing(tmp_path):
    run, events, report = Env(tmp_path).run(scenario_deps())
    t = types(events)
    order = [
        EventType.CLAIM_CREATED,
        EventType.CLAIM_VERIFIED,
        EventType.ORIGIN_UPDATED,
        EventType.COVERAGE_UPDATED,
        EventType.REPORT_DRAFT,
    ]
    firsts = [t.index(x) for x in order]
    assert firsts == sorted(firsts)
    cov = next(e for e in events if e.type is EventType.COVERAGE_UPDATED)
    assert len(cov.payload["cells"]) == 8 and len(cov.payload["rollups"]) == 4
    # every cited claim was judged by the independent verifier first (FR-18)
    verified = {e.payload["claim_id"] for e in events if e.type is EventType.CLAIM_VERIFIED}
    assert verified and {c.claim_id for c in report.citations} <= verified


def test_wrap_up_scores_coverage_from_the_evidence_in_hand_without_any_llm_call(tmp_path):
    handle = RunHandle()
    handle.stop_event.set()
    deps = scenario_deps()
    run, events, _ = Env(tmp_path).run(deps, handle)
    cov = [e for e in events if e.type is EventType.COVERAGE_UPDATED]
    assert len(cov) == 1 and {c["state"] for c in cov[0].payload["cells"]} == {"RED"}
    assert all(c["reason"].startswith("No supporting evidence") for c in cov[0].payload["cells"])
    assert [c["prompt_id"] for c in deps.llm.calls] == ["planner.v1"]  # nothing after the plan


def test_a_provider_outage_in_the_verifier_wraps_up_and_cites_nothing_unjudged(tmp_path):
    outage = GatewayError(FailureType.BLOCKED, "provider outage")
    run, events, report = Env(tmp_path).run(scenario_deps(llm_script={"verifier.v1": outage}))
    assert run.status == "completed" and run.termination_reason == "blocked"
    assert report.citations == [] and "no findings" in report.markdown
    assert phases(events)[-4:] == ["VERIFY", "ANALYZE", "STOP_POLICY", "SYNTHESIZE"]


def test_verifier_step_failures_leave_claims_unjudged_visibly_and_uncited(tmp_path):
    bad = GatewayError(FailureType.STEP_FAILED, "bad")
    run, events, report = Env(tmp_path).run(scenario_deps(llm_script={"verifier.v1": bad}))
    assert run.status == "completed" and run.termination_reason == "no_marginal_gain"
    warn = [e for e in events if e.type is EventType.BUDGET_WARNING]
    assert any(e.payload["limit"] == "verifier_unverified_claims" for e in warn)
    assert report.citations == []
