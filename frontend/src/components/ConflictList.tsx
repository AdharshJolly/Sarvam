import type { Claim, Conflict, ConflictKind } from "@contracts/types";
import { useClaimEvidence } from "../state/useClaimEvidence";
import { useSession } from "../state/useRunSession";
import { Badge } from "./ui/Badge";
import { EmptyState } from "./ui/EmptyState";
import { Skeleton } from "./ui/Skeleton";
import { StateChip } from "./ui/StateChip";
import { conflictKindText, conflictStatusChip } from "./ui/chips";
import { Icon } from "./ui/Icon";
import { Button } from "./ui/Button";

const whyItMatters: Record<ConflictKind, string> = {
  genuine: "Different values are reported for the same thing and period. Sarvam cannot pick a winner from the evidence it has.",
  unit_error: "The figures look far apart only because they use different units or periods. Once normalised they agree.",
  scope_difference: "The claims describe different scopes, so both can be right.",
  temporal: "The claims describe different time periods, so both can be right.",
  definition: "The sources define the measured thing differently, so the numbers are not directly comparable.",
};

function valueText(c: Claim | undefined): string {
  if (!c) return "—";
  if (c.value_num == null) return c.id;
  const unit = c.unit ? ` ${c.unit}` : "";
  return `${c.value_num.toLocaleString()}${unit}${c.period ? ` / ${c.period}` : ""}`;
}

function Side({ claimId, claim }: { claimId: string; claim: Claim | undefined }) {
  const { runId } = useSession();
  const { load } = useClaimEvidence(runId, claimId);
  return (
    <div className="rounded-lg p-3 bg-surface-2">
      <p className="label mb-1">Claim {claimId}</p>
      <p className="mono text-2xl font-bold leading-tight">
        {valueText(claim)}
      </p>
      <p className="mt-1 text-base">{claim?.text ?? "(claim text not loaded)"}</p>
      <div className="mt-2 text-sm text-text-muted">
        {load.status === "loading" ? (
          <Skeleton className="h-4 w-2/3" />
        ) : load.status === "ok" ? (
          <span className="flex flex-wrap items-center gap-1">
            {load.data.source.domain}
            <Badge>{load.data.source.source_type ?? "unknown"}</Badge>
            <Badge>{`Tier ${load.data.source.authority_tier ?? 3}`}</Badge>
          </span>
        ) : (
          <span>Source unavailable: {load.message}</span>
        )}
      </div>
    </div>
  );
}

export function ConflictList({
  conflicts,
  claims,
  slotNames,
  onCompare,
}: {
  conflicts: Conflict[];
  claims: Map<string, Claim>;
  slotNames: Map<string, string>;
  onCompare: (claimIds: string[]) => void;
}) {
  if (conflicts.length === 0) {
    return (
      <EmptyState
        icon="Zap"
        title="No conflicts detected in the claims collected so far"
        why="Conflicts appear after the analysis pass compares numeric claims within a slot. Explained conflicts stay visible too."
      />
    );
  }
  const sorted = [...conflicts].sort((a, b) => Number(b.status !== "explained") - Number(a.status !== "explained"));
  return (
    <ul className="flex flex-col gap-4">
      {sorted.map((c) => {
        const status = c.status ?? "open";
        const kind = c.kind ?? "genuine";
        return (
          <li key={c.id} className={`card anim-in p-4 border-l-[4px] ${status === "open" ? "border-l-bad-fg" : "border-l-ok-fg"}`}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StateChip spec={conflictStatusChip(status)} />
              <strong>{slotNames.get(c.slot_id) ?? c.slot_id}</strong>
              <Badge mono>{c.id}</Badge>
            </div>
            <div className="grid items-center gap-2 md:grid-cols-[1fr_auto_1fr]">
              <Side claimId={c.claim_a} claim={claims.get(c.claim_a)} />
              <div className="text-center">
                <p className="label">vs</p>
                <p className="mono font-bold">{c.delta_pct.toFixed(1)}%</p>
                <p className="text-sm text-text-muted">
                  apart
                </p>
              </div>
              <Side claimId={c.claim_b} claim={claims.get(c.claim_b)} />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <p className="label mb-1">Type</p>
                <p>{conflictKindText[kind]}</p>
              </div>
              <div>
                <p className="label mb-1">Why this matters</p>
                <p className="text-base">{whyItMatters[kind]}</p>
              </div>
            </div>
            {c.explanation ? (
              <p className="mt-3 rounded-md p-3 text-base bg-ok-bg">
                <strong>Explanation: </strong>
                {c.explanation}
              </p>
            ) : null}
            {status === "explained" ? (
              <p className="mt-1 text-sm text-text-muted">
                Explained conflicts stay visible. This one does not downgrade the coverage cell.
              </p>
            ) : null}
            <Button
              className="mt-3"
              icon={<Icon name="ArrowRight" size={16} aria-hidden />}
              onClick={() => onCompare([c.claim_a, c.claim_b])}
            >
              Compare evidence
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
