"""Fetch (SSOT FR-06, section 17). HTML only in the MVP; every hop goes through the SSRF guard."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import urljoin

import httpx

from backend.gateway import GatewayError
from backend.gateway.ssrf import DNSResolutionError, SSRFBlocked, SSRFGuard
from contracts.config import SSRFPolicy
from contracts.models import FailureType

REDIRECT_CODES = {301, 302, 303, 307, 308}


@dataclass(frozen=True)
class FetchResult:
    url: str
    final_url: str
    status_code: int
    content_type: str
    body: bytes
    encoding: str = "utf-8"

    def text(self) -> str:
        try:
            return self.body.decode(self.encoding, errors="replace")
        except LookupError:
            return self.body.decode("utf-8", errors="replace")


class Fetcher(Protocol):
    async def fetch(self, url: str) -> FetchResult:
        """Fetch under timeout, size, redirect and SSRF limits; raise a typed GatewayError."""
        ...


def _unavailable(reason: str) -> GatewayError:
    return GatewayError(FailureType.SOURCE_UNAVAILABLE, reason)


class HttpFetcher:
    """httpx-based fetcher. Reasons: http_<code>, timeout, too_many_redirects, ssrf_blocked,
    too_large, dns_failure, connection_error (SOURCE_UNAVAILABLE) and non_html (SOURCE_EMPTY)."""

    def __init__(
        self,
        policy: SSRFPolicy,
        guard: SSRFGuard,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._policy = policy
        self._guard = guard
        self._client = client

    async def fetch(self, url: str) -> FetchResult:
        client = self._client or httpx.AsyncClient(follow_redirects=False)
        try:
            async with asyncio.timeout(self._policy.timeout_seconds):
                return await self._fetch(client, url)
        except TimeoutError as exc:
            raise _unavailable("timeout") from exc
        finally:
            if self._client is None:
                await client.aclose()

    async def _fetch(self, client: httpx.AsyncClient, url: str) -> FetchResult:
        headers = {"User-Agent": self._policy.user_agent, "Accept": "text/html"}
        current = url
        for _ in range(self._policy.max_redirects + 1):
            try:
                await self._guard.check_url(current)
            except SSRFBlocked as exc:
                raise _unavailable("ssrf_blocked") from exc
            except DNSResolutionError as exc:
                raise _unavailable("dns_failure") from exc
            try:
                async with client.stream(
                    "GET", current, headers=headers, follow_redirects=False
                ) as resp:
                    if resp.status_code in REDIRECT_CODES:
                        location = resp.headers.get("location")
                        if not location:
                            raise _unavailable(f"http_{resp.status_code}")
                        current = urljoin(current, location)
                        continue
                    if resp.status_code >= 400:
                        raise _unavailable(f"http_{resp.status_code}")
                    ctype = resp.headers.get("content-type", "").split(";")[0].strip().lower()
                    if ctype not in self._policy.allowed_content_types:
                        raise GatewayError(FailureType.SOURCE_EMPTY, "non_html")
                    declared = resp.headers.get("content-length")
                    if declared and declared.isdigit():
                        if int(declared) > self._policy.max_response_bytes:
                            raise _unavailable("too_large")
                    body = bytearray()
                    async for chunk in resp.aiter_bytes():
                        body.extend(chunk)
                        if len(body) > self._policy.max_response_bytes:
                            raise _unavailable("too_large")
                    return FetchResult(
                        url=url,
                        final_url=current,
                        status_code=resp.status_code,
                        content_type=ctype,
                        body=bytes(body),
                        encoding=resp.charset_encoding or "utf-8",
                    )
            except httpx.TimeoutException as exc:
                raise _unavailable("timeout") from exc
            except httpx.HTTPError as exc:
                raise _unavailable("connection_error") from exc
        raise _unavailable("too_many_redirects")
