/**
 * Hash routes: `#/run/<id>` and `#/run/<id>/<tab>`.
 *
 * The run id and the active tab live in one hash so a reload or a shared link restores both. There
 * is no router dependency: the app has one view per run plus a landing screen.
 */

export const TAB_IDS = ["matrix", "evidence", "conflicts", "challenge", "report"] as const;
export type TabId = (typeof TAB_IDS)[number];
export const DEFAULT_TAB: TabId = "matrix";

export type PageId =
  | "landing"
  | "workspace"
  | "run"
  | "signin"
  | "register"
  | "account"
  | "admin"
  | "privacy"
  | "terms"
  | "cookies";

export interface Route {
  runId: string | null;
  tab: TabId;
}

const RUN_ROUTE = /^#\/run\/([^/?#]+)(?:\/([^/?#]+))?/;

function isTab(value: string | undefined): value is TabId {
  return value !== undefined && (TAB_IDS as readonly string[]).includes(value);
}

export function getRoutePage(hash: string): PageId {
  if (hash.startsWith("#/signin")) return "signin";
  if (hash.startsWith("#/register")) return "register";
  if (hash.startsWith("#/account")) return "account";
  if (hash.startsWith("#/workspace") || hash.startsWith("#/new")) return "workspace";
  if (hash.startsWith("#/history") || hash.startsWith("#/admin")) return "admin";
  if (hash.startsWith("#/privacy")) return "privacy";
  if (hash.startsWith("#/terms")) return "terms";
  if (hash.startsWith("#/cookies")) return "cookies";
  const m = RUN_ROUTE.exec(hash);
  if (m?.[1]) return "run";
  return "landing";
}


/** Parse a location hash. Unknown or missing tabs fall back to the default tab. */
export function parseRoute(hash: string): Route {
  const m = RUN_ROUTE.exec(hash);
  if (!m?.[1]) return { runId: null, tab: DEFAULT_TAB };
  let runId: string;
  try {
    runId = decodeURIComponent(m[1]);
  } catch {
    return { runId: null, tab: DEFAULT_TAB }; // malformed escape in a hand-edited URL
  }
  return { runId, tab: isTab(m[2]) ? m[2] : DEFAULT_TAB };
}

/** The hash for a run and tab. The default tab is omitted so plain run links stay short. */
export function buildHash(runId: string, tab: TabId = DEFAULT_TAB): string {
  const base = `#/run/${encodeURIComponent(runId)}`;
  return tab === DEFAULT_TAB ? base : `${base}/${tab}`;
}
