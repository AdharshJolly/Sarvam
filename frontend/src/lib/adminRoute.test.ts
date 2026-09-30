import { describe, expect, test } from "bun:test";
import { ADMIN_SECTIONS, buildAdminHash, parseAdminRoute } from "./adminRoute";

describe("parseAdminRoute", () => {
  test("defaults to the overview", () => {
    expect(parseAdminRoute("#/admin")).toEqual({ section: "overview", runId: null });
    expect(parseAdminRoute("#/admin/nope")).toEqual({ section: "overview", runId: null });
  });
  test("reads every section and the run id under runs", () => {
    for (const s of ADMIN_SECTIONS) expect(parseAdminRoute(`#/admin/${s}`).section).toBe(s);
    expect(parseAdminRoute("#/admin/runs/R%201")).toEqual({ section: "runs", runId: "R 1" });
    expect(parseAdminRoute("#/admin/users/R1")).toEqual({ section: "users", runId: null });
    expect(parseAdminRoute("#/admin/runs/%E0%A4%A")).toEqual({ section: "runs", runId: null });
  });
  test("buildAdminHash round-trips", () => {
    expect(buildAdminHash("overview")).toBe("#/admin");
    expect(buildAdminHash("costs")).toBe("#/admin/costs");
    expect(parseAdminRoute(buildAdminHash("runs", "run id/1"))).toEqual({
      section: "runs",
      runId: "run id/1",
    });
  });
});
