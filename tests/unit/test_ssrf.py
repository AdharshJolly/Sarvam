import asyncio

import pytest

from backend.gateway.ssrf import DefaultSSRFGuard, DNSResolutionError, SSRFBlocked

HOSTS = {
    "example.com": ["93.184.216.34"],
    "evil.example": ["10.0.0.5"],
    "mixed.example": ["93.184.216.34", "192.168.1.10"],
    "v6private.example": ["fd00::1"],
    "v6public.example": ["2606:2800:220:1:248:1893:25c8:1946"],
}


async def resolver(host: str, port: int) -> list[str]:
    if host not in HOSTS:
        raise DNSResolutionError(host)
    return HOSTS[host]


def check(url: str) -> None:
    asyncio.run(DefaultSSRFGuard(resolver=resolver).check_url(url))


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/",
        "http://10.0.0.1/",
        "http://172.16.0.1/",
        "http://192.168.0.1/",
        "http://169.254.169.254/latest/meta-data/",
        "http://100.100.100.200/",
        "http://100.64.0.1/",
        "http://0.0.0.0/",
        "http://[::1]/",
        "http://[::ffff:127.0.0.1]/",
        "http://[fe80::1]/",
        "http://localhost/",
        "http://app.localhost/",
        "http://printer.local/",
        "http://foo.internal/",
        "http://metadata.google.internal/",
        "http://2130706433/",  # decimal-encoded 127.0.0.1
        "http://0x7f000001/",  # hex-encoded 127.0.0.1
        "http://127.1/",
        "http://user:pass@example.com/",
        "http://user@example.com/",
        "http://example.com:22/",
        "http://example.com:3306/",
        "file:///etc/passwd",
        "ftp://example.com/",
        "gopher://example.com/",
        "http://evil.example/",  # resolves to a private address
        "http://mixed.example/",  # one private record is enough
        "http://v6private.example/",
    ],
)
def test_blocked(url):
    with pytest.raises(SSRFBlocked):
        check(url)


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com/",
        "https://example.com/page?x=1",
        "https://example.com:8443/",
        "http://example.com:8080/",
        "https://v6public.example/",
        "http://93.184.216.34/",
    ],
)
def test_allowed(url):
    check(url)  # must not raise


def test_dns_failure_is_distinct_from_a_block():
    with pytest.raises(DNSResolutionError):
        check("http://does-not-exist.example/")
