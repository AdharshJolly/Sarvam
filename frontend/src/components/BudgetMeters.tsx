const METERS = ["Searches", "Fetches", "LLM calls", "Cost (USD)", "Time"] as const;

/** Budget meters (SSOT 5.1 / section 12). Values arrive from run state in later task cards. */
export function BudgetMeters() {
  return (
    <section aria-labelledby="budget-h">
      <h2 id="budget-h" className="mb-1 text-sm font-semibold uppercase tracking-wide">
        Budget
      </h2>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
        {METERS.map((m) => (
          <div key={m} className="contents">
            <dt style={{ color: "var(--text-muted)" }}>{m}</dt>
            <dd className="text-right">n/a</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
