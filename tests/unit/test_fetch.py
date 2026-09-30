import asyncio

import httpx
import pytest

from backend.gateway import GatewayError
from backend.gateway.fetch import HttpFetcher
from backend.gateway.ssrf import DefaultSSRFGuard, DNSResolutionError
from contracts.config import SSRFPolicy
from contracts.models import FailureType

HOSTS = {
    "public.example": ["93.184.216.34"],
    "other.example": ["93.184.217.35"],
    "internal.example": ["10.0.0.1"],
}


async def resolver(host, port):
    if host not in HOSTS:
        raise DNSResolutionError(host)
    return HOSTS[host]


def fetch(handler, url, policy=None):
    policy = policy or SSRFPolicy()
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    fetcher = HttpFetcher(policy, DefaultSSRFGuard(policy, resolver), client)
    return asyncio.run(fetcher.fetch(url))


def html(body="<html><body>hi</body></html>", status=200, ctype="text/html; charset=utf-8", **h):
    return httpx.Response(status, content=body.encode(), headers={"content-type": ctype, **h})


def fails(handler, url, failure, reason, policy=None):
    with pytest.raises(GatewayError) as ei:
        fetch(handler, url, policy)
    assert ei.value.failure is failure and ei.value.message == reason


def test_success_sends_user_agent_and_returns_html():
    seen = {}

    def handler(req):
        seen["ua"] = req.headers["user-agent"]
        return html()

    res = fetch(handler, "http://public.example/a")
    assert res.status_code == 200 and res.content_type == "text/html"
    assert res.final_url == "http://public.example/a" and b"hi" in res.body
    assert seen["ua"] == SSRFPolicy().user_agent


def test_http_error_statuses_are_source_unavailable():
    fails(
        lambda r: html(status=403),
        "http://public.example/",
        FailureType.SOURCE_UNAVAILABLE,
        "http_403",
    )
    fails(
        lambda r: html(status=500),
        "http://public.example/",
        FailureType.SOURCE_UNAVAILABLE,
        "http_500",
    )


def test_non_html_is_source_empty():
    fails(
        lambda r: html(ctype="application/pdf"),
        "http://public.example/x.pdf",
        FailureType.SOURCE_EMPTY,
        "non_html",
    )


def test_oversize_body_and_declared_length_are_too_large():
    policy = SSRFPolicy(max_response_bytes=100)
    big = "x" * 500
    fails(
        lambda r: html(big),
        "http://public.example/",
        FailureType.SOURCE_UNAVAILABLE,
        "too_large",
        policy,
    )
    fails(
        lambda r: html("ok", **{"content-length": "999"}),
        "http://public.example/",
        FailureType.SOURCE_UNAVAILABLE,
        "too_large",
        policy,
    )


def test_timeout_is_typed():
    def handler(req):
        raise httpx.ReadTimeout("slow", request=req)

    fails(handler, "http://public.example/", FailureType.SOURCE_UNAVAILABLE, "timeout")


def test_total_timeout_is_enforced():
    async def slow_stream():
        await asyncio.sleep(2)
        yield b"late"

    def handler(req):
        return httpx.Response(200, headers={"content-type": "text/html"}, content=slow_stream())

    fails(
        handler,
        "http://public.example/",
        FailureType.SOURCE_UNAVAILABLE,
        "timeout",
        SSRFPolicy(timeout_seconds=0.2),
    )


def test_dns_failure_and_blocked_hosts():
    fails(lambda r: html(), "http://nope.example/", FailureType.SOURCE_UNAVAILABLE, "dns_failure")
    fails(lambda r: html(), "http://127.0.0.1/", FailureType.SOURCE_UNAVAILABLE, "ssrf_blocked")
    fails(
        lambda r: html(), "http://internal.example/", FailureType.SOURCE_UNAVAILABLE, "ssrf_blocked"
    )


def test_redirect_to_another_public_host_is_followed():
    def handler(req):
        if req.url.host == "public.example":
            return httpx.Response(301, headers={"location": "http://other.example/final"})
        return html("<html>final</html>")

    res = fetch(handler, "http://public.example/start")
    assert res.final_url == "http://other.example/final" and b"final" in res.body


@pytest.mark.parametrize(
    "target",
    ["http://internal.example/", "http://169.254.169.254/latest", "http://127.0.0.1:8080/"],
)
def test_redirect_from_public_to_private_is_refused(target):
    calls = []

    def handler(req):
        calls.append(req.url.host)
        return httpx.Response(302, headers={"location": target})

    fails(handler, "http://public.example/", FailureType.SOURCE_UNAVAILABLE, "ssrf_blocked")
    assert calls == ["public.example"]  # the private target was never requested


def test_redirect_loop_hits_the_limit():
    def handler(req):
        return httpx.Response(302, headers={"location": "http://public.example/again"})

    fails(handler, "http://public.example/", FailureType.SOURCE_UNAVAILABLE, "too_many_redirects")
