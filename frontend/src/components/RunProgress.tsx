import type { Budget, BudgetUsage, Phase } from "@contracts/types";
import { formatSeconds, formatUsd } from "../lib/format";
import { type MeterKind } from "./BudgetMeters";
import { PHASE_ORDER, phaseLabel } from "./PhaseStepper";
import { Card } from "./ui/Card";
import { Icon } from "./ui/Icon";
import { Meter } from "./ui/Meter";

type Status = "done" | "active" | "pending";

export function phaseStatus(index: number, current: number, finished: boolean): Status {
  return finished || index < current ? "done" : index === current ? "active" : "pending";
}

/**
 * The live run view for wide screens: what the run is doing now as the headline, the ten phases as a
 * horizontal stepper, and the budgets as a slim strip. The vertical stepper in the rail stays as the
 * detail view; this is the glanceable one.
 */
export function RunProgress({
  current,
  now,
  live,
  usage,
  budget,
  onOpenMeter,
}: {
  current: Phase | null;
  now: string;
  live: boolean;
  usage: BudgetUsage;
  budget: Budget | undefined;
  onOpenMeter: (k: MeterKind) => void;
}) {
  const idx = current ? PHASE_ORDER.indexOf(current) : -1;
  const n = (x: number) => String(Math.round(x));

  return (
    <Card as="section" aria-labelledby="progress-h" pad="md" className="no-print hidden md:block">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p id="progress-h" className="font-mono text-sm tracking-wider uppercase text-text-muted flex items-center gap-1.5">
            <Icon name="Activity" size={14} className={live ? "blink text-brand" : "text-text-muted"} aria-hidden />
            <span>{live ? "Now" : "Last step"}</span>
          </p>
          <p className="font-display mt-1 text-xl sm:text-2xl font-semibold leading-snug text-text">{now}</p>
        </div>
      </div>

      <ol className="mt-4 flex gap-1.5" aria-label="Phases">
        {PHASE_ORDER.map((p, i) => {
          const status = phaseStatus(i, idx, false);
          return (
            <li key={p} aria-current={status === "active" ? "step" : undefined} className="min-w-0 flex-1">
              <div
                aria-hidden="true"
                className={`h-1.5 rounded-full transition-colors ${
                  status === "done" ? "bg-ok-fg" : status === "active" ? "bg-brand" : "bg-surface-2"
                }`}
              />
              <span
                className={`mt-1.5 flex items-center gap-1 text-sm leading-tight ${
                  status === "active" ? "font-bold text-text" : status === "done" ? "text-text" : "text-text-muted"
                }`}
              >
                {status === "done" ? <Icon name="Check" size={14} className="shrink-0 text-ok-fg" aria-hidden /> : null}
                {status === "active" ? <Icon name="Play" size={14} className="shrink-0 text-brand" aria-hidden /> : null}
                <span className="truncate">{phaseLabel(p)}</span>
                <span className="sr-only"> ({status === "done" ? "done" : status === "active" ? "current" : "not started"})</span>
              </span>
            </li>
          );
        })}
      </ol>

      {budget ? (
        <div className="mt-4 pt-3 border-t border-border-hairline grid grid-cols-2 gap-x-6 gap-y-2 lg:grid-cols-5">
          <Meter label="Searches" used={usage.searches ?? 0} max={budget.max_searches} fmt={n} onClick={() => onOpenMeter("searches")} />
          <Meter label="Fetches" used={usage.fetches ?? 0} max={budget.max_fetches} fmt={n} onClick={() => onOpenMeter("fetches")} />
          <Meter label="LLM calls" used={usage.llm_calls ?? 0} max={budget.max_llm_calls} fmt={n} onClick={() => onOpenMeter("llm")} />
          <Meter label="Cost" used={usage.cost_usd ?? 0} max={budget.max_cost_usd} fmt={formatUsd} onClick={() => onOpenMeter("cost")} />
          <Meter label="Time" used={usage.elapsed_seconds ?? 0} max={budget.max_wall_seconds_soft} fmt={formatSeconds} onClick={() => onOpenMeter("time")} />
        </div>
      ) : null}
    </Card>
  );
}
