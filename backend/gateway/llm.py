"""LLM interface (SSOT section 10). Task T02.

Every call is gateway.llm(role, prompt_id, schema, payload): validated against a schema, retried
up to 2 times with the validation error appended, then a typed STEP_FAILED. Retrieved text is
wrapped in <source> tags and labelled untrusted.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any, Protocol, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class LLMRole(StrEnum):
    PLANNER = "planner"
    EXTRACTOR = "extractor"
    VERIFIER = "verifier"
    CHALLENGER = "challenger"
    WRITER = "writer"
    EXPLAINER = "explainer"


class LLMTier(StrEnum):
    FAST = "fast"
    STRONG = "strong"


class LLMClient(Protocol):
    async def call(
        self, role: LLMRole, prompt_id: str, schema: type[T], payload: dict[str, Any]
    ) -> T: ...
