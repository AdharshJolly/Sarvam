import { useMemo, useState } from "react";
import { useEvidence } from "../../state/EvidenceContext";
import { slotNameMap, dimensionsOf, slotsOf } from "../../state/selectors";
import { useSession } from "../../state/useRunSession";
import { EvidencePanel } from "./EvidencePanel";

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
    <div className="flex flex-col gap-3">
      {slotFilter ? (
        <p className="text-base">
          Showing claims for <strong>{names.get(slotFilter) ?? slotFilter}</strong>.{" "}
          <button type="button" className="underline" onClick={() => onSlotFilter(null)}>
            Show all slots
          </button>
        </p>
      ) : null}
      <EvidencePanel
        plan={{ dimensions: dimensionsOf(view), slots: slotsOf(view), tasks: Object.values(view.tasks) }}
        sources={{ sources, passageCounts: view.passageCounts, now }}
        claims={{
          claims,
          verdicts: view.verdicts,
          slotNames: names,
          rejected: view.rejectedClaims,
          onOpenClaim: (id) => ev.open([id]),
        }}
      />
    </div>
  );
}
