import { expect, test } from "bun:test";
import { GLOSSARY } from "@contracts/glossary";
import type { Phase } from "@contracts/types";
import { eventLabel, phaseName } from "./labels";

const PHASES = ["PLAN", "DISCOVER", "ACQUIRE", "EXTRACT", "CLAIMS", "VERIFY", "ANALYZE", "CHALLENGE", "STOP_POLICY", "SYNTHESIZE"] as Phase[];

test("every lifecycle step has a plain name with no underscore or all-caps", () => {
  for (const p of PHASES) {
    const n = phaseName(p);
    expect(n).not.toBe(p);
    expect(n).not.toMatch(/_|^[A-Z ]+$/);
  }
});

test("Simple mode shows plain event wording, Detailed the technical form", () => {
  expect(eventLabel("claim.verified", "simple")).toBe("Statement checked");
  expect(eventLabel("claim.verified", "detailed")).toBe("CLAIM VERIFIED");
  expect(eventLabel("origin.updated", "simple")).toBe("Independence updated");
});

test("every event in the glossary has a plain label that is not its technical name", () => {
  for (const type of Object.keys(GLOSSARY.event)) {
    expect(eventLabel(type, "simple")).not.toBe(eventLabel(type, "detailed"));
  }
});

test("an unknown event type still shows something", () => {
  expect(eventLabel("future.thing", "simple")).toBe("FUTURE THING");
});
