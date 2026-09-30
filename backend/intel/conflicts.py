"""Numeric conflict detection (SSOT 9.7, FR-12). Pure and deterministic; the explainer is separate.

Claims in one slot that are about the same entity and attribute are brought to comparable terms
(`numeric.normalize_value`) and grouped into *positions*: claims whose normalised values agree
within the tolerance are one position. Two positions that differ by more than the tolerance are a
conflict (one row per pair of positions, represented by the most primary claim on each side). No
claim is dropped: the losing side stays in the store and keeps its citation.

Two kinds of finding come out:

* `disagreement`: positions that still differ after normalisation. Not yet classified; the LLM
  conflict explainer decides `scope_difference`, `temporal`, `definition`, `unit_error` or
  `genuine`. Until explained it is an open conflict.
* `unit trap`: claims that look different as written (69 per day against 2,070 per month) but agree
  once units, currency and period are normalised. The rule classifies it `unit_error`, explained,
  with a generated explanation, so it is visible without downgrading the cell.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from backend.intel.keys import entities_match, id_number, norm_attribute
from backend.intel.numeric import NormalizedValue, normalize_value, relative_difference
from contracts.models import ConflictKind, ConflictStatus

_TYPE_RANK = {"regulator": 0, "company_primary": 1, "news": 2, "blog": 3, "unknown": 4}


@dataclass(frozen=True)
class ConflictClaim:
    """A claim with everything conflict detection and the explainer need."""

    id: str
    slot_id: str
    entity: str | None
    attribute: str | None
    value_num: float | None
    unit: str | None
    period: str | None
    quote: str
    text: str
    passage_id: str
    source_id: str
    source_type: str
    authority_tier: int
    domain: str
    published_at: str | None
    verdict: str  # only claims judged `supports` can conflict (SSOT 9.7: two supported claims)


@dataclass
class ConflictCandidate:
    slot_id: str
    claim_a: str
    claim_b: str
    delta_pct: float
    members_a: list[str]
    members_b: list[str]
    disagreement: bool  # True: differs after normalisation, needs the explainer
    kind: ConflictKind | None = None  # set by the rule for unit traps
    status: ConflictStatus = ConflictStatus.OPEN
    explanation: str | None = None
    explained_by: str | None = None  # "rule" for unit traps


@dataclass
class _Normalised:
    claim: ConflictClaim
    norm: NormalizedValue = field(repr=False)


def _primary_key(item: _Normalised) -> tuple[int, int, int]:
    c = item.claim
    return (c.authority_tier, _TYPE_RANK.get(c.source_type, 4), id_number(c.id))


def _positions(items: list[_Normalised], tolerance: float, value) -> list[list[_Normalised]]:
    """Greedy grouping by value: a claim joins the open position while it is within the tolerance
    of that position's smallest value. Deterministic (sorted by value, then claim id)."""
    out: list[list[_Normalised]] = []
    for item in sorted(items, key=lambda i: (value(i), id_number(i.claim.id))):
        if out and relative_difference(value(out[-1][0]), value(item)) <= tolerance:
            out[-1].append(item)
        else:
            out.append([item])
    return out


def _entity_groups(items: list[_Normalised]) -> list[list[_Normalised]]:
    parent = list(range(len(items)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if entities_match(items[i].claim.entity, items[j].claim.entity):
                parent[find(j)] = find(i)
    groups: dict[int, list[_Normalised]] = {}
    for i, item in enumerate(items):
        groups.setdefault(find(i), []).append(item)
    return list(groups.values())


def describe_raw(n: NormalizedValue) -> str:
    """How a value was written, for explanations: 'Rs 69 per day', '1,200 crore INR'."""
    parts = []
    if n.scale != 1.0:
        parts.append(f"scaled x{n.scale:g}")
    if n.fx_rate != 1.0:
        parts.append(f"converted at {n.fx_rate:g} INR")
    base = f"{n.raw_value:g}"
    unit = (n.raw_unit or "").strip()
    period = f" per {n.raw_period}" if n.raw_period else ""
    text = f"{base} {unit}".strip() + period
    return text + (f" ({', '.join(parts)})" if parts else "")


def _unit_trap_explanation(
    a: ConflictClaim, na: NormalizedValue, b: ConflictClaim, nb: NormalizedValue
) -> str:
    target = f"{(na.value + nb.value) / 2:,.0f} {na.unit}".strip()
    if na.period:
        target += f" per {na.period}"
    return (
        f"{a.id} is quoted as {describe_raw(na)} and {b.id} as {describe_raw(nb)}. "
        f"Once units, currency and period are normalised both are about {target}."
    )


def detect_conflicts(
    claims: list[ConflictClaim], tolerance: float = 0.15
) -> list[ConflictCandidate]:
    """All conflict candidates among `claims` (see module docstring). Claims that cannot be
    compared (no value, no attribute, different units or periods) are ignored, never dropped."""
    by_key: dict[tuple, list[_Normalised]] = {}
    for c in claims:
        attr = norm_attribute(c.attribute)
        if c.verdict != "supports" or c.value_num is None or attr is None:
            continue
        norm = normalize_value(c.value_num, c.unit, c.period, c.quote)
        by_key.setdefault((c.slot_id, attr, norm.unit, norm.period), []).append(
            _Normalised(c, norm)
        )

    out: list[ConflictCandidate] = []
    for (slot_id, _attr, _unit, _period), items in sorted(by_key.items(), key=lambda kv: kv[0][:2]):
        for group in _entity_groups(items):
            positions = _positions(group, tolerance, lambda i: i.norm.value)
            reps = [min(p, key=_primary_key) for p in positions]
            for i in range(len(positions)):
                for j in range(i + 1, len(positions)):
                    a, b = reps[i], reps[j]
                    lo, hi = sorted((a, b), key=lambda r: id_number(r.claim.id))
                    out.append(
                        ConflictCandidate(
                            slot_id=slot_id,
                            claim_a=lo.claim.id,
                            claim_b=hi.claim.id,
                            delta_pct=round(
                                relative_difference(a.norm.value, b.norm.value) * 100, 2
                            ),
                            members_a=sorted((m.claim.id for m in positions[i]), key=id_number),
                            members_b=sorted((m.claim.id for m in positions[j]), key=id_number),
                            disagreement=True,
                        )
                    )
            # Unit traps: one position whose members were written in different terms.
            for position in positions:
                raw_groups = _positions(position, tolerance, lambda i: i.norm.raw_value)
                raw_reps = [min(g, key=_primary_key) for g in raw_groups]
                for i in range(len(raw_groups)):
                    for j in range(i + 1, len(raw_groups)):
                        a, b = raw_reps[i], raw_reps[j]
                        lo, hi = sorted((a, b), key=lambda r: id_number(r.claim.id))
                        out.append(
                            ConflictCandidate(
                                slot_id=slot_id,
                                claim_a=lo.claim.id,
                                claim_b=hi.claim.id,
                                delta_pct=round(
                                    relative_difference(a.norm.raw_value, b.norm.raw_value) * 100, 2
                                ),
                                members_a=sorted(
                                    (m.claim.id for m in raw_groups[i]), key=id_number
                                ),
                                members_b=sorted(
                                    (m.claim.id for m in raw_groups[j]), key=id_number
                                ),
                                disagreement=False,
                                kind=ConflictKind.UNIT_ERROR,
                                status=ConflictStatus.EXPLAINED,
                                explanation=_unit_trap_explanation(
                                    lo.claim, lo.norm, hi.claim, hi.norm
                                ),
                                explained_by="rule",
                            )
                        )
    return out


def contested_claim_ids(candidates: list[ConflictCandidate], open_flags: list[bool]) -> set[str]:
    """Members of both positions of every conflict that is still open (certainty: contested)."""
    out: set[str] = set()
    for cand, is_open in zip(candidates, open_flags, strict=True):
        if is_open:
            out.update(cand.members_a)
            out.update(cand.members_b)
    return out
