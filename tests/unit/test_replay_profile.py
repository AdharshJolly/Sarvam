"""REPLAY applies the knobs the recordings were made with (MANIFEST.json), whatever .env says."""

from __future__ import annotations

import json
from datetime import UTC, datetime

from backend.controller import apply_replay_profile
from contracts.config import Settings
from contracts.models import Budget, Mode, Run

KNOBS = {
    "compact_json": True,
    "passages_per_slot": 5,
    "verifier_batch": 5,
    "extractor_batch": 3,
    "extractor_min_overlap": 3,
    "budget": {"max_searches": 24, "max_fetches": 40, "max_llm_calls": 150},
}


def make_run() -> Run:
    return Run(
        id="R1", question="q", mode=Mode.REPLAY, budget=Budget(), started_at=datetime.now(UTC)
    )


def test_profile_overrides_request_shaping_knobs(tmp_path):
    (tmp_path / "MANIFEST.json").write_text(json.dumps({"knobs": KNOBS}), encoding="utf-8")
    st, run = apply_replay_profile(Settings(record_dir=tmp_path), make_run())
    assert st.extractor_batch_size == 3
    assert st.thresholds.extractor_min_overlap == 3
    assert run.budget.max_llm_calls == 150


def test_without_a_manifest_settings_are_unchanged(tmp_path):
    original = Settings(record_dir=tmp_path)
    st, run = apply_replay_profile(original, make_run())
    assert st is original and run.budget == Budget()
