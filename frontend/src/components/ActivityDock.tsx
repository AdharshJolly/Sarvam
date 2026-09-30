import { useEffect, useRef, useState } from "react";
import { formatSeconds } from "../lib/format";
import type { TimelineItem } from "../state/runStore";
import type { MeterKind } from "./BudgetMeters";
import { StateChip } from "./ui/StateChip";
import { failureChip } from "./ui/chips";

export type DockFilter = "all" | "phases" | "sources" | "claims" | "assurance" | "failures" | MeterKind;

const CHIPS: { id: DockFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "phases", label: "Phases" },
  { id: "sources", label: "Sources" },
  { id: "claims", label: "Claims" },
  { id: "assurance", label: "Assurance" },
  { id: "failures", label: "Failures" },
];

export function matchesFilter(item: TimelineItem, f: DockFilter): boolean {
  switch (f) {
    case "all":
      return true;
    case "phases":
      return item.kind === "phase";
    case "sources":
      return item.kind === "source";
    case "claims":
      return item.kind === "claim";
    case "assurance":
      return item.kind === "assurance";
    case "failures":
      return item.kind === "failure";
    case "searches":
      return item.type === "task.started";
    case "fetches":
      return item.type === "source.fetched" || item.type === "source.failed";
    case "llm":
      return item.tokens !== null;
    case "cost":
      return item.costUsd !== null;
    case "time":
      return item.stepMs !== null;
  }
}

export function ActivityDock({
  timeline,
  startedAt,
  filter,
  onFilter,
  onOpenClaim,
  onOpenSource,
}: {
  timeline: TimelineItem[];
  startedAt: string | undefined;
  filter: DockFilter;
  onFilter: (f: DockFilter) => void;
  onOpenClaim: (id: string) => void;
  onOpenSource: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const listRef = useRef<HTMLOListElement | null>(null);
  const stick = useRef(true);
  const items = timeline.filter((t) => matchesFilter(t, filter));
  const t0 = startedAt ? Date.parse(startedAt) : Number.NaN;

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items.length, open]);

  return (
    <section
      aria-label="Activity timeline"
      className="activity-dock mt-4 rounded border"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="flex flex-wrap items-center gap-2 p-2">
        <button
          type="button"
          aria-expanded={open}
          className="rounded border px-2 py-1 text-base font-semibold"
          style={{ borderColor: "var(--border)" }}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "▾" : "▸"} Activity ({timeline.length})
        </button>
        {open
          ? CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={filter === c.id}
                className="rounded border px-2 py-0.5 text-sm"
                style={{
                  borderColor: filter === c.id ? "var(--accent)" : "var(--border)",
                  fontWeight: filter === c.id ? 700 : 400,
                }}
                onClick={() => onFilter(c.id)}
              >
                {c.label}
              </button>
            ))
          : null}
        {open && !CHIPS.some((c) => c.id === filter) ? (
          <span className="text-sm">
            Filtered by tool: {filter}{" "}
            <button type="button" className="underline" onClick={() => onFilter("all")}>
              clear
            </button>
          </span>
        ) : null}
      </div>
      {open ? (
        <ol
          ref={listRef}
          className="max-h-64 overflow-y-auto border-t p-2"
          style={{ borderColor: "var(--border)" }}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          }}
        >
          {items.length === 0 ? (
            <li style={{ color: "var(--text-muted)" }}>No events match this filter yet.</li>
          ) : null}
          {items.map((it) => {
            const clickable = it.claimId ?? it.sourceId;
            const offset = Number.isNaN(t0) ? "" : `+${formatSeconds((Date.parse(it.ts) - t0) / 1000)}`;
            return (
              <li key={it.id} className="flex flex-wrap items-baseline gap-2 py-0.5 text-base">
                <span className="w-16 shrink-0 text-sm" style={{ color: "var(--text-muted)" }}>
                  {offset}
                </span>
                <span className="rounded px-1 text-sm" style={{ background: "var(--surface-2)" }}>
                  {it.type}
                </span>
                {it.failure ? <StateChip spec={failureChip(it.failure)} /> : null}
                {clickable ? (
                  <button
                    type="button"
                    className="text-left underline"
                    onClick={() => (it.claimId ? onOpenClaim(it.claimId) : it.sourceId ? onOpenSource(it.sourceId) : undefined)}
                  >
                    {it.text}
                  </button>
                ) : (
                  <span>{it.text}</span>
                )}
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {[
                    it.stepMs !== null ? `${(it.stepMs / 1000).toFixed(1)}s` : null,
                    it.tokens !== null ? `${it.tokens} tok` : null,
                    it.costUsd !== null ? `$${it.costUsd.toFixed(3)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
