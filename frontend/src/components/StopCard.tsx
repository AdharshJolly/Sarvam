import type { Challenge, FinalState, StopDecision, TerminationReason } from "@contracts/types";
import { buildHash } from "../lib/route";
import { Banner } from "./ui/Banner";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Icon } from "./ui/Icon";
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

const HEADLINE: Record<FinalState, string> = {
  SUFFICIENT: "Sufficient",
  SUFFICIENT_WITH_CAVEATS: "Sufficient, with caveats",
  INSUFFICIENT: "Insufficient",
};

const meaning: Record<FinalState, string> = {
  SUFFICIENT: "The evidence gathered is enough to answer the question.",
  SUFFICIENT_WITH_CAVEATS: "The evidence is enough to answer, with the caveats listed below.",
  INSUFFICIENT: "The evidence is not enough to answer with confidence. This is a valid outcome, not an error.",
};

const stateTone = { SUFFICIENT: "ok", SUFFICIENT_WITH_CAVEATS: "warn", INSUFFICIENT: "bad" } as const;

const BAND = {
  ok: { band: "bg-ok-bg", text: "text-ok-fg" },
  warn: { band: "bg-warn-bg", text: "text-warn-fg" },
  bad: { band: "bg-bad-bg", text: "text-bad-fg" },
};

export interface StopGap {
  slotId: string;
  name: string;
  reason: string;
}

/** Reasons where the run was cut short, so "complete" would overstate it. */
const CUT_SHORT: TerminationReason[] = ["budget", "timeout", "user_stopped", "blocked"];
const NO_CHALLENGE = CUT_SHORT;

/** A count with its icon and word, so state is never colour alone. */
function Tile({ count, word, icon, tone, href }: { count: number; word: string; icon: "Check" | "AlertTriangle" | "XOctagon"; tone: string; href?: string }) {
  const content = (
    <>
      <span className="mono text-2xl font-bold leading-none">{count}</span>
      <span className="mt-1 flex items-center gap-1 text-sm font-semibold">
        <Icon name={icon} size={14} aria-hidden /> {word}
      </span>
    </>
  );
  if (href) {
    return (
      <a href={href} className={`flex flex-1 flex-col items-center rounded-md border px-2 py-2 hover:opacity-80 transition-opacity ${tone}`}>
        {content}
      </a>
    );
  }
  return (
    <div className={`flex flex-1 flex-col items-center rounded-md border px-2 py-2 ${tone}`}>
      {content}
    </div>
  );
}

/**
 * The verdict (SSOT sections 9.10 and 12): the final state as a headline, why the run stopped, where
 * the critical slots stand, and what is still missing. The same card sits above the tabs and at the top
 * of the report. Announced once when it appears (aria-live).
 */
export function StopCard({
  runId,
  stop,
  gaps,
  challenges,
  onOpenSlot,
  onOpenConflicts,
  onViewReport,
}: {
  runId: string;
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
  const caveats = stop.caveats ?? [];
  const tone = stateTone[stop.state] ?? "ok";
  const { band, text } = BAND[tone];
  const heading = CUT_SHORT.includes(stop.termination_reason) ? "Research stopped" : "Research complete";
  const missing = gaps.length > 0 || caveats.length > 0;

  return (
    <Card as="section" aria-live="polite" aria-label="Stop decision" frame={tone} className="overflow-hidden">
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 ${band}`}>
        <Icon name={finalStateChip(stop.state).icon} size={40} className={`shrink-0 ${text}`} aria-hidden />
        <div className="min-w-[14rem] flex-1">
          <p className="label">{heading}</p>
          <h2 className={`font-display text-3xl font-bold leading-tight ${text}`}>{HEADLINE[stop.state]}</h2>
          <p className="mt-1 text-base">{meaning[stop.state]}</p>
        </div>
        {onViewReport ? (
          <Button variant="primary" size="lg" icon={<Icon name="ArrowRight" size={18} aria-hidden />} onClick={onViewReport}>
            View report
          </Button>
        ) : null}
      </div>

      <div className="grid gap-x-6 gap-y-5 p-4 md:grid-cols-2 xl:grid-cols-3">
        <section aria-labelledby="stop-why">
          <h3 id="stop-why" className="label mb-1">
            Why we stopped
          </h3>
          <p>{terminationText[stop.termination_reason]}</p>
          {challengeSkipped ? (
            <div className="mt-3">
              <Banner tone="warn">The challenge round was not completed</Banner>
            </div>
          ) : (
            <p className="mt-2 text-text-muted">
              Challenge: {rounds} round{rounds === 1 ? "" : "s"} completed.{" "}
              {weakened === 0 ? "No weakened conclusions." : `${weakened} conclusion${weakened === 1 ? "" : "s"} weakened.`}
            </p>
          )}
        </section>

        <section aria-labelledby="stop-slots">
          <h3 id="stop-slots" className="label mb-2">
            Critical slots
          </h3>
          <div className="flex gap-2">
            <Tile count={crit.green ?? 0} word="green" icon="Check" tone="border-ok-border bg-ok-bg text-ok-fg" href={buildHash(runId, "matrix")} />
            <Tile count={crit.amber ?? 0} word="amber" icon="AlertTriangle" tone="border-warn-border bg-warn-bg text-warn-fg" href={buildHash(runId, "matrix")} />
            <Tile count={crit.red ?? 0} word="red" icon="XOctagon" tone="border-bad-border bg-bad-bg text-bad-fg" href={buildHash(runId, "matrix")} />
          </div>
          <p className="mt-3">
            <button type="button" className="underline transition-colors hover:text-brand-secondary" onClick={onOpenConflicts}>
              {openConflicts} open {openConflicts === 1 ? "conflict" : "conflicts"}
            </button>
          </p>
        </section>

        <section aria-labelledby="stop-missing" className="md:col-span-2 xl:col-span-1">
          <h3 id="stop-missing" className="label mb-1">
            What is missing
          </h3>
          {missing ? (
            <>
              {gaps.length > 0 ? (
                <ul className="mb-3 text-base">
                  {gaps.map((g) => (
                    <li key={g.slotId} className="mb-1">
                      <button
                        type="button"
                        className="font-semibold underline transition-colors hover:text-brand-secondary"
                        onClick={() => onOpenSlot(g.slotId)}
                      >
                        {g.name}
                      </button>
                      : {g.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
              {caveats.length > 0 ? (
                <ul className="mb-3 list-disc pl-5 text-base text-text-muted">
                  {caveats.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="text-text-muted">No critical gaps or caveats.</p>
          )}
          {wouldChange.length > 0 ? (
            <>
              <h3 className="label mb-1 mt-3">What could change this conclusion</h3>
              <ul className="list-disc pl-5 text-base text-text-muted">
                {wouldChange.map((c) => (
                  <li key={c.id}>{c.would_change_if}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      </div>
    </Card>
  );
}
