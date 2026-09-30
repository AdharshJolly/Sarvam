import { useEffect, useRef, useState } from "react";
import { formatSeconds } from "../lib/format";
import type { TimelineItem } from "../state/runStore";
import type { MeterKind } from "./BudgetMeters";
import { StateChip } from "./ui/StateChip";
import { failureChip } from "./ui/chips";
import { Icon } from "./ui/Icon";
import type * as LucideIcons from "lucide-react";

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
  phase: "Play",
  source: "FileText",
  claim: "Quote",
  assurance: "ShieldCheck",
  failure: "XOctagon",
  other: "Circle",
};

const TEXT_COLOR: Record<TimelineItem["kind"], string> = {
  phase: "text-info-fg",
  source: "text-text-muted",
  claim: "text-ok-fg",
  assurance: "text-warn-fg",
  failure: "text-bad-fg",
  other: "text-text-muted",
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
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLOListElement | null>(null);
  const stick = useRef(true);
  const items = timeline.filter((t) => matchesFilter(t, filter));
  const t0 = startedAt ? Date.parse(startedAt) : Number.NaN;
  const last = timeline.at(-1);

  useEffect(() => {
    if (window.innerWidth >= 1024) setOpen(true);
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items.length, open]);

  return (
    <section
      aria-label="Activity timeline"
      className="activity-dock fixed inset-x-0 bottom-0 z-50 border-t border-border-strong bg-surface shadow-[0_-4px_12px_rgba(0,0,0,0.1)] lg:sticky lg:shadow-elevation"
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button type="button" aria-expanded={open} className="btn font-semibold text-sm h-8" onClick={() => setOpen((v) => !v)}>
          {open ? "▾" : "▴"} Activity ({timeline.length})
        </button>
        {running ? (
          <span className="inline-flex items-center gap-2 text-sm text-ok-fg font-medium">
            <span className="pulse-dot" aria-hidden="true" /> Live
          </span>
        ) : null}
        {!open && last ? (
          <span className="truncate text-sm text-text-muted font-medium">
            {LABEL[last.type]}: {last.text}
          </span>
        ) : null}
        {open
          ? CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={filter === c.id}
                className={`rounded-full border px-3 py-0.5 text-sm transition-colors ${
                  filter === c.id 
                    ? "border-brand-secondary bg-brand-secondary text-surface font-semibold" 
                    : "border-border-strong bg-transparent font-medium hover:bg-surface-2"
                }`}
                onClick={() => onFilter(c.id)}
              >
                {c.label}
              </button>
            ))
          : null}
        {open && !CHIPS.some((c) => c.id === filter) ? (
          <span className="text-sm font-medium">
            Filtered by tool: {filter}{" "}
            <button type="button" className="underline hover:text-brand-secondary" onClick={() => onFilter("all")}>
              clear
            </button>
          </span>
        ) : null}
      </div>
      {open ? (
        <ol
          ref={listRef}
          className="max-h-[60vh] lg:max-h-[24vh] min-h-24 overflow-y-auto border-t border-border-hairline px-3 py-2"
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          }}
        >
          {items.length === 0 ? <li className="text-text-muted">No events match this filter yet.</li> : null}
          {items.map((it) => {
            const ref = it.claimId ?? it.sourceId;
            const offset = Number.isNaN(t0) ? "" : formatSeconds((Date.parse(it.ts) - t0) / 1000);
            const c = TEXT_COLOR[it.kind];
            return (
              <li key={it.id} className="anim-in grid grid-cols-[3.5rem_1.5rem_9.5rem_1fr] items-baseline gap-x-2 py-0.5">
                <span className="mono text-text-muted text-xs">
                  {offset}
                </span>
                <span aria-hidden="true" className={c}>
                  <Icon name={ICON[it.kind] as keyof typeof LucideIcons} size={14} className="inline-block -mt-0.5" />
                </span>
                <span className={`mono font-semibold text-[0.7rem] ${c}`}>
                  {LABEL[it.type]}
                </span>
                <span className="text-sm">
                  {it.failure ? (
                    <span className="mr-2">
                      <StateChip spec={failureChip(it.failure)} />
                    </span>
                  ) : null}
                  {ref ? (
                    <button
                      type="button"
                      className="text-left underline hover:text-brand-secondary"
                      onClick={() => (it.claimId ? onOpenClaim(it.claimId) : it.sourceId ? onOpenSource(it.sourceId) : undefined)}
                    >
                      {it.text}
                    </button>
                  ) : (
                    it.text
                  )}
                  <span className="mono ml-2 text-xs text-text-muted">
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
