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
import { CoverageMatrix, MatrixTable } from "../CoverageMatrix";
import { OriginGroupView } from "../OriginGroupView";
import { EmptyState } from "../ui/EmptyState";
import { Skeleton } from "../ui/Skeleton";
import { StateChip } from "../ui/StateChip";
import { coverageChip } from "../ui/chips";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

export function countChange(changes: Record<string, string>, kind: string): number {
  return Object.values(changes).filter((c) => c === kind).length;
}

function MatrixSkeleton({ phase }: { phase: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <p className="text-base text-text-muted flex items-center gap-2">
        <Icon name="Activity" size={16} className="blink" aria-hidden /> {phase}
      </p>
      <Card pad="sm" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="rounded-lg border border-border-hairline p-3">
            <Skeleton className="mb-2 h-4 w-1/3" />
            <Skeleton className="mb-2 h-5 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        ))}
      </Card>
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
  const [matrixView, setMatrixView] = useState<"grid" | "table">("grid");
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
        <div className="flex items-center gap-3">
          {rounds.length > 1 ? (
            <label className="flex items-center gap-2">
              <span className="font-semibold text-base">Round:</span>
              <input
                type="range"
                min={0}
                max={rounds.length - 1}
                value={rounds.indexOf(round)}
                onChange={(e) => setPicked(rounds[parseInt(e.target.value, 10)])}
                className="accent-brand cursor-pointer"
                aria-label="Select round"
              />
              <span className="mono min-w-4 text-center">{round}</span>
            </label>
          ) : (
            <span className="font-semibold text-base">Round {round}</span>
          )}
        </div>
        <div role="group" aria-label="Matrix view" className="inline-flex overflow-hidden rounded-md border border-border-strong">
          {(["grid", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={matrixView === v}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-base transition-colors pointer-coarse:min-h-11 ${
                matrixView === v ? "bg-brand text-on-brand font-bold" : "bg-surface text-text hover:bg-surface-2"
              }`}
              onClick={() => setMatrixView(v)}
            >
              <Icon name={v === "grid" ? "Grid" : "Table"} size={16} aria-hidden />
              {v === "grid" ? "Grid" : "Table"}
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

      {changes && prevRound !== undefined ? (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border-hairline bg-surface-2 px-3 py-2 text-base">
          <span className="font-semibold">Round {round} compared with round {prevRound}:</span>
          <span className="inline-flex items-center gap-1 text-ok-fg">
            <Icon name="TrendingUp" size={16} aria-hidden /> {countChange(changes, "improved")} improved
          </span>
          <span className="inline-flex items-center gap-1 text-bad-fg">
            <Icon name="TrendingDown" size={16} aria-hidden /> {countChange(changes, "worse")} worse
          </span>
          <span className="inline-flex items-center gap-1 text-brand-secondary">
            <Icon name="Plus" size={16} aria-hidden /> {countChange(changes, "new")} new
          </span>
          <span className="inline-flex items-center gap-1 text-text-muted">
            <Icon name="Minus" size={16} aria-hidden /> {countChange(changes, "same")} unchanged
          </span>
        </p>
      ) : null}

      {(() => {
        const props = {
          dimensions: dims,
          slots,
          cells,
          rollups: rollupsForRound(view, round),
          stats,
          ...(changes ? { changes } : {}),
          selected,
          onSelect: setSelected,
        };
        return matrixView === "grid" ? <CoverageMatrix {...props} /> : <MatrixTable {...props} />;
      })()}

      {sel ? (
        <Card as="section" pad="md" aria-label="Slot detail">
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
            <Button onClick={() => onOpenClaims(sel.id)}>
              View evidence ({selCell?.supporting_claims ?? 0} claims)
            </Button>
            {(selCell?.open_conflicts ?? 0) > 0 ? (
              <Button
                className="text-warn-fg border-warn-border hover:bg-warn-bg"
                icon={<Icon name="Zap" size={16} aria-hidden />}
                onClick={onOpenConflicts}
              >
                {selCell?.open_conflicts} open conflict{selCell?.open_conflicts === 1 ? "" : "s"}
              </Button>
            ) : null}
            <Button onClick={() => setSelected(null)}>Close</Button>
          </div>
          <OriginGroupView slotName={sel.name} groups={originsForSlot(view, sel.id)} onOpenSource={onOpenSource} />
        </Card>
      ) : (
        <p className="text-base text-text-muted">
          Select a cell to see why it has that state, and how its sources collapse into independent origins.
        </p>
      )}
    </div>
  );
}
