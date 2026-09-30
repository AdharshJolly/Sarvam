import type { Run } from "@contracts/types";

/** Always-visible LIVE / REPLAY badge. State = color + icon + text (never color alone). */
export function ModeBadge({ mode }: { mode: Run["mode"] | null }) {
  const label = mode ?? "NO RUN";
  const icon = mode === "LIVE" ? "\u25CF" : mode === "REPLAY" ? "\u27F2" : "\u25CB";
  const color = mode === "LIVE" ? "var(--ok)" : mode === "REPLAY" ? "var(--warn)" : "var(--text-muted)";
  return (
    <span
      role="status"
      aria-label={`Run mode: ${label}`}
      className="inline-flex w-fit items-center gap-2 rounded border px-2 py-1 text-sm font-semibold"
      style={{ borderColor: color, color }}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}
