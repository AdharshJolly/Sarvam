import type { Challenge, Task } from "@contracts/types";
import { EmptyState } from "./ui/EmptyState";
import { StateChip } from "./ui/StateChip";
import { outcomeChip } from "./ui/chips";

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
        title="No challenges yet"
        why="At least one challenge round must run before a run can be SUFFICIENT; a hard budget or time limit can skip it, and the stop card says so."
      />
    );
  }
  const rounds = [...new Set(challenges.map((c) => c.round))].sort((a, b) => a - b);
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  return (
    <div className="flex flex-col gap-4">
      {rounds.map((r) => (
        <section key={r} aria-label={`Challenge round ${r}`}>
          <h3 className="mb-2 text-lg font-semibold">Round {r}</h3>
          <ul className="flex flex-col gap-3">
            {challenges
              .filter((c) => c.round === r)
              .map((c) => (
                <li
                  key={c.id}
                  className="rounded border p-3"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <StateChip spec={outcomeChip(c.outcome)} />
                    <strong>{c.id}</strong>
                    {c.target_slot ? <span>{slotNames.get(c.target_slot) ?? c.target_slot}</span> : null}
                    {c.target_claim ? (
                      <button type="button" className="underline" onClick={() => onOpenClaim(c.target_claim ?? "")}>
                        {c.target_claim}
                      </button>
                    ) : null}
                  </div>
                  <p>{c.attack}</p>
                  {c.required_evidence ? (
                    <p className="text-base">
                      <strong>Required evidence: </strong>
                      {c.required_evidence}
                    </p>
                  ) : null}
                  {(c.followup_task_ids ?? []).length > 0 ? (
                    <ul className="mt-1 text-base">
                      {(c.followup_task_ids ?? []).map((id) => {
                        const t = taskById.get(id);
                        return (
                          <li key={id}>
                            {"→"} {t ? `${t.query_text} (${t.status ?? "pending"})` : id}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  {c.would_change_if ? (
                    <p className="mt-1 text-base">
                      <strong>Would change if: </strong>
                      {c.would_change_if}
                    </p>
                  ) : null}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
