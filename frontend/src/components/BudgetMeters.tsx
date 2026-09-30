import type { Budget, BudgetUsage } from "@contracts/types";
import { formatSeconds, formatUsd } from "../lib/format";

export type MeterKind = "searches" | "fetches" | "llm" | "cost" | "time";

interface Meter {
  kind: MeterKind;
  label: string;
  used: number;
  max: number | undefined;
  fmt: (n: number) => string;
}

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
        <p style={{ color: "var(--text-muted)" }}>Budget appears when a run starts.</p>
      </section>
    );
  }
  const n = (x: number) => String(Math.round(x));
  const meters: Meter[] = [
    { kind: "searches", label: "Searches", used: usage.searches ?? 0, max: budget.max_searches, fmt: n },
    { kind: "fetches", label: "Fetches", used: usage.fetches ?? 0, max: budget.max_fetches, fmt: n },
    { kind: "llm", label: "LLM calls", used: usage.llm_calls ?? 0, max: budget.max_llm_calls, fmt: n },
    { kind: "cost", label: "Cost (USD)", used: usage.cost_usd ?? 0, max: budget.max_cost_usd, fmt: formatUsd },
    { kind: "time", label: "Time", used: usage.elapsed_seconds ?? 0, max: budget.max_wall_seconds_soft, fmt: formatSeconds },
  ];
  return (
    <section aria-labelledby="budget-h">
      <h2 id="budget-h" className="label mb-2">
        Budget
      </h2>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
        {meters.map((m) => {
          const level = meterLevel(m.used, m.max);
          const color = level === "limit" ? "var(--bad)" : level === "warn" ? "var(--warn)" : "var(--text)";
          const pct = m.max ? Math.min(100, (m.used / m.max) * 100) : 0;
          return (
            <div key={m.kind} className="contents">
              <dt className="text-base" style={{ color: "var(--text-muted)" }}>{m.label}</dt>
              <dd className="text-right" style={{ color }}>
                <button type="button" className="mono underline" onClick={() => onOpenKind?.(m.kind)}>
                  {m.fmt(m.used)} of {m.max !== undefined ? m.fmt(m.max) : "n/a"}
                </button>
                {level === "limit" ? <strong> {"✕"} LIMIT</strong> : level === "warn" ? <span> {"▲"} 80%+</span> : null}
              </dd>
              <div aria-hidden="true" className="col-span-2 h-1 rounded" style={{ background: "var(--surface-2)" }}>
                <div className="progress-fill h-1 rounded" style={{ width: `${pct}%`, background: color }} />
              </div>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
