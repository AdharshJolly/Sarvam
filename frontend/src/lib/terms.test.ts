import { expect, test } from "bun:test";
import { TERMS } from "@contracts/glossary";
import { counted, term, termTitle } from "./terms";

test("terms agree with the count and capitalise for headings", () => {
  expect(counted("origin", 1)).toBe("1 independent source");
  expect(counted("origin", 3)).toBe("3 independent sources");
  expect(term("slot", 2)).toBe("key points");
  expect(termTitle("claim")).toBe("Statement");
});

test("the jargon words slot, origin and claim never appear in their own plain names", () => {
  for (const raw of ["slot", "origin", "claim"] as const) {
    for (const name of [TERMS[raw].singular, TERMS[raw].plural]) {
      expect(name.toLowerCase()).not.toContain(raw);
    }
  }
});
