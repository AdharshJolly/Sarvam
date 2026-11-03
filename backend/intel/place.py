"""Where a question is about (CL-23). Pure and deterministic: no LLM writes or judges a place.

The place comes from the scope's geography when the user set one, else from the question itself:
capitalised words after "in", "across", "within" or "throughout" ("... in Bengaluru in 2027" ->
Bengaluru). Known places add their other names and the regions that contain them, so a page about
Karnataka or India still counts as local for a Bengaluru question.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlsplit

from contracts.models import Scope

_INDIA = "india"
# place -> other names and enclosing regions (lowercase). Starter list; extend as needed.
REGIONS: dict[str, tuple[str, ...]] = {
    "bengaluru": ("bangalore", "karnataka", _INDIA),
    "bangalore": ("bengaluru", "karnataka", _INDIA),
    "mumbai": ("bombay", "maharashtra", _INDIA),
    "pune": ("maharashtra", _INDIA),
    "delhi": ("ncr", _INDIA),
    "chennai": ("madras", "tamil", "nadu", _INDIA),
    "hyderabad": ("telangana", _INDIA),
    "kolkata": ("calcutta", "bengal", _INDIA),
    "ahmedabad": ("gujarat", _INDIA),
    "karnataka": (_INDIA,),
    "maharashtra": (_INDIA,),
    "telangana": (_INDIA,),
    "gujarat": (_INDIA,),
}
_AFTER = re.compile(
    r"\b(?:[Ii]n|[Aa]cross|[Ww]ithin|[Tt]hroughout)\s+((?:[A-Z][\w-]*)(?:\s+[A-Z][\w-]*)*)"
)
_WORD = re.compile(r"[a-z0-9]+")


@dataclass(frozen=True)
class Place:
    names: tuple[str, ...]  # the place as written, for queries ("Bengaluru")
    terms: frozenset[str]  # lowercase words that make a page local (names, aliases, regions)

    def __bool__(self) -> bool:
        return bool(self.names)

    def is_local(self, url: str, text: str) -> bool:
        """Does a search hit (its URL plus title and snippet) mention the place?"""
        if not self.terms:
            return False
        if self.terms & set(_WORD.findall(f"{url} {text}".lower())):
            return True
        host = (urlsplit(url).hostname or "").lower()
        return _INDIA in self.terms and host.endswith(".in")


def place_of(question: str, scope: Scope) -> Place:
    if scope.geography and scope.geography.strip():
        names = tuple(scope.geography.split())
    else:
        found = [w for m in _AFTER.finditer(question) for w in m.group(1).split()]
        names = tuple(dict.fromkeys(found))
    terms: set[str] = set()
    for name in names:
        for word in _WORD.findall(name.lower()):
            terms.add(word)
            terms.update(REGIONS.get(word, ()))
    return Place(names, frozenset(terms))
