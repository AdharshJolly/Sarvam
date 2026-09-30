import type { Run } from "@contracts/types";
import { Icon } from "./ui/Icon";

/** Always-visible LIVE / REPLAY badge. State = colour + icon + text (never colour alone). */
export function ModeBadge({ mode, pulsing = false }: { mode: Run["mode"] | null; pulsing?: boolean }) {
  const label = mode === "REPLAY" ? "REPLAY (recorded)" : (mode ?? "NO RUN");
  
  let classes = "inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold tracking-widest transition-colors ";
  if (mode === "LIVE") classes += "border-good text-good bg-good-bg";
  else if (mode === "REPLAY") classes += "border-warn-border text-warn-fg bg-warn-bg";
  else classes += "border-border text-text-muted bg-surface-2";
  
  return (
    <span
      role="status"
      aria-label={`Run mode: ${label}`}
      className={classes}
    >
      {mode === "LIVE" && pulsing ? (
        <span className="h-2 w-2 rounded-full bg-good animate-pulse" aria-hidden="true" />
      ) : mode === "LIVE" ? (
        <Icon name="Activity" size={12} aria-hidden />
      ) : mode === "REPLAY" ? (
        <Icon name="RotateCcw" size={12} aria-hidden />
      ) : (
        <Icon name="Circle" size={12} aria-hidden />
      )}
      {label}
    </span>
  );
}
