import { useEffect, useRef, useState } from "react";
import { formatSeconds } from "../lib/format";
import type { TimelineItem } from "../state/runStore";
import type { MeterKind } from "./BudgetMeters";
import { StateChip } from "./ui/StateChip";
import { failureChip, toneVar } from "./ui/chips";

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

/** Short uppercase label per event type, in the style of the plan ("PLAN CREATED", "ORIGIN UPDATED"). */
const LABEL: Record<TimelineItem["type"], string> = {
  "run.started": "RUN STARTED",
  "phase.entered": "PHASE",
  "plan.created": "PLAN CREATED",
  "task.started": "SEARCHING",
  "source.found": "SOURCE FOUND",
  "source.fetched": "SOURCE FETCHED",
  "source.failed": "SOURCE FAILED",
  "passages.created": "PASSAGES STORED",
  "claim.created": "CLAIM",
  "claim.rejected": "CLAIM REJECTED",
  "claim.verified": "CLAIM VERIFIED",
  "origin.updated": "ORIGIN UPDATED",
  "conflict.detected": "CONFLICT DETECTED",
  "coverage.updated": "COVERAGE UPDATED",
  "round.started": "NEW ROUND",
  "challenge.created": "CHALLENGE CREATED",
  "challenge.outcome": "CHALLENGE OUTCOME",
  "stop.decided": "STOP DECIDED",
  "report.draft": "REPORT DRAFT",
  "report.verified": "REPORT VERIFIED",
  "budget.warning": "BUDGET WARNING",
  "run.completed": "RUN COMPLETED",
  "run.failed": "RUN FAILED",
};

const ICON: Record<TimelineItem["kind"], string> = {
  phase: "▶",
  source: "▤",
  claim: "❝",
  assurance: "◈",
  failure: "✕",
  other: "·",
};

const KIND_TONE: Record<TimelineItem["kind"], "info" | "muted" | "ok" | "warn" | "bad"> = {
  phase: "info",
  source: "muted",
  claim: "ok",
  assurance: "warn",
  failure: "bad",
  other: "muted",
};

export function ActivityDock({
  timeline,
  startedAt,
  running,
  filter,
  onFilter,
  onOpenClaim,
  onOpenSource,
}: {
  timeline: TimelineItem[];
  startedAt: string | undefined;
  running: boolean;
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
  const last = timeline.at(-1);

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items.length, open]);

  return (
    <section
      aria-label="Activity timeline"
      className="activity-dock sticky bottom-0 z-10 border-t"
      style={{ borderColor: "var(--border-strong)", background: "var(--surface)", boxShadow: "0 -4px 16px rgb(0 0 0 / 0.08)" }}
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button type="button" aria-expanded={open} className="btn font-semibold" onClick={() => setOpen((v) => !v)}>
          {open ? "▾" : "▴"} Activity ({timeline.length})
        </button>
        {running ? (
          <span className="inline-flex items-center gap-2 text-base" style={{ color: "var(--ok)" }}>
            <span className="pulse-dot" aria-hidden="true" /> Live
          </span>
        ) : null}
        {!open && last ? (
          <span className="truncate text-base" style={{ color: "var(--text-muted)" }}>
            {LABEL[last.type]}: {last.text}
          </span>
        ) : null}
        {open
          ? CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={filter === c.id}
                className="rounded-full border px-3 py-0.5 text-sm"
                style={{
                  borderColor: filter === c.id ? "var(--accent)" : "var(--border)",
                  background: filter === c.id ? "var(--accent-bg)" : "transparent",
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
          className="max-h-[24vh] min-h-24 overflow-y-auto border-t px-3 py-2"
          style={{ borderColor: "var(--border)" }}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          }}
        >
          {items.length === 0 ? <li style={{ color: "var(--text-muted)" }}>No events match this filter yet.</li> : null}
          {items.map((it) => {
            const ref = it.claimId ?? it.sourceId;
            const offset = Number.isNaN(t0) ? "" : formatSeconds((Date.parse(it.ts) - t0) / 1000);
            const c = toneVar[KIND_TONE[it.kind]];
            return (
              <li key={it.id} className="anim-in grid grid-cols-[3.5rem_1.5rem_9.5rem_1fr] items-baseline gap-x-2 py-0.5">
                <span className="mono" style={{ color: "var(--text-muted)" }}>
                  {offset}
                </span>
                <span aria-hidden="true" style={{ color: c }}>
                  {ICON[it.kind]}
                </span>
                <span className="mono font-semibold" style={{ color: c }}>
                  {LABEL[it.type]}
                </span>
                <span className="text-base">
                  {it.failure ? (
                    <span className="mr-2">
                      <StateChip spec={failureChip(it.failure)} />
                    </span>
                  ) : null}
                  {ref ? (
                    <button
                      type="button"
                      className="text-left underline"
                      onClick={() => (it.claimId ? onOpenClaim(it.claimId) : it.sourceId ? onOpenSource(it.sourceId) : undefined)}
                    >
                      {it.text}
                    </button>
                  ) : (
                    it.text
                  )}
                  <span className="mono ml-2" style={{ color: "var(--text-muted)" }}>
                    {[
                      it.stepMs !== null ? `${(it.stepMs / 1000).toFixed(1)}s` : null,
                      it.tokens !== null ? `${it.tokens} tok` : null,
                      it.costUsd !== null ? `$${it.costUsd.toFixed(3)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
