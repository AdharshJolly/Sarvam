"""Fetch interface (SSOT FR-06). HTML only in the MVP. Task T02; must go through the SSRF guard."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class FetchResult:
    url: str
    final_url: str
    status_code: int
    content_type: str
    body: bytes


class Fetcher(Protocol):
    async def fetch(self, url: str) -> FetchResult:
        """Fetch under timeout, size, redirect and SSRF limits; raise a typed GatewayError."""
        ...
