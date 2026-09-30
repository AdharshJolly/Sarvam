import type { ReactNode } from "react";
import { TAB_IDS, type TabId } from "../../lib/route";
import { Tabs } from "../ui/Tabs";

export type { TabId };

const LABELS: Record<TabId, string> = {
  matrix: "Matrix",
  evidence: "Evidence",
  conflicts: "Conflicts",
  challenge: "Challenge",
  report: "Report",
};

export const TABS: ReadonlyArray<{ id: TabId; label: string }> = TAB_IDS.map((id) => ({
  id,
  label: LABELS[id],
}));

/** The five research views (SSOT section 12). Panels are supplied by the caller. */
export function CenterTabs({
  active,
  onChange,
  counts,
  renderPanel,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
  counts: Partial<Record<TabId, string>>;
  renderPanel: (id: TabId) => ReactNode;
}) {
  return (
    <Tabs
      label="Research views"
      items={TABS.map((t) => ({ ...t, count: counts[t.id] }))}
      active={active}
      onChange={onChange}
      renderPanel={renderPanel}
      listClassName="max-md:hidden"
    />
  );
}
