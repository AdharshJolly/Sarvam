import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ActivityTimeline } from "../components/ActivityDock";
import { ChallengeList } from "../components/ChallengeList";
import { PhaseStepper } from "../components/PhaseStepper";
import { PlanTree } from "../components/PlanTree";
import { RunForm } from "../components/RunForm";
import { GapList } from "../components/StopCard";
import { clearDraft, saveDraft } from "../lib/digDeeper";
import { SessionProvider } from "../state/useRunSession";

const store = new Map<string, string>();
(globalThis as { sessionStorage?: unknown }).sessionStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
afterEach(() => store.clear());

const gap = { slotId: "S1", name: "Competitor pricing", reason: "only one independent source, so it is partly supported", nextStep: "Find a second source." };

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

describe("dig deeper", () => {
  test("a gap offers the button only when a handler is given", () => {
    expect(renderToStaticMarkup(<GapList gaps={[gap]} onOpenSlot={() => {}} />)).not.toContain("Dig deeper");
    const withIt = renderToStaticMarkup(<GapList gaps={[gap]} onOpenSlot={() => {}} onDigDeeper={() => {}} />);
    expect(withIt).toContain("Dig deeper on this");
    expect(withIt).toContain("Nothing runs until you press Start");
  });

  test("the run form opens prefilled and says nothing has started", () => {
    saveDraft({ question: "What more about pricing?", scope: { geography: "Bengaluru" }, fromRunId: "Rabc" });
    const html = page(<RunForm />);
    expect(html).toContain("What more about pricing?");
    expect(html).toContain("Bengaluru");
    expect(html).toContain("Prefilled from a gap in run");
    expect(html).toContain("credits");
    clearDraft();
    expect(page(<RunForm />)).not.toContain("Prefilled from a gap");
  });
});

describe("plain wording sweep", () => {
  test("the phase stepper reads in plain English", () => {
    const html = renderToStaticMarkup(<PhaseStepper current="VERIFY" />);
    expect(html).toContain("Checking quotes");
    expect(html).not.toMatch(/>CLAIMS<|STOP POLICY/);
  });

  test("the activity timeline filters and labels avoid internal nouns", () => {
    const html = renderToStaticMarkup(
      <ActivityTimeline
        timeline={[{ id: 1, ts: "2026-10-01T00:00:00Z", type: "claim.verified", kind: "claim", text: "t", round: 0, tokens: null, costUsd: null, stepMs: null } as never]}
        startedAt={undefined}
        filter="all"
        onFilter={() => {}}
        onOpenClaim={() => {}}
        onOpenSource={() => {}}
      />,
    );
    expect(html).toContain("Statement checked");
    expect(html).toContain("Statements");
    expect(html).not.toContain("CLAIM VERIFIED");
  });

  test("the plan tree and challenge list use plain headings", () => {
    const plan = renderToStaticMarkup(
      <PlanTree
        dimensions={[{ id: "D1", name: "Pricing", critical: true } as never]}
        slots={[{ id: "S1", dimension_id: "D1", name: "Price", description: "d", critical: true, primary_ok: true, min_independent: 2, attributes: [] } as never]}
        tasks={[]}
      />,
    );
    expect(plan).toContain("needs 2 independent sources");
    expect(plan).toContain("one official source is enough");
    expect(plan).not.toContain("primary_ok");
    const ch = renderToStaticMarkup(
      <ChallengeList
        challenges={[{ id: "CH1", round: 1, attack: "a", outcome: "weakened", followup_task_ids: ["T1"] } as never]}
        tasks={[{ id: "T1", query_text: "q", status: "done" } as never]}
        slotNames={new Map()}
        onOpenClaim={() => {}}
      />,
    );
    expect(ch).toContain("What was tested");
    expect(ch).toContain("Follow-up searches");
    expect(ch).not.toContain(">Attack<");
  });
});
