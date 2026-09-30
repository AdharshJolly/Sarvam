import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CoverageMatrix, MatrixTable } from "../components/CoverageMatrix";
import { OriginGroupView } from "../components/OriginGroupView";
import { StopCard } from "../components/StopCard";
import { ModeBadge } from "../components/ModeBadge";
import { AppHeader } from "../components/layout/AppHeader";
import { BottomTabBar } from "../components/layout/BottomTabBar";
import { Badge } from "../components/ui/Badge";
import { Banner } from "../components/ui/Banner";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ICON_NAMES, Icon } from "../components/ui/Icon";
import { StateChip } from "../components/ui/StateChip";
import { Tabs } from "../components/ui/Tabs";
import { Tooltip } from "../components/ui/Tooltip";
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

/**
 * Smoke renders. There is no DOM in the test runner, so these render components to static markup:
 * that is enough to catch a component that throws (an unregistered icon crashed the rail once) and
 * to pin the accessibility attributes the design system promises.
 */
const html = renderToStaticMarkup;
const noop = () => {};

describe("icons", () => {
  test("every registered icon renders an svg", () => {
    for (const name of ICON_NAMES) {
      expect(html(<Icon name={name} />)).toContain("<svg");
    }
  });

  test("a decorative icon is hidden from assistive tech and a labelled one is named", () => {
    expect(html(<Icon name="Info" />)).toContain('aria-hidden="true"');
    const labelled = html(<Icon name="Info" label="Information" aria-hidden={false} />);
    expect(labelled).toContain("Information");
    expect(labelled).not.toContain('aria-hidden="true"');
  });
});

describe("state chips", () => {
  test("every state the app can show renders its word and an icon", () => {
    const specs = [
      ...(["RED", "AMBER", "GREEN"] as const).map(coverageChip),
      ...(["supports", "partial", "contradicts", "irrelevant"] as const).map(verdictChip),
      ...(["supported", "contested", "single-origin", "assumed"] as const).map(certaintyChip),
      ...["RATE_LIMITED", "SOURCE_UNAVAILABLE", "SOURCE_EMPTY", "STEP_FAILED", "CLAIM_REJECTED", "BLOCKED"].map(failureChip),
      ...(["found", "fetched", "SOURCE_UNAVAILABLE", "SOURCE_EMPTY"] as const).map(sourceStatusChip),
      ...(["strengthened", "weakened", "unresolved", null] as const).map(outcomeChip),
      ...(["open", "explained"] as const).map(conflictStatusChip),
      ...(["SUFFICIENT", "SUFFICIENT_WITH_CAVEATS", "INSUFFICIENT"] as const).map(finalStateChip),
    ];
    expect(specs.length).toBeGreaterThan(25);
    for (const spec of specs) {
      const out = html(<StateChip spec={spec} />);
      expect(out).toContain(spec.label); // state is always a word, never colour alone
      expect(out).toContain("<svg"); // and an icon
    }
  });
});

describe("primitives", () => {
  test("Button renders every variant and size, defaulting to type=button", () => {
    for (const variant of ["primary", "secondary", "ghost", "danger"] as const) {
      expect(html(<Button variant={variant}>Go</Button>)).toContain('type="button"');
    }
    expect(html(<Button size="icon" aria-label="Close" />)).toContain('aria-label="Close"');
  });

  test("Card accents, frames and the button form", () => {
    expect(html(<Card accent="bad">x</Card>)).toContain("border-l-bad-fg");
    expect(html(<Card frame="ok">x</Card>)).toContain("border-ok-fg");
    expect(html(<Card frame="ok">x</Card>)).not.toContain("border-border-hairline");
    expect(html(<Card as="button">x</Card>)).toMatch(/^<button type="button"/);
    expect(html(<Card as="li">x</Card>)).toMatch(/^<li /);
  });

  test("Tooltip keeps its text in the DOM, hidden, and linked by aria-describedby", () => {
    const out = html(<Tooltip text="Why this matters">Trigger</Tooltip>);
    const id = /aria-describedby="([^"]+)"/.exec(out)?.[1];
    expect(id).toBeTruthy();
    expect(out).toContain(`id="${id}"`);
    expect(out).toContain('role="tooltip"');
    expect(out).toContain("hidden");
    expect(out).toContain("Why this matters");
  });

  test("a Badge with a title becomes a focusable tooltip trigger; without one it does not", () => {
    expect(html(<Badge title="Explanation">primary_ok</Badge>)).toContain('tabindex="0"');
    expect(html(<Badge>plain</Badge>)).not.toContain("tabindex");
  });

  test("Banner announces itself as an alert with an icon", () => {
    const out = html(<Banner tone="bad">Failed</Banner>);
    expect(out).toContain('role="alert"');
    expect(out).toContain("<svg");
  });
});

describe("tabs", () => {
  const items = [
    { id: "a", label: "Alpha" },
    { id: "b", label: "Beta", count: "3" },
  ] as const;

  test("renders a tablist, marks the active tab and mounts only its panel", () => {
    const out = html(<Tabs label="Views" items={items} active="b" onChange={noop} renderPanel={(id) => <p>panel {id}</p>} />);
    expect(out).toContain('role="tablist"');
    expect(out).toMatch(/id="tab-b"[^>]*aria-selected="true"|aria-selected="true"[^>]*id="tab-b"/);
    expect(out).toContain("panel b");
    expect(out).not.toContain("panel a");
    expect(out).toContain("(3)");
  });

  test("roving tabindex: only the active tab is a tab stop", () => {
    const out = html(<Tabs label="Views" items={items} active="a" onChange={noop} renderPanel={() => null} />);
    expect(out.match(/tabindex="0"/g)?.length).toBe(1);
    expect(out.match(/tabindex="-1"/g)?.length).toBe(1);
  });
});

describe("shell pieces", () => {
  test("BottomTabBar marks the current view and flags open conflicts", () => {
    const out = html(<BottomTabBar active="conflicts" onChange={noop} counts={{ conflicts: "2 open", evidence: "5" }} />);
    expect(out).toContain('aria-current="page"');
    expect(out.match(/aria-current="page"/g)?.length).toBe(1);
    for (const label of ["Matrix", "Evidence", "Conflicts", "Challenge", "Report"]) expect(out).toContain(label);
    expect(out).toContain("bg-bad-bg"); // open conflicts use the alert tone
  });

  test("ModeBadge keeps its full accessible label when icon-only", () => {
    const out = html(<ModeBadge mode="REPLAY" iconOnly />);
    expect(out).toContain("Run mode: REPLAY (recorded)");
    expect(out).not.toContain(">REPLAY (recorded)<");
  });

  test("AppHeader: the question is the single page heading on a run", () => {
    const out = html(
      <AppHeader
        runId="R1"
        question="Should we launch X?"
        mode="LIVE"
        running
        showMode
        metrics={[{ label: "Cost", value: "$0.01", onClick: noop }]}
        onNewRun={noop}
        onOpenStatus={noop}
        onOpenActivity={noop}
      />,
    );
    expect(out.match(/<h1/g)?.length).toBe(1);
    expect(out).toContain("Should we launch X?");
    expect(out).toContain("Run mode: LIVE");
    expect(out).toContain("Open research status");
    expect(out).toContain("Open activity timeline");
    expect(out).toContain("Cost");
  });

  test("AppHeader on the landing screen has no page heading, metrics or run buttons", () => {
    const out = html(
      <AppHeader
        runId={null}
        question={undefined}
        mode={null}
        running={false}
        showMode={false}
        metrics={[]}
        onNewRun={noop}
        onOpenStatus={noop}
        onOpenActivity={noop}
      />,
    );
    expect(out).not.toContain("<h1"); // the landing hero owns the h1
    expect(out).not.toContain("New run");
    expect(out).toContain("SARVAM");
  });
});


describe("coverage matrix", () => {
  const dim = (id: string, name: string) => ({ id, run_id: "R1", name, description: "", critical: true });
  const slot = (id: string, dimension_id: string, name: string) => ({
    id,
    run_id: "R1",
    dimension_id,
    name,
    description: "d",
    critical: true,
    attributes: [],
    min_independent: 2,
    primary_ok: false,
  });
  const cell = (slot_id: string, state: "RED" | "AMBER" | "GREEN", open_conflicts = 0) => ({
    id: `V-${slot_id}`,
    run_id: "R1",
    round: 0,
    slot_id,
    state,
    independent_origins: 1,
    supporting_claims: 2,
    open_conflicts,
    reason: `reason for ${slot_id}`,
  });
  const props = {
    dimensions: [dim("D1", "Demand"), dim("D2", "Competition")],
    slots: [slot("D1S1", "D1", "Demand size"), slot("D1S2", "D1", "Demand growth"), slot("D2S1", "D2", "Competitor pricing")],
    cells: [cell("D1S1", "GREEN"), cell("D1S2", "AMBER"), cell("D2S1", "RED", 2)],
    rollups: [{ dimension_id: "D1", state: "AMBER" as const, reason: "one slot is thin" }],
    stats: { D1S1: { sources: 4, origins: 1 }, D1S2: { sources: 2, origins: 2 }, D2S1: { sources: 1, origins: 1 } },
    selected: null,
    onSelect: noop,
  };

  test("is an ARIA grid: rows with row headers and one gridcell per slot", () => {
    const out = html(<CoverageMatrix {...props} />);
    expect(out).toContain('role="grid"');
    expect(out.match(/role="row"/g)?.length).toBe(2);
    expect(out.match(/role="rowheader"/g)?.length).toBe(2);
    expect(out.match(/role="gridcell"/g)?.length).toBe(3);
  });

  test("roving tabindex: exactly one cell is a tab stop, the first by default", () => {
    const out = html(<CoverageMatrix {...props} />);
    expect(out.match(/tabindex="0"/g)?.length).toBe(1);
    expect(out.match(/tabindex="-1"/g)?.length).toBe(2);
    expect(out.indexOf('tabindex="0"')).toBeLessThan(out.indexOf('tabindex="-1"'));
  });

  test("the selected cell is the tab stop", () => {
    const out = html(<CoverageMatrix {...props} selected="D2S1" />);
    expect(out.match(/tabindex="0"/g)?.length).toBe(1);
    expect(out).toMatch(/tabindex="0"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*tabindex="0"/);
  });

  test("every cell states its state in words, counts and conflicts (never colour alone)", () => {
    const out = html(<CoverageMatrix {...props} />);
    expect(out).toContain("Demand size: GREEN. 4 sources, 1 independent origin.");
    expect(out).toContain("Competitor pricing: RED. 1 source, 1 independent origin, 2 open conflicts.");
    for (const word of ["GREEN", "AMBER", "RED"]) expect(out).toContain(word);
    expect(out).toContain("<svg");
  });

  test("a slot with no analysis yet says so", () => {
    const out = html(<CoverageMatrix {...props} cells={[]} />);
    expect(out).toContain("NO DATA");
    expect(out).toContain("Awaiting coverage analysis.");
  });

  test("the table version has column headers, a caption and one row per slot", () => {
    const out = html(<MatrixTable {...props} />);
    expect(out).toContain("<caption");
    for (const h of ["Dimension", "Slot", "State", "Sources", "Origins", "Conflicts", "Reason"]) expect(out).toContain(h);
    expect(out.match(/<th scope="col"/g)?.length).toBe(7);
    expect(out.match(/<tr/g)?.length).toBe(1 + 3); // header row plus a row per slot
    expect(out).toContain("reason for D2S1");
  });
});


describe("origin groups (the independence collapse)", () => {
  const source = (id: string, domain: string) => ({
    id,
    run_id: "R1",
    url: `https://${domain}/page`,
    canonical_url: `${domain}/page`,
    domain,
    publisher: domain,
    source_type: "news" as const,
    authority_tier: 2,
    status: "fetched" as const,
  });
  const origin = (id: string, method: "domain" | "near_duplicate" | "none") => ({
    id,
    run_id: "R1",
    label: `Origin ${id}`,
    method,
    member_source_ids: [],
  });
  const groups = [
    { key: "o1", origin: origin("O1", "near_duplicate"), sources: [source("S1", "a.example"), source("S2", "b.example"), source("S3", "c.example")] },
    { key: "src:S4", origin: null, sources: [source("S4", "d.example")] },
  ];

  test("states the collapse in numbers and in words for assistive tech", () => {
    const out = html(<OriginGroupView slotName="Pricing" groups={groups} />);
    expect(out).toContain("4 sources, 2 independent origins");
    expect(out).toContain("2 pages add no independent confirmation: copies count once.");
  });

  test("a multi-page origin shows its brace and page count; the others do not", () => {
    const out = html(<OriginGroupView slotName="Pricing" groups={groups} />);
    expect(out.match(/border-r-4/g)?.length).toBe(1);
    expect(out).toContain("3 pages, 1 origin");
    expect(out).toContain("near-identical text");
  });

  test("an origin whose independence is unknown carries the question-mark badge and a reason", () => {
    const out = html(<OriginGroupView slotName="Pricing" groups={groups} />);
    expect(out).toContain("? independence not established");
    expect(out).toContain("its independence could not be established");
  });

  test("each source is listed with its id, domain and tier, in a labelled list per origin", () => {
    const out = html(<OriginGroupView slotName="Pricing" groups={groups} />);
    for (const id of ["S1", "S2", "S3", "S4"]) expect(out).toContain(`>${id}<`);
    expect(out).toContain("Tier 2");
    expect(out).toContain("Source pages in origin A");
    expect(out).toContain("Source pages in origin B");
  });
});


describe("stop card (the verdict)", () => {
  const stop = (over: Record<string, unknown> = {}) => ({
    state: "SUFFICIENT_WITH_CAVEATS" as const,
    termination_reason: "criteria_met" as const,
    critical_slots: { green: 4, amber: 1, red: 0 },
    open_conflicts: 1,
    challenge_rounds_completed: 2,
    caveats: ["Regulation slot rests on a single origin"],
    ...over,
  });
  const render = (decision: ReturnType<typeof stop>, extra: Record<string, unknown> = {}) =>
    html(
      <StopCard
        stop={decision}
        gaps={[]}
        challenges={[]}
        onOpenSlot={noop}
        onOpenConflicts={noop}
        onViewReport={noop}
        {...extra}
      />,
    );

  test("the final state is a headline in words, with an icon, announced politely", () => {
    const heads = {
      SUFFICIENT: "Sufficient",
      SUFFICIENT_WITH_CAVEATS: "Sufficient, with caveats",
      INSUFFICIENT: "Insufficient",
    } as const;
    for (const [state, text] of Object.entries(heads)) {
      const out = render(stop({ state }));
      expect(out).toContain(`>${text}</h2>`);
      expect(out).toContain("<svg");
      expect(out).toContain('aria-live="polite"');
      expect(out).toContain('aria-label="Stop decision"');
    }
  });

  test("a run cut short is labelled stopped, not complete", () => {
    expect(render(stop())).toContain("Research complete");
    for (const reason of ["budget", "timeout", "user_stopped", "blocked"] as const) {
      const out = render(stop({ termination_reason: reason, challenge_rounds_completed: 0 }));
      expect(out).toContain("Research stopped");
      expect(out).not.toContain("Research complete");
      expect(out).toContain("The challenge round was not completed");
    }
  });

  test("critical slots show count, icon and word for each colour", () => {
    const out = render(stop({ critical_slots: { green: 4, amber: 1, red: 2 } }));
    for (const word of ["green", "amber", "red"]) expect(out).toContain(word);
    expect(out).toContain(">4<");
    expect(out).toContain(">2<");
  });

  test("gaps, caveats and what could change the conclusion are listed and linked", () => {
    const out = render(stop(), {
      gaps: [{ slotId: "D2S1", name: "Competitor pricing", reason: "one origin only" }],
      challenges: [{ id: "H1", would_change_if: "Consumer share is below 10 percent", outcome: "weakened" }],
    });
    expect(out).toContain("Competitor pricing");
    expect(out).toContain("one origin only");
    expect(out).toContain("Regulation slot rests on a single origin");
    expect(out).toContain("Consumer share is below 10 percent");
    expect(out).toContain("1 conclusion weakened");
  });

  test("says so plainly when nothing is missing", () => {
    expect(render(stop({ caveats: [], state: "SUFFICIENT" }))).toContain("No critical gaps or caveats.");
  });

  test("open conflicts are a control that opens the conflicts view", () => {
    const out = render(stop({ open_conflicts: 3 }));
    expect(out).toContain("3 open conflicts");
    expect(render(stop({ open_conflicts: 1 }))).toContain("1 open conflict<");
  });
});
