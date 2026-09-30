import { useEffect, useState } from "react";
import { env } from "../../config/env";
import { formatSeconds, formatUsd } from "../../lib/format";
import { EvidenceProvider, useEvidence } from "../../state/EvidenceContext";
import { openConflictCount, worstCriticalSlots } from "../../state/selectors";
import { useSession } from "../../state/useRunSession";
import { ActivityDock, type DockFilter } from "../ActivityDock";
import type { MeterKind } from "../BudgetMeters";
import { Landing } from "../Landing";
import { MockControls } from "../MockControls";

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

import { Banner } from "../ui/Banner";
import { Metric } from "../ui/Metric";
import { Icon } from "../ui/Icon";

function Shell() {
  const { view, runId, error, newRun, reattach, hydrating } = useSession();
  const ev = useEvidence();
  const [tab, setTabState] = useState<TabId>("matrix");
  const [slotFilter, setSlotFilter] = useState<string | null>(null);
  const [dockFilter, setDockFilter] = useState<DockFilter>("all");
  const run = view.run;
  const running = run?.status === "running" || run?.status === "queued";
  const tokens = view.timeline.reduce((n, t) => n + (t.tokens ?? 0), 0);

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.slice(1);
      if (["matrix", "evidence", "conflicts", "challenge", "report"].includes(hash)) {
        setTabState(hash as TabId);
      }
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const setTab = (t: TabId) => {
    setTabState(t);
    window.history.replaceState(null, "", `#${t}`);
  };

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
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-surface focus:text-brand">
        Skip to content
      </a>
      {env.useMock ? (
        <div className="mock-controls border-b border-warn-border bg-warn-bg px-4 py-2">
          <p className="font-bold text-warn-fg flex items-center gap-2" role="status">
            <Icon name="AlertTriangle" size={16} aria-hidden /> MOCK DATA: scripted fictional events in your browser, not a real research run.
          </p>
          <MockControls runId={runId} />
        </div>
      ) : null}

      <header
        className="app-header sticky top-0 z-20 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border bg-surface px-4 py-2"
      >
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-bold tracking-tight text-brand">SARVAM</h1>
          <p className="hidden text-sm sm:block text-text-muted">
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
          <button type="button" className="btn btn-secondary" onClick={newRun}>
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
          {error}
        </Banner>
      ) : null}
      {runId && running && view.connection === "closed" && !error && !hydrating ? (
        <Banner tone="warn">
          The event stream is closed while the run is still running.{" "}
          <button type="button" className="underline font-semibold" onClick={reattach}>
            Reattach
          </button>
        </Banner>
      ) : null}
      {runId && view.connection === "connecting" && running ? (
        <Banner tone="warn" icon="RefreshCw">
          Reconnecting...
        </Banner>
      ) : null}

      <div className={`grid flex-1 grid-cols-1 ${runId ? "lg:grid-cols-[19rem_1fr]" : ""}`}>
        {runId ? <LeftRail onOpenMeter={goMeter} /> : null}
        <main id="main-content" className="min-w-0 p-4 lg:p-6" tabIndex={-1}>
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
