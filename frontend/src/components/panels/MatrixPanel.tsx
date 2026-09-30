import { useMemo, useState } from "react";
import {
  cellsForRound,
  dimensionsOf,
  latestRound,
  originsForSlot,
  rollupsForRound,
  roundDiff,
  roundsAvailable,
  slotStats,
  slotsOf,
} from "../../state/selectors";
import { useSession } from "../../state/useRunSession";
import { CoverageMatrix } from "../CoverageMatrix";
import { OriginGroupView } from "../OriginGroupView";
import { EmptyState } from "../ui/EmptyState";
import { Skeleton } from "../ui/Skeleton";
import { StateChip } from "../ui/StateChip";
import { coverageChip } from "../ui/chips";
import { Icon } from "../ui/Icon";

function MatrixSkeleton({ phase }: { phase: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <p className="text-base text-text-muted flex items-center gap-2">
        <Icon name="Activity" size={16} className="blink" aria-hidden /> {phase}
      </p>
      <div className="card grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="rounded-lg border border-border p-3">
            <Skeleton className="mb-2 h-4 w-1/3" />
            <Skeleton className="mb-2 h-5 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function MatrixPanel({
  onOpenClaims,
  onOpenConflicts,
  onOpenSource,
}: {
  onOpenClaims: (slotId: string) => void;
  onOpenConflicts: () => void;
  onOpenSource: (sourceId: string) => void;
}) {
  const { view, hydrating } = useSession();
  const rounds = roundsAvailable(view);
  const latest = latestRound(view);
  const [picked, setPicked] = useState<number | null>(null);
  const [compare, setCompare] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const round = picked !== null && rounds.includes(picked) ? picked : latest;

  const slots = useMemo(() => slotsOf(view), [view.plan, view.run?.id]);
  const dims = useMemo(() => dimensionsOf(view), [view.plan, view.run?.id]);
  const stats = useMemo(() => slotStats(view), [view.sources, view.origins, view.tasks, view.plan]);

  const running = view.run?.status === "running" || view.run?.status === "queued";
  const phaseText = view.phase ? `${view.phase.replace("_", " ")}: ${view.nowReason}` : "Starting the run...";

  if (hydrating) return <MatrixSkeleton phase="Loading run state..." />;
  if (!view.plan) {
    return running ? (
      <MatrixSkeleton phase={`Planning research: ${phaseText}`} />
    ) : (
      <EmptyState title="No plan for this run" why="The matrix is laid out from the plan; this run never produced one." />
    );
  }
  if (round === null) {
    return running ? (
      <div className="flex flex-col gap-3">
        <EmptyState
          icon="Clock"
          title="Coverage is computed after the first analysis pass"
          why={`Current phase: ${phaseText}`}
        />
        <MatrixSkeleton phase="Waiting for evidence to fill the matrix" />
      </div>
    ) : (
      <EmptyState
        title="Assurance layer not available for this run"
        why="This run finished without a coverage analysis, so there is no matrix to show. Plan, sources and claims are on the Evidence tab."
      />
    );
  }
  const cells = cellsForRound(view, round);
  const prevRound = rounds.filter((r) => r < round).at(-1);
  const changes = compare && prevRound !== undefined ? roundDiff(cellsForRound(view, prevRound), cells) : undefined;
  const sel = slots.find((s) => s.id === selected);
  const selCell = cells.find((c) => c.slot_id === selected);
  const selDim = dims.find((d) => d.id === sel?.dimension_id);
  const counts = { GREEN: 0, AMBER: 0, RED: 0 };
  for (const c of cells) counts[c.state] += 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="group" aria-label="Coverage round" className="inline-flex overflow-hidden rounded-md border border-border-strong">
          {rounds.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={round === r}
              className={`px-3 py-1 text-base transition-colors ${
                round === r ? "bg-accent text-bg font-bold" : "bg-surface text-text hover:bg-surface-2"
              }`}
              onClick={() => setPicked(r)}
            >
              Round {r}
            </button>
          ))}
        </div>
        {prevRound !== undefined ? (
          <label className="text-base flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Compare with previous round
          </label>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2" aria-label="Legend and totals">
          {(["GREEN", "AMBER", "RED"] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <StateChip spec={coverageChip(s)} />
              <span className="mono">{counts[s]}</span>
            </span>
          ))}
        </div>
      </div>

      <CoverageMatrix
        dimensions={dims}
        slots={slots}
        cells={cells}
        rollups={rollupsForRound(view, round)}
        stats={stats}
        {...(changes ? { changes } : {})}
        selected={selected}
        onSelect={setSelected}
      />

      {sel ? (
        <section aria-label="Slot detail" className="card anim-in p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="label">
                {selDim?.name ?? "Dimension"} / {sel.name}
              </p>
              <p className="text-base text-text-muted">
                {sel.description}
              </p>
            </div>
            {selCell ? <StateChip spec={coverageChip(selCell.state)} large /> : null}
          </div>
          {selCell ? (
            <div className="mb-3 rounded-md p-3 bg-surface-2">
              <p className="label mb-1">Reason</p>
              <p>{selCell.reason}</p>
            </div>
          ) : null}
          <div className="mb-4 flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => onOpenClaims(sel.id)}>
              View evidence ({selCell?.supporting_claims ?? 0} claims)
            </button>
            {(selCell?.open_conflicts ?? 0) > 0 ? (
              <button type="button" className="btn text-warn-fg border-warn-border hover:bg-warn-bg flex items-center gap-2" onClick={onOpenConflicts}>
                <Icon name="Zap" size={16} aria-hidden /> {selCell?.open_conflicts} open conflict{selCell?.open_conflicts === 1 ? "" : "s"}
              </button>
            ) : null}
            <button type="button" className="btn" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <OriginGroupView slotName={sel.name} groups={originsForSlot(view, sel.id)} onOpenSource={onOpenSource} />
        </section>
      ) : (
        <p className="text-base text-text-muted">
          Select a cell to see why it has that state, and how its sources collapse into independent origins.
        </p>
      )}
    </div>
  );
}
