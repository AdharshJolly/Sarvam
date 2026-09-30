import type {
  AdminActivity,
  AdminAudit,
  AdminCosts,
  AdminHealth,
  AdminOverview,
  AdminRunDetail,
  AdminRunPage,
  AdminRunRow,
  AdminSettings,
  AdminUserRow,
} from "@contracts/types";
import type { ReactNode } from "react";
import { ApiError } from "../../api/client";
import { formatUsd } from "../../lib/format";
import { ModeBadge } from "../ModeBadge";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { BarSeries, HBarList } from "../ui/Charts";
import { type Column, DataTable } from "../ui/DataTable";
import { EmptyState } from "../ui/EmptyState";
import { Icon } from "../ui/Icon";
import { Panel } from "../ui/Panel";
import { SkeletonLines } from "../ui/Skeleton";
import { StateChip } from "../ui/StateChip";
import { failureChip, finalStateChip, runStatusChip } from "../ui/chips";
import {
  BUDGET_FIELDS,
  type BudgetKey,
  type BudgetText,
  parseBudgetForm,
} from "./budgetForm";
import { filterRuns, filterUsers } from "./filter";

const fmtTokens = (n: number) => n.toLocaleString("en-US");
const fmtDate = (iso: string | null | undefined) =>
  iso ? `${new Date(iso).toISOString().replace("T", " ").slice(0, 16)} UTC` : "—";
const toData = (rec: Record<string, number>) =>
  Object.entries(rec)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, value]) => ({ label, value }));

/** Loading / error / ready wrapper. 401 and 403 get their own words: the server is the gate. */
export function ResourceView<T>({
  loading,
  error,
  data,
  label,
  children,
}: {
  loading: boolean;
  error: Error | null;
  data: T | null;
  label: string;
  children: (data: T) => ReactNode;
}) {
  if (error) {
    const status = error instanceof ApiError ? error.status : null;
    const msg =
      status === 401
        ? "Your session has expired. Sign in again."
        : status === 403
          ? "The server refused this request: admin role required."
          : `Could not load ${label}: ${error.message}`;
    return <Banner tone="bad">{msg}</Banner>;
  }
  if (!data) return loading ? <SkeletonLines rows={5} label={`Loading ${label}`} /> : null;
  return <>{children(data)}</>;
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <Card pad="md">
      <p className="label text-text-muted">{label}</p>
      <p className="mono mt-1 text-2xl font-semibold">{value}</p>
      {sub ? <p className="mt-0.5 text-sm text-text-muted">{sub}</p> : null}
    </Card>
  );
}

export function PageTitle({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl font-semibold">{title}</h1>
      {aside}
    </div>
  );
}

// ------------------------------------------------------------------ overview

export function OverviewView({
  overview,
  health,
}: {
  overview: AdminOverview;
  health: AdminHealth | null;
}) {
  const replay = overview.runs_by_mode.REPLAY ?? 0;
  return (
    <div className="flex flex-col gap-4">
      {health ? (
        <Banner tone={health.status === "healthy" ? "ok" : "warn"}>
          System {health.status}: database {health.db_ok ? "reachable" : "unreachable"}, gateway
          mode {health.mode.toUpperCase()}, {health.running_runs} run(s) in progress.
        </Banner>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Users" value={overview.users} sub={`${overview.admins} admin`} />
        <Stat label="Runs" value={overview.runs} sub={`${replay} replayed`} />
        <Stat
          label="Total cost"
          value={formatUsd(overview.total_cost_usd)}
          sub="from the audit log"
        />
        <Stat label="Tokens" value={fmtTokens(overview.total_tokens)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Runs by status">
          <HBarList data={toData(overview.runs_by_status)} empty="No runs yet" />
        </Panel>
        <Panel title="Runs by mode">
          <HBarList data={toData(overview.runs_by_mode)} empty="No runs yet" />
        </Panel>
        <Panel title="Stop state: did it know it was done?">
          <HBarList data={toData(overview.stop_states)} empty="No finished runs yet" />
          {overview.insufficient_runs > 0 ? (
            <p className="mt-3 text-sm text-text-muted">
              {overview.insufficient_runs} run(s) ended INSUFFICIENT: they reported that the
              evidence was not enough instead of guessing.
            </p>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------- runs

export const RUN_STATUSES = ["", "queued", "running", "completed", "failed"] as const;
export const RUN_MODES = ["", "LIVE", "REPLAY"] as const;

const runColumns: Column<AdminRunRow>[] = [
  {
    key: "id",
    header: "Run",
    render: (r) => <span className="mono">{r.id}</span>,
    sortValue: (r) => r.id,
  },
  {
    key: "question",
    header: "Question",
    render: (r) => (
      <span className="line-clamp-2 max-w-md">
        {r.hidden ? <span className="mr-1 rounded border border-border-strong px-1 text-sm text-text-muted">hidden</span> : null}
        {r.question}
      </span>
    ),
  },
  {
    key: "mode",
    header: "Mode",
    render: (r) => <ModeBadge mode={r.mode} />,
    sortValue: (r) => r.mode,
  },
  {
    key: "status",
    header: "Status",
    render: (r) => <StateChip spec={runStatusChip(r.status)} />,
    sortValue: (r) => r.status,
  },
  {
    key: "stop",
    header: "Stop state",
    render: (r) => (r.stop_state ? <StateChip spec={finalStateChip(r.stop_state)} /> : "—"),
    sortValue: (r) => r.stop_state ?? "",
  },
  {
    key: "owner",
    header: "Owner",
    render: (r) => r.user_email ?? "anonymous",
    sortValue: (r) => r.user_email ?? "",
  },
  {
    key: "cost",
    header: "Cost",
    align: "right",
    render: (r) => formatUsd(r.cost_usd),
    sortValue: (r) => r.cost_usd,
  },
  {
    key: "started",
    header: "Started",
    render: (r) => fmtDate(r.started_at),
    sortValue: (r) => r.started_at,
  },
];

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="label">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border-strong bg-surface px-2 py-1"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o || "All"}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SearchBox({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <Icon
        name="Search"
        size={14}
        className="pointer-events-none absolute left-2.5 top-2.5 text-text-muted"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        placeholder={label}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-56 rounded-md border border-border-strong bg-surface py-1.5 pl-8 pr-2 text-sm"
      />
    </label>
  );
}

export function RunsView({
  page,
  search,
  onSearch,
  status,
  onStatus,
  mode,
  onMode,
  onOpen,
  onPage,
  includeHidden,
  onIncludeHidden,
  onExport,
}: {
  includeHidden: boolean;
  onIncludeHidden: (v: boolean) => void;
  onExport: () => void;
  page: AdminRunPage;
  search: string;
  onSearch: (v: string) => void;
  status: string;
  onStatus: (v: string) => void;
  mode: string;
  onMode: (v: string) => void;
  onOpen: (r: AdminRunRow) => void;
  onPage: (offset: number) => void;
}) {
  const rows = filterRuns(page.items, search);
  const from = page.total === 0 ? 0 : page.offset + 1;
  const to = page.offset + page.items.length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox
          value={search}
          onChange={onSearch}
          label="Search this page by id, question or owner"
        />
        <Select label="Status" value={status} options={RUN_STATUSES} onChange={onStatus} />
        <Select label="Mode" value={mode} options={RUN_MODES} onChange={onMode} />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeHidden}
            onChange={(e) => onIncludeHidden(e.target.checked)}
          />
          <span>Show hidden</span>
        </label>
        <Button size="sm" onClick={onExport} icon={<Icon name="ArrowDown" size={14} aria-hidden />}>
          Export CSV
        </Button>
      </div>
      <DataTable
        caption="All runs"
        columns={runColumns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={onOpen}
        initialSort={{ key: "started", dir: "desc" }}
        empty={
          <EmptyState
            title="No runs match"
            why="Clear the filters or start a run from the workspace."
          />
        }
      />
      <div className="flex items-center justify-between text-sm text-text-muted">
        <span>
          {from}–{to} of {page.total}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={page.offset === 0}
            onClick={() => onPage(Math.max(0, page.offset - page.limit))}
          >
            Previous
          </Button>
          <Button size="sm" disabled={to >= page.total} onClick={() => onPage(page.offset + page.limit)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- run detail

export function RunDetailView({
  detail,
  onBack,
  onStop,
  onToggleHidden,
  busy = false,
  error = null,
}: {
  detail: AdminRunDetail;
  onBack: () => void;
  onStop: () => void;
  onToggleHidden: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const r = detail.run;
  const active = r.status === "running" || r.status === "queued";
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onBack}
          icon={<Icon name="ArrowLeft" size={14} aria-hidden />}
        >
          All runs
        </Button>
      </div>
      <Card pad="md">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono text-sm text-text-muted">{r.id}</span>
          <ModeBadge mode={r.mode} />
          <StateChip spec={runStatusChip(r.status)} />
          {r.stop_state ? <StateChip spec={finalStateChip(r.stop_state)} /> : null}
        </div>
        <p className="mt-2 text-lg font-medium">{r.question}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {active ? (
            <Button size="sm" variant="danger" disabled={busy} onClick={onStop} icon={<Icon name="Square" size={14} aria-hidden />}>
              Stop run
            </Button>
          ) : null}
          <Button size="sm" disabled={busy} onClick={onToggleHidden}>
            {r.hidden ? "Unhide run" : "Hide run"}
          </Button>
        </div>
        {r.hidden ? (
          <p className="mt-2 text-sm text-text-muted">
            Hidden from every run list. Its evidence, events and cost are kept and still counted.
          </p>
        ) : null}
        {error ? <div className="mt-2"><Banner tone="bad">{error}</Banner></div> : null}
        <p className="mt-1 text-sm text-text-muted">
          {r.user_email ?? "anonymous"} · started {fmtDate(r.started_at)}
          {r.termination_reason ? ` · ended: ${r.termination_reason.replace(/_/g, " ")}` : ""}
        </p>
      </Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cost" value={formatUsd(detail.cost_usd)} />
        <Stat label="Tokens" value={fmtTokens(detail.tokens)} />
        <Stat label="Events" value={detail.event_count} />
        <Stat label="Open conflicts" value={detail.conflicts_by_status.open ?? 0} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Claims by status">
          <HBarList data={toData(detail.claims_by_status)} empty="No claims stored" />
        </Panel>
        <Panel title="Coverage (latest round)">
          <HBarList data={toData(detail.coverage_by_state)} empty="No coverage computed" />
        </Panel>
        <Panel title="Conflicts">
          <HBarList data={toData(detail.conflicts_by_status)} empty="No conflicts" />
        </Panel>
        <Panel title="Challenge outcomes">
          <HBarList data={toData(detail.challenges_by_outcome)} empty="No challenges recorded" />
        </Panel>
      </div>
      <p className="text-sm">
        <a className="text-brand hover:underline" href={`#/run/${encodeURIComponent(r.id)}`}>
          Open the full run view
        </a>
      </p>
    </div>
  );
}

// --------------------------------------------------------------------- users

export type UserAction = "toggle-role" | "toggle-disabled" | "quota" | "delete";

const userColumns: Column<AdminUserRow>[] = [
  {
    key: "email",
    header: "User",
    render: (u) => (
      <span>
        {u.display_name} <span className="text-text-muted">({u.email})</span>
      </span>
    ),
    sortValue: (u) => u.email,
  },
  {
    key: "role",
    header: "Role",
    render: (u) => (
      <StateChip
        spec={
          u.disabled
            ? { icon: "XOctagon", label: "disabled", tone: "bad" }
            : u.role === "admin"
              ? { icon: "ShieldCheck", label: "admin", tone: "brand" }
              : { icon: "User", label: "user", tone: "muted" }
        }
      />
    ),
    sortValue: (u) => `${u.disabled ? "z" : "a"}${u.role}`,
  },
  {
    key: "runs",
    header: "Runs",
    align: "right",
    render: (u) => u.run_count,
    sortValue: (u) => u.run_count,
  },
  {
    key: "cost",
    header: "Cost",
    align: "right",
    render: (u) => formatUsd(u.cost_usd),
    sortValue: (u) => u.cost_usd,
  },
  {
    key: "quota",
    header: "Quota",
    align: "right",
    render: (u) => (u.quota_usd == null ? "unlimited" : formatUsd(u.quota_usd)),
    sortValue: (u) => u.quota_usd ?? Number.MAX_SAFE_INTEGER,
  },
  {
    key: "created",
    header: "Joined",
    render: (u) => fmtDate(u.created_at),
    sortValue: (u) => u.created_at,
  },
  {
    key: "login",
    header: "Last sign-in",
    render: (u) => fmtDate(u.last_login_at),
    sortValue: (u) => u.last_login_at ?? "",
  },
];

export function UsersView({
  users,
  search,
  onSearch,
  currentUserId,
  onAction,
}: {
  users: AdminUserRow[];
  search: string;
  onSearch: (v: string) => void;
  currentUserId: string;
  onAction: (action: UserAction, user: AdminUserRow) => void;
}) {
  const columns: Column<AdminUserRow>[] = [
    ...userColumns,
    {
      key: "actions",
      header: "Actions",
      render: (u) => {
        const self = u.id === currentUserId;
        const why = self ? "You cannot change your own account here" : undefined;
        return (
          <div className="flex flex-wrap gap-1">
            <Button size="sm" disabled={self} title={why} onClick={() => onAction("toggle-role", u)}>
              {u.role === "admin" ? "Make user" : "Make admin"}
            </Button>
            <Button size="sm" disabled={self} title={why} onClick={() => onAction("toggle-disabled", u)}>
              {u.disabled ? "Enable" : "Disable"}
            </Button>
            <Button size="sm" onClick={() => onAction("quota", u)}>
              Quota
            </Button>
            <Button size="sm" variant="danger" disabled={self} title={why} onClick={() => onAction("delete", u)}>
              Delete
            </Button>
          </div>
        );
      },
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <SearchBox value={search} onChange={onSearch} label="Search by name, email or id" />
      <DataTable
        caption="Registered users"
        columns={columns}
        rows={filterUsers(users, search)}
        rowKey={(u) => u.id}
        initialSort={{ key: "created", dir: "desc" }}
        empty={<EmptyState title="No users match" why="Try a different search." />}
      />
    </div>
  );
}

// --------------------------------------------------------------------- costs

export function CostsView({
  costs,
  onDays,
  onExport,
}: {
  costs: AdminCosts;
  onDays: (d: 7 | 30 | 90) => void;
  onExport: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Range">
        {([7, 30, 90] as const).map((d) => (
          <Button
            key={d}
            size="sm"
            variant={costs.days === d ? "primary" : "secondary"}
            aria-pressed={costs.days === d}
            onClick={() => onDays(d)}
          >
            {d} days
          </Button>
        ))}
        <Button size="sm" onClick={onExport} icon={<Icon name="ArrowDown" size={14} aria-hidden />}>
          Export CSV
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label={`Cost, last ${costs.days} days`} value={formatUsd(costs.total_cost_usd)} />
        <Stat label="Tokens" value={fmtTokens(costs.total_tokens)} />
      </div>
      <Panel title="Daily cost (UTC)">
        <BarSeries
          label={`Daily cost over the last ${costs.days} days`}
          data={costs.daily.map((d) => ({ label: d.date, value: d.cost_usd }))}
          format={formatUsd}
        />
        <div className="mt-1 flex justify-between text-sm text-text-muted">
          <span>{costs.daily[0]?.date}</span>
          <span>{costs.daily[costs.daily.length - 1]?.date}</span>
        </div>
      </Panel>
      <Panel title="Cost by event type">
        <HBarList
          data={costs.by_event_type.map((t) => ({ label: t.type, value: t.cost_usd }))}
          format={formatUsd}
          empty="No metered events in this range"
        />
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ activity

export function ActivityView({
  activity,
  type,
  onType,
  types,
}: {
  activity: AdminActivity;
  type: string;
  onType: (v: string) => void;
  types: readonly string[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <Select label="Event type" value={type} options={["", ...types]} onChange={onType} />
      {activity.items.length === 0 ? (
        <EmptyState title="No events" why="The audit log has no events of this type yet." />
      ) : (
        <ol className="flex flex-col divide-y divide-border-hairline rounded-md border border-border-hairline">
          {activity.items.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="mono text-text-muted">#{e.id}</span>
              <span className="mono">{fmtDate(e.ts)}</span>
              <span className="mono font-semibold">{e.type}</span>
              <a
                className="mono text-brand hover:underline"
                href={`#/admin/runs/${encodeURIComponent(e.run_id)}`}
              >
                {e.run_id}
              </a>
              <span className="min-w-0 flex-1 truncate" title={e.summary}>
                {e.summary}
              </span>
              {e.cost_usd != null ? (
                <span className="mono text-text-muted">{formatUsd(e.cost_usd)}</span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// -------------------------------------------------------------------- health

export function HealthView({ health }: { health: AdminHealth }) {
  const b = health.budget_defaults;
  const rows: [string, ReactNode][] = [
    ["Database", health.db_ok ? "reachable" : "unreachable"],
    ["Foreign keys", health.db_foreign_keys ? "on" : "off"],
    ["Journal mode", health.db_journal_mode],
    ["Schema version", health.schema_version],
    ["Gateway mode", health.mode.toUpperCase()],
    ["Runs in progress", health.running_runs],
    [
      "Default budget",
      `${b.max_searches} searches · ${b.max_fetches} fetches · ${b.max_llm_calls} LLM calls · ${formatUsd(b.max_cost_usd ?? 0)}`,
    ],
  ];
  return (
    <div className="flex flex-col gap-4">
      <Banner tone={health.status === "healthy" ? "ok" : "warn"}>System {health.status}.</Banner>
      <Panel title="Runtime">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-text-muted">{k}</dt>
              <dd className="mono">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <Panel title="Typed failures (SSOT 18)">
        {Object.keys(health.failures).length === 0 ? (
          <p className="text-sm text-text-muted">No failures recorded.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {Object.entries(health.failures).map(([name, n]) => (
              <li key={name} className="flex items-center gap-1.5">
                <StateChip spec={failureChip(name)} />
                <span className="mono text-sm">{n}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// --------------------------------------------------------------------- audit

const ACTION_LABEL: Record<string, string> = {
  "user.update": "Updated user",
  "user.delete": "Deleted user",
  "run.stop": "Stopped run",
  "run.hide": "Hid run",
  "run.unhide": "Unhid run",
  "settings.update": "Changed default budget",
  "settings.reset": "Reset default budget",
  "export.runs": "Exported runs CSV",
  "export.costs": "Exported costs CSV",
};

export function AuditView({ audit }: { audit: AdminAudit }) {
  if (audit.items.length === 0) {
    return <EmptyState title="No admin actions yet" why="Every change made in this console is recorded here." />;
  }
  return (
    <ol className="flex flex-col divide-y divide-border-hairline rounded-md border border-border-hairline">
      {audit.items.map((a) => (
        <li key={a.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="mono text-text-muted">#{a.id}</span>
            <span className="mono">{fmtDate(a.ts)}</span>
            <span className="font-semibold">{ACTION_LABEL[a.action] ?? a.action}</span>
            {a.target_id ? <span className="mono text-text-muted">{a.target_id}</span> : null}
            <span className="text-text-muted">by {a.actor_email}</span>
          </div>
          {Object.keys(a.detail ?? {}).length > 0 ? (
            <code className="mono block truncate text-text-muted" title={JSON.stringify(a.detail)}>
              {JSON.stringify(a.detail)}
            </code>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

// ------------------------------------------------------------------ settings

export function SettingsView({
  settings,
  values,
  onChange,
  onSave,
  onReset,
  busy,
  error,
  saved,
}: {
  settings: AdminSettings;
  values: BudgetText;
  onChange: (key: BudgetKey, value: string) => void;
  onSave: () => void;
  onReset: () => void;
  busy: boolean;
  error: string | null;
  saved: boolean;
}) {
  const { errors } = parseBudgetForm(values);
  const invalid = Object.keys(errors).length > 0;
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Banner tone={settings.customized ? "info" : "ok"}>
        {settings.customized
          ? "Using a stored default budget. New runs start from these limits; a run may still override them."
          : "Using the environment default budget. Save changes to override it for all new runs."}
      </Banner>
      <Panel title="Default run budget">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid && !busy) onSave();
          }}
        >
          {BUDGET_FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 text-sm">
              <span className="label">{f.label}</span>
              <input
                inputMode="decimal"
                value={values[f.key]}
                aria-invalid={errors[f.key] ? true : undefined}
                aria-describedby={errors[f.key] ? `err-${f.key}` : undefined}
                onChange={(e) => onChange(f.key, e.target.value)}
                className="rounded-md border border-border-strong bg-surface px-2 py-1.5"
              />
              {errors[f.key] ? (
                <span id={`err-${f.key}`} className="text-sm text-bad-fg">
                  {errors[f.key]}
                </span>
              ) : null}
            </label>
          ))}
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <Button type="submit" disabled={invalid || busy}>
              {busy ? "Saving…" : "Save default budget"}
            </Button>
            <Button type="button" variant="secondary" disabled={busy || !settings.customized} onClick={onReset}>
              Reset to environment defaults
            </Button>
            {saved ? <span className="text-sm text-ok-fg">Saved.</span> : null}
          </div>
        </form>
        {error ? <div className="mt-3"><Banner tone="bad">{error}</Banner></div> : null}
      </Panel>
    </div>
  );
}
