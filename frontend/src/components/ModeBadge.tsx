import type { Run } from "@contracts/types";
import { Icon } from "./ui/Icon";

/** Always-visible LIVE / REPLAY badge. State = colour + icon + text (never colour alone). */
export function ModeBadge({
  mode,
  pulsing = false,
  iconOnly = false,
}: {
  mode: Run["mode"] | null;
  pulsing?: boolean;
  /** Show only the icon (the collapsed rail); the accessible name still carries the full label. */
  iconOnly?: boolean;
}) {
  const label = mode === "REPLAY" ? "REPLAY (recorded)" : (mode ?? "NO RUN");
  
  let classes = "inline-flex w-fit items-center gap-1.5 rounded-full border py-1 text-sm font-bold tracking-widest transition-colors " + (iconOnly ? "px-1.5 " : "px-3 max-sm:px-1.5 ");
  if (mode === "LIVE") classes += "border-ok-border text-ok-fg bg-ok-bg";
  else if (mode === "REPLAY") classes += "border-warn-border text-warn-fg bg-warn-bg";
  else classes += "border-border-hairline text-text-muted bg-surface-2";
  
  return (
    <span
      role="status"
      aria-label={`Run mode: ${label}`}
      className={classes}
    >
      {mode === "LIVE" && pulsing ? (
        <span className="h-2 w-2 rounded-full bg-ok-fg animate-pulse" aria-hidden="true" />
      ) : mode === "LIVE" ? (
        <Icon name="Activity" size={12} aria-hidden />
      ) : mode === "REPLAY" ? (
        <Icon name="RotateCcw" size={12} aria-hidden />
      ) : (
        <Icon name="Circle" size={12} aria-hidden />
      )}
      {iconOnly ? null : <span className="max-sm:sr-only">{label}</span>}
    </span>
  );
}
