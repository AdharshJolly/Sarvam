import { describe, expect, test } from "bun:test";
import { MAX_PINNED, parsePinned } from "./pinned";

describe("parsePinned", () => {
  test("empty text adds nothing", () => {
    expect(parsePinned("  \n ")).toEqual({ urls: [], error: null });
  });

  test("one address per line, blanks and repeats dropped", () => {
    const text = "https://a.example/x.pdf\n\n  http://b.example/  \nhttps://a.example/x.pdf";
    expect(parsePinned(text)).toEqual({ urls: ["https://a.example/x.pdf", "http://b.example/"], error: null });
  });

  test("anything but an http(s) address is refused", () => {
    expect(parsePinned("ftp://a.example/f").error).toContain("Not a web address: ftp://a.example/f");
    expect(parsePinned("niti.gov.in/report.pdf").error).toContain("https://");
    expect(parsePinned("javascript:alert(1)").error).not.toBeNull();
  });

  test("more than the limit is refused", () => {
    const text = Array.from({ length: MAX_PINNED + 1 }, (_, i) => `https://e.example/${i}`).join("\n");
    expect(parsePinned(text).error).toBe(`Add at most ${MAX_PINNED} pages (you have ${MAX_PINNED + 1}).`);
  });
});
