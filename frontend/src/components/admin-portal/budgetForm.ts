import type { Budget } from "@contracts/types";

export const BUDGET_FIELDS = [
  { key: "max_searches", label: "Max searches", step: 1, integer: true },
  { key: "max_fetches", label: "Max fetches", step: 1, integer: true },
  { key: "max_llm_calls", label: "Max LLM calls", step: 1, integer: true },
  { key: "max_cost_usd", label: "Max cost (USD)", step: 0.05, integer: false },
  { key: "max_wall_seconds_soft", label: "Soft wall time (s)", step: 1, integer: true },
  { key: "max_wall_seconds_hard", label: "Hard wall time (s)", step: 1, integer: true },
  { key: "max_followup_rounds", label: "Max follow-up rounds", step: 1, integer: true },
] as const satisfies readonly { key: keyof Budget; label: string; step: number; integer: boolean }[];

export type BudgetKey = (typeof BUDGET_FIELDS)[number]["key"];
export type BudgetText = Record<BudgetKey, string>;

export function budgetToText(b: Budget): BudgetText {
  const out = {} as BudgetText;
  for (const f of BUDGET_FIELDS) out[f.key] = String(b[f.key] ?? "");
  return out;
}

export interface BudgetParse {
  budget: Budget | null;
  /** Field-level problems (and a cross-field one under `max_wall_seconds_hard`). Empty = valid. */
  errors: Partial<Record<BudgetKey, string>>;
}

/** Mirrors `validate_budget` in backend/admin/actions.py; the server is still the authority. */
export function parseBudgetForm(text: BudgetText): BudgetParse {
  const errors: Partial<Record<BudgetKey, string>> = {};
  const values = {} as Record<BudgetKey, number>;
  for (const f of BUDGET_FIELDS) {
    const raw = text[f.key].trim();
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n)) {
      errors[f.key] = "Enter a number";
    } else if (f.integer && !Number.isInteger(n)) {
      errors[f.key] = "Must be a whole number";
    } else if (f.key === "max_cost_usd" ? n <= 0 : f.key === "max_followup_rounds" ? n < 0 : n < 1) {
      errors[f.key] =
        f.key === "max_cost_usd" ? "Must be greater than 0" : f.key === "max_followup_rounds" ? "Must not be negative" : "Must be at least 1";
    } else {
      values[f.key] = n;
    }
  }
  if (
    !errors.max_wall_seconds_hard &&
    !errors.max_wall_seconds_soft &&
    values.max_wall_seconds_hard < values.max_wall_seconds_soft
  ) {
    errors.max_wall_seconds_hard = "Must not be below the soft limit";
  }
  return Object.keys(errors).length > 0 ? { budget: null, errors } : { budget: values, errors };
}
