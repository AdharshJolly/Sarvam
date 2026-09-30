import { useEffect, useRef } from "react";
import { formatSeconds } from "../lib/format";
import { eventHint, eventLabel } from "../lib/labels";
import { useReadingMode } from "../lib/readingMode";
import { termTitle } from "../lib/terms";
import type { TimelineItem } from "../state/runStore";
import type { MeterKind } from "./BudgetMeters";
import { StateChip } from "./ui/StateChip";
import { failureChip } from "./ui/chips";
import { Icon } from "./ui/Icon";
import type { IconName } from "./ui/Icon";
import { Button } from "./ui/Button";

export type DockFilter = "all" | "phases" | "sources" | "claims" | "assurance" | "failures" | MeterKind;

const CHIPS: { id: DockFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "phases", label: "Steps" },
  { id: "sources", label: "Sources" },
  { id: "claims", label: termTitle("claim", 2) },
  { id: "assurance", label: "Quality checks" },
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

const ICON: Record<TimelineItem["kind"], IconName> = {
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

/** Filter chips plus the filtered event list. Shared by the desktop dock and the small-screen sheet. */
export function ActivityTimeline({
  timeline,
  startedAt,
  filter,
  onFilter,
  onOpenClaim,
  onOpenSource,
  listClassName = "max-h-[24vh]",
}: {
  timeline: TimelineItem[];
  startedAt: string | undefined;
  filter: DockFilter;
  onFilter: (f: DockFilter) => void;
  onOpenClaim: (id: string) => void;
  onOpenSource: (id: string) => void;
  listClassName?: string;
}) {
  const mode = useReadingMode();
  const listRef = useRef<HTMLOListElement | null>(null);
  const stick = useRef(true);
  const items = timeline.filter((t) => matchesFilter(t, filter));
  const t0 = startedAt ? Date.parse(startedAt) : Number.NaN;

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        {CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={filter === c.id}
            className={`rounded-full border px-3 py-0.5 text-sm transition-colors pointer-coarse:min-h-11 ${
              filter === c.id
                ? "border-brand-secondary bg-brand-secondary font-semibold text-surface"
                : "border-border-strong bg-transparent font-medium hover:bg-surface-2"
            }`}
            onClick={() => onFilter(c.id)}
          >
            {c.label}
          </button>
        ))}
        {!CHIPS.some((c) => c.id === filter) ? (
          <span className="text-sm font-medium">
            Filtered by tool: {filter}{" "}
            <button type="button" className="underline hover:text-brand-secondary" onClick={() => onFilter("all")}>
              clear
            </button>
          </span>
        ) : null}
      </div>
      <ol
        ref={listRef}
        aria-label="Events"
        className={`min-h-24 overflow-y-auto border-t border-border-hairline px-3 py-2 ${listClassName}`}
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
            <li key={it.id} className="grid grid-cols-[3.5rem_1.5rem_12rem_1fr] items-baseline gap-x-2 py-0.5 max-sm:grid-cols-[3.5rem_1.5rem_1fr]">
              <span className="mono text-sm text-text-muted">{offset}</span>
              <span aria-hidden="true" className={c}>
                <Icon name={ICON[it.kind]} size={14} className="inline-block -mt-0.5" />
              </span>
              <span title={eventHint(it.type)} className={`mono text-sm font-semibold max-sm:col-span-1 ${c}`}>
                {eventLabel(it.type, mode)}
              </span>
              <span className="text-sm max-sm:col-start-3">
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
                <span className="mono ml-2 text-sm text-text-muted">
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
    </div>
  );
}

/**
 * Desktop timeline dock (lg and up): a collapsible bar at the bottom of the page. Its open state is
 * owned by the shell so a click on a header metric or budget meter can open it. Below lg the same
 * timeline appears in a bottom sheet instead.
 */
export function ActivityDock({
  timeline,
  startedAt,
  running,
  open,
  onOpenChange,
  filter,
  onFilter,
  onOpenClaim,
  onOpenSource,
}: {
  timeline: TimelineItem[];
  startedAt: string | undefined;
  running: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: DockFilter;
  onFilter: (f: DockFilter) => void;
  onOpenClaim: (id: string) => void;
  onOpenSource: (id: string) => void;
}) {
  const last = timeline.at(-1);
  const mode = useReadingMode();
  return (
    <section
      aria-label="Activity timeline"
      className="activity-dock sticky bottom-0 z-20 hidden border-t border-border-strong bg-surface shadow-elevation lg:block"
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <Button
          size="sm"
          aria-expanded={open}
          icon={<Icon name={open ? "ChevronDown" : "ChevronUp"} size={16} aria-hidden />}
          onClick={() => onOpenChange(!open)}
        >
          Activity ({timeline.length})
        </Button>
        {running ? (
          <span className="inline-flex items-center gap-2 text-sm font-medium text-ok-fg">
            <span className="pulse-dot" aria-hidden="true" /> Live
          </span>
        ) : null}
        {!open && last ? (
          <span className="truncate text-sm font-medium text-text-muted">
            {eventLabel(last.type, mode)}: {last.text}
          </span>
        ) : null}
      </div>
      {open ? (
        <ActivityTimeline
          timeline={timeline}
          startedAt={startedAt}
          filter={filter}
          onFilter={onFilter}
          onOpenClaim={onOpenClaim}
          onOpenSource={onOpenSource}
        />
      ) : null}
    </section>
  );
}
