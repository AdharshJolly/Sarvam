"""T14 (part 1): the stop policy is a pure function of coverage, conflicts and challenges
(SSOT 9.10, FR-17)."""

from __future__ import annotations

import pytest

from backend.intel.stop import (
    StopCell,
    completed_challenge_rounds,
    criteria_met,
    final_decision,
    marginal_gain,
    next_termination,
)
from contracts.models import (
    Challenge,
    ChallengeOutcome,
    CoverageState,
    FinalState,
    TerminationReason,
)

G, A, R = CoverageState.GREEN, CoverageState.AMBER, CoverageState.RED
T = TerminationReason
S = FinalState


def cell(sid, state, critical=True):
    return StopCell(sid, f"Slot {sid}", critical, state)


def challenge(n=1, round=1, outcome=ChallengeOutcome.STRENGTHENED):
    return Challenge(id=f"H{n}", run_id="R1", round=round, attack="a", outcome=outcome)


ALL_GREEN = [cell("S1", G), cell("S2", G), cell("S3", A, critical=False)]


# ---------------------------------------------------------------- final state, SSOT 9.10 table


def test_sufficient_needs_green_critical_slots_no_conflict_a_challenge_and_no_weakening():
    d = final_decision(ALL_GREEN, 0, [challenge()], T.CRITERIA_MET)
    assert (d.state, d.termination_reason) == (S.SUFFICIENT, T.CRITERIA_MET)
    assert d.critical_slots.green == 2 and d.challenge_rounds_completed == 1 and not d.caveats


def test_a_non_critical_amber_slot_does_not_block_sufficient():
    assert criteria_met([cell("S1", G), cell("S2", R, critical=False)], 0, [challenge()])


@pytest.mark.parametrize(
    "cells, conflicts, challenges, want_state, must_mention",
    [
        ([cell("S1", G), cell("S2", A)], 0, [challenge()], S.SUFFICIENT_WITH_CAVEATS, "limited"),
        (ALL_GREEN, 1, [challenge()], S.SUFFICIENT_WITH_CAVEATS, "open conflict"),
        (ALL_GREEN, 0, [], S.SUFFICIENT_WITH_CAVEATS, "not completed"),
        (
            ALL_GREEN,
            0,
            [challenge(outcome=ChallengeOutcome.WEAKENED)],
            S.SUFFICIENT_WITH_CAVEATS,
            "weakened",
        ),
        (ALL_GREEN, 0, [challenge(outcome=None)], S.SUFFICIENT_WITH_CAVEATS, "not completed"),
        ([cell("S1", G), cell("S2", R)], 0, [challenge()], S.INSUFFICIENT, "No supporting"),
        ([cell("S1", R), cell("S2", A)], 2, [], S.INSUFFICIENT, "No supporting"),
    ],
)
def test_everything_short_of_the_criteria_is_caveated_or_insufficient(
    cells, conflicts, challenges, want_state, must_mention
):
    d = final_decision(cells, conflicts, challenges, T.MAX_ROUNDS)
    assert d.state is want_state and d.termination_reason is T.MAX_ROUNDS
    assert any(must_mention in c for c in d.caveats)
    assert d.open_conflicts == conflicts


@pytest.mark.parametrize("reason", [T.BUDGET, T.TIMEOUT, T.USER_STOPPED, T.BLOCKED])
def test_a_hard_limit_keeps_its_reason_and_says_so(reason):
    d = final_decision([cell("S1", G), cell("S2", A)], 0, [], reason)
    assert d.state is S.SUFFICIENT_WITH_CAVEATS and d.termination_reason is reason
    assert any(reason.value in c for c in d.caveats)


def test_insufficient_is_reached_by_any_reason_including_blocked():
    for reason in (T.BLOCKED, T.NO_MARGINAL_GAIN, T.BUDGET):
        d = final_decision([cell("S1", R)], 0, [], reason)
        assert d.state is S.INSUFFICIENT and d.termination_reason is reason


def test_criteria_met_cannot_be_claimed_when_they_do_not_hold():
    with pytest.raises(ValueError):
        final_decision([cell("S1", A)], 0, [challenge()], T.CRITERIA_MET)


def test_a_met_criteria_run_reports_criteria_met_even_if_a_limit_hit_at_the_same_time():
    d = final_decision(ALL_GREEN, 0, [challenge()], T.BUDGET)
    assert (d.state, d.termination_reason) == (S.SUFFICIENT, T.CRITERIA_MET)


# ---------------------------------------------------------------- challenge rounds


def test_a_challenge_round_is_complete_only_when_every_attack_has_an_outcome():
    assert completed_challenge_rounds([]) == 0
    assert completed_challenge_rounds([challenge(1), challenge(2, outcome=None)]) == 0
    assert completed_challenge_rounds([challenge(1), challenge(2)]) == 1
    assert completed_challenge_rounds([challenge(1, 1), challenge(2, 2, outcome=None)]) == 1
    assert completed_challenge_rounds([challenge(1, 1), challenge(2, 2)]) == 2


# ---------------------------------------------------------------- when the run ends


def term(cells, conflicts=0, challenges=(), *, round=1, max_rounds=2, gain=1, hard=None):
    return next_termination(
        cells, conflicts, list(challenges), round=round, max_rounds=max_rounds, gain=gain,
        hard_limit=hard,
    )  # fmt: skip


def test_round_zero_never_stops_on_its_own_because_a_challenge_must_run():
    assert term(ALL_GREEN, round=0, gain=None) is None
    assert term([cell("S1", R)], round=0, gain=None) is None


def test_criteria_met_after_a_challenge_ends_the_run():
    assert term(ALL_GREEN, challenges=[challenge()]) is T.CRITERIA_MET


def test_zero_gain_after_a_completed_challenge_ends_the_run():
    cells = [cell("S1", G), cell("S2", A)]
    assert term(cells, challenges=[challenge()], gain=0) is T.NO_MARGINAL_GAIN
    assert term(cells, challenges=[challenge()], gain=1) is None  # still improving: go on


def test_zero_gain_does_not_end_the_run_while_the_challenge_is_incomplete():
    cells = [cell("S1", G), cell("S2", A)]
    assert term(cells, challenges=[challenge(outcome=None)], gain=0) is None
    assert term(cells, challenges=[], gain=0) is None


def test_the_round_limit_ends_the_run():
    cells = [cell("S1", G), cell("S2", A)]
    assert term(cells, challenges=[challenge()], round=2, gain=1) is T.MAX_ROUNDS
    assert term(cells, challenges=[], round=2, gain=1) is T.MAX_ROUNDS


def test_a_hard_limit_wins_over_everything():
    for hard in (T.BUDGET, T.TIMEOUT, T.USER_STOPPED, T.BLOCKED):
        assert term(ALL_GREEN, challenges=[challenge()], hard=hard) is hard


# ---------------------------------------------------------------- marginal gain


def test_marginal_gain_counts_slots_that_improved():
    before = {"S1": R, "S2": A, "S3": G, "S4": A}
    after = {"S1": A, "S2": G, "S3": G, "S4": R}
    assert marginal_gain(before, after) == 2  # S1 and S2 improved; S4 got worse
    assert marginal_gain(after, after) == 0
    assert marginal_gain({}, after) == 0  # a slot with no earlier state is not an improvement
