import type { Claim, ClaimRejectedPayload, Verdict, Source } from "@contracts/types";
import { Card } from "./ui/Card";
import { EmptyState } from "./ui/EmptyState";
import { StateChip } from "./ui/StateChip";
import { verdictChip } from "./ui/chips";

export function ClaimList({
  claims,
  verdicts,
  sources,
  slotNames,
  rejected,
  onOpenClaim,
}: {
  claims: Claim[];
  verdicts: Record<string, Verdict>;
  sources: Record<string, Source>;
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
          <h4 className="font-semibold mb-2">
            {slotNames.get(slotId) ?? slotId} <span className="text-text-muted font-normal">({list.length})</span>
          </h4>
          <ul className="flex flex-col gap-2">
            {list.map((c) => {
              const v = verdicts[c.id];
              const numeric = c.value_num != null;
              const sourceId = (c as unknown as { source_id?: string }).source_id;
              const source = sourceId ? sources[sourceId] : undefined;
              return (
                <li key={c.id}>
                  <Card
                    as="button"
                    interactive
                    pad="sm"
                    className="flex w-full flex-col gap-2 text-left text-base"
                    onClick={() => onOpenClaim(c.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 mt-0.5">
                        {v ? <StateChip spec={verdictChip(v)} /> : <StateChip spec={{ icon: "Clock", label: "pending", tone: "muted" }} />}
                      </div>
                      <div className="flex flex-col gap-1 flex-1">
                        <div>
                          <strong className="mono mr-2 text-text-muted">{c.id}</strong>
                          <span className="font-medium">{c.text}</span>
                        </div>
                        {(numeric || source) ? (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-muted mt-1">
                            {numeric ? (
                              <span>
                                {c.entity ?? "?"} / {c.attribute ?? "?"} = <strong className="text-text">{c.value_num}</strong> {c.unit ?? ""} {c.period ? `per ${c.period}` : ""}
                              </span>
                            ) : null}
                            {source ? <span className="truncate max-w-[20rem]" title={source.domain}>{source.domain}</span> : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
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
