import { useMemo, useState } from "react";
import { useSession } from "../../state/useRunSession";
import {
  cellsForRound,
  dimensionsOf,
  latestRound,
  originsForSlot,
  roundDiff,
  roundsAvailable,
  rollupsForRound,
  slotStats,
  slotsOf,
} from "../../state/selectors";
import { CoverageMatrix } from "../CoverageMatrix";
import { OriginGroupView } from "../OriginGroupView";
import { EmptyState } from "../ui/EmptyState";

export function MatrixPanel({
  onOpenClaims,
  onOpenConflicts,
  onOpenSource,
}: {
  onOpenClaims: (slotId: string) => void;
  onOpenConflicts: () => void;
  onOpenSource: (sourceId: string) => void;
}) {
  const { view } = useSession();
  const rounds = roundsAvailable(view);
  const latest = latestRound(view);
  const [picked, setPicked] = useState<number | null>(null);
  const [compare, setCompare] = useState(false);
  const [originSlot, setOriginSlot] = useState<string | null>(null);
  const round = picked !== null && rounds.includes(picked) ? picked : latest;

  const slots = useMemo(() => slotsOf(view), [view.plan, view.run?.id]);
  const dims = useMemo(() => dimensionsOf(view), [view.plan, view.run?.id]);
  const stats = useMemo(() => slotStats(view), [view.sources, view.origins, view.tasks, view.plan]);

  if (!view.plan) {
    return <EmptyState title="No plan yet" why="The matrix is laid out from the plan once the planner finishes." />;
  }
  if (round === null) {
    const done = view.run?.status === "completed" || view.run?.status === "failed";
    return done ? (
      <EmptyState
        title="Assurance layer not available for this run"
        why="This run finished without a coverage analysis, so there is no matrix to show. Plan, sources and claims are on the Evidence tab."
      />
    ) : (
      <EmptyState
        title="Coverage is computed after the first analysis pass"
        why={`Current phase: ${view.phase ? view.phase.replace("_", " ") : "starting"}.`}
      />
    );
  }
  const cells = cellsForRound(view, round);
  const prevRound = rounds.filter((r) => r < round).at(-1);
  const changes = compare && prevRound !== undefined ? roundDiff(cellsForRound(view, prevRound), cells) : undefined;
  const originSlotDef = slots.find((s) => s.id === originSlot);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Coverage round" className="flex gap-1">
          {rounds.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={round === r}
              className="rounded border px-3 py-1 text-base"
              style={{ borderColor: round === r ? "var(--accent)" : "var(--border)", fontWeight: round === r ? 700 : 400 }}
              onClick={() => setPicked(r)}
            >
              Round {r}
            </button>
          ))}
        </div>
        {prevRound !== undefined ? (
          <label className="text-base">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Compare with previous
            round
          </label>
        ) : null}
      </div>
      <CoverageMatrix
        dimensions={dims}
        slots={slots}
        cells={cells}
        rollups={rollupsForRound(view, round)}
        stats={stats}
        {...(changes ? { changes } : {})}
        onOpenOrigins={setOriginSlot}
        onOpenClaims={onOpenClaims}
        onOpenConflicts={onOpenConflicts}
      />
      {originSlotDef ? (
        <div>
          <OriginGroupView
            slotName={originSlotDef.name}
            groups={originsForSlot(view, originSlotDef.id)}
            onOpenSource={onOpenSource}
          />
          <button type="button" className="mt-2 rounded border px-3 py-1" style={{ borderColor: "var(--border)" }} onClick={() => setOriginSlot(null)}>
            Close origin view
          </button>
        </div>
      ) : null}
    </div>
  );
}
