from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from contracts import schema_export
from contracts.config import Settings
from contracts.events import Event, EventType
from contracts.models import (
    Claim,
    FinalState,
    Mode,
    Run,
    StopDecision,
    TerminationReason,
)

SSOT_EVENT_TYPES = {
    "run.started", "plan.created", "task.started", "source.found", "source.fetched",
    "source.failed", "passages.created", "claim.created", "claim.rejected", "claim.verified",
    "origin.updated", "conflict.detected", "coverage.updated", "round.started",
    "challenge.created", "challenge.outcome", "stop.decided", "report.draft", "report.verified",
    "budget.warning", "run.completed", "run.failed",
}  # fmt: skip


def test_event_types_match_ssot():
    assert {t.value for t in EventType} == SSOT_EVENT_TYPES


def test_event_envelope_validates():
    ev = Event(
        id=1,
        run_id="R1",
        ts=datetime.now(UTC),
        round=0,
        type=EventType.RUN_STARTED,
        payload={"question": "q"},
    )
    assert set(ev.model_dump()) == {
        "id", "run_id", "ts", "round", "type", "step_ms", "tokens", "cost_usd", "payload",
    }  # fmt: skip


def test_event_rejects_unknown_type_and_extra_fields():
    with pytest.raises(ValidationError):
        Event(id=1, run_id="R1", ts=datetime.now(UTC), type="not.a.type")
    with pytest.raises(ValidationError):
        Event(id=1, run_id="R1", ts=datetime.now(UTC), type="run.started", surprise=1)


def test_run_and_claim_validate():
    run = Run(id="R1", question="q", mode=Mode.LIVE, started_at=datetime.now(UTC))
    assert run.budget.max_searches == 24
    claim = Claim(id="C1", run_id="R1", slot_id="D1S1", text="t", quote="q", passage_id="P1")
    assert claim.quote_verified is False


def test_claim_requires_quote_and_passage():
    with pytest.raises(ValidationError):
        Claim(id="C1", run_id="R1", slot_id="D1S1", text="t")  # type: ignore[call-arg]


def test_stop_decision_matches_appendix_b():
    sd = StopDecision.model_validate(
        {
            "state": "SUFFICIENT_WITH_CAVEATS",
            "termination_reason": "max_rounds",
            "critical_slots": {"green": 4, "amber": 1, "red": 0},
            "open_conflicts": 1,
            "challenge_rounds_completed": 2,
            "caveats": ["Regulation slot rests on a single origin"],
        }
    )
    assert sd.state is FinalState.SUFFICIENT_WITH_CAVEATS
    assert sd.termination_reason is TerminationReason.MAX_ROUNDS


def test_settings_defaults_match_ssot_budget():
    s = Settings.from_env({})
    assert (s.budget.max_searches, s.budget.max_fetches, s.budget.max_llm_calls) == (24, 40, 250)
    assert s.budget.max_cost_usd == 3.00
    assert s.ssrf.max_redirects == 3 and s.ssrf.max_response_bytes == 3 * 1024 * 1024


def test_settings_env_override_and_secret_not_leaked():
    s = Settings.from_env({"SARVAM_MAX_SEARCHES": "5", "SARVAM_LLM_API_KEY": "sk-secret"})
    assert s.budget.max_searches == 5
    assert "sk-secret" not in repr(s)


def test_generated_schema_is_current():
    """Committed contracts/generated/schema.json must match the Pydantic models."""
    assert schema_export.SCHEMA_PATH.read_text(encoding="utf-8") == schema_export.render()


def test_read_env_file_and_precedence(tmp_path, monkeypatch):
    from contracts.config import read_env_file

    f = tmp_path / ".env"
    f.write_text(
        "# c\nSARVAM_MODE=replay   # inline\nSARVAM_LLM_API_KEY=abc\nSARVAM_MAX_SEARCHES=7\n",
        encoding="utf-8",
    )
    assert read_env_file(f) == {
        "SARVAM_MODE": "replay",
        "SARVAM_LLM_API_KEY": "abc",
        "SARVAM_MAX_SEARCHES": "7",
    }
    assert read_env_file(tmp_path / "missing.env") == {}
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("SARVAM_MAX_SEARCHES", "9")  # real environment beats .env
    s = Settings.from_env()
    assert s.mode == "replay" and s.budget.max_searches == 9
    assert s.llm_api_key.get_secret_value() == "abc"


def test_invalid_config_fails_clearly_without_leaking_secrets():
    with pytest.raises(ValueError):
        Settings.from_env({"SARVAM_MAX_SEARCHES": "lots", "SARVAM_LLM_API_KEY": "sk-secret"})
    with pytest.raises(ValidationError) as ei:
        Settings.from_env({"SARVAM_MODE": "sideways", "SARVAM_LLM_API_KEY": "sk-secret"})
    assert "sk-secret" not in str(ei.value)
