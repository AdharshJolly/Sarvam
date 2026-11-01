/**
 * LIVE vs REPLAY choice for the run form. REPLAY is the recorded demo: it costs nothing but only
 * knows one question with an empty scope. LIVE needs provider keys on the server.
 */
import type { Mode } from "@contracts/types";

/** The one question in the committed recording (cache/recorded/MANIFEST.json). */
export const DEMO_QUESTION =
  "Should a company launch an electric scooter subscription service in Bengaluru in 2027?";

/** What the server can run, from GET /api/health. */
export interface ServerModes {
  liveAvailable: boolean;
  defaultMode: Mode;
}

/** The mode the form starts on. Unknown server or no keys: REPLAY, so nothing costs credits by default. */
export function initialMode(server: ServerModes | null, hasDraft: boolean): Mode {
  if (!server || !server.liveAvailable) return "REPLAY";
  if (hasDraft) return "LIVE";
  return server.defaultMode;
}

/** True when a REPLAY run would stop with a replay miss: another question, or any scope set. */
export function isReplayMiss(
  mode: Mode,
  question: string,
  scope: { geography: string; time_horizon: string; constraints: string },
): boolean {
  if (mode !== "REPLAY" || !question.trim()) return false;
  const scoped = [scope.geography, scope.time_horizon, scope.constraints].some((s) => s.trim());
  return question.trim() !== DEMO_QUESTION || scoped;
}
