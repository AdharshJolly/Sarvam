"""T11: numeric conflict detection on synthetic claims (SSOT 9.7); fixtures cover the corpus."""

from __future__ import annotations

from backend.intel.conflicts import ConflictClaim, contested_claim_ids, detect_conflicts
from contracts.models import ConflictKind, ConflictStatus


def claim(
    n,
    value,
    *,
    entity="VoltRide basic plan",
    attribute="monthly_price_inr",
    unit="INR",
    period="month",
    slot="D2S1",
    verdict="supports",
    tier=3,
    stype="unknown",
    quote="q",
):
    return ConflictClaim(
        id=f"C{n}",
        slot_id=slot,
        entity=entity,
        attribute=attribute,
        value_num=value,
        unit=unit,
        period=period,
        quote=quote,
        text=f"claim {n}",
        passage_id=f"P{n}",
        source_id=f"S{n}",
        source_type=stype,
        authority_tier=tier,
        domain=f"d{n}.example",
        published_at=None,
        verdict=verdict,
    )


def test_a_difference_above_the_tolerance_is_a_conflict_kept_open_for_the_explainer():
    (c,) = detect_conflicts([claim(1, 1299), claim(2, 1599)])
    assert (c.claim_a, c.claim_b, c.slot_id) == ("C1", "C2", "D2S1")
    assert c.delta_pct == 18.76 and c.disagreement is True
    assert c.kind is None and c.status is ConflictStatus.OPEN and c.explained_by is None


def test_a_difference_at_or_below_the_tolerance_is_not_a_conflict():
    assert detect_conflicts([claim(1, 1000), claim(2, 1150)]) == []  # 13.0 percent
    assert detect_conflicts([claim(1, 850), claim(2, 1000)]) == []  # exactly 15.0 percent
    assert len(detect_conflicts([claim(1, 849), claim(2, 1000)])) == 1  # 15.1 percent


def test_the_tolerance_is_configurable():
    pair = [claim(1, 1000), claim(2, 1100)]
    assert detect_conflicts(pair, tolerance=0.15) == []
    assert len(detect_conflicts(pair, tolerance=0.05)) == 1


def test_agreeing_claims_form_one_position_and_one_conflict_against_the_outlier():
    claims = [claim(1, 1299), claim(2, 1299), claim(3, 1300), claim(4, 1599)]
    (c,) = detect_conflicts(claims)
    assert c.members_a == ["C1", "C2", "C3"] and c.members_b == ["C4"]
    assert contested_claim_ids([c], [True]) == {"C1", "C2", "C3", "C4"}
    assert contested_claim_ids([c], [False]) == set()


def test_the_representative_of_a_position_is_its_most_primary_claim():
    claims = [
        claim(1, 1299, tier=3),
        claim(2, 1299, tier=1, stype="company_primary"),
        claim(3, 1599, tier=3),
    ]
    (c,) = detect_conflicts(claims)
    assert {c.claim_a, c.claim_b} == {"C2", "C3"}


def test_three_positions_give_three_pairwise_conflicts():
    assert len(detect_conflicts([claim(1, 1000), claim(2, 1500), claim(3, 2500)])) == 3


def test_only_claims_judged_supports_can_conflict():
    assert detect_conflicts([claim(1, 1299), claim(2, 1599, verdict="partial")]) == []
    assert detect_conflicts([claim(1, 1299), claim(2, 1599, verdict="irrelevant")]) == []


def test_claims_without_a_value_or_attribute_are_ignored_not_dropped():
    assert detect_conflicts([claim(1, 1299), claim(2, None)]) == []
    assert detect_conflicts([claim(1, 1299), claim(2, 1599, attribute=None)]) == []


def test_different_entities_attributes_slots_or_units_are_not_compared():
    base = claim(1, 1299)
    assert detect_conflicts([base, claim(2, 2599, entity="VoltRide premium plan")]) == []
    assert detect_conflicts([base, claim(2, 2599, attribute="deposit_inr")]) == []
    assert detect_conflicts([base, claim(2, 2599, slot="D9S9")]) == []
    assert detect_conflicts([base, claim(2, 18, unit="percent")]) == []
    assert detect_conflicts([base, claim(2, 2599, period="one_time")]) == []


def test_entity_subsets_are_compared():
    assert len(detect_conflicts([claim(1, 1299), claim(2, 1599, entity="basic plan")])) == 1


def test_unit_trap_is_found_classified_unit_error_and_explained_without_an_llm():
    a = claim(1, 2070, entity="VoltRide premium plan", period="month", tier=1)
    b = claim(2, 69, entity="premium plan", period="day")
    (c,) = detect_conflicts([a, b])
    assert c.disagreement is False
    assert c.kind is ConflictKind.UNIT_ERROR and c.status is ConflictStatus.EXPLAINED
    assert c.explained_by == "rule"
    assert c.delta_pct == 96.67  # the raw figures look 97 percent apart
    assert "C1" in c.explanation and "C2" in c.explanation and "per day" in c.explanation
    assert "2,070" in c.explanation and "per month" in c.explanation


def test_scale_trap_crore_against_plain_rupees_is_a_unit_trap():
    a = claim(
        1,
        1200,
        unit="INR crore",
        period="year",
        attribute="market_size_inr_crore",
        entity="e-scooter market",
        slot="D3S1",
    )
    b = claim(
        2,
        12_000_000_000,
        unit="INR",
        period="year",
        attribute="market_size_inr_crore",
        entity="e-scooter market",
        slot="D3S1",
    )
    (c,) = detect_conflicts([a, b])
    assert c.kind is ConflictKind.UNIT_ERROR and c.status is ConflictStatus.EXPLAINED


def test_currency_trap_usd_against_inr():
    a = claim(1, 1000, unit="INR", period="month")
    b = claim(2, 1000 / 85.0, unit="USD", period="month")
    (c,) = detect_conflicts([a, b])
    assert c.kind is ConflictKind.UNIT_ERROR and c.explained_by == "rule"


def test_unit_trap_and_real_disagreement_can_coexist_for_one_attribute():
    claims = [
        claim(1, 2070, entity="premium plan"),
        claim(2, 69, entity="premium plan", period="day"),
        claim(3, 3000, entity="premium plan"),
    ]
    found = detect_conflicts(claims)
    kinds = sorted((c.disagreement, c.kind) for c in found)
    assert len(found) == 2
    assert (True, None) in kinds and (False, ConflictKind.UNIT_ERROR) in kinds


def test_detection_is_deterministic_for_any_claim_order():
    claims = [claim(1, 1299), claim(2, 1599), claim(3, 1300), claim(4, 2100)]
    reference = [(c.claim_a, c.claim_b, c.delta_pct) for c in detect_conflicts(claims)]
    for order in (claims[::-1], claims[2:] + claims[:2]):
        assert [(c.claim_a, c.claim_b, c.delta_pct) for c in detect_conflicts(order)] == reference
