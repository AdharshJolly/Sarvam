import { useState } from "react";
import { BudgetMeters, type MeterKind } from "../BudgetMeters";
import { ModeBadge } from "../ModeBadge";
import { PhaseStepper } from "../PhaseStepper";
import { useSession } from "../../state/useRunSession";
import { StateChip } from "../ui/StateChip";
import type { ChipSpec } from "../ui/chips";

const connectionChips: Record<"open" | "connecting" | "closed", ChipSpec> = {
  open: { icon: "●", label: "Stream connected", tone: "ok" },
  connecting: { icon: "⟳", label: "Reconnecting...", tone: "warn" },
  closed: { icon: "○", label: "Stream closed", tone: "muted" },
};

const connectionSpec = (c: "open" | "connecting" | "closed"): ChipSpec => connectionChips[c];

/** Left rail: question, mode, phase stepper, Now line, budget meters, stop button (SSOT section 12). */
export function LeftRail({ onOpenMeter }: { onOpenMeter: (k: MeterKind) => void }) {
  const { view, stop, stopping } = useSession();
  const [confirming, setConfirming] = useState(false);
  const run = view.run;
  const running = run?.status === "running" || run?.status === "queued";
  const scope = run?.scope;
  const finished = run?.status === "completed";
  return (
    <aside
      aria-label="Research status"
      className="left-rail flex flex-col gap-5 border-b p-4 lg:border-r lg:border-b-0"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <ModeBadge mode={run?.mode ?? null} />
      <section aria-labelledby="question-h">
        <h2 id="question-h" className="mb-1 text-sm font-semibold uppercase tracking-wide">
          Question
        </h2>
        {run ? (
          <>
            <p>{run.question}</p>
            {scope?.geography || scope?.time_horizon || scope?.constraints ? (
              <p className="text-base" style={{ color: "var(--text-muted)" }}>
                {[scope?.geography, scope?.time_horizon, scope?.constraints].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Status: {run.status}
            </p>
          </>
        ) : (
          <p style={{ color: "var(--text-muted)" }}>No run started.</p>
        )}
      </section>
      {run ? (
        <section aria-label="Now" aria-live="polite">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide">Now</h2>
          <p>{view.nowReason || "Waiting for the first step..."}</p>
        </section>
      ) : null}
      <PhaseStepper current={view.phase} finished={finished} />
      <BudgetMeters usage={run ? view.usage : null} budget={run?.budget} onOpenKind={onOpenMeter} />
      {view.budgetWarnings.length > 0 ? (
        <p role="alert" className="rounded border p-2 text-base" style={{ borderColor: "var(--warn)", color: "var(--warn)" }}>
          {"▲"} Budget warning: {view.budgetWarnings.map((w) => `${w.limit} at ${w.used} of ${w.max}`).join("; ")}
        </p>
      ) : null}
      {run ? <StateChip spec={connectionSpec(view.connection)} /> : null}
      {running ? (
        stopping ? (
          <p aria-live="polite">Stopping: wrapping up with the evidence in hand.</p>
        ) : confirming ? (
          <div className="flex flex-col gap-2">
            <p>Stop this run and wrap up with the evidence in hand?</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded px-3 py-1 font-semibold"
                style={{ background: "var(--bad)", color: "var(--bg)" }}
                onClick={() => {
                  setConfirming(false);
                  void stop();
                }}
              >
                Yes, stop
              </button>
              <button type="button" className="rounded border px-3 py-1" style={{ borderColor: "var(--border)" }} onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="w-fit rounded border px-3 py-1 text-base" style={{ borderColor: "var(--bad)", color: "var(--bad)" }} onClick={() => setConfirming(true)}>
            {"■"} Stop run
          </button>
        )
      ) : null}
    </aside>
  );
}
