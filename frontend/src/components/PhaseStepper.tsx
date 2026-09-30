/** The ten lifecycle states (SSOT section 7). */
export const PHASES = [
  "PLAN",
  "DISCOVER",
  "ACQUIRE",
  "EXTRACT",
  "CLAIMS",
  "VERIFY",
  "ANALYZE",
  "CHALLENGE",
  "STOP POLICY",
  "SYNTHESIZE",
] as const;

export type Phase = (typeof PHASES)[number];

export function PhaseStepper({ current }: { current: Phase | null }) {
  const idx = current ? PHASES.indexOf(current) : -1;
  return (
    <nav aria-label="Run phase">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide">Phase</h2>
      <ol className="flex flex-col gap-1">
        {PHASES.map((p, i) => {
          const status = i < idx ? "done" : i === idx ? "active" : "pending";
          const icon = status === "done" ? "✓" : status === "active" ? "▶" : "·";
          return (
            <li
              key={p}
              aria-current={status === "active" ? "step" : undefined}
              className="flex items-center gap-2 text-base"
              style={{ color: status === "pending" ? "var(--text-muted)" : "var(--text)" }}
            >
              <span aria-hidden="true" className="w-4 text-center">
                {icon}
              </span>
              <span>{p}</span>
              <span className="sr-only">({status})</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
