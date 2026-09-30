import type { Budget, BudgetUsage } from "@contracts/types";
import { formatSeconds, formatUsd } from "../lib/format";
import { Meter } from "./ui/Meter";

export type MeterKind = "searches" | "fetches" | "llm" | "cost" | "time";

export function meterLevel(used: number, max: number | undefined): "ok" | "warn" | "limit" {
  if (!max || max <= 0) return "ok";
  const r = used / max;
  return r >= 1 ? "limit" : r >= 0.8 ? "warn" : "ok";
}

/** Budget meters (SSOT 5.1 / section 12): amber at 80 percent, LIMIT at 100 percent, with icon and text. */
export function BudgetMeters({
  usage,
  budget,
  onOpenKind,
}: {
  usage: BudgetUsage | null;
  budget: Budget | undefined;
  onOpenKind?: (k: MeterKind) => void;
}) {
  if (!usage || !budget) {
    return (
      <section aria-labelledby="budget-h">
        <h2 id="budget-h" className="label mb-2">
          Budget
        </h2>
        <p className="text-text-muted">Budget appears when a run starts.</p>
      </section>
    );
  }
  const n = (x: number) => String(Math.round(x));
  
  return (
    <section aria-labelledby="budget-h">
      <h2 id="budget-h" className="label mb-2">
        Budget
      </h2>
      <div className="flex flex-col gap-3">
        <Meter key="searches" label="Searches" used={usage.searches ?? 0} max={budget.max_searches} fmt={n} onClick={() => onOpenKind?.("searches")} />
        <Meter key="fetches" label="Fetches" used={usage.fetches ?? 0} max={budget.max_fetches} fmt={n} onClick={() => onOpenKind?.("fetches")} />
        <Meter key="llm" label="LLM calls" used={usage.llm_calls ?? 0} max={budget.max_llm_calls} fmt={n} onClick={() => onOpenKind?.("llm")} />
        <Meter key="cost" label="Cost (USD)" used={usage.cost_usd ?? 0} max={budget.max_cost_usd} fmt={formatUsd} onClick={() => onOpenKind?.("cost")} />
        <Meter key="time" label="Time" used={usage.elapsed_seconds ?? 0} max={budget.max_wall_seconds_soft} fmt={formatSeconds} onClick={() => onOpenKind?.("time")} />
      </div>
    </section>
  );
}
