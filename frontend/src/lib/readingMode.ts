import { useSyncExternalStore } from "react";

/** Simple shows plain wording only; Detailed adds the technical term beside it (B-38). */
export type ReadingMode = "simple" | "detailed";

const KEY = "sarvam.readingMode";
const listeners = new Set<() => void>();
let mode: ReadingMode = "simple";

try {
  if (globalThis.localStorage?.getItem(KEY) === "detailed") mode = "detailed";
} catch {
  // Storage can be blocked; the default applies.
}

export function getReadingMode(): ReadingMode {
  return mode;
}

export function setReadingMode(next: ReadingMode): void {
  mode = next;
  try {
    globalThis.localStorage?.setItem(KEY, next);
  } catch {
    // A per-viewer convenience only; ignore storage failures.
  }
  listeners.forEach((l) => l());
}

export function useReadingMode(): ReadingMode {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getReadingMode,
    () => "simple",
  );
}

/** Simple mode keeps the full coverage grid behind "Show details"; Detailed mode always shows it. */
export function showsCoverageGrid(mode: ReadingMode, expanded: boolean): boolean {
  return mode === "detailed" || expanded;
}
