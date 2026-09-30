import type { Challenge, Task } from "@contracts/types";
import { Badge } from "./ui/Badge";
import { EmptyState } from "./ui/EmptyState";
import { StateChip } from "./ui/StateChip";
import { outcomeChip } from "./ui/chips";
import { Card } from "./ui/Card";
import type { Tone } from "./ui/chips";

const outcomeNote = {
  strengthened: "The attack failed: the conclusion stands after looking for counter-evidence.",
  weakened: "The attack found evidence that weakens the conclusion.",
  unresolved: "Sarvam could not settle this either way with the evidence it could reach.",
} as const;

const TEXT_TONE: Record<Tone, string> = {
  ok: "text-ok-fg",
  warn: "text-warn-fg",
  bad: "text-bad-fg",
  muted: "text-text-muted",
  brand: "text-brand",
  info: "text-info-fg",
};

/** slotNames maps a slot id to a readable path such as "Pricing → Competitor subscription pricing". */
export function ChallengeList({
  challenges,
  tasks,
  slotNames,
  onOpenClaim,
}: {
  challenges: Challenge[];
  tasks: Task[];
  slotNames: Map<string, string>;
  onOpenClaim: (claimId: string) => void;
}) {
  if (challenges.length === 0) {
    return (
      <EmptyState
        icon="Swords"
        title="No challenges yet"
        why="At least one challenge round must run before a run can be SUFFICIENT; a hard budget or time limit can skip it, and the stop card says so."
      />
    );
  }
  const rounds = [...new Set(challenges.map((c) => c.round))].sort((a, b) => a - b);
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  return (
    <div className="flex flex-col gap-6">
      {rounds.map((r) => (
        <section key={r} aria-label={`Challenge round ${r}`}>
          <h3 className="label mb-2">Challenge round {r}</h3>
          <ul className="flex flex-col gap-3">
            {challenges
              .filter((c) => c.round === r)
              .map((c) => {
                const oc = outcomeChip(c.outcome);
                const textColor = TEXT_TONE[oc.tone];
                return (
                  <Card as="li" key={c.id} pad="md" accent={oc.tone} className="anim-in">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <StateChip spec={oc} />
                      <Badge mono>{c.id}</Badge>
                      {c.target_slot ? <Badge>{slotNames.get(c.target_slot) ?? c.target_slot}</Badge> : null}
                      {c.target_claim ? (
                        <button type="button" className="mono underline text-brand-secondary hover:text-brand" onClick={() => onOpenClaim(c.target_claim ?? "")}>
                          {c.target_claim}
                        </button>
                      ) : null}
                    </div>
                    <p className="label mb-1">Attack</p>
                    <p className="text-lg leading-snug">{c.attack}</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {c.required_evidence ? (
                        <div>
                          <p className="label mb-1">Required evidence</p>
                          <p className="text-base">{c.required_evidence}</p>
                        </div>
                      ) : null}
                      {(c.followup_task_ids ?? []).length > 0 ? (
                        <div>
                          <p className="label mb-1">Follow-up queries</p>
                          <ul className="text-base">
                            {(c.followup_task_ids ?? []).map((id) => {
                              const t = taskById.get(id);
                              return (
                                <li key={id} className="flex gap-2">
                                  <span className="text-text-muted">-</span> 
                                  <span>{t ? t.query_text : id} {t ? <Badge>{t.status ?? "pending"}</Badge> : null}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                    {c.outcome ? (
                      <p className="mt-3 text-base text-text-muted">
                        <strong className={textColor}>{oc.label.toUpperCase()}.</strong> {outcomeNote[c.outcome]}
                      </p>
                    ) : (
                      <p className="mt-3 text-base blink text-text-muted">
                        Outcome pending...
                      </p>
                    )}
                    {c.would_change_if ? (
                      <div className="mt-3 rounded-md p-3 bg-surface-2">
                        <p className="label mb-1">Would change the conclusion if</p>
                        <p className="text-base">{c.would_change_if}</p>
                      </div>
                    ) : null}
                  </Card>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
