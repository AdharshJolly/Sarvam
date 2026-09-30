"""Freshness bucket for a source (SSOT 9.2). Badge only in the MVP; used in the report note."""

from __future__ import annotations

from datetime import UTC, datetime

UNDER_12 = "under_12_months"
BETWEEN_12_36 = "12_to_36_months"
OVER_36 = "over_36_months"
UNKNOWN = "unknown"

_MONTH_DAYS = 365.25 / 12


def freshness_bucket(published_at: datetime | None, now: datetime | None = None) -> str:
    """Age bucket of a publish date: under 12 months, 12 to 36, over 36, or unknown."""
    if published_at is None:
        return UNKNOWN
    reference = now or datetime.now(UTC)
    if published_at.tzinfo is None:
        published_at = published_at.replace(tzinfo=UTC)
    if reference.tzinfo is None:
        reference = reference.replace(tzinfo=UTC)
    months = (reference - published_at).total_seconds() / 86400 / _MONTH_DAYS
    if months < 12:
        return UNDER_12
    return BETWEEN_12_36 if months <= 36 else OVER_36
