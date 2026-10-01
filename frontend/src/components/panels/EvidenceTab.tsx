import { useMemo, useState } from "react";
import { useEvidence } from "../../state/EvidenceContext";
import { slotNameMap, dimensionsOf, slotsOf } from "../../state/selectors";
import { useSession } from "../../state/useRunSession";
import { Panel } from "../ui/Panel";
import { PlanTree } from "../PlanTree";
import { SourcesTable } from "../SourcesTable";
import { ClaimList } from "../ClaimList";

export function EvidenceTab({
  slotFilter,
  onSlotFilter,
}: {
  slotFilter: string | null;
  onSlotFilter: (s: string | null) => void;
}) {
  const { view } = useSession();
  const ev = useEvidence();
  const [now] = useState(() => new Date());
  const names = useMemo(() => slotNameMap(view), [view.plan]);
  const claims = Object.values(view.claims).filter((c) => !slotFilter || c.slot_id === slotFilter);
  const sources = Object.values(view.sources);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="flex flex-col gap-6">
      {slotFilter ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[1.3rem] border border-brand/20 bg-surface-2 p-3 text-base">
          <p>
            Showing {claims.length} of {Object.keys(view.claims).length} claims for <strong>{names.get(slotFilter) ?? slotFilter}</strong>.
          </p>
          <button type="button" className="font-semibold underline hover:text-brand" onClick={() => onSlotFilter(null)}>
            Clear filter
          </button>
        </div>
      ) : null}
      
      <div className="flex flex-col md:flex-row gap-8 items-start relative">
        {/* Left Sidebar: Table of Contents */}
        <nav className="hidden md:block w-48 shrink-0 sticky top-32">
          <ul className="flex flex-col space-y-2 border-l-2 border-border-hairline pl-4">
            <li>
              <button onClick={() => scrollTo('plan')} className="text-left font-medium text-text-muted hover:text-brand transition-colors w-full py-1">
                Plan
              </button>
            </li>
            <li>
              <button onClick={() => scrollTo('sources')} className="flex justify-between items-center text-left font-medium text-text-muted hover:text-brand transition-colors w-full py-1">
                <span>Sources</span>
                <span className="text-sm bg-surface-2 px-2 py-0.5 rounded-full">{sources.length}</span>
              </button>
            </li>
            <li>
              <button onClick={() => scrollTo('claims')} className="flex justify-between items-center text-left font-medium text-text-muted hover:text-brand transition-colors w-full py-1">
                <span>Claims</span>
                <span className="text-sm bg-surface-2 px-2 py-0.5 rounded-full">{claims.length}</span>
              </button>
            </li>
          </ul>
        </nav>
        
        {/* Right Content: Stacked Sections */}
        <div className="flex-1 flex flex-col gap-8 min-w-0 w-full">
          <Panel title="Plan" id="plan">
            <PlanTree dimensions={dimensionsOf(view)} slots={slotsOf(view)} tasks={Object.values(view.tasks)} />
          </Panel>
          <Panel title="Sources" id="sources">
            <SourcesTable sources={sources} passageCounts={view.passageCounts} now={now} />
          </Panel>
          <Panel title="Claims" id="claims">
            <ClaimList 
              claims={claims} 
              verdicts={view.verdicts} 
              sources={view.sources}
              slotNames={names} 
              rejected={view.rejectedClaims} 
              onOpenClaim={(id: string) => ev.open([id])} 
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}
