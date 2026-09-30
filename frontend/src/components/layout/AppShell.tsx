import { useState } from "react";
import { env } from "../../config/env";
import { EvidenceProvider, useEvidence } from "../../state/EvidenceContext";
import { openConflictCount, worstCriticalSlots } from "../../state/selectors";
import { useSession } from "../../state/useRunSession";
import { ActivityDock, type DockFilter } from "../ActivityDock";
import type { MeterKind } from "../BudgetMeters";
import { MockControls } from "../MockControls";
import { ModeBadge } from "../ModeBadge";
import { RunForm } from "../RunForm";
import { StopCard } from "../StopCard";
import { ChallengePanel } from "../panels/ChallengePanel";
import { ConflictsPanel } from "../panels/ConflictsPanel";
import { EvidenceTab } from "../panels/EvidenceTab";
import { MatrixPanel } from "../panels/MatrixPanel";
import { ReportPanel } from "../panels/ReportPanel";
import { StateChip } from "../ui/StateChip";
import { failureChip } from "../ui/chips";
import { CenterTabs, type TabId } from "./CenterTabs";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { LeftRail } from "./LeftRail";
import { ThemeToggle } from "./ThemeToggle";

function Banner({ tone, children }: { tone: "bad" | "warn"; children: React.ReactNode }) {
  const c = tone === "bad" ? "var(--bad)" : "var(--warn)";
  return (
    <div role="alert" className="border-b px-4 py-2 font-semibold" style={{ borderColor: c, color: c, background: "var(--surface)" }}>
      {children}
    </div>
  );
}

function Shell() {
  const { view, runId, error, newRun, reattach } = useSession();
  const [tab, setTab] = useState<TabId>("matrix");
  const [slotFilter, setSlotFilter] = useState<string | null>(null);
  const [dockFilter, setDockFilter] = useState<DockFilter>("all");
  const run = view.run;
  const running = run?.status === "running" || run?.status === "queued";

  const goEvidenceForSlot = (slotId: string) => {
    setSlotFilter(slotId);
    setTab("evidence");
  };
  const goSource = (sourceId: string) => {
    setTab("evidence");
    setTimeout(() => document.getElementById(`source-${sourceId}`)?.scrollIntoView({ block: "center" }), 50);
  };
  const goConflicts = () => setTab("conflicts");
  const goMeter = (k: MeterKind) => setDockFilter(k);

  const counts: Partial<Record<TabId, string>> = {
    evidence: String(Object.keys(view.claims).length),
    conflicts: `${openConflictCount(view)} open`,
    challenge: String(Object.keys(view.challenges).length),
  };

  return (
    <div className="flex min-h-screen flex-col">
      {env.useMock ? (
        <div className="border-b px-4 py-2" style={{ borderColor: "var(--warn)", background: "var(--surface)" }}>
          <p className="font-bold" style={{ color: "var(--warn)" }} role="status">
            {"⚠"} MOCK DATA: scripted fictional events in your browser, not a real research run.
          </p>
          <MockControls runId={runId} />
        </div>
      ) : null}
      <header
        className="app-header flex flex-wrap items-center justify-between gap-4 border-b px-4 py-3"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sarvam</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Evidence-First Autonomous Research Agent
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ModeBadge mode={run?.mode ?? null} />
          <button type="button" className="rounded border px-3 py-1" style={{ borderColor: "var(--border)" }} onClick={newRun}>
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
          Run failed: {view.failure ? view.failure.message : "the failure detail was recorded before this page loaded (see the server event log)."}{" "}
          Stored data is still available below.
        </Banner>
      ) : null}
      {error ? <Banner tone="bad">{"✕"} {error}</Banner> : null}
      {runId && running && view.connection === "closed" && !error ? (
        <Banner tone="warn">
          {"▲"} The event stream is closed while the run is still running.{" "}
          <button type="button" className="underline" onClick={reattach}>
            Reattach
          </button>
        </Banner>
      ) : null}
      {runId && view.connection === "connecting" && running ? <Banner tone="warn">{"⟳"} Reconnecting...</Banner> : null}

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[19rem_1fr]">
        <LeftRail onOpenMeter={goMeter} />
        <main className="min-w-0 p-4">
          {!runId ? (
            <RunForm />
          ) : (
            <>
              {view.stop ? (
                <div className="mb-4">
                  <StopCard
                    stop={view.stop}
                    gaps={worstCriticalSlots(view)}
                    challenges={Object.values(view.challenges)}
                    onOpenSlot={goEvidenceForSlot}
                    onOpenConflicts={goConflicts}
                  />
                </div>
              ) : null}
              <CenterTabs
                active={tab}
                onChange={setTab}
                counts={counts}
                renderPanel={(id) => {
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
              <ActivityDockBound filter={dockFilter} onFilter={setDockFilter} onSource={goSource} />
            </>
          )}
        </main>
      </div>

      <EvidenceDrawer />
    </div>
  );
}


function ActivityDockBound({
  filter,
  onFilter,
  onSource,
}: {
  filter: DockFilter;
  onFilter: (f: DockFilter) => void;
  onSource: (id: string) => void;
}) {
  const { view } = useSession();
  const ev = useEvidence();
  return (
    <ActivityDock
      timeline={view.timeline}
      startedAt={view.run?.started_at}
      filter={filter}
      onFilter={onFilter}
      onOpenClaim={(id) => ev.open([id])}
      onOpenSource={onSource}
    />
  );
}

/** Application shell (SSOT section 12): left rail, tabbed center, activity dock, right evidence drawer. */
export function AppShell() {
  return (
    <EvidenceProvider>
      <Shell />
    </EvidenceProvider>
  );
}
