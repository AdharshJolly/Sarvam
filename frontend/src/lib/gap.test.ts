import { expect, test } from "bun:test";
import { GAP_CASES } from "@contracts/glossary";
import { gapText, gapTextForCell } from "./gap";

test("gapText gives the same sentence as the Python glossary for every shared case", () => {
  for (const c of GAP_CASES) {
    expect(gapText(c.state, c.origins, c.claims, c.conflicts).reason).toBe(c.reason);
  }
});

test("every non-green gap has a full sentence and a next step", () => {
  for (const state of ["AMBER", "RED"] as const) {
    for (const origins of [0, 1, 3]) {
      for (const conflicts of [0, 2]) {
        const g = gapText(state, origins, origins, conflicts);
        expect(g.reason).toContain(", so ");
        expect(g.next_step.trim().length).toBeGreaterThan(0);
      }
    }
  }
});

test("a slot with no cell yet reads as not enough evidence", () => {
  expect(gapTextForCell(undefined).reason).toBe("no usable evidence was found, so there is not enough evidence");
});
