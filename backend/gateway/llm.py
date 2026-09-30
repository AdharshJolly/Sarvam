"""LLM interface (SSOT section 10). Task T02.

Every call is gateway.llm(role, prompt_id, schema, payload): validated against a schema, retried
up to 2 times with the validation error appended, then a typed STEP_FAILED. Retrieved text is
wrapped in <source> tags and labelled untrusted.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Protocol, TypeVar

import httpx
from pydantic import BaseModel

from backend.gateway import CallMetrics, GatewayError, MetricsSink, http_failure
from contracts.config import Settings
from contracts.models import FailureType

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


# Known OpenAI-compatible endpoints; SARVAM_LLM_PROVIDER may also be a full http(s) base URL.
PROVIDER_BASE_URLS = {
    "openai": "https://api.openai.com/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "groq": "https://api.groq.com/openai/v1",
}


@dataclass(frozen=True)
class LLMCompletion:
    text: str
    metrics: CallMetrics


class OpenAICompatLLM:
    """Minimal OpenAI-compatible chat client. Role, prompt and schema handling is T02."""

    def __init__(
        self,
        provider: str,
        api_key: str,
        *,
        client: httpx.AsyncClient | None = None,
        on_call: MetricsSink | None = None,
        timeout: float = 60.0,
    ) -> None:
        base = provider if provider.startswith(("http://", "https://")) else None
        base = base or PROVIDER_BASE_URLS.get(provider)
        if base is None:
            raise GatewayError(FailureType.BLOCKED, f"unsupported SARVAM_LLM_PROVIDER {provider!r}")
        self.provider = provider
        self._base = base.rstrip("/")
        self._api_key = api_key
        self._client = client
        self._on_call = on_call
        self._timeout = timeout

    async def complete(
        self,
        model: str,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.0,
        max_tokens: int | None = None,
    ) -> LLMCompletion:
        body: dict[str, Any] = {"model": model, "messages": messages, "temperature": temperature}
        if max_tokens is not None:
            body["max_tokens"] = max_tokens
        headers = {"Authorization": f"Bearer {self._api_key}"}
        start = time.perf_counter()
        try:
            client = self._client or httpx.AsyncClient(timeout=self._timeout)
            try:
                resp = await client.post(
                    f"{self._base}/chat/completions", json=body, headers=headers
                )
                resp.raise_for_status()
                data = resp.json()
            finally:
                if self._client is None:
                    await client.aclose()
            text = data["choices"][0]["message"]["content"] or ""
            usage = data.get("usage") or {}
        except httpx.HTTPError as exc:
            raise http_failure(self.provider, exc) from exc
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise GatewayError(
                FailureType.STEP_FAILED, f"{self.provider} returned an unparseable response"
            ) from exc
        cost = usage.get("cost")  # reported by some providers (e.g. OpenRouter)
        metrics = CallMetrics(
            "llm",
            self.provider,
            data.get("model", model),
            int((time.perf_counter() - start) * 1000),
            tokens=usage.get("total_tokens"),
            cost_usd=float(cost) if cost is not None else None,
        )
        if self._on_call:
            self._on_call(metrics)
        return LLMCompletion(text, metrics)


def llm_from_settings(settings: Settings, *, on_call: MetricsSink | None = None) -> OpenAICompatLLM:
    key = settings.llm_api_key.get_secret_value()
    if not key:
        raise GatewayError(FailureType.BLOCKED, "SARVAM_LLM_API_KEY is not set")
    return OpenAICompatLLM(settings.llm_provider, key, on_call=on_call)
