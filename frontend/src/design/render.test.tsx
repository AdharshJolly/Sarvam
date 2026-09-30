import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
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
