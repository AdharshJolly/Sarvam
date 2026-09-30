import { env } from "../config/env";
import { apiUrl, routes } from "./url";

/** Typed failure from the API boundary; callers must surface it, never swallow it (NFR-04). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(env.apiBaseUrl, path), {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export interface Health {
  status: string;
  service: string;
  version: string;
  env: string;
  db_journal_mode: string;
}

/** Domain shapes come from generated contracts (@contracts/types), never hand-written here. */
export const api = {
  health: () => request<Health>(routes.health()),
};
