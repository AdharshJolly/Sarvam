/** Operator-console hash routes: `#/admin`, `#/admin/<section>`, `#/admin/runs/<runId>`. */

export const ADMIN_SECTIONS = [
  "overview",
  "runs",
  "users",
  "costs",
  "activity",
  "audit",
  "health",
  "settings",
] as const;
export type AdminSection = (typeof ADMIN_SECTIONS)[number];
export const DEFAULT_ADMIN_SECTION: AdminSection = "overview";

export interface AdminRoute {
  section: AdminSection;
  runId: string | null;
}

const ADMIN_ROUTE = /^#\/admin(?:\/([^/?#]+))?(?:\/([^/?#]+))?/;

function isSection(value: string | undefined): value is AdminSection {
  return value !== undefined && (ADMIN_SECTIONS as readonly string[]).includes(value);
}

/** Unknown sections fall back to the overview; a run id is only read under `runs`. */
export function parseAdminRoute(hash: string): AdminRoute {
  const m = ADMIN_ROUTE.exec(hash);
  if (!m || !isSection(m[1])) return { section: DEFAULT_ADMIN_SECTION, runId: null };
  if (m[1] !== "runs" || !m[2]) return { section: m[1], runId: null };
  try {
    return { section: "runs", runId: decodeURIComponent(m[2]) };
  } catch {
    return { section: "runs", runId: null }; // malformed escape in a hand-edited URL
  }
}

export function buildAdminHash(section: AdminSection, runId?: string): string {
  if (section === "runs" && runId) return `#/admin/runs/${encodeURIComponent(runId)}`;
  return section === DEFAULT_ADMIN_SECTION ? "#/admin" : `#/admin/${section}`;
}
