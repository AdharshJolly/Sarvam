import type { Challenge, FinalState, StopDecision, TerminationReason } from "@contracts/types";
import { StateChip } from "./ui/StateChip";
import { finalStateChip } from "./ui/chips";

export const terminationText: Record<TerminationReason, string> = {
  criteria_met: "All critical slots are green and a challenge round completed.",
  no_marginal_gain: "Another round was not adding new evidence.",
  max_rounds: "The follow-up round limit was reached.",
  budget: "A budget limit was reached and the run wrapped up with the evidence in hand.",
  timeout: "The time limit was reached and the run wrapped up with the evidence in hand.",
  user_stopped: "The run was stopped by the user.",
  blocked: "The run was blocked by a failure and wrapped up with the evidence in hand.",
};

const meaning: Record<FinalState, string> = {
  SUFFICIENT: "The evidence gathered is enough to answer the question.",
  SUFFICIENT_WITH_CAVEATS: "The evidence is enough to answer, with the caveats listed below.",
  INSUFFICIENT: "The evidence is not enough to answer with confidence. This is a valid outcome, not an error.",
};

export interface StopGap {
  slotId: string;
  name: string;
  reason: string;
}

const NO_CHALLENGE: TerminationReason[] = ["budget", "timeout", "user_stopped", "blocked"];

export function StopCard({
  stop,
  gaps,
  challenges,
  onOpenSlot,
  onOpenConflicts,
}: {
  stop: StopDecision;
  gaps: StopGap[];
  challenges: Challenge[];
  onOpenSlot: (slotId: string) => void;
  onOpenConflicts: () => void;
}) {
  const crit = stop.critical_slots ?? {};
  const openConflicts = stop.open_conflicts ?? 0;
  const challengeSkipped =
    NO_CHALLENGE.includes(stop.termination_reason) && (stop.challenge_rounds_completed ?? 0) === 0;
  const wouldChange = challenges.filter((c) => c.would_change_if);
  return (
    <section
      aria-live="polite"
      aria-label="Stop decision"
      className="rounded border-2 p-4"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <StateChip spec={finalStateChip(stop.state)} large />
        <p className="text-base">{meaning[stop.state]}</p>
      </div>
      <p className="mt-2">
        <strong>Why it stopped: </strong>
        {terminationText[stop.termination_reason]}
      </p>
      {challengeSkipped ? (
        <p role="alert" className="mt-2 rounded border p-2 font-semibold" style={{ borderColor: "var(--warn)", color: "var(--warn)" }}>
          {"▲"} The challenge round was not completed
        </p>
      ) : null}
      <p className="mt-2 text-base">
        Critical slots: {crit.green ?? 0} green, {crit.amber ?? 0} amber, {crit.red ?? 0} red.{" "}
        <button type="button" className="underline" onClick={onOpenConflicts}>
          {openConflicts} open {openConflicts === 1 ? "conflict" : "conflicts"}
        </button>
      </p>
      {gaps.length > 0 ? (
        <div className="mt-2">
          <h4 className="font-semibold">Remaining gaps</h4>
          <ul className="text-base">
            {gaps.map((g) => (
              <li key={g.slotId}>
                <button type="button" className="underline" onClick={() => onOpenSlot(g.slotId)}>
                  {g.name}
                </button>
                : {g.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {(stop.caveats ?? []).length > 0 ? (
        <div className="mt-2">
          <h4 className="font-semibold">Caveats</h4>
          <ul className="list-disc pl-5 text-base">
            {(stop.caveats ?? []).map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {wouldChange.length > 0 ? (
        <div className="mt-2">
          <h4 className="font-semibold">What could change this conclusion</h4>
          <ul className="list-disc pl-5 text-base">
            {wouldChange.map((c) => (
              <li key={c.id}>{c.would_change_if}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
