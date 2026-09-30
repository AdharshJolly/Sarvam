"""T11: numeric normalisation: Indian formats, currency, period, units (SSOT 9.7)."""

from __future__ import annotations

import pytest

from backend.intel.numeric import (
    INR_RATES,
    normalize_period,
    normalize_value,
    parse_amounts,
    parse_number,
    parse_unit,
    relative_difference,
)


@pytest.mark.parametrize(
    "text,value",
    [
        ("1,299", 1299.0),
        ("1,29,999", 129999.0),  # Indian grouping
        ("12,34,56,789", 123456789.0),
        ("2.5", 2.5),
        ("1,299.50", 1299.5),
        ("7", 7.0),
    ],
)
def test_parse_number_handles_indian_and_western_grouping(text, value):
    assert parse_number(text) == value


@pytest.mark.parametrize(
    "text,value,currency",
    [
        ("Rs. 1,299", 1299.0, "INR"),
        ("₹2.5 lakh", 250000.0, "INR"),
        ("Rs 1,200 crore a year", 1.2e10, "INR"),
        ("INR 45k", 45000.0, "INR"),
        ("$3.2M", 3.2e6, "USD"),
        ("US$ 1.5 billion", 1.5e9, "USD"),
        ("€20 million", 2e7, "EUR"),
        ("4 lakhs", 400000.0, None),
        ("12 cr", 1.2e8, None),
        ("500 scooters", 500.0, None),
    ],
)
def test_parse_amounts_reads_scale_words_and_currency(text, value, currency):
    (amt,) = parse_amounts(text)
    assert amt.value == pytest.approx(value)
    assert amt.currency == currency


def test_parse_amounts_does_not_read_a_unit_letter_out_of_a_longer_word():
    (amt,) = parse_amounts("5 months and 3 bikes")[:1]
    assert amt.value == 5.0 and amt.scale_word is None
    assert [a.value for a in parse_amounts("5 months and 3 bikes")] == [5.0, 3.0]


def test_parse_unit_classifies_currency_percent_count_and_other():
    assert parse_unit("INR").kind == "currency" and parse_unit("INR").label == "INR"
    crore = parse_unit("INR crore")
    assert (crore.kind, crore.label, crore.scale) == ("currency", "INR", 1e7)
    assert parse_unit("Rs lakh").scale == 1e5
    assert parse_unit("USD million").scale == 1e6
    assert parse_unit("₹").label == "INR" and parse_unit("$").label == "USD"
    assert parse_unit("percent").kind == "percent" and parse_unit("%").kind == "percent"
    assert parse_unit("vehicles").kind == "count"
    assert parse_unit("kWh").kind == "other"
    assert parse_unit(None).kind == "none" and parse_unit("  ").kind == "none"


def test_normalize_period_aliases():
    assert normalize_period("Monthly") == "month"
    assert normalize_period("per-day") == "day" and normalize_period("per day") == "day"
    assert normalize_period("annual") == "year"
    assert normalize_period("one-off") == "one_time"
    assert normalize_period(None) is None and normalize_period(" ") is None


def test_periods_are_converted_to_per_month():
    assert normalize_value(69, "INR", "day").value == pytest.approx(2070)
    assert normalize_value(300, "INR", "week").value == pytest.approx(1299)
    assert normalize_value(12000, "INR", "year").value == pytest.approx(1000)
    month = normalize_value(1299, "INR", "month")
    assert month.value == 1299 and not month.converted and month.period == "month"


def test_one_time_and_missing_periods_are_left_alone():
    assert normalize_value(5000, "INR", "one_time").period == "one_time"
    assert normalize_value(5000, "INR", None).period is None
    assert normalize_value(5000, "INR", None).value == 5000


def test_scale_and_currency_are_brought_to_inr():
    crore = normalize_value(1200, "INR crore", "year")
    assert crore.value == pytest.approx(1200 * 1e7 / 12)
    usd = normalize_value(10, "USD", "month")
    assert usd.value == pytest.approx(10 * INR_RATES["USD"]) and usd.unit == "INR"
    assert normalize_value(3, "lakh INR", None).value == 300000


def test_percent_and_counts_are_not_period_converted():
    pct = normalize_value(18, "percent", "year")
    assert pct.value == 18 and pct.period == "year" and pct.unit == "percent"
    fleet = normalize_value(500, "vehicles", None)
    assert (fleet.value, fleet.unit) == (500, "count")


def test_quote_recovers_a_scale_the_extractor_left_out():
    recovered = normalize_value(2.5, "INR", None, "an investment of Rs 2.5 crore in the city")
    assert recovered.value == pytest.approx(2.5e7)
    # an extractor that already scaled the value is never scaled twice
    assert normalize_value(25_000_000, "INR", None, "Rs 2.5 crore").value == 25_000_000
    # the quote is only trusted when its number equals the claim value
    assert normalize_value(3, "INR", None, "Rs 2.5 crore").value == 3


def test_quote_recovers_a_missing_currency():
    n = normalize_value(1299, None, "month", "plans from Rs. 1,299 a month")
    assert n.unit == "INR" and n.value == pytest.approx(1299)


def test_relative_difference_is_symmetric_and_safe_at_zero():
    assert relative_difference(1299, 1599) == pytest.approx(300 / 1599)
    assert relative_difference(1599, 1299) == relative_difference(1299, 1599)
    assert relative_difference(0, 0) == 0.0
    assert relative_difference(100, 100) == 0.0
