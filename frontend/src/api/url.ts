/** Pure URL builders for the API surface in SSOT section 11. */
const API_PREFIX = "/api";

export function apiUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${API_PREFIX}${p}`;
}

export const routes = {
  health: () => "/health",
  authRegister: () => "/auth/register",
  authLogin: () => "/auth/login",
  authLogout: () => "/auth/logout",
  authMe: () => "/auth/me",
  authUsage: () => "/auth/me/usage",
  runs: () => "/runs",
  run: (id: string) => `/runs/${encodeURIComponent(id)}`,
  events: (id: string) => `/runs/${encodeURIComponent(id)}/events`,
  state: (id: string) => `/runs/${encodeURIComponent(id)}/state`,
  claim: (id: string, cid: string) =>
    `/runs/${encodeURIComponent(id)}/claims/${encodeURIComponent(cid)}`,
  report: (id: string) => `/runs/${encodeURIComponent(id)}/report`,
  stop: (id: string) => `/runs/${encodeURIComponent(id)}/stop`,
  adminOverview: () => "/admin/overview",
  adminRuns: () => "/admin/runs",
  adminRun: (id: string) => `/admin/runs/${encodeURIComponent(id)}`,
  adminUsers: () => "/admin/users",
  adminCosts: () => "/admin/costs",
  adminActivity: () => "/admin/activity",
  adminHealth: () => "/admin/health",
  adminUser: (id: string) => `/admin/users/${encodeURIComponent(id)}`,
  adminRunStop: (id: string) => `/admin/runs/${encodeURIComponent(id)}/stop`,
  adminSettings: () => "/admin/settings",
  adminAudit: () => "/admin/audit",
  adminExportRuns: () => "/admin/export/runs.csv",
  adminExportCosts: () => "/admin/export/costs.csv",
} as const;
