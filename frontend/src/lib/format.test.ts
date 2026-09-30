import { expect, test } from "bun:test";
import { ageBucket, domainOf, formatSeconds, formatUsd, stateStyle } from "./format";

const now = new Date("2026-06-01T00:00:00Z");

test("ageBucket buckets", () => {
  expect(ageBucket("2026-01-01", now)).toBe("under 12 months");
  expect(ageBucket("2024-06-01", now)).toBe("12 to 36 months");
  expect(ageBucket("2019-01-01", now)).toBe("over 36 months");
  expect(ageBucket(null, now)).toBe("date unknown");
  expect(ageBucket("garbage", now)).toBe("date unknown");
});

test("domainOf, formatters, stateStyle", () => {
  expect(domainOf("https://a.example.invalid/x")).toBe("a.example.invalid");
  expect(domainOf("not a url")).toBe("not a url");
  expect(formatSeconds(75)).toBe("1m 15s");
  expect(formatUsd(0.5)).toBe("$0.500");
  expect(stateStyle("RED").icon).toBe("XOctagon");
  expect(stateStyle("GREEN").label).toBe("GREEN");
});

test("safeHref allows only http(s)", async () => {
  const { safeHref } = await import("./format");
  expect(safeHref("https://a.example.invalid/x")).toBe("https://a.example.invalid/x");
  expect(safeHref("javascript:alert(1)")).toBeUndefined();
  expect(safeHref("data:text/html,x")).toBeUndefined();
  expect(safeHref("nonsense")).toBeUndefined();
});
