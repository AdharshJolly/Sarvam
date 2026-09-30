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

export function PhaseStepper({ current, finished = false, live = false }: { current: Phase | null; finished?: boolean; live?: boolean }) {
  const idx = current ? PHASE_ORDER.indexOf(current) : -1;
  return (
    <nav aria-label="Run phase">
      <h2 className="label mb-2">Research</h2>
      <ol className="flex flex-col">
        {PHASE_ORDER.map((p, i) => {
          const status = finished || i < idx ? "done" : i === idx ? "active" : "pending";
          const color = status === "done" ? "var(--ok)" : status === "active" ? "var(--accent)" : "var(--text-muted)";
          const last = i === PHASE_ORDER.length - 1;
          return (
            <li key={p} aria-current={status === "active" ? "step" : undefined} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm font-bold"
                  style={{
                    borderColor: color,
                    color: status === "done" ? "var(--bg)" : color,
                    background: status === "done" ? "var(--ok)" : status === "active" ? "var(--accent-bg)" : "transparent",
                  }}
                >
                  {status === "done" ? "✓" : status === "active" ? (live ? <span className="pulse-dot" style={{ color }} /> : "▶") : "·"}
                </span>
                {!last ? <span aria-hidden="true" className="w-px flex-1" style={{ minHeight: 10, background: status === "done" ? "var(--ok)" : "var(--border)" }} /> : null}
              </div>
              <span className="pb-2 text-base leading-6" style={{ color: status === "pending" ? "var(--text-muted)" : "var(--text)", fontWeight: status === "active" ? 700 : 400 }}>
                {phaseLabel(p)}
                <span className="sr-only"> ({status})</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
