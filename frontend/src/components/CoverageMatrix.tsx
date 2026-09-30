import type { CoverageCell, CoverageState, Dimension, EvidenceSlot, DimensionRollup } from "@contracts/types";
import { useEffect, useRef, useState } from "react";
import { Badge } from "./ui/Badge";
import { StateChip } from "./ui/StateChip";
import { coverageChip } from "./ui/chips";
import { Icon } from "./ui/Icon";

export interface SlotStats {
  sources: number;
  origins: number;
}

export type CellChange = "improved" | "worse" | "same" | "new";

export interface CoverageMatrixProps {
  dimensions: Dimension[];
  slots: EvidenceSlot[];
  cells: CoverageCell[];
  rollups: DimensionRollup[];
  stats: Record<string, SlotStats>;
  /** slot id -> change vs previous round (only when compare is on). */
  changes?: Record<string, CellChange>;
  selected: string | null;
  onSelect: (slotId: string | null) => void;
}

const toneOf = { RED: "bad", AMBER: "warn", GREEN: "ok" } as const;

const TONE_COLORS = {
  ok: "bg-ok-bg border-ok-border text-ok-fg",
  warn: "bg-warn-bg border-warn-border text-warn-fg",
  bad: "bg-bad-bg border-bad-border text-bad-fg",
  muted: "bg-surface-2 border-border-hairline text-text-muted",
};

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
    <div aria-label="Coverage matrix" className="card overflow-hidden">
      {p.dimensions.map((d, di) => {
        const roll = rollupByDim.get(d.id);
        const dimSlots = p.slots.filter((s) => s.dimension_id === d.id);
        return (
          <div
            key={d.id}
            aria-label={`Dimension ${d.name}`}
            className={`grid gap-3 p-3 lg:grid-cols-[13rem_1fr] ${di === 0 ? '' : 'border-t border-border-hairline'}`}
          >
            <div className="flex flex-col gap-1">
              <h3 className="font-semibold">{d.name}</h3>
              <div className="flex flex-wrap items-center gap-1">
                {d.critical ? <Badge>critical</Badge> : null}
                {roll ? <StateChip spec={coverageChip(roll.state)} /> : null}
              </div>
              {roll ? (
                <p className="text-sm text-text-muted">
                  {roll.reason}
                </p>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {dimSlots.map((s) => {
                const cell = cellBySlot.get(s.id);
                const st = p.stats[s.id] ?? { sources: 0, origins: 0 };
                const ch = p.changes?.[s.id];
                const tone = cell ? toneOf[cell.state] : "muted";
                const isSel = p.selected === s.id;
                
                const toneClass = TONE_COLORS[tone] ?? TONE_COLORS.muted;
                const [bgColor, borderColor, textColor] = toneClass.split(" ");
                
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={isSel}
                    aria-label={`${s.name}: ${cell ? cell.state : "no data yet"}. ${st.sources} sources, ${st.origins} independent origins. Open details.`}
                    onClick={() => p.onSelect(isSel ? null : s.id)}
                    className={`matrix-cell rounded-lg border p-3 text-left transition-colors focus-visible:outline-brand-secondary ${flashing.has(s.id) ? "anim-flash" : ""} ${bgColor} ${isSel ? 'border-brand-secondary border-2 shadow-elevation' : `${borderColor} border`}`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className={`font-semibold flex items-center gap-1 ${textColor}`}>
                        {cell ? (
                          <>
                            <Icon name={coverageChip(cell.state).icon as any} size={14} aria-hidden />
                            {cell.state}
                          </>
                        ) : (
                          <>
                            <Icon name="Circle" size={14} aria-hidden />
                            NO DATA
                          </>
                        )}
                      </span>
                      {ch ? (
                        <span className="text-sm font-semibold flex items-center gap-1 text-brand-secondary">
                          {ch === "improved" ? <Icon name="TrendingUp" size={14} /> : ch === "worse" ? <Icon name="TrendingDown" size={14} /> : null}
                          {ch === "new" ? "new this round" : ch}
                        </span>
                      ) : null}
                    </div>
                    <p className="font-medium leading-snug">{s.name}</p>
                    <p className="mono mt-1 text-text-muted flex items-center gap-1 text-xs">
                      {st.sources} src <Icon name="ArrowRight" size={10} aria-hidden /> {st.origins} origin{st.origins === 1 ? "" : "s"}
                      {(cell?.open_conflicts ?? 0) > 0 ? (
                        <span className="flex items-center gap-0.5 ml-1"><Icon name="Zap" size={10} aria-hidden /> {cell?.open_conflicts}</span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-sm text-text-muted line-clamp-2">
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
