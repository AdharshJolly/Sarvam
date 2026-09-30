import type { Phase } from "@contracts/types";
import { Icon } from "./ui/Icon";

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
          const last = i === PHASE_ORDER.length - 1;
          
          let circleClasses = "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-colors ";
          if (status === "done") circleClasses += "bg-good text-bg border-good";
          else if (status === "active") circleClasses += "bg-brand/10 text-brand border-brand";
          else circleClasses += "bg-transparent text-text-muted border-text-muted";

          return (
            <li key={p} aria-current={status === "active" ? "step" : undefined} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span aria-hidden="true" className={circleClasses}>
                  {status === "done" ? <Icon name="Check" size={14} aria-hidden /> : status === "active" ? (live ? <span className="h-2 w-2 rounded-full bg-brand animate-pulse" /> : <Icon name="Play" size={12} className="ml-0.5" aria-hidden />) : "·"}
                </span>
                {!last ? <span aria-hidden="true" className={`w-px flex-1 min-h-[10px] ${status === "done" ? "bg-good" : "bg-border"}`} /> : null}
              </div>
              <span className={`pb-2 text-base leading-6 transition-colors ${status === "pending" ? "text-text-muted font-normal" : status === "active" ? "text-text font-bold" : "text-text font-normal"}`}>
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
