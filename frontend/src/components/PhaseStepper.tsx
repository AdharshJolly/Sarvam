import type { Phase } from "@contracts/types";

/** The ten lifecycle states (SSOT section 7), in order. */
export const PHASE_ORDER: Phase[] = [
  "PLAN",
  "DISCOVER",
  "ACQUIRE",
  "EXTRACT",
  "CLAIMS",
  "VERIFY",
  "ANALYZE",
  "CHALLENGE",
  "STOP_POLICY",
  "SYNTHESIZE",
];

export const phaseLabel = (p: Phase): string => p.replace("_", " ");

export function PhaseStepper({ current, finished = false }: { current: Phase | null; finished?: boolean }) {
  const idx = current ? PHASE_ORDER.indexOf(current) : -1;
  return (
    <nav aria-label="Run phase">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide">Phase</h2>
      <ol className="flex flex-col gap-1">
        {PHASE_ORDER.map((p, i) => {
          const status = finished || i < idx ? "done" : i === idx ? "active" : "pending";
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
              <span style={{ fontWeight: status === "active" ? 600 : 400 }}>{phaseLabel(p)}</span>
              <span className="sr-only">({status})</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
