import asyncio
import json

from backend.controller import RunHandle, run_m0
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
        asyncio.run(run_m0("R1", settings=self.settings, deps=deps, handle=handle))
        run = repo.get_run(self.conn, "R1")
        events = list(read_events(self.conn, "R1"))
        return run, events, repo.build_report_view(self.conn, "R1")


def phases(events):
    return [e.payload["phase"] for e in events if e.type is EventType.PHASE_ENTERED]


def test_full_run_completes_cleanly(tmp_path):
    run, events, report = Env(tmp_path).run(scenario_deps())
    assert run.status == "completed" and run.termination_reason is None
    assert phases(events) == ["PLAN", "DISCOVER", "ACQUIRE", "EXTRACT", "CLAIMS", "SYNTHESIZE"]
    assert report.citations and events[-1].type is EventType.RUN_COMPLETED


def test_stop_request_takes_the_wrap_up_path(tmp_path):
    handle = RunHandle()
    handle.stop_event.set()
    run, events, report = Env(tmp_path).run(scenario_deps(), handle)
    assert run.status == "completed" and run.termination_reason == "user_stopped"
    assert phases(events) == ["PLAN", "SYNTHESIZE"]
    assert (
        "Wrap-up (user_stopped)"
        in [e for e in events if e.type is EventType.PHASE_ENTERED][-1].payload["reason"]
    )
    assert report is not None and "no findings" in report.markdown


def test_soft_time_limit_takes_the_wrap_up_path(tmp_path):
    env = Env(tmp_path, Budget(max_wall_seconds_soft=0))
    run, events, report = env.run(scenario_deps())
    assert run.termination_reason == "timeout" and phases(events) == ["PLAN", "SYNTHESIZE"]
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
    assert run.status == "completed" and run.termination_reason is None
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
