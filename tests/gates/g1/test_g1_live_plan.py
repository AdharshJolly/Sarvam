"""G1 (T03): the real planner returns a valid plan for all 5 golden questions.

Needs SARVAM_LLM_* credentials (environment or .env); otherwise reported as SKIPPED with a
"BLOCKED" reason, never as passed.
"""

import asyncio
import re
from pathlib import Path

import pytest

from backend.gateway.core import ToolGateway
from backend.gateway.llm import llm_from_settings
from backend.pipeline.plan import find_violations, plan_question
from contracts.config import Settings
from contracts.models import Mode, Scope

ROOT = Path(__file__).resolve().parents[3]


def golden_questions() -> list[tuple[str, str]]:
    text = (ROOT / "fixtures/questions.yaml").read_text(encoding="utf-8")
    return re.findall(r"- id: (Q\d)\n(?:\s+canonical: true\n)?\s+text: (.+)", text)


def test_golden_questions_file_has_five():
    assert [qid for qid, _ in golden_questions()] == ["Q1", "Q2", "Q3", "Q4", "Q5"]


def test_real_planner_returns_valid_plans_for_all_golden_questions():
    settings = Settings.from_env()
    if not (
        settings.llm_provider
        and settings.llm_api_key.get_secret_value()
        and settings.llm_model_strong
    ):
        pytest.skip(
            "BLOCKED: SARVAM_LLM_PROVIDER / SARVAM_LLM_API_KEY / MODEL_STRONG not configured"
        )

    async def go():
        for qid, question in golden_questions():
            gateway = ToolGateway(
                settings=settings,
                budget=settings.budget,
                mode=Mode.LIVE,
                llm=llm_from_settings(settings),
            )
            plan, metrics = await plan_question(gateway, question, Scope(), settings.budget)
            assert find_violations(plan, settings.thresholds) == [], qid
            assert metrics.latency_ms > 0 and metrics.model
            tasks = [t for d in plan.dimensions for s in d.slots for t in s.tasks]
            assert 8 <= len(tasks) <= settings.thresholds.max_initial_tasks, qid

    asyncio.run(go())
