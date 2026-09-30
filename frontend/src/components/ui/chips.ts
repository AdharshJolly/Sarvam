import type {
  ChallengeOutcome,
  ConflictKind,
  ConflictStatus,
  CoverageState,
  FinalState,
  SourceStatus,
  Verdict,
  RunStatus,
} from "@contracts/types";
import { stateStyle } from "../../lib/format";
import { StatusIconMap } from "./Icon";
import type { IconName } from "./Icon";

export type Tone = "ok" | "warn" | "bad" | "info" | "brand" | "muted";

export interface ChipSpec {
  icon: IconName;
  label: string;
  tone: Tone;
}

const coverageTone: Record<CoverageState, Tone> = { RED: "bad", AMBER: "warn", GREEN: "ok" };

export function coverageChip(state: CoverageState): ChipSpec {
  const s = stateStyle(state);
  return { icon: StatusIconMap[state] || "Info", label: s.label, tone: coverageTone[state] };
}

export function verdictChip(v: Verdict): ChipSpec {
  switch (v) {
    case "supports":
      return { icon: "CheckCircle", label: "supports", tone: "ok" };
    case "partial":
      return { icon: "AlertTriangle", label: "partial", tone: "warn" };
    case "contradicts":
      return { icon: "XOctagon", label: "contradicts", tone: "bad" };
    case "irrelevant":
      return { icon: "Minus", label: "irrelevant", tone: "muted" };
  }
}

export type CertaintyLabel = "supported" | "contested" | "single-origin" | "assumed";

export function certaintyChip(c: CertaintyLabel): ChipSpec {
  switch (c) {
    case "supported":
      return { icon: "CheckCircle", label: "supported", tone: "ok" };
    case "contested":
      return { icon: "Zap", label: "contested", tone: "bad" }; // using Zap for contested/conflict
    case "single-origin":
      return { icon: "AlertTriangle", label: "single origin", tone: "warn" };
    case "assumed":
      return { icon: "HelpCircle", label: "System inference", tone: "muted" };
  }
}

/** Typed failure names (SSOT section 18) and source statuses. */
export function failureChip(name: string): ChipSpec {
  return { icon: "XOctagon", label: name, tone: "bad" };
}

export function sourceStatusChip(s: SourceStatus): ChipSpec {
  switch (s) {
    case "found":
      return { icon: "Search", label: "found", tone: "muted" };
    case "fetched":
      return { icon: "CheckCircle", label: "fetched", tone: "ok" };
    case "SOURCE_UNAVAILABLE":
    case "SOURCE_EMPTY":
      return failureChip(s);
  }
}

export function outcomeChip(o: ChallengeOutcome | null | undefined): ChipSpec {
  switch (o) {
    case "strengthened":
      return { icon: "CheckCircle", label: "strengthened", tone: "ok" };
    case "weakened":
      return { icon: "ArrowDown", label: "weakened", tone: "bad" };
    case "unresolved":
      return { icon: "HelpCircle", label: "unresolved", tone: "warn" };
    default:
      return { icon: "Clock", label: "pending", tone: "muted" };
  }
}

export function conflictStatusChip(s: ConflictStatus): ChipSpec {
  return s === "open"
    ? { icon: "Zap", label: "open", tone: "bad" }
    : { icon: "CheckCircle", label: "explained", tone: "ok" };
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
      return { icon: "CheckCircle", label: "SUFFICIENT", tone: "ok" };
    case "SUFFICIENT_WITH_CAVEATS":
      return { icon: "AlertTriangle", label: "SUFFICIENT WITH CAVEATS", tone: "warn" };
    case "INSUFFICIENT":
      return { icon: "Circle", label: "INSUFFICIENT", tone: "bad" };
  }
}

export function runStatusChip(status: RunStatus | string | undefined): ChipSpec {
  switch (status) {
    case "completed":
      return { icon: "CheckCircle", label: "Completed", tone: "ok" };
    case "running":
      return { icon: "RefreshCw", label: "Running", tone: "brand" };
    case "failed":
      return { icon: "AlertTriangle", label: "Failed", tone: "bad" };
    case "queued":
      return { icon: "Clock", label: "Queued", tone: "info" };
    default:
      return { icon: "Clock", label: status || "Pending", tone: "muted" };
  }
}

