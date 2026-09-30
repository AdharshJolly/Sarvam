import { useState } from "react";
import { useSession } from "../../state/useRunSession";
import { BudgetMeters, type MeterKind } from "../BudgetMeters";
import { PhaseStepper } from "../PhaseStepper";
import { SkeletonLines } from "../ui/Skeleton";
import { Icon } from "../ui/Icon";
import { Banner } from "../ui/Banner";
import { ModeBadge } from "../ModeBadge";
import { Button } from "../ui/Button";

type Conn = "open" | "connecting" | "closed";
const connectionIcons: Record<Conn, { icon: string; label: string; className: string }> = {
  open: { icon: "CheckCircle2", label: "Stream connected", className: "text-ok-fg" },
  connecting: { icon: "RefreshCw", label: "Reconnecting...", className: "text-warn-fg blink" },
  closed: { icon: "Circle", label: "Stream closed", className: "text-text-muted" },
};

/** Left rail: the orientation layer. Question, phase stepper, Now line, budget meters, stop (SSOT section 12). */
export function LeftRail({ onOpenMeter }: { onOpenMeter: (k: MeterKind) => void }) {
  const { view, stop, stopping, hydrating, runId } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [open, setOpen] = useState(false);
  const run = view.run;
  const running = run?.status === "running" || run?.status === "queued";
  const scope = run?.scope;
  const finished = run?.status === "completed";
  
  return (
    <aside
      aria-label="Research status"
      className="left-rail flex flex-col border-b border-border lg:border-r lg:border-b-0 bg-surface"
    >
      <button 
        type="button"
        className="flex items-center justify-between p-4 font-semibold lg:hidden hover:bg-surface-2 transition-colors" 
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <Icon name="Activity" size={16} aria-hidden />
          Research status
        </span>
        <Icon name={open ? "ChevronUp" : "ChevronDown"} size={16} aria-hidden />
      </button>

      <div className={`flex-col gap-6 p-4 pt-0 lg:p-4 lg:flex ${open ? "flex" : "hidden"}`}>
        <section aria-labelledby="question-h">
        <div className="mb-3">
          <ModeBadge mode={run?.mode ?? null} pulsing={running} />
        </div>
        <h2 id="question-h" className="label mb-2">
          Research question
        </h2>
        {hydrating ? (
          <SkeletonLines rows={3} label="Loading run..." />
        ) : run ? (
          <>
            <p className="font-medium leading-snug">{run.question}</p>
            {scope?.geography || scope?.time_horizon || scope?.constraints ? (
              <p className="mt-1 text-sm text-text-muted">
                {[scope?.geography, scope?.time_horizon, scope?.constraints].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-text-muted">No run started.</p>
        )}
      </section>

      {run ? (
        <section
          aria-label="Now"
          aria-live="polite"
          className="rounded-md p-3 bg-brand-secondary/10 border border-border"
        >
          <h2 className="label mb-1">Now</h2>
          <p className="text-base">{view.nowReason || (running ? "Waiting for the first step..." : "No further steps.")}</p>
        </section>
      ) : null}

      {runId ? <PhaseStepper current={view.phase} finished={finished} live={running} /> : null}
      {runId ? <BudgetMeters usage={run ? view.usage : null} budget={run?.budget} onOpenKind={onOpenMeter} /> : null}

      {view.budgetWarnings.length > 0 ? (
        <Banner tone="warn">
          Budget warning: {view.budgetWarnings.map((w) => `${w.limit} at ${w.used} of ${w.max}`).join("; ")}
        </Banner>
      ) : null}

      {run ? (
        <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${connectionIcons[view.connection].className}`}>
          <Icon name={connectionIcons[view.connection].icon as any} size={14} aria-hidden />
          {connectionIcons[view.connection].label}
        </div>
      ) : null}

      {running ? (
        stopping ? (
          <p aria-live="polite" className="blink">
            Stopping: wrapping up with the evidence in hand.
          </p>
        ) : confirming ? (
          <div className="flex flex-col gap-2">
            <p>Stop this run and wrap up with the evidence in hand?</p>
            <div className="flex gap-2">
              <Button
                variant="danger"
                onClick={() => {
                  setConfirming(false);
                  void stop();
                }}
              >
                Yes, stop
              </Button>
              <Button onClick={() => setConfirming(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button
            variant="danger"
            className="w-fit"
            icon={<Icon name="Square" size={14} aria-hidden />}
            onClick={() => setConfirming(true)}
          >
            Stop run
          </Button>
        )
      ) : null}
      </div>
    </aside>
  );
}
