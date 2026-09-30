"""Search provider interface (SSOT 6.2: one primary provider, one optional fallback). Task T02."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


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
