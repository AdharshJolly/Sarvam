import { expect, test } from "bun:test";
import { collectCitationIds, parseInline, parseReport, unresolvedCitations } from "./reportMarkdown";

test("headings, paragraph, bullets", () => {
  const n = parseReport("# T\n\n## Sub\nline one\nline two\n\n- a [C1]\n- b\n");
  expect(n.map((x) => x.type)).toEqual(["heading", "heading", "paragraph", "list"]);
  const p = n[2];
  expect(p?.type === "paragraph" && p.inline).toEqual([{ t: "text", text: "line one line two" }]);
  const l = n[3];
  expect(l?.type === "list" && l.items.length).toBe(2);
});

test("table", () => {
  const n = parseReport("| A | B |\n|---|---|\n| 1 | **x** |\n| 2 | y [C3] |\n");
  const t = n[0];
  expect(t?.type).toBe("table");
  if (t?.type === "table") {
    expect(t.header.length).toBe(2);
    expect(t.rows.length).toBe(2);
    expect(t.rows[0]?.[1]).toEqual([{ t: "bold", children: [{ t: "text", text: "x" }] }]);
  }
});

test("multiple citations and certainty in one sentence", () => {
  const i = parseInline("Price is 499 [C41][C42] {{certainty:contested}}");
  expect(i.filter((x) => x.t === "cite").length).toBe(2);
  expect(i.at(-1)).toEqual({ t: "certainty", value: "contested" });
});

test("unknown certainty is dropped", () => {
  expect(parseInline("x {{certainty:bogus}} y").some((x) => x.t === "certainty")).toBe(false);
});

test("html stays literal text", () => {
  const i = parseInline("<script>alert(1)</script> <b>hi</b>");
  expect(i).toEqual([{ t: "text", text: "<script>alert(1)</script> <b>hi</b>" }]);
});

test("stray brackets do not crash", () => {
  for (const s of ["[C", "[C]", "]]][[[", "{{certainty:", "{{certainty:}}", "**", "****", "[C1", "| |", "|--|"]) {
    expect(() => parseReport(s)).not.toThrow();
  }
  expect(parseInline("see [C12] and [Cx]")).toEqual([
    { t: "text", text: "see " },
    { t: "cite", id: "C12" },
    { t: "text", text: " and [Cx]" },
  ]);
});

test("citation resolution", () => {
  const ids = collectCitationIds(parseReport("a [C1] **b [C2]**\n\n- [C1] [C9]"));
  expect(ids).toEqual(["C1", "C2", "C9"]);
  expect(unresolvedCitations(ids, ["C1", "C2"])).toEqual(["C9"]);
});
