import type { Run } from "@contracts/types";

/** Always-visible LIVE / REPLAY badge. State = colour + icon + text (never colour alone). */
export function ModeBadge({ mode, pulsing = false }: { mode: Run["mode"] | null; pulsing?: boolean }) {
  const label = mode === "REPLAY" ? "REPLAY (recorded)" : (mode ?? "NO RUN");
  const color = mode === "LIVE" ? "var(--ok)" : mode === "REPLAY" ? "var(--warn)" : "var(--text-muted)";
  const bg = mode === "LIVE" ? "var(--ok-bg)" : mode === "REPLAY" ? "var(--warn-bg)" : "var(--surface-2)";
  return (
    <span
      role="status"
      aria-label={`Run mode: ${label}`}
      className="inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-sm font-bold tracking-wide"
      style={{ borderColor: color, color, background: bg }}
    >
      {mode === "LIVE" && pulsing ? (
        <span className="pulse-dot" aria-hidden="true" />
      ) : (
        <span aria-hidden="true">{mode === "LIVE" ? "●" : mode === "REPLAY" ? "↻" : "○"}</span>
      )}
      {label}
    </span>
  );
}
