"""Search provider interface (SSOT 6.2: one primary provider, one optional fallback). Task T02."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Protocol

import httpx

from backend.gateway import CallMetrics, GatewayError, MetricsSink, http_failure
from contracts.config import Settings
from contracts.models import FailureType


@dataclass(frozen=True)
class SearchHit:
    url: str
    title: str
    snippet: str = ""
    cleaned_text: str | None = (
        None  # provider-supplied text, used as extraction fallback (SOURCE_EMPTY)
    )


class SearchProvider(Protocol):
    name: str

    async def search(self, query: str, *, max_results: int = 8) -> list[SearchHit]: ...


class TavilySearch:
    """Tavily search provider (returns cleaned page text, the SSOT extraction fallback)."""

    name = "tavily"
    url = "https://api.tavily.com/search"

    def __init__(
        self,
        api_key: str,
        *,
        client: httpx.AsyncClient | None = None,
        on_call: MetricsSink | None = None,
        timeout: float = 20.0,
    ) -> None:
        self._api_key = api_key
        self._client = client
        self._on_call = on_call
        self._timeout = timeout

    async def search(self, query: str, *, max_results: int = 8) -> list[SearchHit]:
        payload = {"query": query, "max_results": max_results, "include_raw_content": True}
        headers = {"Authorization": f"Bearer {self._api_key}"}
        start = time.perf_counter()
        try:
            client = self._client or httpx.AsyncClient(timeout=self._timeout)
            try:
                resp = await client.post(self.url, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
            finally:
                if self._client is None:
                    await client.aclose()
            hits = [
                SearchHit(
                    url=r["url"],
                    title=r.get("title", ""),
                    snippet=r.get("content", ""),
                    cleaned_text=r.get("raw_content") or None,
                )
                for r in data["results"]
            ]
        except httpx.HTTPError as exc:
            raise http_failure(self.name, exc) from exc
        except (ValueError, KeyError, TypeError) as exc:
            raise GatewayError(
                FailureType.STEP_FAILED, f"{self.name} returned an unparseable response"
            ) from exc
        if self._on_call:
            latency = int((time.perf_counter() - start) * 1000)
            self._on_call(CallMetrics("search", self.name, None, latency))
        return hits


def search_from_settings(settings: Settings, *, on_call: MetricsSink | None = None) -> TavilySearch:
    if settings.search_provider != "tavily":
        raise GatewayError(
            FailureType.BLOCKED,
            f"unsupported or unset SARVAM_SEARCH_PROVIDER {settings.search_provider!r}",
        )
    key = settings.search_api_key.get_secret_value()
    if not key:
        raise GatewayError(FailureType.BLOCKED, "SARVAM_SEARCH_API_KEY is not set")
    return TavilySearch(key, on_call=on_call)
