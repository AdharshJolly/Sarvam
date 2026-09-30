"""Claim-key helpers shared by origin clustering (S3) and numeric conflicts (SSOT 9.6, 9.7).

The claim key is (entity, attribute, period). Slot attribute lists keep attribute names stable;
entities come from free text, so two entities match when their content words are equal or when the
shorter one (at least two words) is contained in the longer one ("premium plan" in "VoltRide
premium plan"). Pure and deterministic.
"""

from __future__ import annotations

import re
import unicodedata

_ARTICLES = {"the", "a", "an"}


def entity_tokens(text: str | None) -> frozenset[str]:
    """Lower-case content words of an entity, without articles and punctuation."""
    if not text:
        return frozenset()
    norm = unicodedata.normalize("NFKC", text).lower()
    return frozenset(w for w in re.findall(r"[a-z0-9]+", norm) if w not in _ARTICLES)


def entities_match(a: str | None, b: str | None) -> bool:
    ta, tb = entity_tokens(a), entity_tokens(b)
    if not ta or not tb:
        return False
    if ta == tb:
        return True
    small, large = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    return len(small) >= 2 and small <= large


def norm_attribute(attribute: str | None) -> str | None:
    return attribute.strip().lower() if attribute and attribute.strip() else None


def norm_period(period: str | None) -> str | None:
    return period.strip().lower() if period and period.strip() else None


def id_number(identifier: str) -> int:
    """Numeric part of a short id (S12 -> 12) for deterministic ordering."""
    digits = re.sub(r"\D", "", identifier)
    return int(digits) if digits else 0
