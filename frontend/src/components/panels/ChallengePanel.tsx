import { useEvidence } from "../../state/EvidenceContext";
import { slotNameMap } from "../../state/selectors";
import { useSession } from "../../state/useRunSession";
import { ChallengeList } from "../ChallengeList";

export function ChallengePanel() {
  const { view } = useSession();
  const ev = useEvidence();
  return (
    <ChallengeList
      challenges={Object.values(view.challenges)}
      tasks={Object.values(view.tasks)}
      slotNames={slotNameMap(view)}
      onOpenClaim={(id) => ev.open([id])}
    />
  );
}
