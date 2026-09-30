import { useEvidence } from "../../state/EvidenceContext";
import { slotNameMap } from "../../state/selectors";
import { useSession } from "../../state/useRunSession";
import { ConflictList } from "../ConflictList";

export function ConflictsPanel() {
  const { view } = useSession();
  const ev = useEvidence();
  return (
    <ConflictList
      conflicts={Object.values(view.conflicts)}
      claims={new Map(Object.entries(view.claims))}
      slotNames={slotNameMap(view)}
      onCompare={ev.open}
    />
  );
}
