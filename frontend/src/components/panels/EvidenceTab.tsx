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
  return (
    <div className="flex flex-col gap-4">
      {slotFilter ? (
        <p className="text-base">
          Showing claims for <strong>{names.get(slotFilter) ?? slotFilter}</strong>.{" "}
          <button type="button" className="underline" onClick={() => onSlotFilter(null)}>
            Show all slots
          </button>
        </p>
      ) : null}
      <Panel title="Plan">
        <PlanTree dimensions={dimensionsOf(view)} slots={slotsOf(view)} tasks={Object.values(view.tasks)} />
      </Panel>
      <Panel title="Sources" id="sources">
        <SourcesTable sources={sources} passageCounts={view.passageCounts} now={now} />
      </Panel>
      <Panel title="Claims" id="claims">
        <ClaimList 
          claims={claims} 
          verdicts={view.verdicts} 
          slotNames={names} 
          rejected={view.rejectedClaims} 
          onOpenClaim={(id: string) => ev.open([id])} 
        />
      </Panel>
    </div>
  );
}
