import type { CoverageCell, CoverageState, Dimension, EvidenceSlot } from "@contracts/types";
import { useEffect, useRef, useState } from "react";
import { Badge } from "./ui/Badge";
import { StateChip } from "./ui/StateChip";
import { coverageChip, toneBg, toneVar } from "./ui/chips";

export interface SlotStats {
  sources: number;
  origins: number;
}

/** Structural stand-in until the contract addendum ships DimensionRollup. */
export interface RollupView {
  dimension_id: string;
  state: CoverageState;
  reason: string;
}

export type CellChange = "improved" | "worse" | "same" | "new";

export interface CoverageMatrixProps {
  dimensions: Dimension[];
  slots: EvidenceSlot[];
  cells: CoverageCell[];
  rollups: RollupView[];
  stats: Record<string, SlotStats>;
  /** slot id -> change vs previous round (only when compare is on). */
  changes?: Record<string, CellChange>;
  selected: string | null;
  onSelect: (slotId: string | null) => void;
}

const changeText: Record<CellChange, string | null> = {
  improved: "▲ improved",
  worse: "▼ worse",
  same: null,
  new: "new this round",
};

const toneOf = { RED: "bad", AMBER: "warn", GREEN: "ok" } as const;

/** Slots whose state changed since the previous render flash once (a live state change, not decoration). */
function useFlashing(cells: CoverageCell[]): Set<string> {
  const prev = useRef<Map<string, CoverageState>>(new Map());
  const [flash, setFlash] = useState<Set<string>>(new Set());
  useEffect(() => {
    const changed = new Set<string>();
    for (const c of cells) {
      const before = prev.current.get(c.slot_id);
      if (before !== undefined && before !== c.state) changed.add(c.slot_id);
      prev.current.set(c.slot_id, c.state);
    }
    if (changed.size === 0) return;
    setFlash(changed);
    const t = setTimeout(() => setFlash(new Set()), 1300);
    return () => clearTimeout(t);
  }, [cells]);
  return flash;
}

export function CoverageMatrix(p: CoverageMatrixProps) {
  const cellBySlot = new Map(p.cells.map((c) => [c.slot_id, c]));
  const rollupByDim = new Map(p.rollups.map((r) => [r.dimension_id, r]));
  const flashing = useFlashing(p.cells);
  return (
    <div role="grid" aria-label="Coverage matrix" className="card overflow-hidden">
      {p.dimensions.map((d, di) => {
        const roll = rollupByDim.get(d.id);
        const dimSlots = p.slots.filter((s) => s.dimension_id === d.id);
        return (
          <div
            key={d.id}
            role="row"
            aria-label={`Dimension ${d.name}`}
            className="grid gap-3 p-3 lg:grid-cols-[13rem_1fr]"
            style={{ borderTop: di === 0 ? "none" : "1px solid var(--border)" }}
          >
            <div role="rowheader" className="flex flex-col gap-1">
              <h3 className="font-semibold">{d.name}</h3>
              <div className="flex flex-wrap items-center gap-1">
                {d.critical ? <Badge>critical</Badge> : null}
                {roll ? <StateChip spec={coverageChip(roll.state)} /> : null}
              </div>
              {roll ? (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {roll.reason}
                </p>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {dimSlots.map((s) => {
                const cell = cellBySlot.get(s.id);
                const st = p.stats[s.id] ?? { sources: 0, origins: 0 };
                const ch = p.changes?.[s.id];
                const chText = ch ? changeText[ch] : null;
                const tone = cell ? toneOf[cell.state] : "muted";
                const isSel = p.selected === s.id;
                return (
                  <button
                    key={s.id}
                    role="gridcell"
                    type="button"
                    aria-pressed={isSel}
                    aria-label={`${s.name}: ${cell ? cell.state : "no data yet"}. ${st.sources} sources, ${st.origins} independent origins. Open details.`}
                    onClick={() => p.onSelect(isSel ? null : s.id)}
                    className={`matrix-cell rounded-lg border p-3 text-left ${flashing.has(s.id) ? "anim-flash" : ""}`}
                    style={{
                      borderColor: isSel ? "var(--accent)" : toneVar[tone],
                      borderWidth: isSel ? 2 : 1,
                      background: toneBg[tone],
                      boxShadow: isSel ? "var(--shadow)" : undefined,
                    }}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-semibold" style={{ color: toneVar[tone] }}>
                        {cell ? `${coverageChip(cell.state).icon} ${cell.state}` : "○ NO DATA"}
                      </span>
                      {chText ? (
                        <span className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
                          {chText}
                        </span>
                      ) : null}
                    </div>
                    <p className="font-medium leading-snug">{s.name}</p>
                    <p className="mono mt-1" style={{ color: "var(--text-muted)" }}>
                      {st.sources} src {"→"} {st.origins} origin{st.origins === 1 ? "" : "s"}
                      {(cell?.open_conflicts ?? 0) > 0 ? ` · ⚡ ${cell?.open_conflicts}` : ""}
                    </p>
                    <p className="mt-1 text-sm" style={{ color: "var(--text-muted)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {cell ? cell.reason : "Awaiting coverage analysis."}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
