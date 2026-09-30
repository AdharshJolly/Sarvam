"""Offline fakes for the three gateway providers: the whole backend is testable with these."""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from typing import Any

from pydantic import BaseModel

from backend.gateway import CallMetrics, GatewayError
from backend.gateway.fetch import FetchResult
from backend.gateway.llm import LLMCompletion
from backend.gateway.search import SearchHit


class FakeSearch:
    """Scripted hits per query. A value may be a list of hits or an Exception to raise."""

    def __init__(
        self,
        script: dict[str, list[SearchHit] | Exception] | None = None,
        default: list[SearchHit] | None = None,
        name: str = "fake-search",
    ) -> None:
        self.name = name
        self.script = script or {}
        self.default = default or []
        self.calls: list[str] = []

    async def search(self, query: str, *, max_results: int = 8) -> list[SearchHit]:
        self.calls.append(query)
        out = self.script.get(query, self.default)
        if isinstance(out, Exception):
            raise out
        return list(out)[:max_results]


class FakeFetcher:
    """Scripted FetchResult or GatewayError per URL; unknown URLs are SOURCE_UNAVAILABLE."""

    def __init__(self, script: dict[str, FetchResult | Exception] | None = None) -> None:
        self.script = script or {}
        self.calls: list[str] = []

    async def fetch(self, url: str) -> FetchResult:
        self.calls.append(url)
        out = self.script.get(url)
        if out is None:
            from contracts.models import FailureType

            raise GatewayError(FailureType.SOURCE_UNAVAILABLE, "http_404")
        if isinstance(out, Exception):
            raise out
        return out


def html_result(url: str, html: str, final_url: str | None = None) -> FetchResult:
    return FetchResult(
        url=url,
        final_url=final_url or url,
        status_code=200,
        content_type="text/html",
        body=html.encode("utf-8"),
        encoding="utf-8",
    )


Scripted = str | dict | BaseModel | Exception | Callable[[list[dict[str, str]]], str]


class FakeLLM:
    """Scripted responses per prompt id (parsed from the system message). Each list is consumed in
    order; the last entry repeats. Records every call."""

    def __init__(
        self,
        script: dict[str, list[Scripted] | Scripted],
        *,
        tokens: int | None = 10,
        cost_usd: float | None = None,
        provider: str = "fake-llm",
    ) -> None:
        self.script = {k: v if isinstance(v, list) else [v] for k, v in script.items()}
        self.tokens = tokens
        self.cost_usd = cost_usd
        self.provider = provider
        self.calls: list[dict[str, Any]] = []
        self._index: dict[str, int] = {}

    async def complete(
        self,
        model: str,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.0,
        max_tokens: int | None = None,
    ) -> LLMCompletion:
        match = re.search(r"Prompt id: ([\w.\-]+)\.", messages[0]["content"])
        prompt_id = match.group(1) if match else "?"
        self.calls.append(
            {"prompt_id": prompt_id, "model": model, "messages": messages, "temp": temperature}
        )
        items = self.script.get(prompt_id)
        if not items:
            raise AssertionError(f"FakeLLM has no script for prompt {prompt_id!r}")
        i = self._index.get(prompt_id, 0)
        self._index[prompt_id] = i + 1
        item = items[min(i, len(items) - 1)]
        if isinstance(item, Exception):
            raise item
        if callable(item):
            text = item(messages)
        elif isinstance(item, BaseModel):
            text = item.model_dump_json()
        elif isinstance(item, dict):
            text = json.dumps(item)
        else:
            text = item
        metrics = CallMetrics(
            "llm", self.provider, model, 5, tokens=self.tokens, cost_usd=self.cost_usd
        )
        return LLMCompletion(text, metrics)
