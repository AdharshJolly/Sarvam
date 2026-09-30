import { useState } from "react";
import { useSession } from "../../state/useRunSession";
import { BudgetMeters, type MeterKind } from "../BudgetMeters";
import { PhaseStepper } from "../PhaseStepper";
import { Skeleton } from "../ui/Skeleton";
import { StateChip } from "../ui/StateChip";
import type { ChipSpec } from "../ui/chips";

type Conn = "open" | "connecting" | "closed";
const connectionChips: Record<Conn, ChipSpec> = {
  open: { icon: "●", label: "Stream connected", tone: "ok" },
  connecting: { icon: "⟳", label: "Reconnecting...", tone: "warn" },
  closed: { icon: "○", label: "Stream closed", tone: "muted" },
};

/** Left rail: the orientation layer. Question, phase stepper, Now line, budget meters, stop (SSOT section 12). */
export function LeftRail({ onOpenMeter }: { onOpenMeter: (k: MeterKind) => void }) {
  const { view, stop, stopping, hydrating, runId } = useSession();
  const [confirming, setConfirming] = useState(false);
  const run = view.run;
  const running = run?.status === "running" || run?.status === "queued";
  const scope = run?.scope;
  const finished = run?.status === "completed";
  return (
    <aside
      aria-label="Research status"
      className="left-rail flex flex-col gap-6 border-b p-4 lg:border-r lg:border-b-0"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <section aria-labelledby="question-h">
        <h2 id="question-h" className="label mb-2">
          Research question
        </h2>
        {hydrating ? (
          <div role="status" className="flex flex-col gap-2">
            <span className="sr-only">Loading run...</span>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/5" />
          </div>
        ) : run ? (
          <>
            <p className="font-medium leading-snug">{run.question}</p>
            {scope?.geography || scope?.time_horizon || scope?.constraints ? (
              <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                {[scope?.geography, scope?.time_horizon, scope?.constraints].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </>
        ) : (
          <p style={{ color: "var(--text-muted)" }}>No run started.</p>
        )}
      </section>

      {run ? (
        <section
          aria-label="Now"
          aria-live="polite"
          className="rounded-md p-3"
          style={{ background: "var(--accent-bg)", border: "1px solid var(--border)" }}
        >
          <h2 className="label mb-1">Now</h2>
          <p className="text-base">{view.nowReason || (running ? "Waiting for the first step..." : "No further steps.")}</p>
        </section>
      ) : null}

      {runId ? <PhaseStepper current={view.phase} finished={finished} live={running} /> : null}
      {runId ? <BudgetMeters usage={run ? view.usage : null} budget={run?.budget} onOpenKind={onOpenMeter} /> : null}

      {view.budgetWarnings.length > 0 ? (
        <p role="alert" className="rounded-md border p-2 text-base" style={{ borderColor: "var(--warn)", color: "var(--warn)", background: "var(--warn-bg)" }}>
          {"▲"} Budget warning: {view.budgetWarnings.map((w) => `${w.limit} at ${w.used} of ${w.max}`).join("; ")}
        </p>
      ) : null}

      {run ? <StateChip spec={connectionChips[view.connection]} /> : null}

      {running ? (
        stopping ? (
          <p aria-live="polite" className="blink">
            Stopping: wrapping up with the evidence in hand.
          </p>
        ) : confirming ? (
          <div className="flex flex-col gap-2">
            <p>Stop this run and wrap up with the evidence in hand?</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn font-semibold"
                style={{ background: "var(--bad)", borderColor: "var(--bad)", color: "var(--bg)" }}
                onClick={() => {
                  setConfirming(false);
                  void stop();
                }}
              >
                Yes, stop
              </button>
              <button type="button" className="btn" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn w-fit" style={{ borderColor: "var(--bad)", color: "var(--bad)" }} onClick={() => setConfirming(true)}>
            {"■"} Stop run
          </button>
        )
      ) : null}
    </aside>
  );
}
