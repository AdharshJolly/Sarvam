"""SSRF guard boundary (SSOT section 17). Interface only; implementation is task T02.

Required behaviour (from SSOT 17), NOT yet implemented:
  - allow http and https only
  - resolve DNS and block loopback, private, link-local and cloud-metadata addresses
  - limit redirects to 3 and re-check every hop
  - timeout 12 s, size cap 3 MB, HTML content types only
Limits live in contracts.config.SSRFPolicy.
"""

from __future__ import annotations

from typing import Protocol

from contracts.config import SSRFPolicy


class SSRFBlocked(Exception):
    """Raised when a URL or redirect target violates the SSRF policy."""


class SSRFGuard(Protocol):
    policy: SSRFPolicy

    async def check_url(self, url: str) -> None:
        """Raise SSRFBlocked if `url` (after DNS resolution) must not be fetched."""
        ...
