import { describe, expect, test } from "bun:test";
import type {
  AdminActivity,
  AdminCosts,
  AdminHealth,
  AdminOverview,
  AdminRunDetail,
  AdminRunPage,
  AdminRunRow,
  AdminUserRow,
} from "@contracts/types";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiError } from "../../api/client";
import { barFractions } from "../ui/Charts";
import { type Column, DataTable, sortRows } from "../ui/DataTable";
import { AdminGate, AdminLayout } from "./AdminConsole";
import { filterRuns, filterUsers } from "./filter";
import {
  ActivityView,
  CostsView,
  HealthView,
  OverviewView,
  ResourceView,
  RunDetailView,
  RunsView,
  UsersView,
} from "./views";

const html = renderToStaticMarkup;
const noop = () => {};

const run = (over: Partial<AdminRunRow> = {}): AdminRunRow => ({
  id: "r1",
  question: "Should we launch X?",
  mode: "LIVE",
  status: "completed",
  stop_state: "SUFFICIENT",
  termination_reason: "criteria_met",
  started_at: "2026-09-30T10:00:00+00:00",
  ended_at: null,
  user_id: "u1",
  user_email: "alice@sarvam.ai",
  cost_usd: 1.25,
  tokens: 400,
  ...over,
});

const user = (over: Partial<AdminUserRow> = {}): AdminUserRow => ({
  id: "u1",
  email: "alice@sarvam.ai",
  display_name: "Alice",
  role: "user",
  created_at: "2026-09-01T00:00:00+00:00",
  last_login_at: null,
  run_count: 2,
  cost_usd: 2,
  ...over,
});

const health: AdminHealth = {
  status: "healthy",
  db_ok: true,
  db_foreign_keys: true,
  db_journal_mode: "wal",
  schema_version: 3,
  mode: "live",
  budget_defaults: {},
  running_runs: 1,
  failures: { STEP_FAILED: 2 },
};

describe("pure helpers", () => {
  test("sortRows sorts numbers numerically, strings by locale, and is stable", () => {
    const col: Column<{ n: number }> = { key: "n", header: "n", render: () => null, sortValue: (r) => r.n };
    const rows = [{ n: 10 }, { n: 2 }, { n: 33 }];
    expect(sortRows(rows, col, "asc").map((r) => r.n)).toEqual([2, 10, 33]);
    expect(sortRows(rows, col, "desc").map((r) => r.n)).toEqual([33, 10, 2]);
    const s: Column<{ s: string; i: number }> = { key: "s", header: "s", render: () => null, sortValue: (r) => r.s };
    const ties = [{ s: "a", i: 1 }, { s: "a", i: 2 }];
    expect(sortRows(ties, s, "desc").map((r) => r.i)).toEqual([1, 2]);
    expect(sortRows(rows, undefined, "asc")).toEqual(rows);
  });

  test("barFractions scales to the max and survives all-zero data", () => {
    expect(barFractions([1, 2, 4])).toEqual([0.25, 0.5, 1]);
    expect(barFractions([0, 0])).toEqual([0, 0]);
    expect(barFractions([])).toEqual([]);
  });

  test("filterRuns / filterUsers search id, text and owner case-insensitively", () => {
    const runs = [run(), run({ id: "r2", question: "Other", user_email: null })];
    expect(filterRuns(runs, "  ALICE ").map((r) => r.id)).toEqual(["r1"]);
    expect(filterRuns(runs, "r2").map((r) => r.id)).toEqual(["r2"]);
    expect(filterRuns(runs, "").length).toBe(2);
    expect(filterUsers([user(), user({ id: "u2", email: "bob@x.io", display_name: "Bob" })], "bob").length).toBe(1);
  });
});

describe("DataTable", () => {
  test("renders headers with aria-sort on the initial sort and a button per sortable column", () => {
    const out = html(
      <DataTable
        caption="t"
        columns={[{ key: "n", header: "N", render: (r: { n: number }) => r.n, sortValue: (r) => r.n }]}
        rows={[{ n: 2 }, { n: 1 }]}
        rowKey={(r) => String(r.n)}
        initialSort={{ key: "n", dir: "asc" }}
      />,
    );
    expect(out).toContain('aria-sort="ascending"');
    expect(out).toContain("<caption");
    expect(out.indexOf(">1<")).toBeLessThan(out.indexOf(">2<"));
  });

  test("shows the empty state instead of an empty table", () => {
    const out = html(
      <DataTable caption="t" columns={[]} rows={[]} rowKey={() => ""} empty={<p>nothing here</p>} />,
    );
    expect(out).toContain("nothing here");
    expect(out).not.toContain("<table");
  });
});

describe("views", () => {
  test("ResourceView: loading, 401, 403, generic error, and ready", () => {
    const base = { data: null, label: "runs", children: () => <p>ready</p> };
    expect(html(<ResourceView {...base} loading error={null} />)).toContain("Loading runs");
    expect(html(<ResourceView {...base} loading={false} error={new ApiError(401, "x")} />)).toContain("session has expired");
    expect(html(<ResourceView {...base} loading={false} error={new ApiError(403, "x")} />)).toContain("admin role required");
    expect(html(<ResourceView {...base} loading={false} error={new Error("boom")} />)).toContain("Could not load runs: boom");
    expect(html(<ResourceView {...base} data={1} loading={false} error={null} />)).toContain("ready");
  });

  test("OverviewView shows totals, the health banner and the INSUFFICIENT explanation", () => {
    const overview: AdminOverview = {
      users: 3,
      admins: 1,
      runs: 5,
      runs_by_status: { completed: 4, failed: 1 },
      runs_by_mode: { LIVE: 3, REPLAY: 2 },
      stop_states: { SUFFICIENT: 3, INSUFFICIENT: 1 },
      insufficient_runs: 1,
      total_cost_usd: 2.5,
      total_tokens: 12345,
    };
    const out = html(<OverviewView overview={overview} health={health} />);
    expect(out).toContain("$2.50");
    expect(out).toContain("12,345");
    expect(out).toContain("2 replayed");
    expect(out).toContain("System healthy");
    expect(out).toContain("ended INSUFFICIENT");
  });

  test("RunsView renders rows with mode and status chips, and the range text", () => {
    const page: AdminRunPage = {
      items: [run(), run({ id: "r2", mode: "REPLAY", status: "failed", stop_state: null, user_email: null })],
      total: 2,
      limit: 25,
      offset: 0,
    };
    const out = html(
      <RunsView page={page} search="" onSearch={noop} status="" onStatus={noop} mode="" onMode={noop} includeHidden={false} onIncludeHidden={noop} onExport={noop} onOpen={noop} onPage={noop} />,
    );
    expect(out).toContain("REPLAY (recorded)");
    expect(out).toContain("Failed");
    expect(out).toContain("anonymous");
    expect(out).toContain("1–2 of 2");
    expect(html(
      <RunsView page={{ ...page, items: [], total: 0 }} search="" onSearch={noop} status="" onStatus={noop} mode="" onMode={noop} includeHidden={false} onIncludeHidden={noop} onExport={noop} onOpen={noop} onPage={noop} />,
    )).toContain("No runs match");
  });

  test("RunDetailView shows evidence-quality breakdowns", () => {
    const detail: AdminRunDetail = {
      run: run(),
      event_count: 42,
      cost_usd: 1.25,
      tokens: 400,
      claims_by_status: { supported: 5, rejected: 1 },
      conflicts_by_status: { open: 2 },
      challenges_by_outcome: {},
      coverage_by_state: { GREEN: 3, RED: 1 },
    };
    const out = html(<RunDetailView detail={detail} onBack={noop} onStop={noop} onToggleHidden={noop} />);
    expect(out).toContain("Claims by status");
    expect(out).toContain("supported");
    expect(out).toContain("No challenges recorded");
    expect(out).toContain('href="#/run/r1"');
  });

  test("UsersView marks admins and never renders secret fields", () => {
    const out = html(<UsersView users={[user({ role: "admin" }), user({ id: "u2", email: "b@x.io" })]} search="" onSearch={noop} currentUserId="u1" onAction={noop} />);
    expect(out).toContain("admin");
    expect(out).not.toContain("password");
  });

  test("CostsView marks the active range and titles every bar", () => {
    const costs: AdminCosts = {
      days: 7,
      total_cost_usd: 3,
      total_tokens: 900,
      daily: [
        { date: "2026-09-29", cost_usd: 1, tokens: 300 },
        { date: "2026-09-30", cost_usd: 2, tokens: 600 },
      ],
      by_event_type: [{ type: "claim.verified", cost_usd: 3, tokens: 900, events: 4 }],
    };
    const out = html(<CostsView costs={costs} onDays={noop} onExport={noop} />);
    expect(out).toContain('aria-pressed="true"');
    expect(out).toContain("<title>2026-09-30: $2.00</title>");
    expect(out).toContain("claim.verified");
  });

  test("ActivityView links each event to its run; empty feed explains itself", () => {
    const feed: AdminActivity = {
      items: [{ id: 9, run_id: "r1", ts: "2026-09-30T10:00:00+00:00", round: 0, type: "run.failed", cost_usd: null, tokens: null, summary: "boom" }],
    };
    expect(html(<ActivityView activity={feed} type="" onType={noop} types={["run.failed"]} />)).toContain('href="#/admin/runs/r1"');
    expect(html(<ActivityView activity={{ items: [] }} type="" onType={noop} types={[]} />)).toContain("No events");
  });

  test("HealthView lists typed failures or says there are none", () => {
    expect(html(<HealthView health={health} />)).toContain("STEP_FAILED");
    expect(html(<HealthView health={{ ...health, failures: {} }} />)).toContain("No failures recorded");
    expect(html(<HealthView health={{ ...health, status: "degraded", db_ok: false }} />)).toContain("System degraded");
  });
});

describe("shell", () => {
  const layout = (over: Partial<Parameters<typeof AdminLayout>[0]> = {}) =>
    html(
      <AdminLayout section="runs" collapsed={false} drawerOpen={false} isDesktop onToggle={noop} onNavigate={noop} onRefresh={noop} {...over}>
        <p>page body</p>
      </AdminLayout>,
    );

  test("desktop sidebar lists every section and marks the current one", () => {
    const out = layout();
    for (const label of ["Overview", "Runs", "Users", "Costs", "Activity", "Health"]) expect(out).toContain(label);
    expect(out).toContain('aria-current="page"');
    expect(out).toContain("page body");
    expect(out).toContain("Collapse sidebar");
  });

  test("collapsed sidebar keeps accessible names but hides labels visually", () => {
    const out = layout({ collapsed: true });
    expect(out).toContain("Expand sidebar");
    expect(out).toContain('class="sr-only">Runs<');
  });

  test("below lg the drawer only exists when open", () => {
    expect(layout({ isDesktop: false })).not.toContain('role="dialog"');
    expect(layout({ isDesktop: false, drawerOpen: true })).toContain('role="dialog"');
  });

  test("gate states say what is wrong and where to go", () => {
    expect(html(<AdminGate kind="signin" />)).toContain("#/signin");
    expect(html(<AdminGate kind="forbidden" />)).toContain("does not have the admin role");
  });
});
