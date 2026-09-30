"""Coverage matrix and dimension rollups (SSOT 9.8, FR-13). Pure and deterministic.

| State | Rule per slot |
| GREEN | at least `min_independent` origins support the slot (verdict supports) and no open
|       | conflict; a single tier-1 origin is enough when the slot has `primary_ok` |
| AMBER | exactly one origin, or two or more with an open conflict, or only partial verdicts |
| RED   | no supporting origin |

Every cell carries a human-readable reason. Explained conflicts never downgrade a cell; only open
ones do. Unestablished independence still counts as an origin (SSOT 9.6, S0) and the reason says so.

Rollup: the worst state among a dimension's critical slots; with no critical slot, the median of
its slots (the lower median for an even count, the conservative choice; decision B-22).
"""

from __future__ import annotations

from dataclasses import dataclass

from contracts.models import CoverageState

_ORDER = {CoverageState.RED: 0, CoverageState.AMBER: 1, CoverageState.GREEN: 2}


@dataclass(frozen=True)
class CoverageSlot:
    id: str
    dimension_id: str
    name: str
    critical: bool
    min_independent: int
    primary_ok: bool


@dataclass(frozen=True)
class CoverageDimension:
    id: str
    name: str


@dataclass(frozen=True)
class CoverageClaim:
    """A claim with a verdict, placed on its origin. Rejected claims are never passed in."""

    claim_id: str
    slot_id: str
    source_id: str
    origin_id: str  # the source's own id when no origin is assigned
    origin_established: bool  # the origin's method is not `none`
    verdict: str  # supports | partial | contradicts | irrelevant
    authority_tier: int


@dataclass(frozen=True)
class CellResult:
    slot_id: str
    state: CoverageState
    independent_origins: int
    supporting_claims: int
    open_conflicts: int
    reason: str


@dataclass(frozen=True)
class RollupResult:
    dimension_id: str
    state: CoverageState
    reason: str


def _plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def compute_cell(
    slot: CoverageSlot, claims: list[CoverageClaim], open_conflicts: int
) -> CellResult:
    """State, counts and reason for one slot from its judged claims and open conflicts."""
    evidence = [c for c in claims if c.verdict in ("supports", "partial")]
    supports = [c for c in evidence if c.verdict == "supports"]
    origins = {c.origin_id for c in evidence}
    support_origins = {c.origin_id for c in supports}
    sources = {c.source_id for c in evidence}
    counts = dict(
        independent_origins=len(origins),
        supporting_claims=len(evidence),
        open_conflicts=open_conflicts,
    )
    summary = f"{_plural(len(sources), 'source')}, {_plural(len(origins), 'origin')}"
    weak_independence = (
        " Independence between these origins is unestablished."
        if len(origins) >= 2 and not any(c.origin_established for c in evidence)
        else ""
    )

    if not origins:
        judged = len(claims)
        why = (
            f"{_plural(judged, 'claim')} extracted, none supported or partially supported"
            if judged
            else "no claim was extracted for this slot"
        )
        return CellResult(
            slot.id, CoverageState.RED, reason=f"No supporting evidence: {why}.", **counts
        )
    if open_conflicts > 0:
        return CellResult(
            slot.id,
            CoverageState.AMBER,
            reason=(
                f"{summary}, but {_plural(open_conflicts, 'open conflict')} between claims "
                f"still need resolving.{weak_independence}"
            ),
            **counts,
        )
    if len(support_origins) >= max(slot.min_independent, 1):
        return CellResult(
            slot.id,
            CoverageState.GREEN,
            reason=(
                f"{summary}: {len(support_origins)} independent origins support this slot."
                f"{weak_independence}"
            ),
            **counts,
        )
    tier1 = {c.origin_id for c in supports if c.authority_tier == 1}
    if slot.primary_ok and tier1:
        return CellResult(
            slot.id,
            CoverageState.GREEN,
            reason=f"{summary}: 1 tier-1 primary origin is enough for this slot.",
            **counts,
        )
    if not support_origins:
        return CellResult(
            slot.id,
            CoverageState.AMBER,
            reason=f"{summary}: the evidence only partially supports this slot.",
            **counts,
        )
    return CellResult(
        slot.id,
        CoverageState.AMBER,
        reason=(
            f"{summary}: {len(support_origins)} of the {slot.min_independent} independent "
            "origins required."
        ),
        **counts,
    )


def compute_coverage(
    slots: list[CoverageSlot],
    claims: list[CoverageClaim],
    open_conflicts_by_slot: dict[str, int],
) -> list[CellResult]:
    by_slot: dict[str, list[CoverageClaim]] = {}
    for c in claims:
        by_slot.setdefault(c.slot_id, []).append(c)
    return [
        compute_cell(s, by_slot.get(s.id, []), open_conflicts_by_slot.get(s.id, 0)) for s in slots
    ]


def rollup_dimensions(
    dimensions: list[CoverageDimension],
    slots: list[CoverageSlot],
    states: dict[str, CoverageState],
) -> list[RollupResult]:
    """One rollup per dimension that has slots (see module docstring)."""
    out: list[RollupResult] = []
    for dim in dimensions:
        own = [s for s in slots if s.dimension_id == dim.id and s.id in states]
        if not own:
            continue
        critical = [s for s in own if s.critical]
        if critical:
            worst = min(critical, key=lambda s: _ORDER[states[s.id]])
            state = states[worst.id]
            reason = f"Worst critical slot: {worst.name} is {state.value}."
        else:
            ordered = sorted(own, key=lambda s: _ORDER[states[s.id]])
            median = ordered[(len(ordered) - 1) // 2]
            state = states[median.id]
            reason = f"No critical slots; median of {len(own)} slots is {state.value}."
        out.append(RollupResult(dim.id, state, reason))
    return out
