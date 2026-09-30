import type {
  AuthResponse,
  ClaimEvidence,
  ReportView,
  Run,
  RunCreate,
  RunState,
  RunSummary,
  UserCreate,
  UserLogin,
  UserPublic,
} from "@contracts/types";
import { env } from "../config/env";
import { apiUrl, routes } from "./url";

/** Typed failure from the API boundary; callers must surface it, never swallow it (NFR-04). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detail: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function detailOf(body: unknown): string | null {
  if (body && typeof body === "object" && "detail" in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (d !== undefined) return JSON.stringify(d);
  }
  return null;
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem("sarvam_token");
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem("sarvam_token", token);
    } else {
      localStorage.removeItem("sarvam_token");
    }
  } catch {
    // localStorage not accessible
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(apiUrl(env.apiBaseUrl, path), {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders, ...init?.headers },
  });
  if (!res.ok) {
    if (res.status === 401 && path !== routes.authLogin()) {
      setStoredToken(null);
    }
    let detail: string | null = null;
    try {
      detail = detailOf(await res.json());
    } catch {
      detail = null; // non-JSON error body: status line is all we have
    }
    throw new ApiError(res.status, detail ?? `${res.status} ${res.statusText}`, detail);
  }
  return (await res.json()) as T;
}

export interface Health {
  status: string;
  service: string;
  version: string;
  env: string;
  db_journal_mode: string;
}

/** The run-facing API surface. The mock implements the same interface (see src/mocks). */
export interface RunApi {
  createRun: (body: RunCreate) => Promise<Run>;
  getRun: (id: string) => Promise<RunSummary>;
  getState: (id: string) => Promise<RunState>;
  getClaim: (id: string, claimId: string) => Promise<ClaimEvidence>;
  getReport: (id: string) => Promise<ReportView>;
  stopRun: (id: string) => Promise<RunSummary>;
  listRuns: () => Promise<Run[]>;
}

export const realApi: RunApi = {
  createRun: (body) => request<Run>(routes.runs(), { method: "POST", body: JSON.stringify(body) }),
  getRun: (id) => request<RunSummary>(routes.run(id)),
  getState: (id) => request<RunState>(routes.state(id)),
  getClaim: (id, cid) => request<ClaimEvidence>(routes.claim(id, cid)),
  getReport: (id) => request<ReportView>(routes.report(id)),
  stopRun: (id) => request<RunSummary>(routes.stop(id), { method: "POST" }),
  listRuns: () => request<Run[]>(routes.runs()),
};

export interface UserUpdateData {
  display_name?: string;
  password?: string;
}

/** Domain shapes come from generated contracts (@contracts/types), never hand-written here. */
export const api = {
  health: () => request<Health>(routes.health()),
  register: (body: UserCreate) =>
    request<AuthResponse>(routes.authRegister(), { method: "POST", body: JSON.stringify(body) }),
  login: (body: UserLogin) =>
    request<AuthResponse>(routes.authLogin(), { method: "POST", body: JSON.stringify(body) }),
  logout: () => request<{ ok: boolean }>(routes.authLogout(), { method: "POST" }),
  me: () => request<UserPublic>(routes.authMe()),
  updateProfile: (body: UserUpdateData) =>
    request<UserPublic>(routes.authMe(), { method: "PATCH", body: JSON.stringify(body) }),
  deleteAccount: () =>
    request<{ ok: boolean }>(routes.authMe(), { method: "DELETE" }),
  listRuns: () => request<Run[]>(routes.runs()),
  stopRun: (id: string) => request<RunSummary>(routes.stop(id), { method: "POST" }),
};

