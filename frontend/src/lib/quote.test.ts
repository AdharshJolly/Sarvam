import { expect, test } from "bun:test";
import { highlightRanges } from "./quote";

const marked = (r: ReturnType<typeof highlightRanges>) => r.segments.filter((s) => s.mark).map((s) => s.text);

test("exact server offsets", () => {
  const r = highlightRanges("abc price is 5 def", 4, 14, "price is 5");
  expect(r.located).toBe(true);
  expect(marked(r)).toEqual(["price is 5"]);
});

test("curly quotes fallback", () => {
  const r = highlightRanges("He said “it costs 99” today", null, null, 'said "it costs 99"');
  expect(r.located).toBe(true);
  expect(marked(r)).toEqual(["said “it costs 99”"]);
});

test("whitespace and case differences", () => {
  const r = highlightRanges("Plan  costs\n  Rs 499 per month.", null, null, "plan costs rs 499");
  expect(r.located).toBe(true);
  expect(marked(r)).toEqual(["Plan  costs\n  Rs 499"]);
});

test("missing quote", () => {
  const r = highlightRanges("nothing here", null, null, "absent phrase");
  expect(r.located).toBe(false);
  expect(marked(r)).toEqual([]);
  expect(r.segments[0]?.text).toBe("nothing here");
});

test("bad server offsets fall back", () => {
  const r = highlightRanges("abc def", 10, 20, "def");
  expect(r.located).toBe(true);
  expect(marked(r)).toEqual(["def"]);
});
