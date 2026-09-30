import { useState } from "react";
import { useSession } from "../../state/useRunSession";
import { BudgetMeters, type MeterKind } from "../BudgetMeters";
import { ModeBadge } from "../ModeBadge";
import { PhaseStepper } from "../PhaseStepper";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";
import { SkeletonLines } from "../ui/Skeleton";
import { Tooltip } from "../ui/Tooltip";

type Conn = "open" | "connecting" | "closed";
const connectionIcons: Record<Conn, { icon: IconName; label: string; className: string }> = {
  open: { icon: "CheckCircle", label: "Stream connected", className: "text-ok-fg" },
  connecting: { icon: "RefreshCw", label: "Reconnecting...", className: "text-warn-fg blink" },
  closed: { icon: "Circle", label: "Stream closed", className: "text-text-muted" },
};

/**
 * The orientation layer (SSOT section 12): question, Now line, phase stepper, budget meters, stream
 * state and stop. Used inside the desktop rail and inside the small-screen status sheet.
 * `showMode` adds the LIVE/REPLAY badge for places where the header is not already showing it.
 */
export function RailContent({
  onOpenMeter,
  showMode,
}: {
  onOpenMeter: (k: MeterKind) => void;
  showMode: boolean;
}) {
  const { view, stop, stopping, hydrating, runId } = useSession();
  const [confirming, setConfirming] = useState(false);
  const run = view.run;
  const running = run?.status === "running" || run?.status === "queued";
  const scope = run?.scope;
  const finished = run?.status === "completed";

  return (
    <div className="flex flex-col gap-4 p-3.5 pt-1">
      <section aria-labelledby="question-h">
        {showMode ? (
          <div className="mb-2.5">
            <ModeBadge mode={run?.mode ?? null} pulsing={running} />
          </div>
        ) : null}
        <h2 id="question-h" className="font-mono text-sm tracking-wider uppercase text-text-muted mb-1">
          Research Question
        </h2>
        {hydrating ? (
          <SkeletonLines rows={3} label="Loading run..." />
        ) : run ? (
          <>
            <p className="font-medium text-sm leading-snug text-text line-clamp-3">{run.question}</p>
            {scope?.geography || scope?.time_horizon || scope?.constraints ? (
              <p className="mt-1 text-sm text-text-muted font-mono">
                {[scope?.geography, scope?.time_horizon, scope?.constraints].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-text-muted">No run started.</p>
        )}
      </section>

      {run ? (
        // Announced once by the shell's live region, so this box is not a live region itself.
        <section aria-label="Now" className="rounded-lg border border-border-hairline bg-surface-2/60 p-3">
          <h2 className="font-mono text-sm tracking-wider uppercase text-text-muted mb-1">Now</h2>
          <p className="text-sm text-text leading-snug">{view.nowReason || (running ? "Waiting for the first step..." : "No further steps.")}</p>
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
        <div
          className={`flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider ${connectionIcons[view.connection].className}`}
        >
          <Icon name={connectionIcons[view.connection].icon} size={14} aria-hidden />
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
  );
}

/** The icon strip shown when the rail is collapsed: mode, current step, warnings and stream state. */
function CollapsedRail() {
  const { view } = useSession();
  const run = view.run;
  const running = run?.status === "running" || run?.status === "queued";
  const conn = connectionIcons[view.connection];
  const stepText = view.nowReason || (running ? "Waiting for the first step..." : "No further steps.");

  return (
    <div className="flex flex-col items-center gap-4 pb-4">
      <ModeBadge mode={run?.mode ?? null} pulsing={running} iconOnly />
      <Tooltip text={`${view.phase ?? "No phase"}: ${stepText}`} side="right" focusable>
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-secondary/10 text-brand-secondary">
          <Icon name="Activity" size={18} label={`Current step: ${view.phase ?? "none"}`} />
        </span>
      </Tooltip>
      {view.budgetWarnings.length > 0 ? (
        <Tooltip
          text={`Budget warning: ${view.budgetWarnings.map((w) => `${w.limit} ${w.used}/${w.max}`).join("; ")}`}
          side="right"
          focusable
        >
          <span className="text-warn-fg">
            <Icon name="AlertTriangle" size={18} label="Budget warning" />
          </span>
        </Tooltip>
      ) : null}
      <Tooltip text={conn.label} side="right" focusable>
        <span className={conn.className}>
          <Icon name={conn.icon} size={18} label={conn.label} />
        </span>
      </Tooltip>
    </div>
  );
}

/**
 * Desktop research-status rail (lg and up). Expanded it holds the full orientation layer; collapsed
 * it is an icon strip. Below lg the same content appears in a sheet opened from the header.
 */
export function LeftRail({
  collapsed,
  onToggle,
  onOpenMeter,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onOpenMeter: (k: MeterKind) => void;
}) {
  return (
    <aside
      aria-label="Research status"
      className={`left-rail hidden border-r border-border-hairline bg-surface lg:sticky lg:top-14 lg:z-10 lg:block lg:max-h-[calc(100dvh-3.5rem)] lg:self-start ${
        // The collapsed strip must not clip its tooltips, so only the expanded rail scrolls.
        collapsed ? "" : "lg:overflow-y-auto"
      }`}
    >
      <div className={`flex p-2 ${collapsed ? "justify-center" : "justify-end"}`}>
        <Button
          size="icon"
          variant="ghost"
          aria-label={collapsed ? "Expand research status" : "Collapse research status"}
          aria-expanded={!collapsed}
          icon={<Icon name={collapsed ? "PanelLeftOpen" : "PanelLeftClose"} size={18} aria-hidden />}
          onClick={onToggle}
        />
      </div>
      {collapsed ? <CollapsedRail /> : <RailContent onOpenMeter={onOpenMeter} showMode />}
    </aside>
  );
}
