/**
 * Recent runs, kept in localStorage so the landing screen can offer them again. Purely a convenience:
 * every read is validated (a corrupted value yields an empty list) and every write is best effort.
 */

export interface HistoryEntry {
  id: string;
  question: string;
  startedAt: string;
  mode: string;
}

export const HISTORY_KEY = "sarvam-runs";
export const HISTORY_MAX = 20;

function isEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id.length > 0 &&
    typeof v.question === "string" &&
    typeof v.startedAt === "string" &&
    typeof v.mode === "string"
  );
}

/** Parse a stored value. Anything that is not an array of well-formed entries is dropped, never thrown. */
export function parseHistory(raw: string | null | undefined): HistoryEntry[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? data.filter(isEntry).slice(0, HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

/** The list with `entry` first. A run already in the list moves to the front instead of repeating. */
export function withEntry(list: readonly HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [entry, ...list.filter((e) => e.id !== entry.id)].slice(0, HISTORY_MAX);
}

export function readHistory(): HistoryEntry[] {
  try {
    return parseHistory(localStorage.getItem(HISTORY_KEY));
  } catch {
    return []; // storage blocked
  }
}

export function addHistory(entry: HistoryEntry): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(withEntry(readHistory(), entry)));
  } catch {
    // Storage unavailable: the run itself is unaffected.
  }
}
