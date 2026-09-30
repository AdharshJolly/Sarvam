import { describe, expect, test } from "bun:test";
import { LG_MIN, XL_MIN, countNumber, isRailCollapsed, parseRailPref } from "./layout";

describe("parseRailPref", () => {
  test("keeps an explicit choice", () => {
    expect(parseRailPref("expanded")).toBe("expanded");
    expect(parseRailPref("collapsed")).toBe("collapsed");
  });

  test("anything else means auto", () => {
    for (const raw of [null, undefined, "", "auto", "open", "COLLAPSED", "{}"]) {
      expect(parseRailPref(raw)).toBe("auto");
    }
  });
});

describe("isRailCollapsed", () => {
  test("auto follows the width: collapsed below xl, expanded from xl", () => {
    expect(isRailCollapsed("auto", LG_MIN)).toBe(true);
    expect(isRailCollapsed("auto", XL_MIN - 1)).toBe(true);
    expect(isRailCollapsed("auto", XL_MIN)).toBe(false);
    expect(isRailCollapsed("auto", 1920)).toBe(false);
  });

  test("an explicit choice wins at every width", () => {
    for (const width of [LG_MIN, XL_MIN, 1920]) {
      expect(isRailCollapsed("collapsed", width)).toBe(true);
      expect(isRailCollapsed("expanded", width)).toBe(false);
    }
  });
});

describe("countNumber", () => {
  test("reads the leading number of a count label", () => {
    expect(countNumber("3")).toBe(3);
    expect(countNumber("2 open")).toBe(2);
    expect(countNumber("0 open")).toBe(0);
  });

  test("returns null when there is no number", () => {
    expect(countNumber(undefined)).toBeNull();
    expect(countNumber("")).toBeNull();
    expect(countNumber("none")).toBeNull();
  });
});
