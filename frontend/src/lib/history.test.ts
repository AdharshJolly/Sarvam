import { describe, expect, test } from "bun:test";
import type { Run } from "@contracts/types";
import { HISTORY_PAGE_SIZE, appendPage, filterRuns, hasMore, runOutcome } from "./history";

const run = (id: string, extra: Partial<Run> = {}): Run =>
  ({
    id,
    question: `question ${id}`,
    mode: "LIVE",
    status: "completed",
    started_at: "2026-09-30T10:00:00+00:00",
    ...extra,
  }) as Run;

describe("appendPage", () => {
  test("adds the next page after the current list", () => {
    expect(appendPage([run("R1")], [run("R2"), run("R3")]).map((r) => r.id)).toEqual(["R1", "R2", "R3"]);
  });

  test("a run already listed is not repeated (a new run shifts the offsets)", () => {
    expect(appendPage([run("R1"), run("R2")], [run("R2"), run("R3")]).map((r) => r.id)).toEqual(["R1", "R2", "R3"]);
  });
});

describe("hasMore", () => {
  test("a full page means there may be another", () => {
    expect(hasMore(HISTORY_PAGE_SIZE)).toBe(true);
  });

  test("a short or empty page is the last one", () => {
    expect(hasMore(HISTORY_PAGE_SIZE - 1)).toBe(false);
    expect(hasMore(0)).toBe(false);
  });
});

describe("runOutcome", () => {
  test("a stopped run reports its final state and the plain-language reason", () => {
    const out = runOutcome(run("R1", { stop_state: "SUFFICIENT_WITH_CAVEATS", termination_reason: "budget" }));
    expect(out?.state).toBe("SUFFICIENT_WITH_CAVEATS");
    expect(out?.reason).toBeTruthy();
    expect(out?.reason).not.toBe("budget");
  });

  test("a run without a stop decision has no outcome", () => {
    expect(runOutcome(run("R1", { status: "running" }))).toBeNull();
    expect(runOutcome(run("R1", { stop_state: null }))).toBeNull();
  });

  test("a final state without a recorded reason still reports the state", () => {
    expect(runOutcome(run("R1", { stop_state: "INSUFFICIENT" }))).toEqual({ state: "INSUFFICIENT", reason: null });
  });
});

describe("filterRuns", () => {
  const runs = [run("R1", { question: "Scooter market in Bengaluru" }), run("R2", { question: "EV battery costs" })];

  test("matches the question or the id, ignoring case", () => {
    expect(filterRuns(runs, "bengaluru").map((r) => r.id)).toEqual(["R1"]);
    expect(filterRuns(runs, "r2").map((r) => r.id)).toEqual(["R2"]);
  });

  test("a blank query keeps every run", () => {
    expect(filterRuns(runs, "  ")).toHaveLength(2);
  });
});
