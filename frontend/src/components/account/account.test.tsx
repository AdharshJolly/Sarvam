import { describe, expect, test } from "bun:test";
import type { UserUsage } from "@contracts/types";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountUsage, quotaPercent, roleLabel } from "./AccountUsage";

const html = renderToStaticMarkup;
const usage = (over: Partial<UserUsage> = {}): UserUsage => ({
  run_count: 3,
  cost_usd: 1,
  quota_usd: null,
  remaining_usd: null,
  ...over,
});

describe("account usage", () => {
  test("role labels use the real role, not a fixed title", () => {
    expect(roleLabel("admin")).toBe("Administrator");
    expect(roleLabel("user")).toBe("Researcher");
    expect(roleLabel(undefined)).toBe("Researcher");
  });

  test("quotaPercent is null without a quota and clamps to 0..100", () => {
    expect(quotaPercent(usage())).toBeNull();
    expect(quotaPercent(usage({ quota_usd: 4, cost_usd: 1 }))).toBe(25);
    expect(quotaPercent(usage({ quota_usd: 1, cost_usd: 5 }))).toBe(100);
    expect(quotaPercent(usage({ quota_usd: 0, cost_usd: 0 }))).toBe(100);
  });

  test("no quota: shows Unlimited and no progress bar", () => {
    const out = html(<AccountUsage usage={usage()} error={null} />);
    expect(out).toContain("Unlimited");
    expect(out).toContain("Research runs");
    expect(out).not.toContain("progressbar");
  });

  test("with a quota: progress bar carries the value and remaining amount", () => {
    const out = html(<AccountUsage usage={usage({ quota_usd: 4, cost_usd: 1, remaining_usd: 3 })} error={null} />);
    expect(out).toContain('role="progressbar"');
    expect(out).toContain('aria-valuenow="25"');
    expect(out).toContain("25% used");
    expect(out).toContain("$3.00 remaining");
    expect(out).not.toContain("quota is used up");
  });

  test("an exhausted quota says so in words", () => {
    const out = html(<AccountUsage usage={usage({ quota_usd: 1, cost_usd: 2, remaining_usd: 0 })} error={null} />);
    expect(out).toContain("quota is used up");
  });

  test("loading and error states are explicit", () => {
    expect(html(<AccountUsage usage={null} error={null} />)).toContain("Loading usage");
    expect(html(<AccountUsage usage={null} error="boom" />)).toContain("Usage could not be loaded: boom");
  });
});
