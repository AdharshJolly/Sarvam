import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CoverageMatrix, MatrixTable } from "../components/CoverageMatrix";
import { StopCard } from "../components/StopCard";
import { ReportBody } from "../components/report/ReportBody";
import { StateChip } from "../components/ui/StateChip";
import {
  certaintyChip,
  conflictStatusChip,
  coverageChip,
  failureChip,
  finalStateChip,
  outcomeChip,
  sourceStatusChip,
  verdictChip,
} from "../components/ui/chips";
import { getReadingMode, showsCoverageGrid } from "../lib/readingMode";
import { parseReport } from "../lib/reportMarkdown";
import { buildScenario, type ScenarioId } from "../mocks/scenarios";
import { cellsForRound, dimensionsOf, latestRound, rollupsForRound, slotStats, slotsOf, worstCriticalSlots } from "../state/selectors";
import { reduceAll } from "../state/runStore";

const html = renderToStaticMarkup;
const noop = () => {};

/** Stored enum values that must never reach a Simple-mode reader (contracts/glossary.py maps them). */
const RAW_ENUM = /\b(?:RED|AMBER|GREEN|SUFFICIENT|SUFFICIENT_WITH_CAVEATS|INSUFFICIENT)\b|\b[A-Z]{2,}(?:_[A-Z]+)+\b/;

// The failure scenario ends without a stop decision, so there is no stop card to check.
const SCENARIO_IDS: ScenarioId[] = ["complete", "insufficient", "budget-wrapup"];

describe("Simple mode shows no raw enum values", () => {
  test("the default reading mode is simple", () => {
    expect(getReadingMode()).toBe("simple");
  });

  test("the test's own pattern catches a leak", () => {
    expect(RAW_ENUM.test("Status: RED")).toBe(true);
    expect(RAW_ENUM.test("SUFFICIENT_WITH_CAVEATS")).toBe(true);
    expect(RAW_ENUM.test("Not enough evidence")).toBe(false);
  });

  test("every chip a reader can see", () => {
    const specs = [
      ...(["RED", "AMBER", "GREEN"] as const).map(coverageChip),
      ...(["SUFFICIENT", "SUFFICIENT_WITH_CAVEATS", "INSUFFICIENT"] as const).map(finalStateChip),
      ...(["supports", "partial", "contradicts", "irrelevant"] as const).map(verdictChip),
      ...(["supported", "contested", "single-origin", "assumed"] as const).map(certaintyChip),
      ...["RATE_LIMITED", "SOURCE_UNAVAILABLE", "SOURCE_EMPTY", "STEP_FAILED", "CLAIM_REJECTED", "BLOCKED"].map(failureChip),
      ...(["found", "fetched", "SOURCE_UNAVAILABLE", "SOURCE_EMPTY"] as const).map(sourceStatusChip),
      ...(["strengthened", "weakened", "unresolved", null] as const).map(outcomeChip),
      ...(["open", "explained"] as const).map(conflictStatusChip),
    ];
    for (const spec of specs) {
      const out = html(<StateChip spec={spec} />);
      expect(out).not.toMatch(RAW_ENUM);
    }
  });

  for (const id of SCENARIO_IDS) {
    test(`${id} scenario: stop card, coverage views and report`, () => {
      const scenario = buildScenario(id);
      const view = reduceAll(scenario.events);
      expect(view.stop).not.toBeNull();
      const gaps = worstCriticalSlots(view);
      const out = [
        html(
          <StopCard
            runId="R1"
            stop={view.stop!}
            gaps={gaps}
            challenges={Object.values(view.challenges)}
            onOpenSlot={noop}
            onOpenConflicts={noop}
            onViewReport={noop}
          />,
        ),
      ];
      const round = latestRound(view);
      if (round !== null) {
        const props = {
          dimensions: dimensionsOf(view),
          slots: slotsOf(view),
          cells: cellsForRound(view, round),
          rollups: rollupsForRound(view, round),
          stats: slotStats(view),
          selected: null,
          onSelect: noop,
        };
        out.push(html(<CoverageMatrix {...props} />), html(<MatrixTable {...props} />));
      }
      if (scenario.report) {
        const nodes = parseReport(scenario.report.markdown);
        out.push(html(<ReportBody nodes={nodes} resolvable={new Set()} onCite={noop} />));
      }
      for (const chunk of out) expect(chunk).not.toMatch(RAW_ENUM);
    });
  }
});

describe("Simple mode keeps the coverage grid behind Show details", () => {
  test("simple hides the grid until expanded; detailed always shows it", () => {
    expect(showsCoverageGrid("simple", false)).toBe(false);
    expect(showsCoverageGrid("simple", true)).toBe(true);
    expect(showsCoverageGrid("detailed", false)).toBe(true);
    expect(showsCoverageGrid("detailed", true)).toBe(true);
  });
});

describe("every non-green gap shows a next step", () => {
  for (const id of SCENARIO_IDS) {
    test(`${id}: each gap on the stop card carries a reason sentence and a next step`, () => {
      const view = reduceAll(buildScenario(id).events);
      const gaps = worstCriticalSlots(view);
      const out = html(
        <StopCard
          runId="R1"
          stop={view.stop!}
          gaps={gaps}
          challenges={[]}
          onOpenSlot={noop}
          onOpenConflicts={noop}
        />,
      );
      for (const g of gaps) {
        expect(g.nextStep.trim().length).toBeGreaterThan(0);
        expect(g.reason).toContain(", so ");
        expect(out).toContain(g.name);
      }
      expect((out.match(/Next step:/g) ?? []).length).toBe(gaps.length);
    });
  }
});
