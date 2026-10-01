import { useEffect, useState } from "react";
import { env } from "../../config/env";
import { formatRunCost, formatSeconds } from "../../lib/format";
import {
  LG_MIN,
  XL_MIN,
  XXL_MIN,
  type RailPref,
  isRailCollapsed,
  readRailPref,
  writeRailPref,
} from "../../lib/layout";
import { onAnchorClick } from "../../lib/anchor";
import { buildHash, getRoutePage, parseRoute, type PageId } from "../../lib/route";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { EvidenceProvider, useEvidence } from "../../state/EvidenceContext";
import { openConflictCount, worstCriticalSlots, cellsForRound, latestRound } from "../../state/selectors";
import { useDigDeeper } from "../../state/useDigDeeper";
import { useSession } from "../../state/useRunSession";
import { ActivityDock, ActivityTimeline, type DockFilter } from "../ActivityDock";
import type { MeterKind } from "../BudgetMeters";
import { Landing } from "../Landing";
import { MockControls } from "../MockControls";
import { RunProgress } from "../RunProgress";
import { StopCard } from "../StopCard";
import { ChallengePanel } from "../panels/ChallengePanel";
import { ConflictsPanel } from "../panels/ConflictsPanel";
import { EvidenceTab } from "../panels/EvidenceTab";
import { MatrixPanel } from "../panels/MatrixPanel";
import { ReportPanel } from "../panels/ReportPanel";
import { Banner } from "../ui/Banner";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { SkeletonLines } from "../ui/Skeleton";
import { StateChip } from "../ui/StateChip";
import { failureChip } from "../ui/chips";
import { AppHeader } from "./AppHeader";
import { BottomTabBar } from "./BottomTabBar";
import { CenterTabs, type TabId } from "./CenterTabs";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { LeftRail, RailContent } from "./LeftRail";
import { SignInPage } from "../auth/SignInPage";
import { RegisterPage } from "../auth/RegisterPage";
import { WorkspacePage } from "../workspace/WorkspacePage";
import { AdminPage } from "../admin/AdminPage";
import { AdminConsole } from "../admin-portal/AdminConsole";
import { AccountPage } from "../account/AccountPage";
import { PrivacyPolicyPage } from "../legal/PrivacyPolicyPage";
import { TermsPage } from "../legal/TermsPage";
import { CookiePolicyPage } from "../legal/CookiePolicyPage";
import { CookieBanner } from "../ui/CookieBanner";
import { useAuth } from "../../state/useAuth";

function Shell() {
  const { user, loading: authLoading } = useAuth();
  const { view, runId, error, newRun, reattach, hydrating } = useSession();
  const digDeeper = useDigDeeper();
  const ev = useEvidence();
  const isLg = useMediaQuery(`(min-width: ${LG_MIN}px)`);
  const isXl = useMediaQuery(`(min-width: ${XL_MIN}px)`);
  const isXxl = useMediaQuery(`(min-width: ${XXL_MIN}px)`);

  const [page, setPage] = useState<PageId>(() => getRoutePage(window.location.hash));
  const [tab, setTabState] = useState<TabId>(() => parseRoute(window.location.hash).tab);
  const [slotFilter, setSlotFilter] = useState<string | null>(null);
  const [dockFilter, setDockFilter] = useState<DockFilter>("all");
  const [dockOpen, setDockOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false); // status sheet (below lg)
  const [activityOpen, setActivityOpen] = useState(false); // timeline sheet (below lg)
  const [railPref, setRailPref] = useState<RailPref>(readRailPref);

  const run = view.run;
  const running = run?.status === "running" || run?.status === "queued";
  const tokens = view.timeline.reduce((n, t) => n + (t.tokens ?? 0), 0);
  // The evidence drawer is docked (beside the workspace) only from xl up.
  const collapsed = isRailCollapsed(railPref, isXxl ? XXL_MIN : isXl ? XL_MIN : LG_MIN, ev.isOpen && isXl);

  const toggleRail = () => {
    const next: RailPref = collapsed ? "expanded" : "collapsed";
    setRailPref(next);
    writeRailPref(next);
  };

  // Redirect logged-in users away from the landing page
  useEffect(() => {
    if (!authLoading && user && !runId && page === "landing") {
      window.location.hash = "#/workspace";
    }
  }, [user, authLoading, runId, page]);

  // The sheets only exist below lg; close them if the window grows past it.
  useEffect(() => {
    if (isLg) {
      setStatusOpen(false);
      setActivityOpen(false);
    }
  }, [isLg]);

  // The route & tab lives in the URL (#/run/<id>/<tab>, #/signin, #/register, #/admin, #/account, #/cookies)
  useEffect(() => {
    const onHash = () => {
      setPage(getRoutePage(window.location.hash));
      setTabState(parseRoute(window.location.hash).tab);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (page === "signin") return <SignInPage />;
  if (page === "register") return <RegisterPage />;
  if (page === "workspace") return <WorkspacePage />;
  if (page === "admin") return <AdminPage />;
  if (page === "console") return <AdminConsole />;
  if (page === "account") return <AccountPage />;
  if (page === "privacy") return <PrivacyPolicyPage />;
  if (page === "terms") return <TermsPage />;
  if (page === "cookies") return <CookiePolicyPage />;


  const setTab = (t: TabId) => {
    if (runId) window.location.hash = buildHash(runId, t);
    else setTabState(t);
  };

  /** Show the events behind a number: the dock on wide screens, the bottom sheet below lg. */
  const openActivity = (filter: DockFilter) => {
    setDockFilter(filter);
    if (isLg) setDockOpen(true);
    else setActivityOpen(true);
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
  const goMeter = (k: MeterKind) => openActivity(k);

  const counts: Partial<Record<TabId, string>> = {
    evidence: String(Object.keys(view.claims).length),
    conflicts: `${openConflictCount(view)} open`,
    challenge: String(Object.keys(view.challenges).length),
  };

  const nowText = view.nowReason || (running ? "Waiting for the first step..." : "No further steps.");

  return (
    <div className={`flex min-h-screen flex-col ${ev.isOpen ? "xl:pr-[30rem]" : ""}`}>
      <a href="#main-content" onClick={onAnchorClick("main-content")} className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-surface focus:text-brand">
        Skip to content
      </a>
      {/* The single polite announcement of what the run is doing; the visible "Now" text is not live. */}
      <div className="sr-only" role="status" aria-live="polite">
        {runId && run ? nowText : ""}
      </div>

      {env.useMock ? (
        <div className="mock-controls border-b border-warn-border bg-warn-bg px-4 py-2">
          <p className="font-bold text-warn-fg flex items-center gap-2" role="status">
            <Icon name="AlertTriangle" size={16} aria-hidden /> MOCK DATA: scripted fictional events in your browser, not a real research run.
          </p>
          <MockControls runId={runId} />
        </div>
      ) : null}

      <AppHeader
        runId={runId}
        question={run?.question}
        mode={run?.mode ?? null}
        running={running}
        showMode={!isLg || collapsed}
        metrics={[
          { label: "Cost unavailable", value: `${tokens.toLocaleString()} tokens, ${view.usage.llm_calls ?? 0} calls`, onClick: () => openActivity("llm") },
          { label: "Time", value: formatSeconds(view.usage.elapsed_seconds ?? 0), onClick: () => openActivity("time") },
        ]}
        onNewRun={newRun}
        onOpenStatus={() => setStatusOpen(true)}
        onOpenActivity={() => setActivityOpen(true)}
      />

      {/* Below lg the rail is a sheet, so keep the current step in view and one tap from it. */}
      {runId && run ? (
        <button
          type="button"
          onClick={() => setStatusOpen(true)}
          className="no-print flex w-full items-center gap-2 border-b border-border-hairline bg-brand-secondary/10 px-4 py-2 text-left text-base lg:hidden"
        >
          <Icon name="Activity" size={16} className="shrink-0 text-brand-secondary" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{nowText}</span>
          <span className="shrink-0 text-sm font-semibold text-brand-secondary">Status</span>
        </button>
      ) : null}

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
      {error ? <Banner tone="bad">{error}</Banner> : null}
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

      <div
        className={`grid flex-1 grid-cols-1 ${
          runId ? (collapsed ? "lg:grid-cols-[3.5rem_1fr]" : "lg:grid-cols-[17rem_1fr]") : ""
        }`}
      >
        {runId ? <LeftRail collapsed={collapsed} onToggle={toggleRail} onOpenMeter={goMeter} /> : null}
        <main id="main-content" className="min-w-0 p-4 pb-24 md:pb-4 lg:p-6" tabIndex={-1}>
          {!runId ? (
            <Landing />
          ) : (
            <div className="mx-auto flex max-w-6xl flex-col gap-4">
              {running && !view.stop ? (
                <RunProgress
                  current={view.phase}
                  now={nowText}
                  live={running}
                  usage={view.usage}
                  budget={run?.budget}
                  onOpenMeter={goMeter}
                />
              ) : null}
              {view.stop ? (
                (() => {
                  const cells = cellsForRound(view, latestRound(view));
                  const counts = { GREEN: 0, AMBER: 0, RED: 0 };
                  for (const c of cells) counts[c.state] += 1;
                  return (
                    <StopCard
                      runId={runId}
                      stop={view.stop}
                      gaps={worstCriticalSlots(view)}
                      challenges={Object.values(view.challenges)}
                      onOpenSlot={goEvidenceForSlot}
                      onOpenConflicts={goConflicts}
                      onViewReport={goReport}
                      onDigDeeper={digDeeper}
                      counts={counts}
                    />
                  );
                })()
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
                      return <ReportPanel />;
                  }
                }}
              />
            </div>
          )}
        </main>
      </div>

      {runId ? (
        <>
          <ActivityDock
            timeline={view.timeline}
            startedAt={view.run?.started_at}
            running={running}
            open={dockOpen}
            onOpenChange={setDockOpen}
            filter={dockFilter}
            onFilter={setDockFilter}
            onOpenClaim={(id) => ev.open([id])}
            onOpenSource={goSource}
          />
          <BottomTabBar active={tab} onChange={setTab} counts={counts} />
          <Dialog isOpen={statusOpen && !isLg} onClose={() => setStatusOpen(false)} title="Research status" placement="left">
            <RailContent
              showMode={false}
              onOpenMeter={(k) => {
                setStatusOpen(false);
                openActivity(k);
              }}
            />
          </Dialog>
          <Dialog isOpen={activityOpen && !isLg} onClose={() => setActivityOpen(false)} title="Activity timeline" placement="bottom">
            <ActivityTimeline
              timeline={view.timeline}
              startedAt={view.run?.started_at}
              filter={dockFilter}
              onFilter={setDockFilter}
              onOpenClaim={(id) => {
                setActivityOpen(false);
                ev.open([id]);
              }}
              onOpenSource={(id) => {
                setActivityOpen(false);
                goSource(id);
              }}
              listClassName="max-h-[55dvh]"
            />
          </Dialog>
        </>
      ) : null}
      <EvidenceDrawer />
      <CookieBanner />
    </div>
  );
}

/** Application shell (SSOT section 12): status rail, tabbed workspace, docked evidence drawer, activity timeline. */
export function AppShell() {
  return (
    <EvidenceProvider>
      <Shell />
    </EvidenceProvider>
  );
}
