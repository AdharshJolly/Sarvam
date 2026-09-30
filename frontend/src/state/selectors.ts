import type { CoverageCell, Dimension, EvidenceSlot, Origin, Source, DimensionRollup } from "@contracts/types";
import type { CellChange, SlotStats } from "../components/CoverageMatrix";
import type { OriginGroup } from "../components/OriginGroupView";
import type { StopGap } from "../components/StopCard";
import { gapTextForCell } from "../lib/gap";
import type { RunView } from "./runStore";

export function latestRound(v: RunView): number | null {
  const rounds = Object.keys(v.coverageByRound).map(Number);
  return rounds.length ? Math.max(...rounds) : null;
}

export function roundsAvailable(v: RunView): number[] {
  return Object.keys(v.coverageByRound)
    .map(Number)
    .sort((a, b) => a - b);
}

export function cellsForRound(v: RunView, round: number | null): CoverageCell[] {
  return round === null ? [] : (v.coverageByRound[round] ?? []);
}

export function rollupsForRound(v: RunView, round: number | null): DimensionRollup[] {
  return round === null ? [] : (v.rollupsByRound[round] ?? []);
}

export function cellsBySlot(cells: CoverageCell[]): Map<string, CoverageCell> {
  return new Map(cells.map((c) => [c.slot_id, c]));
}

/** Dimensions and slots come from the plan; run_id is filled from the run. */
export function dimensionsOf(v: RunView): Dimension[] {
  const runId = v.run?.id ?? "";
  return (v.plan?.dimensions ?? []).map((d) => ({
    id: d.id,
    run_id: runId,
    name: d.name,
    description: d.description ?? "",
    critical: d.critical,
  }));
}

export function slotsOf(v: RunView): EvidenceSlot[] {
  const runId = v.run?.id ?? "";
  return (v.plan?.dimensions ?? []).flatMap((d) =>
    (d.slots ?? []).map((s) => ({
      id: s.id,
      run_id: runId,
      dimension_id: d.id,
      name: s.name,
      description: s.description,
      critical: s.critical,
      attributes: s.attributes ?? [],
      min_independent: s.min_independent ?? 2,
      primary_ok: s.primary_ok ?? false,
    })),
  );
}

/** slot id -> "Dimension → Slot" for orientation in panels that reference a slot. */
export function slotPathMap(v: RunView): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of v.plan?.dimensions ?? []) for (const s of d.slots ?? []) out.set(s.id, `${d.name} → ${s.name}`);
  return out;
}

export function slotNameMap(v: RunView): Map<string, string> {
  return new Map(slotsOf(v).map((s) => [s.id, s.name]));
}

export function sourcesForSlot(v: RunView, slotId: string): Source[] {
  return Object.values(v.sources).filter((s) => {
    const task = s.task_id ? v.tasks[s.task_id] : undefined;
    return task?.slot_id === slotId;
  });
}

/** Groups a slot's sources by origin; a source with no origin is its own "unestablished" group. */
export function originsForSlot(v: RunView, slotId: string): OriginGroup[] {
  const groups = new Map<string, OriginGroup>();
  for (const s of sourcesForSlot(v, slotId)) {
    const origin: Origin | null = s.origin_id ? (v.origins[s.origin_id] ?? null) : null;
    const key = origin ? `origin:${origin.id}` : `src:${s.id}`;
    const g = groups.get(key);
    if (g) g.sources.push(s);
    else groups.set(key, { key, origin, sources: [s] });
  }
  return [...groups.values()];
}

export function slotStats(v: RunView): Record<string, SlotStats> {
  const out: Record<string, SlotStats> = {};
  for (const s of slotsOf(v)) {
    const groups = originsForSlot(v, s.id);
    out[s.id] = { sources: groups.reduce((n, g) => n + g.sources.length, 0), origins: groups.length };
  }
  return out;
}

const rank = { RED: 0, AMBER: 1, GREEN: 2 } as const;

/** Cells that improved or worsened between two rounds (slots absent from `prev` are "new"). */
export function roundDiff(prev: CoverageCell[], cur: CoverageCell[]): Record<string, CellChange> {
  const before = cellsBySlot(prev);
  const out: Record<string, CellChange> = {};
  for (const c of cur) {
    const p = before.get(c.slot_id);
    if (!p) out[c.slot_id] = "new";
    else if (rank[c.state] > rank[p.state]) out[c.slot_id] = "improved";
    else if (rank[c.state] < rank[p.state]) out[c.slot_id] = "worse";
    else out[c.slot_id] = "same";
  }
  return out;
}

/** Critical slots whose latest coverage state is not GREEN (remaining gaps for the stop card). */
export function worstCriticalSlots(v: RunView): StopGap[] {
  const round = latestRound(v);
  const cells = cellsBySlot(cellsForRound(v, round));
  const out: StopGap[] = [];
  for (const s of slotsOf(v)) {
    if (!s.critical) continue;
    const c = cells.get(s.id);
    if (c?.state === "GREEN") continue;
    const g = gapTextForCell(c);
    out.push({ slotId: s.id, name: s.name, reason: g.reason, nextStep: g.next_step });
  }
  return out.sort((a, b) => {
    const ra = cells.get(a.slotId)?.state ?? "RED";
    const rb = cells.get(b.slotId)?.state ?? "RED";
    return rank[ra] - rank[rb];
  });
}

export function challengesCompleted(v: RunView): number {
  return Object.values(v.challenges).filter((c) => c.outcome != null).length;
}

export function openConflictCount(v: RunView): number {
  return Object.values(v.conflicts).filter((c) => (c.status ?? "open") === "open").length;
}
