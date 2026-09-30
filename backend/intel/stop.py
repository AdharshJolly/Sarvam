"""Stop policy: a pure function of coverage, conflicts and challenge outcomes (SSOT 9.10, FR-17).

`next_termination` tells the controller whether the run ends after a round and why; `final_decision`
turns the stored tables into the final state. Neither reads a clock, a budget or an LLM: hard limits
are passed in by the controller as a `TerminationReason`. `recompute_stop` rebuilds the decision of
any stored run from its tables, which is what the "state is a pure function of the tables" test
checks against the `stop.decided` event.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass

from backend.store import repo
from contracts.models import (
    Challenge,
    ChallengeOutcome,
    ConflictStatus,
    CoverageState,
    CriticalSlotCounts,
    FinalState,
    StopDecision,
    TerminationReason,
)

_RANK = {CoverageState.RED: 0, CoverageState.AMBER: 1, CoverageState.GREEN: 2}
HARD_LIMITS = frozenset(
    {
        TerminationReason.BUDGET,
        TerminationReason.TIMEOUT,
        TerminationReason.USER_STOPPED,
        TerminationReason.BLOCKED,
    }
)


@dataclass(frozen=True)
class StopCell:
    slot_id: str
    name: str
    critical: bool
    state: CoverageState


def marginal_gain(previous: dict[str, CoverageState], current: dict[str, CoverageState]) -> int:
    """Number of slots whose state improved between two rounds (SSOT 9.10)."""
    return sum(
        1 for slot, state in current.items() if _RANK[state] > _RANK[previous.get(slot, state)]
    )


def completed_challenge_rounds(challenges: list[Challenge]) -> int:
    """A challenge round is complete when it has attacks and every attack has an outcome."""
    by_round: dict[int, list[Challenge]] = {}
    for c in challenges:
        by_round.setdefault(c.round, []).append(c)
    return sum(1 for cs in by_round.values() if all(c.outcome is not None for c in cs))


def criteria_met(cells: list[StopCell], open_conflicts: int, challenges: list[Challenge]) -> bool:
    """SUFFICIENT: all critical slots GREEN, no open conflict, one challenge round complete and no
    challenge that weakened the conclusion."""
    return (
        all(c.state is CoverageState.GREEN for c in cells if c.critical)
        and open_conflicts == 0
        and completed_challenge_rounds(challenges) >= 1
        and not any(c.outcome is ChallengeOutcome.WEAKENED for c in challenges)
    )


def next_termination(
    cells: list[StopCell],
    open_conflicts: int,
    challenges: list[Challenge],
    *,
    round: int,
    max_rounds: int,
    gain: int | None,
    hard_limit: TerminationReason | None = None,
) -> TerminationReason | None:
    """The reason the run ends after `round`, or None to run another follow-up round.

    A hard limit wins over everything. Otherwise the run ends when the criteria are met, when a
    completed challenge round brought no marginal gain (`gain` is None for round 0), or when the
    follow-up rounds are used up. Before a challenge round has completed, only the round limit and
    hard limits end the run: at least one challenge must run (SSOT 7.1).
    """
    if hard_limit is not None:
        return hard_limit
    if criteria_met(cells, open_conflicts, challenges):
        return TerminationReason.CRITERIA_MET
    if completed_challenge_rounds(challenges) >= 1 and gain == 0:
        return TerminationReason.NO_MARGINAL_GAIN
    if round >= max_rounds:
        return TerminationReason.MAX_ROUNDS
    return None


def final_decision(
    cells: list[StopCell],
    open_conflicts: int,
    challenges: list[Challenge],
    reason: TerminationReason,
) -> StopDecision:
    """The final state for a run that ends with `reason` (SSOT 9.10 table).

    INSUFFICIENT when any critical slot is RED, whatever the reason. SUFFICIENT only when the
    criteria are met, and its reason is then `criteria_met` (the table pairs them). Everything
    else is SUFFICIENT_WITH_CAVEATS, and the caveats say what is missing.
    """
    critical = [c for c in cells if c.critical]
    counts = CriticalSlotCounts(
        green=sum(c.state is CoverageState.GREEN for c in critical),
        amber=sum(c.state is CoverageState.AMBER for c in critical),
        red=sum(c.state is CoverageState.RED for c in critical),
    )
    done = completed_challenge_rounds(challenges)
    met = criteria_met(cells, open_conflicts, challenges)
    if reason is TerminationReason.CRITERIA_MET and not met:
        raise ValueError("criteria_met is only valid when the sufficiency criteria hold")

    caveats: list[str] = []
    if not met:
        red = [c.name for c in critical if c.state is CoverageState.RED]
        amber = [c.name for c in critical if c.state is CoverageState.AMBER]
        if red:
            caveats.append(f"No supporting evidence for critical slot(s): {', '.join(red)}.")
        if amber:
            caveats.append(f"Critical slot(s) with limited evidence: {', '.join(amber)}.")
        if open_conflicts:
            caveats.append(f"{open_conflicts} open conflict(s) between claims.")
        weakened = [c for c in challenges if c.outcome is ChallengeOutcome.WEAKENED]
        if weakened:
            caveats.append(f"{len(weakened)} challenge(s) weakened the conclusion.")
        if done < 1:
            caveats.append("The challenge round was not completed.")
        if reason in HARD_LIMITS:
            caveats.append(f"The run ended early ({reason.value}) with the evidence in hand.")

    if met:
        state, why = FinalState.SUFFICIENT, TerminationReason.CRITERIA_MET
    else:
        state = FinalState.INSUFFICIENT if counts.red else FinalState.SUFFICIENT_WITH_CAVEATS
        why = reason
    return StopDecision(
        state=state,
        termination_reason=why,
        critical_slots=counts,
        open_conflicts=open_conflicts,
        challenge_rounds_completed=done,
        caveats=caveats,
    )


# ---------------------------------------------------------------- reading the stored tables


def latest_round(conn: sqlite3.Connection, run_id: str) -> int:
    return max((c.round for c in repo.list_coverage(conn, run_id)), default=0)


def coverage_states(conn: sqlite3.Connection, run_id: str, round: int) -> dict[str, CoverageState]:
    return {c.slot_id: c.state for c in repo.list_coverage(conn, run_id, round=round)}


def stop_cells(conn: sqlite3.Connection, run_id: str, round: int) -> list[StopCell]:
    slots = {s.id: s for s in repo.list_slots(conn, run_id)}
    return [
        StopCell(c.slot_id, slots[c.slot_id].name, slots[c.slot_id].critical, c.state)
        for c in repo.list_coverage(conn, run_id, round=round)
    ]


def open_conflict_count(conn: sqlite3.Connection, run_id: str) -> int:
    return sum(1 for c in repo.list_conflicts(conn, run_id) if c.status is ConflictStatus.OPEN)


def recompute_stop(conn: sqlite3.Connection, run_id: str) -> StopDecision | None:
    """Rebuild a finished run's decision from its tables and its stored termination reason. The
    controller stores exactly this function's result, so a stored run must reproduce it."""
    run = repo.get_run(conn, run_id)
    if run is None or run.termination_reason is None:
        return None
    return final_decision(
        stop_cells(conn, run_id, latest_round(conn, run_id)),
        open_conflict_count(conn, run_id),
        repo.list_challenges(conn, run_id),
        run.termination_reason,
    )
