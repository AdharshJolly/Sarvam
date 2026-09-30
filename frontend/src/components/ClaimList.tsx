import type { Claim, ClaimRejectedPayload, Verdict } from "@contracts/types";
import { Card } from "./ui/Card";
import { EmptyState } from "./ui/EmptyState";
import { StateChip } from "./ui/StateChip";
import { verdictChip } from "./ui/chips";

export function ClaimList({
  claims,
  verdicts,
  slotNames,
  rejected,
  onOpenClaim,
}: {
  claims: Claim[];
  verdicts: Record<string, Verdict>;
  slotNames: Map<string, string>;
  rejected: ClaimRejectedPayload[];
  onOpenClaim: (claimId: string) => void;
}) {
  const bySlot = new Map<string, Claim[]>();
  for (const c of claims) bySlot.set(c.slot_id, [...(bySlot.get(c.slot_id) ?? []), c]);
  return (
    <div className="flex flex-col gap-4">
      {claims.length === 0 ? (
        <EmptyState title="No verified claims yet" why="Claims appear once extraction finds quotes that exist in a stored passage." />
      ) : null}
      {[...bySlot.entries()].map(([slotId, list]) => (
        <section key={slotId} aria-label={`Claims for ${slotNames.get(slotId) ?? slotId}`}>
          <h4 className="font-semibold">{slotNames.get(slotId) ?? slotId}</h4>
          <ul className="flex flex-col gap-1">
            {list.map((c) => {
              const v = verdicts[c.id];
              const numeric = c.value_num != null;
              return (
                <li key={c.id}>
                  <Card
                    as="button"
                    interactive
                    pad="xs"
                    className="flex w-full flex-wrap items-center gap-2 text-left text-base"
                    onClick={() => onOpenClaim(c.id)}
                  >
                    <strong className="mono">{c.id}</strong>
                    <span>{c.text}</span>
                    {numeric ? (
                      <span className="text-text-muted">
                        [{c.entity ?? "?"} / {c.attribute ?? "?"} = {c.value_num} {c.unit ?? ""} {c.period ?? ""}]
                      </span>
                    ) : null}
                    {v ? <StateChip spec={verdictChip(v)} /> : null}
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <details>
        <summary className="cursor-pointer font-semibold">Rejected by quote guard ({rejected.length})</summary>
        {rejected.length === 0 ? (
          <p className="text-base text-text-muted">
            Nothing rejected so far.
          </p>
        ) : (
          <ul className="mt-1 text-base">
            {rejected.map((r, i) => (
              <li key={`${r.slot_id}-${i}`} className="mb-1">
                <strong>{slotNames.get(r.slot_id) ?? r.slot_id}</strong>: {'"'}
                {r.quote}
                {'"'} <span className="text-text-muted">{r.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
