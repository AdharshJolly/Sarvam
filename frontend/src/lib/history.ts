/**
 * Run history helpers. The history itself lives on the server (GET /api/runs, newest first, paged);
 * these pure functions shape what the history page and the workspace show.
 */
import type { FinalState, Run } from "@contracts/types";
import { gloss } from "../components/ui/chips";

export const HISTORY_PAGE_SIZE = 25;

/** The list with the next page after it. A run already listed is skipped: a run started meanwhile shifts the offsets. */
export function appendPage(current: readonly Run[], page: readonly Run[]): Run[] {
  const seen = new Set(current.map((r) => r.id));
  return [...current, ...page.filter((r) => !seen.has(r.id))];
}

/** A full page means the server may have more; a short page is the last one. */
export function hasMore(pageLength: number, pageSize: number = HISTORY_PAGE_SIZE): boolean {
  return pageLength >= pageSize;
}

export interface RunOutcome {
  state: FinalState;
  /** Plain-language stop reason from the glossary, or null when none was recorded. */
  reason: string | null;
}

/** The stop decision of a finished run, or null while it has none. */
export function runOutcome(run: Run): RunOutcome | null {
  if (!run.stop_state) return null;
  const reason = run.termination_reason ? gloss("termination_reason", run.termination_reason).label : null;
  return { state: run.stop_state, reason };
}

/** Runs whose question or id contains the query (case-insensitive). */
export function filterRuns(runs: readonly Run[], query: string): Run[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...runs];
  return runs.filter((r) => r.id.toLowerCase().includes(q) || r.question.toLowerCase().includes(q));
}
