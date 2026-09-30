import { expect, test } from "bun:test";
import { buildScenario, SCENARIOS } from "../mocks/scenarios";
import { initialView, reduce, reduceAll } from "./runStore";
import {
  challengesCompleted,
  latestRound,
  originsForSlot,
  roundDiff,
  slotStats,
  worstCriticalSlots,
} from "./selectors";

const view = (id: Parameters<typeof buildScenario>[0]) => {
  const s = buildScenario(id);
  return reduceAll(s.events, { ...initialView, run: { id: s.runId, question: s.question, mode: "LIVE", started_at: "x" } });
};

test("replaying the same events twice gives identical state", () => {
  const s = buildScenario("complete");
  const once = reduceAll(s.events);
  const twice = reduceAll(s.events, once);
  expect(twice).toEqual(once);
});

test("duplicate and out-of-order events are ignored", () => {
  const s = buildScenario("complete");
  const v = reduceAll(s.events.slice(0, 10));
  const e5 = s.events[4];
  if (!e5) throw new Error("fixture");
  expect(reduce(v, { type: "event", event: e5 })).toBe(v);
  expect(v.lastEventId).toBe(10);
});

test("every scenario reduces to the expected end state", () => {
  const complete = view("complete");
  expect(complete.stop?.state).toBe("SUFFICIENT_WITH_CAVEATS");
  expect(complete.stop?.termination_reason).toBe("max_rounds");
  expect(complete.run?.status).toBe("completed");
  expect(complete.reportVersion).toBe(1);
  expect(view("insufficient").stop?.state).toBe("INSUFFICIENT");
  const budget = view("budget-wrapup");
  expect(budget.stop?.termination_reason).toBe("budget");
  expect(budget.stop?.challenge_rounds_completed).toBe(0);
  const failed = view("failure");
  expect(failed.failure?.failure).toBe("BLOCKED");
  expect(failed.run?.status).toBe("failed");
  expect(Object.keys(failed.claims).length).toBeGreaterThan(0);
  expect(view("replay").stop?.state).toBe("SUFFICIENT_WITH_CAVEATS");
  expect(SCENARIOS.length).toBe(5);
});

test("event ids are sequential per scenario", () => {
  for (const sc of SCENARIOS) {
    const s = buildScenario(sc.id);
    s.events.forEach((e, i) => expect(e.id).toBe(i + 1));
  }
});

test("origin collapse: pricing slot has more sources than origins", () => {
  const v = view("complete");
  const groups = originsForSlot(v, "D2S1");
  const total = groups.reduce((n, g) => n + g.sources.length, 0);
  expect(total).toBe(8);
  expect(groups.length).toBe(4);
  const press = groups.find((g) => g.origin?.id === "O1");
  expect(press?.sources.length).toBe(5);
  expect(groups.find((g) => g.origin?.method === "none")).toBeDefined();
  expect(slotStats(v)["D2S1"]).toEqual({ sources: 8, origins: 4 });
});

test("source with no origin is its own unestablished group", () => {
  const v = reduceAll(buildScenario("complete").events.slice(0, 40));
  const groups = originsForSlot(v, "D2S1");
  expect(groups.every((g) => g.origin === null)).toBe(true);
  expect(groups.length).toBe(7);
});

test("roundDiff and worstCriticalSlots", () => {
  const v = view("complete");
  expect(latestRound(v)).toBe(1);
  const diff = roundDiff(v.coverageByRound[0] ?? [], v.coverageByRound[1] ?? []);
  expect(diff["D1S1"]).toBe("improved");
  expect(diff["D3S1"]).toBe("worse");
  expect(diff["D2S2"]).toBe("same");
  const gaps = worstCriticalSlots(v).map((g) => g.slotId);
  expect(gaps.sort()).toEqual(["D2S1", "D3S1"]);
  expect(challengesCompleted(v)).toBe(3);
});

test("rejected claims are kept for the audit list", () => {
  expect(view("complete").rejectedClaims.length).toBe(2);
});

test("run id comes from the URL hash", async () => {
  const { runIdFromHash } = await import("./useRunSession");
  expect(runIdFromHash("#/run/R1")).toBe("R1");
  expect(runIdFromHash("#/run/mock-complete-1?x=1")).toBe("mock-complete-1");
  expect(runIdFromHash("")).toBeNull();
  expect(runIdFromHash("#/other")).toBeNull();
});
