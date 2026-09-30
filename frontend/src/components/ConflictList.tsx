import type { Claim, Conflict } from "@contracts/types";
import { EmptyState } from "./ui/EmptyState";
import { StateChip } from "./ui/StateChip";
import { conflictKindText, conflictStatusChip } from "./ui/chips";

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
        title="No conflicts detected in the claims collected so far"
        why="Conflicts appear after the analysis pass compares numeric claims within a slot."
      />
    );
  }
  const sorted = [...conflicts].sort((a, b) => Number(b.status !== "explained") - Number(a.status !== "explained"));
  return (
    <ul className="flex flex-col gap-3">
      {sorted.map((c) => {
        const status = c.status ?? "open";
        const kind = c.kind ?? "genuine";
        return (
          <li
            key={c.id}
            className="rounded border p-3"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StateChip spec={conflictStatusChip(status)} />
              <strong>{slotNames.get(c.slot_id) ?? c.slot_id}</strong>
              <span>{`${c.delta_pct.toFixed(1)}% apart`}</span>
              <span style={{ color: "var(--text-muted)" }}>{conflictKindText[kind]}</span>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {[c.claim_a, c.claim_b].map((id) => (
                <blockquote key={id} className="rounded p-2" style={{ background: "var(--surface-2)" }}>
                  <span className="font-semibold">{id}: </span>
                  {claims.get(id)?.text ?? "(claim text not loaded)"}
                </blockquote>
              ))}
            </div>
            {c.explanation ? <p className="mt-2 text-base">{c.explanation}</p> : null}
            {status === "explained" ? (
              <p className="text-base" style={{ color: "var(--text-muted)" }}>
                Explained: does not downgrade the coverage cell.
              </p>
            ) : null}
            <button
              type="button"
              className="mt-2 rounded border px-3 py-1 text-base"
              style={{ borderColor: "var(--border)" }}
              onClick={() => onCompare([c.claim_a, c.claim_b])}
            >
              Compare evidence
            </button>
          </li>
        );
      })}
    </ul>
  );
}
