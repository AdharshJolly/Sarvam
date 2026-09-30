import { describe, expect, test } from "bun:test";
import { nextTabIndex } from "./tabs";

describe("nextTabIndex", () => {
  test("ArrowRight moves forward and wraps from the last tab to the first", () => {
    expect(nextTabIndex("ArrowRight", 0, 5)).toBe(1);
    expect(nextTabIndex("ArrowRight", 4, 5)).toBe(0);
  });

  test("ArrowLeft moves back and wraps from the first tab to the last", () => {
    expect(nextTabIndex("ArrowLeft", 3, 5)).toBe(2);
    expect(nextTabIndex("ArrowLeft", 0, 5)).toBe(4);
  });

  test("Home and End jump to the ends", () => {
    expect(nextTabIndex("Home", 3, 5)).toBe(0);
    expect(nextTabIndex("End", 1, 5)).toBe(4);
  });

  test("other keys are not handled, so Tab and typing keep their normal behaviour", () => {
    for (const key of ["Tab", "Enter", " ", "a", "ArrowDown", "ArrowUp", "Escape"]) {
      expect(nextTabIndex(key, 2, 5)).toBeNull();
    }
  });

  test("an empty list handles nothing and a single tab stays put", () => {
    expect(nextTabIndex("ArrowRight", 0, 0)).toBeNull();
    expect(nextTabIndex("ArrowRight", 0, 1)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 1)).toBe(0);
  });
});
