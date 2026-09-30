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

export interface StopGap {
  slotId: string;
  name: string;
  reason: string;
}

/** Reasons where the run was cut short, so "complete" would overstate it. */
const CUT_SHORT: TerminationReason[] = ["budget", "timeout", "user_stopped", "blocked"];
const NO_CHALLENGE = CUT_SHORT;

/** A count with its icon and word, so state is never colour alone. */
function Tile({
  count,
  word,
  icon,
  tone,
  href,
}: {
  count: number;
  word: string;
  icon: "Check" | "AlertTriangle" | "XOctagon";
  tone: string;
  href?: string;
}) {
  const content = (
    <>
      <span className="mono text-xl font-bold leading-none">{count}</span>
      <span className="mt-1 flex items-center gap-1 text-sm font-semibold">
        <Icon name={icon} size={14} aria-hidden />
        <span>{word}</span>
      </span>
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        className={`flex flex-1 flex-col items-center rounded-lg border px-3 py-2 transition-all hover:opacity-90 ${tone}`}
      >
        {content}
      </a>
    );
  }
  return (
    <div className={`flex flex-1 flex-col items-center rounded-lg border px-3 py-2 ${tone}`}>
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
  const heading = CUT_SHORT.includes(stop.termination_reason) ? "Research stopped" : "Research complete";
  const missing = gaps.length > 0 || caveats.length > 0;

  const statusColor =
    tone === "ok" ? "text-ok-fg" : tone === "warn" ? "text-warn-fg" : "text-bad-fg";
  const badgeBg =
    tone === "ok"
      ? "bg-ok-bg text-ok-fg border-ok-border"
      : tone === "warn"
      ? "bg-warn-bg text-warn-fg border-warn-border"
      : "bg-bad-bg text-bad-fg border-bad-border";

  return (
    <Card as="section" aria-live="polite" aria-label="Stop decision" frame={tone} className="overflow-hidden">
      {/* Refined Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-hairline bg-surface p-5 sm:p-6">
        <div className="flex items-start gap-3.5">
          <div className="mt-0.5">
            <Icon name={finalStateChip(stop.state).icon} size={28} className={statusColor} aria-hidden />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-sm font-mono font-medium border ${badgeBg}`}>
                <span className="uppercase">{heading}</span>
              </span>
            </div>
            <h2 className={`font-display text-2xl sm:text-3xl font-bold leading-tight ${statusColor}`}>
              {HEADLINE[stop.state]}
            </h2>
            <p className="mt-1 text-sm sm:text-base text-text-muted leading-relaxed max-w-2xl font-normal">
              {meaning[stop.state]}
            </p>
          </div>
        </div>

        {onViewReport ? (
          <Button
            variant="primary"
            size="md"
            icon={<Icon name="ArrowRight" size={16} aria-hidden />}
            onClick={onViewReport}
          >
            View report
          </Button>
        ) : null}
      </div>

      {/* 3 Balanced Columns */}
      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-2 xl:grid-cols-3">
        {/* Column 1: Why we stopped */}
        <section aria-labelledby="stop-why" className="space-y-2">
          <h3 id="stop-why" className="font-mono text-sm tracking-wider uppercase text-text-muted">
            Why we stopped
          </h3>
          <p className="text-sm sm:text-base text-text leading-relaxed font-normal">
            {terminationText[stop.termination_reason]}
          </p>
          {challengeSkipped ? (
            <div className="mt-2">
              <Banner tone="warn">The challenge round was not completed</Banner>
            </div>
          ) : (
            <p className="text-sm text-text-muted font-mono pt-1">
              Challenge: {rounds} round{rounds === 1 ? "" : "s"} completed.{" "}
              {weakened === 0 ? "No weakened conclusions." : `${weakened} conclusion${weakened === 1 ? "" : "s"} weakened.`}
            </p>
          )}
        </section>

        {/* Column 2: Critical slots */}
        <section aria-labelledby="stop-slots" className="space-y-2">
          <h3 id="stop-slots" className="font-mono text-sm tracking-wider uppercase text-text-muted">
            Critical slots
          </h3>
          <div className="flex gap-2">
            <Tile
              count={crit.green ?? 0}
              word="green"
              icon="Check"
              tone="border-ok-border bg-ok-bg/50 text-ok-fg"
              href={buildHash(runId, "matrix")}
            />
            <Tile
              count={crit.amber ?? 0}
              word="amber"
              icon="AlertTriangle"
              tone="border-warn-border bg-warn-bg/50 text-warn-fg"
              href={buildHash(runId, "matrix")}
            />
            <Tile
              count={crit.red ?? 0}
              word="red"
              icon="XOctagon"
              tone="border-bad-border bg-bad-bg/50 text-bad-fg"
              href={buildHash(runId, "matrix")}
            />
          </div>
          <p className="pt-1 text-sm font-mono">
            <button
              type="button"
              className="text-text-muted hover:text-brand transition-colors underline font-medium"
              onClick={onOpenConflicts}
            >
              {openConflicts} open {openConflicts === 1 ? "conflict" : "conflicts"}
            </button>
          </p>
        </section>

        {/* Column 3: What is missing */}
        <section aria-labelledby="stop-missing" className="space-y-2 md:col-span-2 xl:col-span-1">
          <h3 id="stop-missing" className="font-mono text-sm tracking-wider uppercase text-text-muted">
            What is missing
          </h3>
          {missing ? (
            <div className="space-y-2 text-sm text-text">
              {gaps.length > 0 ? (
                <ul className="space-y-1.5">
                  {gaps.map((g) => (
                    <li key={g.slotId} className="leading-snug">
                      <button
                        type="button"
                        className="font-semibold text-brand hover:underline mr-1 text-left"
                        onClick={() => onOpenSlot(g.slotId)}
                      >
                        {g.name}
                      </button>
                      <span className="text-text-muted">: {g.reason}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {caveats.length > 0 ? (
                <ul className="list-disc pl-4 space-y-1 text-text-muted">
                  {caveats.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-text-muted">No critical gaps or caveats.</p>
          )}

          {wouldChange.length > 0 ? (
            <div className="pt-2 border-t border-border-hairline">
              <h4 className="font-mono text-sm tracking-wider uppercase text-text-muted mb-1.5">
                What could change this conclusion
              </h4>
              <ul className="list-disc pl-4 space-y-1 text-sm text-text-muted">
                {wouldChange.map((c) => (
                  <li key={c.id}>{c.would_change_if}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>
    </Card>
  );
}
