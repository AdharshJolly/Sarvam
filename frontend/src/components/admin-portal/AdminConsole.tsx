import type { AdminUserRow, EventType } from "@contracts/types";
import { useEffect, useState, type ReactNode } from "react";
import { ApiError, adminApi, adminDownloads } from "../../api/client";
import {
  ADMIN_SECTIONS,
  type AdminSection,
  buildAdminHash,
  parseAdminRoute,
} from "../../lib/adminRoute";
import { LG_MIN } from "../../lib/layout";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { useAuth } from "../../state/useAuth";
import { ThemeToggle } from "../layout/ThemeToggle";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";
import { SkeletonLines } from "../ui/Skeleton";
import { type BudgetKey, type BudgetText, budgetToText, parseBudgetForm } from "./budgetForm";
import { ConfirmDialog, QuotaDialog } from "./dialogs";
import { useAdminResource } from "./useAdminResource";
import {
  ActivityView,
  AuditView,
  CostsView,
  HealthView,
  OverviewView,
  PageTitle,
  ResourceView,
  RunDetailView,
  RunsView,
  SettingsView,
  type UserAction,
  UsersView,
} from "./views";

const NAV: Record<AdminSection, { label: string; icon: IconName }> = {
  overview: { label: "Overview", icon: "LayoutDashboard" },
  runs: { label: "Runs", icon: "Table" },
  users: { label: "Users", icon: "Users" },
  costs: { label: "Costs", icon: "Coins" },
  activity: { label: "Activity", icon: "Activity" },
  audit: { label: "Audit log", icon: "ShieldCheck" },
  health: { label: "Health", icon: "HeartPulse" },
  settings: { label: "Settings", icon: "SlidersHorizontal" },
};

const EVENT_TYPES: EventType[] = [
  "run.started",
  "phase.entered",
  "plan.created",
  "task.started",
  "source.found",
  "source.fetched",
  "source.failed",
  "passages.created",
  "claim.created",
  "claim.rejected",
  "claim.verified",
  "origin.updated",
  "conflict.detected",
  "coverage.updated",
  "round.started",
  "challenge.created",
  "challenge.outcome",
  "stop.decided",
  "report.draft",
  "report.verified",
  "budget.warning",
  "run.completed",
  "run.failed",
];

const POLL_MS = 30_000;
const PAGE_SIZE = 25;

// ---------------------------------------------------------------- layout

/** Sidebar + topbar. Below lg the sidebar is a drawer; from lg up it collapses to icons. */
export function AdminLayout({
  section,
  collapsed,
  drawerOpen,
  isDesktop,
  onToggle,
  onNavigate,
  onRefresh,
  children,
}: {
  section: AdminSection;
  collapsed: boolean;
  drawerOpen: boolean;
  isDesktop: boolean;
  onToggle: () => void;
  onNavigate: (s: AdminSection) => void;
  onRefresh: () => void;
  children: ReactNode;
}) {
  const showLabels = !isDesktop || !collapsed;
  const sidebar = (
    <nav
      aria-label="Admin sections"
      className={`flex h-full flex-col gap-1 border-r border-border-hairline bg-surface p-2 ${
        isDesktop ? (collapsed ? "w-16" : "w-56") : "w-64"
      }`}
    >
      <a href="#/" className="mb-2 flex items-center gap-2 px-2 py-2 font-semibold">
        <Icon name="ShieldCheck" size={20} className="shrink-0 text-brand" aria-hidden />
        {showLabels ? <span>Sarvam Admin</span> : <span className="sr-only">Sarvam Admin</span>}
      </a>
      {ADMIN_SECTIONS.map((s) => {
        const active = s === section;
        return (
          <a
            key={s}
            href={buildAdminHash(s)}
            aria-current={active ? "page" : undefined}
            title={NAV[s].label}
            onClick={() => onNavigate(s)}
            className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-surface-2 text-brand ring-1 ring-border-strong"
                : "text-text-muted hover:bg-surface-2 hover:text-text"
            }`}
          >
            <Icon name={NAV[s].icon} size={18} className="shrink-0" aria-hidden />
            {showLabels ? <span>{NAV[s].label}</span> : <span className="sr-only">{NAV[s].label}</span>}
          </a>
        );
      })}
      <div className="mt-auto flex flex-col gap-1 border-t border-border-hairline pt-2 text-sm">
        <a href="#/workspace" className="rounded-md px-2 py-2 text-text-muted hover:bg-surface-2 hover:text-text">
          {showLabels ? "Back to workspace" : <Icon name="ArrowLeft" size={18} label="Back to workspace" aria-hidden={false} />}
        </a>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-bg text-text">
      {isDesktop ? <aside className="sticky top-0 h-screen shrink-0">{sidebar}</aside> : null}
      {!isDesktop && drawerOpen ? (
        <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <aside className="h-full shadow-elevation">{sidebar}</aside>
          <button type="button" aria-label="Close navigation" className="flex-1 bg-text/40" onClick={onToggle} />
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border-hairline bg-surface/85 px-4 py-2 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              aria-label={isDesktop ? (collapsed ? "Expand sidebar" : "Collapse sidebar") : "Open navigation"}
              aria-expanded={isDesktop ? !collapsed : drawerOpen}
              icon={<Icon name={isDesktop ? (collapsed ? "PanelLeftOpen" : "PanelLeftClose") : "Menu"} size={20} aria-hidden />}
              onClick={onToggle}
            />
            <span className="label">Operator console</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onRefresh} icon={<Icon name="RefreshCw" size={14} aria-hidden />}>
              <span className="max-sm:sr-only">Refresh</span>
            </Button>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- pages

function OverviewPage({ tick }: { tick: number }) {
  const overview = useAdminResource(() => adminApi.overview(), [tick], POLL_MS);
  const health = useAdminResource(() => adminApi.health(), [tick], POLL_MS);
  return (
    <>
      <PageTitle title="Overview" />
      <ResourceView {...overview} label="the overview">
        {(o) => <OverviewView overview={o} health={health.data} />}
      </ResourceView>
    </>
  );
}

function errorText(e: unknown): string {
  return e instanceof ApiError || e instanceof Error ? e.message : String(e);
}

/** Runs one admin mutation with busy/error state; the caller decides what a success does. */
function useMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, clear: () => setError(null) };
}

function RunsPage({ tick, runId, bump }: { tick: number; runId: string | null; bump: () => void }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState("");
  const [offset, setOffset] = useState(0);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const mut = useMutation();
  const list = useAdminResource(
    () =>
      adminApi.runs({ status, mode, limit: PAGE_SIZE, offset, include_hidden: includeHidden }),
    [status, mode, offset, includeHidden, tick],
  );
  const detail = useAdminResource(
    () => (runId ? adminApi.run(runId) : Promise.resolve(null)),
    [runId, tick],
  );
  const back = () => {
    window.location.hash = buildAdminHash("runs");
  };

  if (runId) {
    return (
      <>
        <PageTitle title="Run detail" />
        <ResourceView {...detail} label="the run">
          {(d) => (
            <>
              <RunDetailView
                detail={d}
                onBack={back}
                busy={mut.busy}
                error={confirmStop ? null : mut.error}
                onStop={() => {
                  mut.clear();
                  setConfirmStop(true);
                }}
                onToggleHidden={async () => {
                  if (await mut.run(() => adminApi.setRunHidden(d.run.id, !d.run.hidden))) bump();
                }}
              />
              <ConfirmDialog
                isOpen={confirmStop}
                title="Stop this run?"
                body="The run wraps up with what it has gathered and records why it stopped. This cannot be undone."
                confirmLabel="Stop run"
                danger
                busy={mut.busy}
                error={mut.error}
                onClose={() => setConfirmStop(false)}
                onConfirm={async () => {
                  if (await mut.run(() => adminApi.stopRun(d.run.id))) {
                    setConfirmStop(false);
                    bump();
                  }
                }}
              />
            </>
          )}
        </ResourceView>
      </>
    );
  }
  return (
    <>
      <PageTitle title="Runs" />
      {mut.error ? <Banner tone="bad">{mut.error}</Banner> : null}
      <ResourceView {...list} label="runs">
        {(page) => (
          <RunsView
            page={page}
            search={search}
            onSearch={setSearch}
            status={status}
            onStatus={(v) => {
              setStatus(v);
              setOffset(0);
            }}
            mode={mode}
            onMode={(v) => {
              setMode(v);
              setOffset(0);
            }}
            includeHidden={includeHidden}
            onIncludeHidden={(v) => {
              setIncludeHidden(v);
              setOffset(0);
            }}
            onExport={() => void mut.run(() => adminDownloads.runs({ status, mode }))}
            onOpen={(r) => {
              window.location.hash = buildAdminHash("runs", r.id);
            }}
            onPage={setOffset}
          />
        )}
      </ResourceView>
    </>
  );
}

type PendingUser = { action: UserAction; user: AdminUserRow } | null;

function UsersPage({ tick, bump, currentUserId }: { tick: number; bump: () => void; currentUserId: string }) {
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<PendingUser>(null);
  const mut = useMutation();
  const users = useAdminResource(() => adminApi.users(), [tick]);
  const close = () => {
    setPending(null);
    mut.clear();
  };
  const open = (action: UserAction, user: AdminUserRow) => {
    mut.clear();
    setPending({ action, user });
  };
  const apply = async (fn: () => Promise<unknown>) => {
    if (await mut.run(fn)) {
      setPending(null);
      bump();
    }
  };

  const u = pending?.user;
  const a = pending?.action;
  return (
    <>
      <PageTitle title="Users" />
      <ResourceView {...users} label="users">
        {(rows) => (
          <UsersView
            users={rows}
            search={search}
            onSearch={setSearch}
            currentUserId={currentUserId}
            onAction={open}
          />
        )}
      </ResourceView>
      <ConfirmDialog
        isOpen={!!u && a === "toggle-role"}
        title={u?.role === "admin" ? "Remove admin role?" : "Grant admin role?"}
        body={
          u?.role === "admin"
            ? `${u.email} will lose access to this console. If their email is listed in SARVAM_ADMIN_EMAILS they regain the role at their next sign-in.`
            : `${u?.email} will be able to see every run and user, change settings and delete accounts.`
        }
        confirmLabel={u?.role === "admin" ? "Make user" : "Make admin"}
        busy={mut.busy}
        error={mut.error}
        onClose={close}
        onConfirm={() => u && apply(() => adminApi.updateUser(u.id, { role: u.role === "admin" ? "user" : "admin" }))}
      />
      <ConfirmDialog
        isOpen={!!u && a === "toggle-disabled"}
        title={u?.disabled ? "Enable this account?" : "Disable this account?"}
        body={
          u?.disabled
            ? `${u.email} will be able to sign in again.`
            : `${u?.email} is signed out immediately and cannot sign in until re-enabled. Their runs are kept.`
        }
        confirmLabel={u?.disabled ? "Enable" : "Disable"}
        danger={!u?.disabled}
        busy={mut.busy}
        error={mut.error}
        onClose={close}
        onConfirm={() => u && apply(() => adminApi.updateUser(u.id, { disabled: !u.disabled }))}
      />
      <ConfirmDialog
        isOpen={!!u && a === "delete"}
        title="Delete this account?"
        body={`${u?.email} and their sessions are removed permanently. Their runs are kept but become anonymous. This cannot be undone.`}
        confirmLabel="Delete account"
        danger
        busy={mut.busy}
        error={mut.error}
        onClose={close}
        onConfirm={() => u && apply(() => adminApi.deleteUser(u.id))}
      />
      <QuotaDialog
        isOpen={!!u && a === "quota"}
        email={u?.email ?? ""}
        current={u?.quota_usd ?? null}
        busy={mut.busy}
        error={mut.error}
        onClose={close}
        onSave={(q) => u && apply(() => adminApi.updateUser(u.id, { quota_usd: q }))}
      />
    </>
  );
}

function CostsPage({ tick }: { tick: number }) {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const mut = useMutation();
  const costs = useAdminResource(() => adminApi.costs(days), [days, tick], POLL_MS);
  return (
    <>
      <PageTitle title="Costs" />
      {mut.error ? <Banner tone="bad">{mut.error}</Banner> : null}
      <ResourceView {...costs} label="costs">
        {(c) => (
          <CostsView
            costs={c}
            onDays={setDays}
            onExport={() => void mut.run(() => adminDownloads.costs(days))}
          />
        )}
      </ResourceView>
    </>
  );
}

function ActivityPage({ tick }: { tick: number }) {
  const [type, setType] = useState("");
  const feed = useAdminResource(() => adminApi.activity({ type, limit: 100 }), [type, tick], POLL_MS);
  return (
    <>
      <PageTitle title="Activity" />
      <ResourceView {...feed} label="activity">
        {(a) => <ActivityView activity={a} type={type} onType={setType} types={EVENT_TYPES} />}
      </ResourceView>
    </>
  );
}

function AuditPage({ tick }: { tick: number }) {
  const audit = useAdminResource(() => adminApi.audit({ limit: 100 }), [tick], POLL_MS);
  return (
    <>
      <PageTitle title="Audit log" />
      <ResourceView {...audit} label="the audit log">
        {(a) => <AuditView audit={a} />}
      </ResourceView>
    </>
  );
}

function SettingsPage({ tick, bump }: { tick: number; bump: () => void }) {
  const settings = useAdminResource(() => adminApi.settings(), [tick]);
  const [values, setValues] = useState<BudgetText | null>(null);
  const [saved, setSaved] = useState(false);
  const mut = useMutation();

  useEffect(() => {
    if (settings.data) setValues(budgetToText(settings.data.default_budget));
  }, [settings.data]);

  return (
    <>
      <PageTitle title="Settings" />
      <ResourceView {...settings} label="settings">
        {(s) =>
          values ? (
            <SettingsView
              settings={s}
              values={values}
              onChange={(k: BudgetKey, v: string) => {
                setSaved(false);
                setValues({ ...values, [k]: v });
              }}
              busy={mut.busy}
              error={mut.error}
              saved={saved}
              onSave={async () => {
                const { budget } = parseBudgetForm(values);
                if (budget && (await mut.run(() => adminApi.saveSettings(budget)))) {
                  setSaved(true);
                  bump();
                }
              }}
              onReset={async () => {
                if (await mut.run(() => adminApi.resetSettings())) {
                  setSaved(false);
                  bump();
                }
              }}
            />
          ) : null
        }
      </ResourceView>
    </>
  );
}

function HealthPage({ tick }: { tick: number }) {
  const health = useAdminResource(() => adminApi.health(), [tick], POLL_MS);
  return (
    <>
      <PageTitle title="Health" />
      <ResourceView {...health} label="health">
        {(h) => <HealthView health={h} />}
      </ResourceView>
    </>
  );
}

// ---------------------------------------------------------------- console

/** Gate screen: explicit states instead of a silent redirect. The server is the real gate. */
export function AdminGate({ kind }: { kind: "signin" | "forbidden" }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Operator console</h1>
      {kind === "signin" ? (
        <>
          <Banner tone="info">Sign in with an admin account to open the console.</Banner>
          <a className="text-brand hover:underline" href="#/signin">
            Go to sign in
          </a>
        </>
      ) : (
        <>
          <Banner tone="warn">This account does not have the admin role.</Banner>
          <a className="text-brand hover:underline" href="#/workspace">
            Back to the workspace
          </a>
        </>
      )}
    </div>
  );
}

export function AdminConsole() {
  const { user, loading } = useAuth();
  const isDesktop = useMediaQuery(`(min-width: ${LG_MIN}px)`);
  const [route, setRoute] = useState(() => parseAdminRoute(window.location.hash));
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseAdminRoute(window.location.hash));
      setDrawerOpen(false);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <SkeletonLines rows={4} label="Checking your session" />
      </div>
    );
  }
  if (!user) return <AdminGate kind="signin" />;
  if (user.role !== "admin") return <AdminGate kind="forbidden" />;

  return (
    <AdminLayout
      section={route.section}
      collapsed={collapsed}
      drawerOpen={drawerOpen}
      isDesktop={isDesktop}
      onToggle={() => (isDesktop ? setCollapsed((c) => !c) : setDrawerOpen((o) => !o))}
      onNavigate={() => setDrawerOpen(false)}
      onRefresh={() => setTick((t) => t + 1)}
    >
      {route.section === "overview" ? <OverviewPage tick={tick} /> : null}
      {route.section === "runs" ? <RunsPage tick={tick} runId={route.runId} bump={bump} /> : null}
      {route.section === "users" ? <UsersPage tick={tick} bump={bump} currentUserId={user.id} /> : null}
      {route.section === "costs" ? <CostsPage tick={tick} /> : null}
      {route.section === "activity" ? <ActivityPage tick={tick} /> : null}
      {route.section === "audit" ? <AuditPage tick={tick} /> : null}
      {route.section === "health" ? <HealthPage tick={tick} /> : null}
      {route.section === "settings" ? <SettingsPage tick={tick} bump={bump} /> : null}
    </AdminLayout>
  );
}
