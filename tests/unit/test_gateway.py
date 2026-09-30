import asyncio
import json

import httpx
import pytest

from backend.gateway import CallMetrics, GatewayError
from backend.gateway.llm import OpenAICompatLLM, llm_from_settings
from backend.gateway.search import (
    ExaSearch,
    TavilySearch,
    search_fallback_from_settings,
    search_from_settings,
)
from contracts.config import Settings
from contracts.models import FailureType

KEY = "sk-super-secret-key"


def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _search(handler, sink=None):
    return TavilySearch(KEY, client=_client(handler), on_call=sink)


def test_search_parses_hits_and_records_latency():
    seen: list[CallMetrics] = []

    def handler(req: httpx.Request) -> httpx.Response:
        assert req.headers["authorization"] == f"Bearer {KEY}"
        assert json.loads(req.content)["query"] == "ev scooters"
        results = [
            {"url": "https://a.example", "title": "A", "content": "snip", "raw_content": "full"},
            {"url": "https://b.example", "title": "B", "content": "s2", "raw_content": None},
        ]
        return httpx.Response(200, json={"results": results})

    hits = asyncio.run(_search(handler, seen.append).search("ev scooters"))
    assert [h.url for h in hits] == ["https://a.example", "https://b.example"]
    assert hits[0].cleaned_text == "full" and hits[1].cleaned_text is None
    assert len(seen) == 1 and seen[0].kind == "search" and seen[0].latency_ms >= 0


@pytest.mark.parametrize(
    ("status", "failure"),
    [(429, FailureType.RATE_LIMITED), (401, FailureType.BLOCKED), (500, FailureType.STEP_FAILED)],
)
def test_search_errors_are_typed_and_do_not_leak_key(status, failure):
    with pytest.raises(GatewayError) as ei:
        asyncio.run(_search(lambda r: httpx.Response(status)).search("q"))
    assert ei.value.failure is failure and KEY not in str(ei.value)


def test_search_timeout_and_bad_payload_are_typed():
    def timeout(req):
        raise httpx.ConnectTimeout("slow", request=req)

    with pytest.raises(GatewayError) as ei:
        asyncio.run(_search(timeout).search("q"))
    assert ei.value.failure is FailureType.STEP_FAILED and KEY not in str(ei.value)
    with pytest.raises(GatewayError) as ei:
        asyncio.run(_search(lambda r: httpx.Response(200, json={"nope": 1})).search("q"))
    assert ei.value.failure is FailureType.STEP_FAILED


def _llm(handler, sink=None):
    return OpenAICompatLLM("openai", KEY, client=_client(handler), on_call=sink)


def test_llm_returns_text_and_records_tokens_cost_latency():
    seen: list[CallMetrics] = []

    def handler(req: httpx.Request) -> httpx.Response:
        assert str(req.url) == "https://api.openai.com/v1/chat/completions"
        assert json.loads(req.content)["model"] == "m-fast"
        body = {
            "model": "m-fast-2026",
            "choices": [{"message": {"content": "pong"}}],
            "usage": {"total_tokens": 12, "cost": 0.0003},
        }
        return httpx.Response(200, json=body)

    llm = _llm(handler, seen.append)
    out = asyncio.run(llm.complete("m-fast", [{"role": "user", "content": "ping"}]))
    assert out.text == "pong" and seen == [out.metrics]
    m = out.metrics
    assert (m.kind, m.provider, m.model, m.tokens, m.cost_usd) == (
        "llm",
        "openai",
        "m-fast-2026",
        12,
        0.0003,
    )
    assert m.latency_ms >= 0


def test_llm_cost_is_none_when_provider_does_not_report_it():
    resp = {"choices": [{"message": {"content": "x"}}], "usage": {"total_tokens": 3}}
    out = asyncio.run(_llm(lambda r: httpx.Response(200, json=resp)).complete("m", []))
    assert out.metrics.tokens == 3 and out.metrics.cost_usd is None


@pytest.mark.parametrize(
    ("status", "failure"),
    [(429, FailureType.RATE_LIMITED), (403, FailureType.BLOCKED), (502, FailureType.STEP_FAILED)],
)
def test_llm_errors_are_typed_and_do_not_leak_key(status, failure):
    with pytest.raises(GatewayError) as ei:
        asyncio.run(_llm(lambda r: httpx.Response(status)).complete("m", []))
    assert ei.value.failure is failure and KEY not in str(ei.value)


def test_provider_configuration():
    s = Settings.from_env({})
    with pytest.raises(GatewayError) as ei:
        search_from_settings(s)
    assert ei.value.failure is FailureType.BLOCKED
    with pytest.raises(GatewayError):
        llm_from_settings(s)  # no key
    with pytest.raises(GatewayError):
        OpenAICompatLLM("mystery", KEY)  # unknown provider name
    ok = Settings.from_env(
        {
            "SARVAM_SEARCH_PROVIDER": "tavily",
            "SARVAM_SEARCH_API_KEY": KEY,
            "SARVAM_LLM_PROVIDER": "https://llm.example/v1/",
            "SARVAM_LLM_API_KEY": KEY,
        }
    )
    assert isinstance(search_from_settings(ok), TavilySearch)
    assert llm_from_settings(ok)._base == "https://llm.example/v1"


def test_exa_parses_hits_and_uses_api_key_header():
    seen: list[CallMetrics] = []

    def handler(req: httpx.Request) -> httpx.Response:
        assert req.headers["x-api-key"] == KEY
        body = json.loads(req.content)
        assert body["query"] == "q" and body["numResults"] == 3
        results = [
            {"url": "https://a.example", "title": "A", "text": "full text"},
            {"url": "https://b.example", "title": None, "text": None},
        ]
        return httpx.Response(200, json={"results": results})

    exa = ExaSearch(KEY, client=_client(handler), on_call=seen.append)
    hits = asyncio.run(exa.search("q", max_results=3))
    assert hits[0].cleaned_text == "full text" and hits[1].cleaned_text is None
    assert hits[1].title == "" and seen[0].provider == "exa"


@pytest.mark.parametrize(
    ("status", "failure"),
    [(429, FailureType.RATE_LIMITED), (401, FailureType.BLOCKED), (500, FailureType.STEP_FAILED)],
)
def test_exa_errors_are_typed_and_do_not_leak_key(status, failure):
    exa = ExaSearch(KEY, client=_client(lambda r: httpx.Response(status)))
    with pytest.raises(GatewayError) as ei:
        asyncio.run(exa.search("q"))
    assert ei.value.failure is failure and KEY not in str(ei.value)


def test_search_fallback_configuration():
    assert search_fallback_from_settings(Settings.from_env({})) is None
    with pytest.raises(GatewayError):
        search_fallback_from_settings(Settings.from_env({"SARVAM_SEARCH_FALLBACK_PROVIDER": "exa"}))
    ok = Settings.from_env(
        {"SARVAM_SEARCH_FALLBACK_PROVIDER": "exa", "SARVAM_SEARCH_FALLBACK_API_KEY": KEY}
    )
    assert isinstance(search_fallback_from_settings(ok), ExaSearch)
    with pytest.raises(GatewayError):
        search_fallback_from_settings(
            Settings.from_env(
                {"SARVAM_SEARCH_FALLBACK_PROVIDER": "nope", "SARVAM_SEARCH_FALLBACK_API_KEY": KEY}
            )
        )


def test_retry_hint_is_read_from_header_or_google_style_body():
    from backend.gateway import http_failure

    def failure(response):
        exc = httpx.HTTPStatusError(
            "x", request=httpx.Request("POST", "https://x"), response=response
        )
        return http_failure("gemini", exc)

    assert failure(httpx.Response(429, headers={"retry-after": "7"})).retry_after == 7.0
    body = {"error": {"status": "RESOURCE_EXHAUSTED", "details": [{"retryDelay": "23.5s"}]}}
    assert failure(httpx.Response(429, json=body)).retry_after == 23.5
    plain = failure(httpx.Response(429, text="slow down"))
    assert plain.failure is FailureType.RATE_LIMITED and plain.retry_after is None
