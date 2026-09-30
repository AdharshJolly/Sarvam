"""Numeric normalisation (SSOT 9.7, FR-12): Indian formats, currency to INR, period to per month.

Deterministic and pure. The extractor supplies `value`, `unit` and `period`; this module turns them
into values that can be compared, and reads amounts out of raw text (lakh, crore, k, M, comma
grouping, rupee sign) to cross-check a claim against its own quote.

The rate table is a configured, dated default (`INR_RATES_AS_OF`): approximate rates that must be
refreshed before any figure is treated as exact. Conflicts only need them to bring currencies to
the same order of magnitude.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

INR_RATES_AS_OF = "2026-09-30"
INR_RATES: dict[str, float] = {
    "INR": 1.0,
    "USD": 85.0,
    "EUR": 92.0,
    "GBP": 108.0,
    "AED": 23.1,
    "SGD": 63.0,
}

# Period -> multiplier that converts a value quoted for that period into a monthly value.
PERIOD_TO_MONTH: dict[str, float] = {
    "day": 30.0,
    "week": 4.33,
    "month": 1.0,
    "year": 1.0 / 12.0,
}
ONE_TIME = "one_time"

SCALES: dict[str, float] = {
    "thousand": 1e3, "k": 1e3,
    "lakh": 1e5, "lakhs": 1e5, "lac": 1e5, "lacs": 1e5,
    "million": 1e6, "mn": 1e6, "m": 1e6,
    "crore": 1e7, "crores": 1e7, "cr": 1e7,
    "billion": 1e9, "bn": 1e9, "b": 1e9,
}  # fmt: skip

CURRENCY_ALIASES: dict[str, str] = {
    "rs": "INR", "inr": "INR", "₹": "INR", "rupee": "INR", "rupees": "INR",
    "usd": "USD", "$": "USD", "us$": "USD", "dollar": "USD", "dollars": "USD",
    "eur": "EUR", "€": "EUR", "euro": "EUR", "euros": "EUR",
    "gbp": "GBP", "£": "GBP", "pound": "GBP", "pounds": "GBP",
    "aed": "AED", "dirham": "AED", "dirhams": "AED",
    "sgd": "SGD",
}  # fmt: skip
PERCENT_WORDS = {"percent", "percentage", "pct", "%"}
COUNT_WORDS = {
    "vehicles", "vehicle", "scooters", "scooter", "units", "unit", "stations", "station",
    "riders", "rider", "users", "user", "cities", "city", "customers", "customer", "bikes",
    "count", "number", "people", "orders", "trips", "rides",
}  # fmt: skip

_NUMBER = r"\d[\d,]*(?:\.\d+)?"
_AMOUNT = re.compile(
    r"(?P<cur>₹|us\$|\$|€|£|\b(?:rs|inr|usd|eur|gbp|aed|sgd)\b\.?)?\s*"
    r"(?P<num>" + _NUMBER + r")\s*"
    r"(?P<scale>(?:thousand|lakhs?|lacs?|crores?|cr|million|billion|mn|bn|k|m|b)(?![a-z0-9]))?",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class UnitInfo:
    kind: str  # currency | percent | count | other | none
    label: str  # canonical unit: INR, USD, percent, count, or the raw lower-case unit
    scale: float = 1.0
    scale_word: str | None = None


@dataclass(frozen=True)
class Amount:
    value: float  # after applying the scale word
    raw_number: float  # the number as written (commas removed)
    scale_word: str | None
    currency: str | None  # canonical currency code when a symbol or code precedes the number


@dataclass(frozen=True)
class NormalizedValue:
    """A claim value brought to comparable terms (INR, per month) with its provenance."""

    value: float
    unit: str  # canonical label: INR, USD... is converted to INR; percent; count; raw otherwise
    period: str | None  # month for converted rates, one_time, or the raw lower-case period
    raw_value: float
    raw_unit: str | None
    raw_period: str | None
    scale: float
    fx_rate: float
    period_factor: float

    @property
    def converted(self) -> bool:
        """True when normalisation changed the number (scale, currency or period)."""
        return self.scale != 1.0 or self.fx_rate != 1.0 or self.period_factor != 1.0


def parse_number(text: str) -> float:
    """'1,29,999' -> 129999.0 (Indian and western grouping); '2.5' -> 2.5."""
    return float(text.replace(",", ""))


def parse_amounts(text: str) -> list[Amount]:
    """Every amount in `text` with its currency symbol/code and scale word (lakh, crore, k, M)."""
    out: list[Amount] = []
    for m in _AMOUNT.finditer(text):
        raw = parse_number(m.group("num").rstrip(","))
        word = m.group("scale")
        scale = SCALES.get(word.lower(), 1.0) if word else 1.0
        cur = m.group("cur")
        currency = CURRENCY_ALIASES.get(cur.lower().rstrip(".")) if cur else None
        out.append(Amount(raw * scale, raw, word.lower() if word else None, currency))
    return out


def parse_unit(unit: str | None) -> UnitInfo:
    """Classify an extractor unit string: currency (with scale), percent, count, other or none."""
    if not unit or not unit.strip():
        return UnitInfo("none", "")
    lowered = unit.lower().replace("₹", " inr ").replace("%", " percent ")
    lowered = lowered.replace("us$", " usd ").replace("$", " usd ").replace("€", " eur ")
    lowered = lowered.replace("£", " gbp ")
    tokens = re.findall(r"[a-z]+", lowered)
    scale, scale_word = 1.0, None
    for tok in tokens:
        if tok in SCALES:
            scale, scale_word = SCALES[tok], tok
            break
    for tok in tokens:
        if tok in CURRENCY_ALIASES:
            return UnitInfo("currency", CURRENCY_ALIASES[tok], scale, scale_word)
    if any(tok in PERCENT_WORDS for tok in tokens):
        return UnitInfo("percent", "percent", scale, scale_word)
    if any(tok in COUNT_WORDS for tok in tokens):
        return UnitInfo("count", "count", scale, scale_word)
    return UnitInfo("other", " ".join(t for t in tokens if t not in SCALES) or lowered.strip(),
                    scale, scale_word)  # fmt: skip


def normalize_period(period: str | None) -> str | None:
    if not period or not period.strip():
        return None
    p = period.strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "daily": "day", "per_day": "day", "weekly": "week", "per_week": "week",
        "monthly": "month", "per_month": "month", "yearly": "year", "annual": "year",
        "annually": "year", "per_year": "year", "one_off": ONE_TIME, "onetime": ONE_TIME,
    }  # fmt: skip
    return aliases.get(p, p)


def normalize_value(
    value: float, unit: str | None, period: str | None, quote: str | None = None
) -> NormalizedValue:
    """INR, per-month value for a claim. The quote is used only to recover a scale word or
    currency the extractor left out (for example value 2.5, unit INR, quote 'Rs 2.5 crore')."""
    info = parse_unit(unit)
    kind, label, scale = info.kind, info.label, info.scale
    if quote and (scale == 1.0 or kind in ("none", "other")):
        for amt in parse_amounts(quote):
            if abs(amt.raw_number - value) < 1e-9 and (amt.scale_word or amt.currency):
                if scale == 1.0 and amt.scale_word:
                    scale = SCALES[amt.scale_word]
                if kind in ("none", "other") and amt.currency:
                    kind, label = "currency", amt.currency
                break
    fx = INR_RATES.get(label, 1.0) if kind == "currency" else 1.0
    if kind == "currency":
        label = "INR" if label in INR_RATES else label
    norm_period = normalize_period(period)
    factor = 1.0
    out_period = norm_period
    if kind == "currency" and norm_period in PERIOD_TO_MONTH:
        factor = PERIOD_TO_MONTH[norm_period]
        out_period = "month"
    return NormalizedValue(
        value=value * scale * fx * factor,
        unit=label if label else (unit or "").strip().lower(),
        period=out_period,
        raw_value=value,
        raw_unit=unit,
        raw_period=period,
        scale=scale,
        fx_rate=fx,
        period_factor=factor,
    )


def relative_difference(a: float, b: float) -> float:
    """|a - b| / max(|a|, |b|): symmetric, 0 when both are 0 (decision B-22)."""
    biggest = max(abs(a), abs(b))
    return 0.0 if biggest == 0 else abs(a - b) / biggest
