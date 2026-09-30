import type { CoverageState } from "@contracts/types";

export function formatUsd(v: number): string {
  return `$${v.toFixed(v < 1 ? 3 : 2)}`;
}

export function formatSeconds(s: number): string {
  const total = Math.max(0, Math.round(s));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export type AgeBucket = "under 12 months" | "12 to 36 months" | "over 36 months" | "date unknown";

/** Freshness badge only (SSOT 9.2); never used in scoring. */
export function ageBucket(publishedAt: string | null | undefined, now: Date): AgeBucket {
  if (!publishedAt) return "date unknown";
  const t = Date.parse(publishedAt);
  if (Number.isNaN(t)) return "date unknown";
  const months = (now.getTime() - t) / (1000 * 60 * 60 * 24 * 30.4375);
  if (months < 12) return "under 12 months";
  if (months <= 36) return "12 to 36 months";
  return "over 36 months";
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function stateStyle(state: CoverageState): { icon: string; label: string; colorVar: string } {
  switch (state) {
    case "RED":
      return { icon: "✕", label: "RED", colorVar: "var(--bad)" };
    case "AMBER":
      return { icon: "▲", label: "AMBER", colorVar: "var(--warn)" };
    case "GREEN":
      return { icon: "✓", label: "GREEN", colorVar: "var(--ok)" };
  }
}

/** Only http(s) URLs may become links; anything else (javascript:, data:) is rendered as plain text. */
export function safeHref(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}
