"""SSRF guard (SSOT section 17, NFR-06). Every fetch and every redirect hop is checked here.

Blocks: non-http(s) schemes, credentials in the URL, unusual ports, local hostnames, and any host
that resolves (A or AAAA, every record) to a non-global address: loopback, RFC1918, link-local,
CGNAT, multicast, reserved, unspecified and the cloud metadata endpoints. IPv4-mapped IPv6 is
unwrapped first. Residual risk (DNS rebinding between check and connect) is documented in
docs/architecture/security.md.
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from collections.abc import Awaitable, Callable
from typing import Protocol
from urllib.parse import urlsplit

from contracts.config import SSRFPolicy


class SSRFBlocked(Exception):
    """Raised when a URL or redirect target violates the SSRF policy."""


class DNSResolutionError(Exception):
    """The host did not resolve (reported by the fetcher as SOURCE_UNAVAILABLE dns_failure)."""


class SSRFGuard(Protocol):
    policy: SSRFPolicy

    async def check_url(self, url: str) -> None:
        """Raise SSRFBlocked if `url` (after DNS resolution) must not be fetched."""
        ...


Resolver = Callable[[str, int], Awaitable[list[str]]]

ALLOWED_PORTS = {80, 443, 8080, 8443}
BLOCKED_HOSTS = {"localhost", "metadata.google.internal"}
BLOCKED_SUFFIXES = (".localhost", ".local", ".internal")
METADATA_ADDRESSES = {
    ipaddress.ip_address("169.254.169.254"),
    ipaddress.ip_address("100.100.100.200"),
    ipaddress.ip_address("fd00:ec2::254"),
}


async def system_resolver(host: str, port: int) -> list[str]:
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise DNSResolutionError(host) from exc
    return sorted({str(info[4][0]) for info in infos})


def _parse_literal(host: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    """IP literal in any common spelling (dotted, decimal, hex, short, IPv6), else None."""
    bare = host.strip("[]").split("%", 1)[0]
    try:
        return ipaddress.ip_address(bare)
    except ValueError:
        pass
    if ":" not in bare and all(c.isalnum() or c == "." for c in bare) and bare[:1].isdigit():
        try:  # inet_aton accepts 2130706433, 0x7f000001, 127.1 and similar spellings
            return ipaddress.IPv4Address(socket.inet_aton(bare))
        except OSError:
            return None
    return None


def _forbidden(addr: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped is not None:
        addr = addr.ipv4_mapped
    return addr in METADATA_ADDRESSES or not addr.is_global


class DefaultSSRFGuard:
    def __init__(self, policy: SSRFPolicy | None = None, resolver: Resolver | None = None) -> None:
        self.policy = policy or SSRFPolicy()
        self._resolver = resolver or system_resolver

    async def check_url(self, url: str) -> None:
        parts = urlsplit(url)
        if parts.scheme.lower() not in self.policy.allowed_schemes:
            raise SSRFBlocked(f"scheme not allowed: {parts.scheme!r}")
        if parts.username is not None or parts.password is not None or "@" in parts.netloc:
            raise SSRFBlocked("credentials in URL")
        host = (parts.hostname or "").lower().rstrip(".")
        if not host:
            raise SSRFBlocked("missing host")
        try:
            port = parts.port or (443 if parts.scheme.lower() == "https" else 80)
        except ValueError as exc:
            raise SSRFBlocked("invalid port") from exc
        if port not in ALLOWED_PORTS:
            raise SSRFBlocked(f"port not allowed: {port}")
        if host in BLOCKED_HOSTS or host.endswith(BLOCKED_SUFFIXES):
            raise SSRFBlocked(f"local hostname: {host}")
        literal = _parse_literal(host)
        addresses = [literal] if literal is not None else None
        if addresses is None:
            resolved = await self._resolver(host, port)
            if not resolved:
                raise DNSResolutionError(host)
            try:
                addresses = [ipaddress.ip_address(a.split("%", 1)[0]) for a in resolved]
            except ValueError as exc:
                raise SSRFBlocked("resolver returned an invalid address") from exc
        for addr in addresses:
            if _forbidden(addr):
                raise SSRFBlocked(f"non-public address: {addr}")
