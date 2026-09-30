import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Landing } from "../components/Landing";
import { taskStatusView } from "../components/ChallengeList";
import { RunForm } from "../components/RunForm";
import { SourcesTable, sortSources } from "../components/SourcesTable";
import { contentsEntries } from "../components/panels/ReportPanel";
import { ReportBody } from "../components/report/ReportBody";
import { ReportContents } from "../components/report/ReportContents";
import { parseReport } from "../lib/reportMarkdown";
import { RunProgress, phaseStatus } from "../components/RunProgress";
import { SessionProvider } from "../state/useRunSession";

// The session reads the URL hash while rendering; there is no DOM under bun, so give it a minimal one.
function page(node: React.ReactNode): string {
  const g = globalThis as { window?: unknown };
  const before = g.window;
  g.window = { location: { hash: "" }, addEventListener() {}, removeEventListener() {} };
  try {
    return renderToStaticMarkup(<SessionProvider>{node}</SessionProvider>);
  } finally {
    g.window = before;
  }
}

describe("landing", () => {
  const html = page(<Landing />);

  test("has one h1 and the four demo moments", () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
    for (const m of ["Coverage matrix", "Independence collapse", "Claim to passage", "Stop decision"]) {
      expect(html).toContain(m);
    }
  });

  test("shows a backend status region", () => {
    expect(html).toContain('role="status"');
  });
});

describe("run form", () => {
  const html = page(<RunForm />);

  test("every field has a visible label", () => {
    for (const id of ["question", "geography", "horizon", "constraints"]) {
      expect(html).toContain(`for="${id}"`);
    }
  });

  test("explains both modes, including that replay only knows recorded questions", () => {
    expect(html).toContain("Only questions recorded earlier");
    expect(html).toContain("several minutes");
  });

  test("shows no validation error before the first submit", () => {
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("aria-invalid");
  });
});

describe("run progress (live view)", () => {
  const budget = { max_searches: 10, max_fetches: 20, max_llm_calls: 30, max_cost_usd: 1, max_wall_seconds_soft: 600 };
  const usage = { searches: 9, fetches: 2, llm_calls: 30, cost_usd: 0.1, elapsed_seconds: 30 };
  const html = renderToStaticMarkup(
    <RunProgress
      current="VERIFY"
      now="Verifying claims"
      live
      usage={usage as never}
      budget={budget as never}
      onOpenMeter={() => {}}
    />,
  );

  test("leads with what the run is doing now", () => {
    expect(html).toContain("Now");
    expect(html).toContain("Verifying claims");
  });

  test("marks exactly one phase current, and earlier ones done, in words", () => {
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain("(done)");
    expect(html).toContain("(current)");
    expect(html).toContain("(not started)");
  });

  test("budget warnings carry an icon and a word, not colour alone", () => {
    expect(html).toContain("80%+");
    expect(html).toContain("LIMIT");
  });
});

describe("phaseStatus", () => {
  test("splits phases around the current one", () => {
    expect([0, 1, 2].map((i) => phaseStatus(i, 1, false))).toEqual(["done", "active", "pending"]);
    expect(phaseStatus(2, 1, true)).toBe("done");
  });
});

describe("follow-up query status", () => {
  test("known statuses have an icon and a word", () => {
    expect(taskStatusView("done")).toMatchObject({ icon: "Check", word: "Done" });
    expect(taskStatusView("blocked")).toMatchObject({ icon: "XOctagon", word: "Blocked" });
    expect(taskStatusView(undefined).word).toBe("Pending");
  });

  test("an unknown status is shown as given, not hidden", () => {
    expect(taskStatusView("waiting").word).toBe("waiting");
  });
});

describe("report", () => {
  const md = "# Title\n\n## Summary\n\nA finding [C1] here.\n\n### Detail\n\n- point one\n";
  const nodes = parseReport(md);
  const html = renderToStaticMarkup(<ReportBody nodes={nodes} resolvable={new Set(["C1"])} onCite={() => {}} />);

  test("reads in a Newsreader column of about 70 characters", () => {
    expect(html).toContain("font-display");
    expect(html).toContain("max-w-[70ch]");
  });

  test("headings carry ids and a resolved citation is a button", () => {
    expect(html).toMatch(/<h3 id="heading-\d+"/);
    expect(html).toContain('aria-label="Open evidence for claim C1"');
  });

  test("contents lists only h2 and h3 and points at real heading ids", () => {
    const entries = contentsEntries(nodes);
    expect(entries.map((e) => e.level)).toEqual([2, 3]);
    const nav = renderToStaticMarkup(<ReportContents headings={entries} />);
    for (const e of entries) expect(nav).toContain(`href="#heading-${e.index}"`);
    expect(nav).toContain('href="#sources-cited"');
  });
});

describe("sources table", () => {
  const src = (id: string, domain: string, tier: number, published_at?: string) =>
    ({ id, url: `https://${domain}/`, domain, authority_tier: tier, published_at, status: "fetched" }) as never;
  const list = [src("S2", "b.com", 2, "2025-01-01"), src("S10", "a.com", 1, "2026-01-01"), src("S1", "c.com", 2)];
  const counts = { S1: 5, S2: 1, S10: 3 };
  const ids = (k: Parameters<typeof sortSources>[1], d: "asc" | "desc") =>
    sortSources(list, k, d, counts).map((s) => (s as { id: string }).id);

  test("ids sort naturally, not as text", () => {
    expect(ids("id", "asc")).toEqual(["S1", "S2", "S10"]);
    expect(ids("id", "desc")).toEqual(["S10", "S2", "S1"]);
  });

  test("numbers sort as numbers and equal rows keep their order", () => {
    expect(ids("passages", "desc")).toEqual(["S1", "S10", "S2"]);
    expect(ids("tier", "asc")).toEqual(["S10", "S2", "S1"]);
  });

  test("freshness puts the newest first and undated sources last", () => {
    expect(ids("freshness", "asc")).toEqual(["S10", "S2", "S1"]);
  });

  test("the table has a sticky header, labelled sortable columns and unsorted state", () => {
    const html = renderToStaticMarkup(<SourcesTable sources={list as never} passageCounts={counts} now={new Date("2026-06-01")} />);
    expect(html).toContain("sticky");
    expect(html).toContain('aria-sort="none"');
    expect(html).toContain("Column headings sort the table");
  });
});
