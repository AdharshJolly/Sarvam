import type {
  ChallengeOutcome,
  ConflictKind,
  ConflictStatus,
  CoverageState,
  FinalState,
  SourceStatus,
  Verdict,
} from "@contracts/types";
import { stateStyle } from "../../lib/format";

export type Tone = "ok" | "warn" | "bad" | "info" | "muted";

export interface ChipSpec {
  icon: string;
  label: string;
  tone: Tone;
}

export const toneBg: Record<Tone, string> = {
  ok: "var(--ok-bg)",
  warn: "var(--warn-bg)",
  bad: "var(--bad-bg)",
  info: "var(--accent-bg)",
  muted: "var(--surface-2)",
};

export const toneVar: Record<Tone, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  bad: "var(--bad)",
  info: "var(--accent)",
  muted: "var(--text-muted)",
};

const coverageTone: Record<CoverageState, Tone> = { RED: "bad", AMBER: "warn", GREEN: "ok" };

export function coverageChip(state: CoverageState): ChipSpec {
  const s = stateStyle(state);
  return { icon: s.icon, label: s.label, tone: coverageTone[state] };
}

export function verdictChip(v: Verdict): ChipSpec {
  switch (v) {
    case "supports":
      return { icon: "✓", label: "supports", tone: "ok" };
    case "partial":
      return { icon: "▲", label: "partial", tone: "warn" };
    case "contradicts":
      return { icon: "✕", label: "contradicts", tone: "bad" };
    case "irrelevant":
      return { icon: "—", label: "irrelevant", tone: "muted" };
  }
}

export type CertaintyLabel = "supported" | "contested" | "single-origin" | "assumed";

export function certaintyChip(c: CertaintyLabel): ChipSpec {
  switch (c) {
    case "supported":
      return { icon: "✓", label: "supported", tone: "ok" };
    case "contested":
      return { icon: "⚡", label: "contested", tone: "bad" };
    case "single-origin":
      return { icon: "▲", label: "single origin", tone: "warn" };
    case "assumed":
      return { icon: "?", label: "System inference", tone: "muted" };
  }
}

/** Typed failure names (SSOT section 18) and source statuses. */
export function failureChip(name: string): ChipSpec {
  return { icon: "✕", label: name, tone: "bad" };
}

export function sourceStatusChip(s: SourceStatus): ChipSpec {
  switch (s) {
    case "found":
      return { icon: "·", label: "found", tone: "muted" };
    case "fetched":
      return { icon: "✓", label: "fetched", tone: "ok" };
    case "SOURCE_UNAVAILABLE":
    case "SOURCE_EMPTY":
      return failureChip(s);
  }
}

export function outcomeChip(o: ChallengeOutcome | null | undefined): ChipSpec {
  switch (o) {
    case "strengthened":
      return { icon: "✓", label: "strengthened", tone: "ok" };
    case "weakened":
      return { icon: "▼", label: "weakened", tone: "bad" };
    case "unresolved":
      return { icon: "?", label: "unresolved", tone: "warn" };
    default:
      return { icon: "·", label: "pending", tone: "muted" };
  }
}

export function conflictStatusChip(s: ConflictStatus): ChipSpec {
  return s === "open"
    ? { icon: "⚡", label: "open", tone: "bad" }
    : { icon: "✓", label: "explained", tone: "ok" };
}

export const conflictKindText: Record<ConflictKind, string> = {
  unit_error: "unit mismatch (e.g. per day vs per month)",
  scope_difference: "different scope",
  temporal: "different time period",
  definition: "different definition",
  genuine: "genuine disagreement",
};

export function finalStateChip(f: FinalState): ChipSpec {
  switch (f) {
    case "SUFFICIENT":
      return { icon: "✓", label: "SUFFICIENT", tone: "ok" };
    case "SUFFICIENT_WITH_CAVEATS":
      return { icon: "▲", label: "SUFFICIENT WITH CAVEATS", tone: "warn" };
    case "INSUFFICIENT":
      return { icon: "○", label: "INSUFFICIENT", tone: "bad" };
  }
}
