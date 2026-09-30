import type { Run } from "@contracts/types";
import { ModeBadge } from "../ModeBadge";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Metric } from "../ui/Metric";
import { Tooltip } from "../ui/Tooltip";
import { ThemeToggle } from "./ThemeToggle";

export interface HeaderMetric {
  label: string;
  value: string;
  onClick: () => void;
}

/**
 * The top bar. On a run it shows the question as the page title (truncated, full text on hover or
 * focus), the LIVE/REPLAY badge whenever the rail is not showing it, and cost, time and tokens that
 * each open the timeline filtered to the events behind the number. Below lg it also carries the
 * buttons that open the status and activity sheets.
 */
export function AppHeader({
  runId,
  question,
  mode,
  running,
  showMode,
  metrics,
  onNewRun,
  onOpenStatus,
  onOpenActivity,
}: {
  runId: string | null;
  question: string | undefined;
  mode: Run["mode"] | null;
  running: boolean;
  showMode: boolean;
  metrics: HeaderMetric[];
  onNewRun: () => void;
  onOpenStatus: () => void;
  onOpenActivity: () => void;
}) {
  return (
    <header className="app-header sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-hairline bg-surface px-4 py-2">
      {runId ? (
        <Button
          size="icon"
          variant="ghost"
          className="lg:hidden"
          aria-label="Open research status"
          icon={<Icon name="PanelLeft" size={20} aria-hidden />}
          onClick={onOpenStatus}
        />
      ) : null}

      <p className="shrink-0 text-xl font-bold tracking-tight text-brand">SARVAM</p>
      {/* On a phone the question drops to its own row so it is never squeezed to nothing. */}
      {question ? (
        <Tooltip text={question} className="order-last min-w-0 max-w-full basis-full sm:order-none sm:flex-1 sm:basis-0" focusable>
          <h1 className="min-w-0 truncate text-base font-medium">{question}</h1>
        </Tooltip>
      ) : (
        <p className="hidden flex-1 text-sm text-text-muted sm:block">Research that knows when it isn&apos;t done.</p>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        {runId && showMode ? <ModeBadge mode={mode} pulsing={running} /> : null}
        {runId ? (
          <div className="hidden items-center gap-5 md:flex" role="group" aria-label="Run totals">
            {metrics.map((m) => (
              <Metric key={m.label} label={m.label} value={m.value} onClick={m.onClick} />
            ))}
          </div>
        ) : null}
        {runId ? (
          <Button
            size="icon"
            variant="ghost"
            className="lg:hidden"
            aria-label="Open activity timeline"
            icon={<Icon name="Activity" size={20} aria-hidden />}
            onClick={onOpenActivity}
          />
        ) : null}
        {runId ? (
          <Button size="sm" icon={<Icon name="Plus" size={16} aria-hidden />} onClick={onNewRun}>
            <span className="max-sm:sr-only">New run</span>
          </Button>
        ) : null}
        <ThemeToggle />
      </div>
    </header>
  );
}
