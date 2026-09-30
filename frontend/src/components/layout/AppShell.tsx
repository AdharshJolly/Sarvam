import { type ReactNode, useState } from "react";
import { env } from "../../config/env";
import { formatSeconds, formatUsd } from "../../lib/format";
import { EvidenceProvider, useEvidence } from "../../state/EvidenceContext";
import { openConflictCount, worstCriticalSlots } from "../../state/selectors";
import { useSession } from "../../state/useRunSession";
import { ActivityDock, type DockFilter } from "../ActivityDock";
import type { MeterKind } from "../BudgetMeters";
import { Landing } from "../Landing";
import { MockControls } from "../MockControls";
import { ModeBadge } from "../ModeBadge";
import { StopCard } from "../StopCard";
import { ChallengePanel } from "../panels/ChallengePanel";
import { ConflictsPanel } from "../panels/ConflictsPanel";
import { EvidenceTab } from "../panels/EvidenceTab";
import { MatrixPanel } from "../panels/MatrixPanel";
import { ReportPanel } from "../panels/ReportPanel";
import { SkeletonLines } from "../ui/Skeleton";
import { StateChip } from "../ui/StateChip";
import { failureChip } from "../ui/chips";
import { CenterTabs, type TabId } from "./CenterTabs";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { LeftRail } from "./LeftRail";
import { ThemeToggle } from "./ThemeToggle";

function Banner({ tone, children }: { tone: "bad" | "warn"; children: ReactNode }) {
  const c = tone === "bad" ? "var(--bad)" : "var(--warn)";
  return (
    <div
      role="alert"
      className="anim-in border-b px-4 py-2 font-semibold"
      style={{ borderColor: c, color: c, background: tone === "bad" ? "var(--bad-bg)" : "var(--warn-bg)" }}
    >
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col leading-tight">
      <span className="label" style={{ fontSize: "0.7rem" }}>
        {label}
      </span>
      <span className="mono font-semibold">{value}</span>
    </span>
  );
}

function Shell() {
  const { view, runId, error, newRun, reattach, hydrating } = useSession();
  const ev = useEvidence();
  const [tab, setTab] = useState<TabId>("matrix");
  const [slotFilter, setSlotFilter] = useState<string | null>(null);
  const [dockFilter, setDockFilter] = useState<DockFilter>("all");
  const run = view.run;
  const running = run?.status === "running" || run?.status === "queued";
  const tokens = view.timeline.reduce((n, t) => n + (t.tokens ?? 0), 0);

  const goEvidenceForSlot = (slotId: string) => {
    setSlotFilter(slotId);
    setTab("evidence");
  };
  const goSource = (sourceId: string) => {
    setTab("evidence");
    setTimeout(() => document.getElementById(`source-${sourceId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
  };
  const goConflicts = () => setTab("conflicts");
  const goReport = () => setTab("report");
  const goMeter = (k: MeterKind) => setDockFilter(k);

  const counts: Partial<Record<TabId, string>> = {
    evidence: String(Object.keys(view.claims).length),
    conflicts: `${openConflictCount(view)} open`,
    challenge: String(Object.keys(view.challenges).length),
  };

  return (
    <div className={`flex min-h-screen flex-col ${ev.isOpen ? "xl:pr-[30rem]" : ""}`}>
      {env.useMock ? (
        <div className="mock-controls border-b px-4 py-2" style={{ borderColor: "var(--warn)", background: "var(--warn-bg)" }}>
          <p className="font-bold" style={{ color: "var(--warn)" }} role="status">
            {"⚠"} MOCK DATA: scripted fictional events in your browser, not a real research run.
          </p>
          <MockControls runId={runId} />
        </div>
      ) : null}

      <header
        className="app-header sticky top-0 z-20 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b px-4 py-2"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-bold tracking-tight">SARVAM</h1>
          <p className="hidden text-sm sm:block" style={{ color: "var(--text-muted)" }}>
            Research that knows when it isn&apos;t done.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {run ? (
            <div className="flex items-center gap-5" aria-label="Run totals">
              <Metric label="Cost" value={formatUsd(view.usage.cost_usd ?? 0)} />
              <Metric label="Time" value={formatSeconds(view.usage.elapsed_seconds ?? 0)} />
              <Metric label="Tokens" value={tokens.toLocaleString()} />
            </div>
          ) : null}
          <ModeBadge mode={run?.mode ?? null} pulsing={running} />
          <button type="button" className="btn" onClick={newRun}>
            New run
          </button>
          <ThemeToggle />
        </div>
      </header>

      {view.failure || run?.status === "failed" ? (
        <Banner tone="bad">
          {view.failure ? (
            <span className="mr-2">
              <StateChip spec={failureChip(view.failure.failure)} />
            </span>
          ) : null}
          Run failed:{" "}
          {view.failure ? view.failure.message : "the failure detail was recorded before this page loaded (see the server event log)."} Stored
          data is still available below.
        </Banner>
      ) : null}
      {error ? (
        <Banner tone="bad">
          {"✕"} {error}
        </Banner>
      ) : null}
      {runId && running && view.connection === "closed" && !error && !hydrating ? (
        <Banner tone="warn">
          {"▲"} The event stream is closed while the run is still running.{" "}
          <button type="button" className="underline" onClick={reattach}>
            Reattach
          </button>
        </Banner>
      ) : null}
      {runId && view.connection === "connecting" && running ? (
        <Banner tone="warn">
          <span className="blink">{"⟳"}</span> Reconnecting...
        </Banner>
      ) : null}

      <div className={`grid flex-1 grid-cols-1 ${runId ? "lg:grid-cols-[19rem_1fr]" : ""}`}>
        {runId ? <LeftRail onOpenMeter={goMeter} /> : null}
        <main className="min-w-0 p-4 lg:p-6">
          {!runId ? (
            <Landing />
          ) : (
            <div className="mx-auto flex max-w-6xl flex-col gap-4">
              {view.stop ? (
                <StopCard
                  stop={view.stop}
                  gaps={worstCriticalSlots(view)}
                  challenges={Object.values(view.challenges)}
                  onOpenSlot={goEvidenceForSlot}
                  onOpenConflicts={goConflicts}
                  onViewReport={goReport}
                />
              ) : null}
              <CenterTabs
                active={tab}
                onChange={setTab}
                counts={counts}
                renderPanel={(id) => {
                  if (hydrating && id !== "matrix") return <SkeletonLines rows={6} label="Loading run state..." />;
                  switch (id) {
                    case "matrix":
                      return <MatrixPanel onOpenClaims={goEvidenceForSlot} onOpenConflicts={goConflicts} onOpenSource={goSource} />;
                    case "evidence":
                      return <EvidenceTab slotFilter={slotFilter} onSlotFilter={setSlotFilter} />;
                    case "conflicts":
                      return <ConflictsPanel />;
                    case "challenge":
                      return <ChallengePanel />;
                    case "report":
                      return <ReportPanel onOpenSlot={goEvidenceForSlot} onOpenConflicts={goConflicts} />;
                  }
                }}
              />
            </div>
          )}
        </main>
      </div>

      {runId ? (
        <ActivityDock
          timeline={view.timeline}
          startedAt={view.run?.started_at}
          running={running}
          filter={dockFilter}
          onFilter={setDockFilter}
          onOpenClaim={(id) => ev.open([id])}
          onOpenSource={goSource}
        />
      ) : null}
      <EvidenceDrawer />
    </div>
  );
}

/** Application shell (SSOT section 12): left rail, tabbed workspace, docked evidence drawer, activity timeline. */
export function AppShell() {
  return (
    <EvidenceProvider>
      <Shell />
    </EvidenceProvider>
  );
}
