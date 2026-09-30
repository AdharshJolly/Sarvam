import type { CoverageCell, CoverageState, Dimension, EvidenceSlot } from "@contracts/types";
import { Badge } from "./ui/Badge";
import { StateChip } from "./ui/StateChip";
import { coverageChip } from "./ui/chips";

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
  onOpenOrigins: (slotId: string) => void;
  onOpenClaims: (slotId: string) => void;
  onOpenConflicts: (slotId: string) => void;
}

const changeText: Record<CellChange, string | null> = {
  improved: "▲ improved",
  worse: "▼ worse",
  same: null,
  new: "new this round",
};

export function CoverageMatrix(p: CoverageMatrixProps) {
  const cellBySlot = new Map(p.cells.map((c) => [c.slot_id, c]));
  const rollupByDim = new Map(p.rollups.map((r) => [r.dimension_id, r]));
  return (
    <div className="flex flex-col gap-4">
      {p.dimensions.map((d) => {
        const roll = rollupByDim.get(d.id);
        const dimSlots = p.slots.filter((s) => s.dimension_id === d.id);
        return (
          <section key={d.id} aria-label={`Dimension ${d.name}`}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold">{d.name}</h3>
              {d.critical ? <Badge>critical</Badge> : null}
              {roll ? <StateChip spec={coverageChip(roll.state)} /> : null}
              {roll ? (
                <span className="text-base" style={{ color: "var(--text-muted)" }}>
                  {roll.reason}
                </span>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {dimSlots.map((s) => {
                const cell = cellBySlot.get(s.id);
                const st = p.stats[s.id] ?? { sources: 0, origins: 0 };
                const ch = p.changes?.[s.id];
                const chText = ch ? changeText[ch] : null;
                return (
                  <article
                    key={s.id}
                    className="matrix-cell rounded border p-3"
                    style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                  >
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-semibold">{s.name}</h4>
                      {cell ? <StateChip spec={coverageChip(cell.state)} /> : <Badge>no data yet</Badge>}
                    </div>
                    {chText ? (
                      <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
                        {chText}
                      </p>
                    ) : null}
                    <p className="text-base">
                      <button
                        type="button"
                        className="underline"
                        aria-label={`Show origin groups for ${s.name}`}
                        onClick={() => p.onOpenOrigins(s.id)}
                      >
                        {st.sources} {st.sources === 1 ? "source" : "sources"}, {st.origins} independent{" "}
                        {st.origins === 1 ? "origin" : "origins"}
                      </button>
                    </p>
                    <p className="text-base">
                      <button type="button" className="underline" onClick={() => p.onOpenClaims(s.id)}>
                        {cell?.supporting_claims ?? 0} supporting claims
                      </button>
                      {(cell?.open_conflicts ?? 0) > 0 ? (
                        <>
                          {" "}
                          <button type="button" className="underline" onClick={() => p.onOpenConflicts(s.id)}>
                            {"⚡"} {cell?.open_conflicts} open conflicts
                          </button>
                        </>
                      ) : null}
                    </p>
                    <p className="mt-1 text-base" style={{ color: "var(--text-muted)" }}>
                      {cell ? cell.reason : "Awaiting coverage analysis for this slot."}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
