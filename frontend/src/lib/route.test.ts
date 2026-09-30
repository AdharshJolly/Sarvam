import { describe, expect, test } from "bun:test";
import { DEFAULT_TAB, TAB_IDS, buildHash, parseRoute } from "./route";

describe("parseRoute", () => {
  test("no run in the hash means the landing screen", () => {
    expect(parseRoute("")).toEqual({ runId: null, tab: DEFAULT_TAB });
    expect(parseRoute("#")).toEqual({ runId: null, tab: DEFAULT_TAB });
    expect(parseRoute("#/other/thing")).toEqual({ runId: null, tab: DEFAULT_TAB });
  });

  test("a run without a tab uses the default tab", () => {
    expect(parseRoute("#/run/R1")).toEqual({ runId: "R1", tab: "matrix" });
  });

  test("every known tab round-trips", () => {
    for (const tab of TAB_IDS) {
      expect(parseRoute(`#/run/R1/${tab}`)).toEqual({ runId: "R1", tab });
    }
  });

  test("an unknown tab falls back to the default instead of failing", () => {
    expect(parseRoute("#/run/R1/nonsense")).toEqual({ runId: "R1", tab: "matrix" });
  });

  test("the old bare tab hash is not mistaken for a run", () => {
    expect(parseRoute("#report").runId).toBeNull();
  });

  test("ids with special characters are decoded, and bad escapes do not throw", () => {
    expect(parseRoute("#/run/mock-complete-1").runId).toBe("mock-complete-1");
    expect(parseRoute(`#/run/${encodeURIComponent("a b/c")}`).runId).toBe("a b/c");
    expect(parseRoute("#/run/%E0%A4%A")).toEqual({ runId: null, tab: DEFAULT_TAB });
  });

  test("query strings and fragments after the tab are ignored", () => {
    expect(parseRoute("#/run/R1/report?x=1")).toEqual({ runId: "R1", tab: "report" });
  });
});

describe("buildHash", () => {
  test("omits the default tab and includes the others", () => {
    expect(buildHash("R1")).toBe("#/run/R1");
    expect(buildHash("R1", "matrix")).toBe("#/run/R1");
    expect(buildHash("R1", "report")).toBe("#/run/R1/report");
  });

  test("encodes the id and parses back to the same route", () => {
    for (const tab of TAB_IDS) {
      const hash = buildHash("run id/1", tab);
      expect(parseRoute(hash)).toEqual({ runId: "run id/1", tab });
    }
  });
});
