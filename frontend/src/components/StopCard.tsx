import type { Challenge, FinalState, StopDecision, TerminationReason } from "@contracts/types";
import { StateChip } from "./ui/StateChip";
import { finalStateChip, toneBg, toneVar } from "./ui/chips";

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

const stateTone = { SUFFICIENT: "ok", SUFFICIENT_WITH_CAVEATS: "warn", INSUFFICIENT: "bad" } as const;

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
  onViewReport,
}: {
  stop: StopDecision;
  gaps: StopGap[];
  challenges: Challenge[];
  onOpenSlot: (slotId: string) => void;
  onOpenConflicts: () => void;
  onViewReport?: () => void;
}) {
  const crit = stop.critical_slots ?? {};
  const openConflicts = stop.open_conflicts ?? 0;
  const rounds = stop.challenge_rounds_completed ?? 0;
  const challengeSkipped = NO_CHALLENGE.includes(stop.termination_reason) && rounds === 0;
  const wouldChange = challenges.filter((c) => c.would_change_if);
  const weakened = challenges.filter((c) => c.outcome === "weakened").length;
  const tone = stateTone[stop.state];
  return (
    <section
      aria-live="polite"
      aria-label="Stop decision"
      className="card anim-in overflow-hidden"
      style={{ borderColor: toneVar[tone], borderWidth: 2 }}
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ background: toneBg[tone] }}>
        <div>
          <p className="label">Research complete</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <StateChip spec={finalStateChip(stop.state)} large />
          </div>
        </div>
        <p className="min-w-[14rem] flex-1 text-base">{meaning[stop.state]}</p>
        {onViewReport ? (
          <button type="button" className="btn btn-primary" onClick={onViewReport}>
            View report {"→"}
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-2">
        <div>
          <h4 className="label mb-1">Why we stopped</h4>
          <p>{terminationText[stop.termination_reason]}</p>

          {challengeSkipped ? (
            <p role="alert" className="mt-3 rounded-md border p-2 font-semibold" style={{ borderColor: "var(--warn)", color: "var(--warn)", background: "var(--warn-bg)" }}>
              {"▲"} The challenge round was not completed
            </p>
          ) : (
            <>
              <h4 className="label mb-1 mt-3">Challenge</h4>
              <p>
                {rounds} round{rounds === 1 ? "" : "s"} completed.{" "}
                {weakened === 0 ? "No weakened conclusions." : `${weakened} conclusion${weakened === 1 ? "" : "s"} weakened.`}
              </p>
            </>
          )}

          <h4 className="label mb-1 mt-3">Critical slots</h4>
          <p className="mono">
            <span style={{ color: "var(--ok)" }}>{"✓"} {crit.green ?? 0} green</span>
            {"  "}
            <span style={{ color: "var(--warn)" }}>{"▲"} {crit.amber ?? 0} amber</span>
            {"  "}
            <span style={{ color: "var(--bad)" }}>{"✕"} {crit.red ?? 0} red</span>
          </p>
          <p className="mt-1">
            <button type="button" className="underline" onClick={onOpenConflicts}>
              {openConflicts} open {openConflicts === 1 ? "conflict" : "conflicts"}
            </button>
          </p>
        </div>

        <div>
          {gaps.length > 0 ? (
            <>
              <h4 className="label mb-1">Remaining gaps</h4>
              <ul className="mb-3 text-base">
                {gaps.map((g) => (
                  <li key={g.slotId} className="mb-1">
                    <button type="button" className="font-semibold underline" onClick={() => onOpenSlot(g.slotId)}>
                      {g.name}
                    </button>
                    : {g.reason}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {(stop.caveats ?? []).length > 0 ? (
            <>
              <h4 className="label mb-1">Caveats</h4>
              <ul className="mb-3 list-disc pl-5 text-base">
                {(stop.caveats ?? []).map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          ) : null}
          {wouldChange.length > 0 ? (
            <>
              <h4 className="label mb-1">What could change this conclusion</h4>
              <ul className="list-disc pl-5 text-base">
                {wouldChange.map((c) => (
                  <li key={c.id}>{c.would_change_if}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
