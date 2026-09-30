"""Extractor relevance floor (SARVAM_EXTRACTOR_MIN_OVERLAP, B-35): skips weak OTHER-slot jobs."""

import pytest

from backend.pipeline.claims import _relevant_slots
from contracts.config import Settings
from contracts.models import EvidenceSlot, Passage


def slot(sid, name, description="", attributes=()):
    return EvidenceSlot(
        id=sid,
        run_id="R1",
        dimension_id="D1",
        name=name,
        description=description,
        attributes=list(attributes),
    )


def passage(text, n=0):
    return Passage(id=f"P{n}", source_id="S1", idx=n, text=text, char_start=0, char_end=len(text))


OWN = slot("A", "scooter price", "monthly price")
STRONG = slot("B", "fleet size", "fleet scooters city deployed", ["fleet_size"])
WEAK = slot("C", "parking regulation", "council parking rules")  # shares only "parking"
TEXT = "The scooter fleet deployed in the city grew; the monthly price of a scooter rose. Parking."
PASSAGES = [passage(TEXT)]


def ids(relevant):
    return [s.id for s, _ in relevant]


def test_default_floor_is_off_and_keeps_every_overlapping_slot():
    assert Settings().thresholds.extractor_min_overlap == 0
    assert ids(_relevant_slots([OWN, STRONG, WEAK], "A", PASSAGES, 5)) == ["A", "B", "C"]


def test_floor_drops_weak_other_slots_but_keeps_strong_ones():
    out = _relevant_slots([OWN, STRONG, WEAK], "A", PASSAGES, 5, min_other_overlap=3)
    assert ids(out) == ["A", "B"]


def test_own_slot_is_never_dropped_by_the_floor():
    weak_own = slot("C", "parking regulation", "council parking rules")
    out = _relevant_slots([OWN, STRONG, weak_own], "C", PASSAGES, 5, min_other_overlap=99)
    assert ids(out) == ["C"]  # own slot survives; both others fall below 99


def test_a_slot_with_zero_overlap_is_still_dropped_with_the_floor_off():
    unrelated = slot("D", "tax", "gst rates")
    assert ids(_relevant_slots([unrelated], "A", PASSAGES, 5)) == []


def test_floor_env_parsing():
    assert (
        Settings.from_env({"SARVAM_EXTRACTOR_MIN_OVERLAP": "3"}).thresholds.extractor_min_overlap
        == 3
    )
    assert Settings.from_env({}).thresholds.extractor_min_overlap == 0
    with pytest.raises(ValueError):
        Settings.from_env({"SARVAM_EXTRACTOR_MIN_OVERLAP": "-1"})
