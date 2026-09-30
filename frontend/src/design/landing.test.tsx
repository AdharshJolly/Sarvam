import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Landing } from "../components/Landing";
import { taskStatusView } from "../components/ChallengeList";
import { RunForm } from "../components/RunForm";
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
