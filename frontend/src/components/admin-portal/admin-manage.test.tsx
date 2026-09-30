import { describe, expect, test } from "bun:test";
import type { AdminAudit, AdminRunDetail, AdminRunRow, AdminSettings, AdminUserRow } from "@contracts/types";
import { renderToStaticMarkup } from "react-dom/server";
import { BUDGET_FIELDS, budgetToText, parseBudgetForm } from "./budgetForm";
import { ConfirmDialog, QuotaDialog, parseQuota } from "./dialogs";
import { AuditView, RunDetailView, SettingsView, UsersView } from "./views";

const html = renderToStaticMarkup;
const noop = () => {};

const budget = {
  max_searches: 24,
  max_fetches: 40,
  max_llm_calls: 250,
  max_cost_usd: 3,
  max_wall_seconds_soft: 480,
  max_wall_seconds_hard: 600,
  max_followup_rounds: 2,
};

const user = (over: Partial<AdminUserRow> = {}): AdminUserRow => ({
  id: "u2",
  email: "bob@sarvam.ai",
  display_name: "Bob",
  role: "user",
  disabled: false,
  quota_usd: null,
  created_at: "2026-09-01T00:00:00+00:00",
  last_login_at: null,
  run_count: 1,
  cost_usd: 0.5,
  ...over,
});

const runRow = (over: Partial<AdminRunRow> = {}): AdminRunRow => ({
  id: "r1",
  question: "q",
  mode: "LIVE",
  status: "running",
  started_at: "2026-09-30T10:00:00+00:00",
  cost_usd: 0,
  tokens: 0,
  hidden: false,
  ...over,
});

const detail = (run: AdminRunRow): AdminRunDetail => ({
  run,
  event_count: 1,
  cost_usd: 0,
  tokens: 0,
  claims_by_status: {},
  conflicts_by_status: {},
  challenges_by_outcome: {},
  coverage_by_state: {},
});

describe("budget form", () => {
  test("round-trips the server budget and accepts it", () => {
    const parsed = parseBudgetForm(budgetToText(budget));
    expect(parsed.errors).toEqual({});
    expect(parsed.budget).toEqual(budget);
  });

  test("mirrors the server rules field by field", () => {
    const text = budgetToText(budget);
    const bad = (key: keyof typeof text, value: string) => parseBudgetForm({ ...text, [key]: value }).errors[key];
    expect(bad("max_searches", "0")).toBe("Must be at least 1");
    expect(bad("max_searches", "2.5")).toBe("Must be a whole number");
    expect(bad("max_fetches", "")).toBe("Enter a number");
    expect(bad("max_llm_calls", "abc")).toBe("Enter a number");
    expect(bad("max_cost_usd", "0")).toBe("Must be greater than 0");
    expect(bad("max_followup_rounds", "-1")).toBe("Must not be negative");
    expect(parseBudgetForm({ ...text, max_followup_rounds: "0" }).errors).toEqual({});
    expect(parseBudgetForm({ ...text, max_cost_usd: "0.25" }).budget?.max_cost_usd).toBe(0.25);
  });

  test("hard wall time may not be below soft", () => {
    const r = parseBudgetForm({ ...budgetToText(budget), max_wall_seconds_hard: "100" });
    expect(r.budget).toBeNull();
    expect(r.errors.max_wall_seconds_hard).toBe("Must not be below the soft limit");
  });

  test("covers every budget field once", () => {
    expect(new Set(BUDGET_FIELDS.map((f) => f.key)).size).toBe(7);
  });
});

describe("quota parsing", () => {
  test("empty is unlimited, numbers are kept, junk is refused", () => {
    expect(parseQuota("")).toEqual({ ok: true, value: null });
    expect(parseQuota("  ")).toEqual({ ok: true, value: null });
    expect(parseQuota("2.5")).toEqual({ ok: true, value: 2.5 });
    expect(parseQuota("0")).toEqual({ ok: true, value: 0 });
    expect(parseQuota("-1").ok).toBe(false);
    expect(parseQuota("lots").ok).toBe(false);
  });
});

describe("dialogs", () => {
  test("ConfirmDialog renders title, body, labels and any error", () => {
    const out = html(
      <ConfirmDialog isOpen title="Delete?" body="Gone forever" confirmLabel="Delete account" danger busy={false} error="Server said no" onConfirm={noop} onClose={noop} />,
    );
    expect(out).toContain("Delete?");
    expect(out).toContain("Gone forever");
    expect(out).toContain("Delete account");
    expect(out).toContain("Server said no");
    expect(html(<ConfirmDialog isOpen title="t" body="b" confirmLabel="Go" busy error={null} onConfirm={noop} onClose={noop} />)).toContain("Working…");
  });

  test("QuotaDialog explains the effect", () => {
    const out = html(<QuotaDialog isOpen email="bob@sarvam.ai" current={null} busy={false} error={null} onSave={noop} onClose={noop} />);
    expect(out).toContain("bob@sarvam.ai");
    expect(out).toContain("Unlimited");
  });
});

describe("users: management actions", () => {
  const render = (users: AdminUserRow[], currentUserId = "u1") =>
    html(<UsersView users={users} search="" onSearch={noop} currentUserId={currentUserId} onAction={noop} />);

  test("every row offers the four actions, with role-aware wording", () => {
    const out = render([user(), user({ id: "u3", email: "c@x.io", role: "admin", disabled: true })]);
    expect(out).toContain("Make admin");
    expect(out).toContain("Make user");
    expect(out).toContain("Enable");
    expect(out).toContain("Disable");
    expect(out).toContain("Quota");
    expect(out).toContain("Delete");
  });

  test("a disabled account is labelled with a word, not just a colour", () => {
    expect(render([user({ disabled: true })])).toContain("disabled");
  });

  test("your own row cannot change role, be disabled or be deleted, and says why", () => {
    const out = render([user({ id: "me", email: "me@x.io" })], "me");
    expect(out.match(/disabled=""/g)?.length).toBe(3);
    expect(out).toContain("You cannot change your own account here");
    expect(render([user()]).match(/disabled=""/g)).toBeNull();
  });

  test("quota column shows unlimited or a dollar amount", () => {
    expect(render([user()])).toContain("unlimited");
    expect(render([user({ quota_usd: 5 })])).toContain("$5.00");
  });
});

describe("run controls", () => {
  const render = (run: AdminRunRow, extra: { busy?: boolean; error?: string | null } = {}) =>
    html(<RunDetailView detail={detail(run)} onBack={noop} onStop={noop} onToggleHidden={noop} {...extra} />);

  test("Stop is offered only while a run is active", () => {
    expect(render(runRow({ status: "running" }))).toContain("Stop run");
    expect(render(runRow({ status: "queued" }))).toContain("Stop run");
    expect(render(runRow({ status: "completed" }))).not.toContain("Stop run");
    expect(render(runRow({ status: "failed" }))).not.toContain("Stop run");
  });

  test("hide toggles its wording and explains that evidence is kept", () => {
    expect(render(runRow())).toContain("Hide run");
    const hidden = render(runRow({ hidden: true }));
    expect(hidden).toContain("Unhide run");
    expect(hidden).toContain("still counted");
  });

  test("busy disables the buttons and an error is shown", () => {
    const out = render(runRow(), { busy: true, error: "run is completed and not stoppable" });
    expect(out).toContain("not stoppable");
    expect(out).toContain('disabled=""');
  });
});

describe("audit view", () => {
  test("lists actions with actor, target and detail; explains the empty log", () => {
    const audit: AdminAudit = {
      items: [
        { id: 2, ts: "2026-09-30T10:00:00+00:00", actor_id: "a", actor_email: "root@sarvam.ai", action: "user.delete", target_type: "user", target_id: "u9", detail: { email: "x@y.z" } },
        { id: 1, ts: "2026-09-30T09:00:00+00:00", actor_id: "a", actor_email: "root@sarvam.ai", action: "settings.reset", target_type: "settings", target_id: "default_budget", detail: {} },
      ],
    };
    const out = html(<AuditView audit={audit} />);
    expect(out).toContain("Deleted user");
    expect(out).toContain("Reset default budget");
    expect(out).toContain("by root@sarvam.ai");
    expect(out).toContain("x@y.z");
    expect(html(<AuditView audit={{ items: [] }} />)).toContain("No admin actions yet");
  });
});

describe("settings view", () => {
  const settings = (customized: boolean): AdminSettings => ({ default_budget: budget, customized });
  const render = (customized: boolean, over: Partial<Parameters<typeof SettingsView>[0]> = {}) =>
    html(
      <SettingsView settings={settings(customized)} values={budgetToText(budget)} onChange={noop} onSave={noop} onReset={noop} busy={false} error={null} saved={false} {...over} />,
    );

  test("shows one input per budget field and says where the defaults come from", () => {
    const out = render(false);
    for (const f of BUDGET_FIELDS) expect(out).toContain(f.label);
    expect(out).toContain("environment default budget");
    expect(render(true)).toContain("stored default budget");
  });

  test("reset is only available once customised", () => {
    const off = render(false).split("Reset to environment defaults")[0] ?? "";
    expect(off.endsWith('disabled="">')).toBe(true);
    const on = render(true).split("Reset to environment defaults")[0] ?? "";
    expect(on.endsWith('disabled="">')).toBe(false);
  });

  test("invalid input shows an inline error and blocks saving", () => {
    const values = { ...budgetToText(budget), max_searches: "0" };
    const out = render(true, { values });
    expect(out).toContain("Must be at least 1");
    expect(out).toContain('aria-invalid="true"');
    expect(out.split("Save default budget")[0]?.endsWith('disabled="">')).toBe(true);
  });

  test("shows saved confirmation and server errors", () => {
    expect(render(true, { saved: true })).toContain("Saved.");
    expect(render(true, { error: "max_cost_usd must be greater than 0" })).toContain("must be greater than 0");
  });
});
