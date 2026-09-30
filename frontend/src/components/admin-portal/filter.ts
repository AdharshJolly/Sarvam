import type { AdminRunRow, AdminUserRow } from "@contracts/types";

const norm = (s: string) => s.trim().toLowerCase();

/** Client-side search over an already-loaded page of runs (id, question, owner). */
export function filterRuns(rows: readonly AdminRunRow[], query: string): AdminRunRow[] {
  const q = norm(query);
  if (!q) return [...rows];
  return rows.filter((r) =>
    [r.id, r.question, r.user_email ?? ""].some((f) => f.toLowerCase().includes(q)),
  );
}

export function filterUsers(rows: readonly AdminUserRow[], query: string): AdminUserRow[] {
  const q = norm(query);
  if (!q) return [...rows];
  return rows.filter((u) =>
    [u.id, u.email, u.display_name].some((f) => f.toLowerCase().includes(q)),
  );
}
