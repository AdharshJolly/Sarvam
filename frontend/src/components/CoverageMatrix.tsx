import type { CoverageCell, CoverageState, Dimension, DimensionRollup, EvidenceSlot } from "@contracts/types";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { type GridPos, firstCell, gridMove } from "../lib/grid";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";
import { Icon } from "./ui/Icon";
import { StateChip } from "./ui/StateChip";
import { useReadingMode } from "../lib/readingMode";
import { coverageChip } from "./ui/chips";
import { term, termTitle } from "../lib/terms";

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

type Tone = "ok" | "warn" | "bad" | "muted";
const TONE_OF: Record<CoverageState, Tone> = { RED: "bad", AMBER: "warn", GREEN: "ok" };

const CELL_BORDER: Record<Tone, string> = {
  ok: "border-l-4 border-l-ok-fg border-y-border-hairline border-r-border-hairline bg-surface hover:bg-surface-2",
  warn: "border-l-4 border-l-warn-fg border-y-border-hairline border-r-border-hairline bg-surface hover:bg-surface-2",
  bad: "border-l-4 border-l-bad-fg border-y-border-hairline border-r-border-hairline bg-surface hover:bg-surface-2",
  muted: "border-l-4 border-l-border-hairline border-y-border-hairline border-r-border-hairline bg-surface hover:bg-surface-2",
};

const BADGE_STYLE: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok-fg border border-ok-border",
  warn: "bg-warn-bg text-warn-fg border border-warn-border",
  bad: "bg-bad-bg text-bad-fg border border-bad-border",
  muted: "bg-surface-2 text-text-muted border border-border-hairline",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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

/**
 * The coverage matrix (SSOT section 12): one row per dimension, one cell per evidence slot. It is an
 * ARIA grid with a roving tabindex, so Tab enters it once and the arrow keys move between cells.
 * Every cell shows its state as an icon and a word, and how many sources collapse into how many
 * independent origins.
 */
export function CoverageMatrix(p: CoverageMatrixProps) {
  const cellBySlot = new Map(p.cells.map((c) => [c.slot_id, c]));
  const rollupByDim = new Map(p.rollups.map((r) => [r.dimension_id, r]));
  const flashing = useFlashing(p.cells);
  const detailed = useReadingMode() === "detailed";

  const rows = useMemo(
    () => p.dimensions.map((dim) => ({ dim, slots: p.slots.filter((s) => s.dimension_id === dim.id) })),
    [p.dimensions, p.slots],
  );
  const rowLengths = useMemo(() => rows.map((r) => r.slots.length), [rows]);
  const positionOf = (slotId: string | null): GridPos | null => {
    if (!slotId) return null;
    for (let row = 0; row < rows.length; row++) {
      const col = rows[row]?.slots.findIndex((s) => s.id === slotId) ?? -1;
      if (col >= 0) return { row, col };
    }
    return null;
  };

  const [active, setActive] = useState<GridPos | null>(null);
  useEffect(() => {
    const pos = positionOf(p.selected);
    if (pos) setActive(pos);
  }, [p.selected]); // eslint-disable-line react-hooks/exhaustive-deps

  // The tab stop: the last focused cell, else the selected one, else the first (also after the plan changes).
  const stop = (() => {
    if (active && (rowLengths[active.row] ?? 0) > active.col) return active;
    return positionOf(p.selected) ?? firstCell(rowLengths);
  })();

  const refs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const onKeyDown = (e: KeyboardEvent, pos: GridPos) => {
    const next = gridMove(rowLengths, pos, e.key, e.ctrlKey);
    if (!next) return;
    e.preventDefault();
    setActive(next);
    const slot = rows[next.row]?.slots[next.col];
    if (slot) refs.current.get(slot.id)?.focus();
  };

  return (
    <Card role="grid" aria-label="Coverage matrix" className="overflow-hidden">
      {rows.map(({ dim, slots }, row) => {
        const roll = rollupByDim.get(dim.id);
        return (
          <div
            key={dim.id}
            role="row"
            aria-label={`Dimension ${dim.name}`}
            className={`grid gap-4 p-4 lg:grid-cols-[13rem_1fr] items-start ${
              row === 0 ? "" : "border-t border-border-hairline"
            }`}
          >
            <div role="rowheader" className="flex flex-col gap-1.5 pr-2">
              <h3 className="font-semibold text-base text-text">{dim.name}</h3>
              <div className="flex flex-wrap items-center gap-1.5">
                {dim.critical ? <Badge>critical</Badge> : null}
                {roll ? <StateChip spec={coverageChip(roll.state)} /> : null}
              </div>
              {roll ? (
                <p className="text-sm text-text-muted leading-relaxed line-clamp-3 mt-0.5 font-normal">
                  {roll.reason}
                </p>
              ) : null}
            </div>

            <div role="none" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {slots.map((s, col) => {
                const cell = cellBySlot.get(s.id);
                const st = p.stats[s.id] ?? { sources: 0, origins: 0 };
                const change = p.changes?.[s.id];
                const tone: Tone = cell ? TONE_OF[cell.state] : "muted";
                const selected = p.selected === s.id;
                const isStop = stop?.row === row && stop.col === col;
                const conflicts = cell?.open_conflicts ?? 0;
                return (
                  <div key={s.id} role="gridcell" aria-selected={selected}>
                    <button
                      ref={(el) => {
                        refs.current.set(s.id, el);
                      }}
                      type="button"
                      tabIndex={isStop ? 0 : -1}
                      aria-pressed={selected}
                      aria-label={`${s.name}: ${cell ? coverageChip(cell.state).label : "no data yet"}. ${plural(st.sources, "source")}, ${plural(
                        st.origins,
                        "independent origin",
                      )}${conflicts > 0 ? `, ${plural(conflicts, "unexplained disagreement")}` : ""}. Open details.`}
                      onClick={() => p.onSelect(selected ? null : s.id)}
                      onFocus={() => setActive({ row, col })}
                      onKeyDown={(e) => onKeyDown(e, { row, col })}
                      className={`matrix-cell flex min-h-11 w-full flex-col rounded-lg border p-3.5 text-left transition-all ${
                        CELL_BORDER[tone]
                      } ${selected ? "ring-2 ring-brand-secondary ring-offset-2 ring-offset-surface" : ""} ${
                        flashing.has(s.id) ? "anim-flash" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-sm font-mono font-medium ${BADGE_STYLE[tone]}`}>
                          <Icon name={cell ? coverageChip(cell.state).icon : "Circle"} size={13} aria-hidden />
                          <span>{cell ? coverageChip(cell.state).label : "No data yet"}</span>
                          {detailed && cell ? <span className="opacity-70">({cell.state})</span> : null}
                        </span>

                        {change ? (
                          <span className="flex items-center gap-1 text-sm font-semibold text-brand-secondary">
                            {change === "improved" ? <Icon name="TrendingUp" size={14} aria-hidden /> : null}
                            {change === "worse" ? <Icon name="TrendingDown" size={14} aria-hidden /> : null}
                            {change === "new" ? "new this round" : change}
                          </span>
                        ) : null}
                      </div>

                      <span className="font-medium text-base text-text leading-snug mt-2">
                        {s.name}
                      </span>

                      <div className="font-mono text-sm text-text-muted mt-1 flex flex-wrap items-center gap-2">
                        <span>
                          <strong className="text-text font-semibold">{st.sources}</strong> {st.sources === 1 ? "source" : "sources"}
                        </span>
                        <span className="text-border-hairline">/</span>
                        <span>
                          <strong className="text-text font-semibold">{st.origins}</strong> {term("origin", st.origins)}
                        </span>
                        {conflicts > 0 ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-bad-fg ml-auto">
                            <Icon name="Zap" size={13} aria-hidden /> {conflicts}
                          </span>
                        ) : null}
                      </div>

                      <span className="line-clamp-2 text-sm text-text-muted mt-1.5 leading-relaxed font-normal">
                        {cell ? cell.reason : "Awaiting coverage analysis."}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </Card>
  );
}

/**
 * The same data as a plain table: the accessible alternative to the colour-coded grid, and the easier
 * form for reading exact numbers or scanning reasons.
 */
export function MatrixTable(p: CoverageMatrixProps) {
  const cellBySlot = new Map(p.cells.map((c) => [c.slot_id, c]));
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-base">
        <caption className="sr-only">Coverage by key point</caption>
        <thead>
          <tr className="border-b border-border-hairline text-text-muted">
            {["Dimension", termTitle("slot"), "State", "Sources", termTitle("origin", 2), "Disagreements", "Reason"].map((h) => (
              <th key={h} scope="col" className="label p-2.5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.dimensions.flatMap((dim) =>
            p.slots
              .filter((s) => s.dimension_id === dim.id)
              .map((s) => {
                const cell = cellBySlot.get(s.id);
                const st = p.stats[s.id] ?? { sources: 0, origins: 0 };
                const selected = p.selected === s.id;
                return (
                  <tr key={s.id} className={`border-b border-border-hairline align-top ${selected ? "bg-surface-2" : ""}`}>
                    <td className="p-2.5 font-semibold">{dim.name}</td>
                    <td className="p-2.5">
                      <button
                        type="button"
                        aria-pressed={selected}
                        className="text-left underline hover:text-brand-secondary"
                        onClick={() => p.onSelect(selected ? null : s.id)}
                      >
                        {s.name}
                      </button>
                    </td>
                    <td className="p-2.5">{cell ? <StateChip spec={coverageChip(cell.state)} /> : "No data"}</td>
                    <td className="mono p-2.5">{st.sources}</td>
                    <td className="mono p-2.5">{st.origins}</td>
                    <td className="mono p-2.5">{cell?.open_conflicts ?? 0}</td>
                    <td className="p-2.5 text-text-muted">{cell ? cell.reason : "Awaiting coverage analysis."}</td>
                  </tr>
                );
              }),
          )}
        </tbody>
      </table>
    </Card>
  );
}
