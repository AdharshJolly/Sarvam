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
import { GLOSSARY, type GlossaryTable } from "@contracts/glossary";
import { stateStyle } from "../../lib/format";
import { StatusIconMap } from "./Icon";
import type { IconName } from "./Icon";

export type Tone = "ok" | "warn" | "bad" | "info" | "brand" | "muted";

export interface ChipSpec {
  icon: IconName;
  /** Plain-language label (contracts/glossary.py), always shown. */
  label: string;
  tone: Tone;
  /** The technical term, shown beside the label in Detailed reading mode. */
  raw?: string;
  /** One-line meaning, exposed as the chip's tooltip. */
  hint?: string;
}

/** Plain wording for an enum value; an unknown value falls back to itself rather than hiding it. */
export function gloss(table: GlossaryTable, key: string): { label: string; meaning: string; next_step: string } {
  const rows = GLOSSARY[table] as Record<string, { label: string; meaning: string; next_step: string }>;
  return rows[key] ?? { label: key, meaning: "", next_step: "" };
}

function chip(table: GlossaryTable, key: string, icon: IconName, tone: Tone, raw?: string): ChipSpec {
  const g = gloss(table, key);
  return { icon, label: g.label, tone, raw: raw ?? key, hint: g.meaning };
}

const coverageTone: Record<CoverageState, Tone> = { RED: "bad", AMBER: "warn", GREEN: "ok" };

export function coverageChip(state: CoverageState): ChipSpec {
  const s = stateStyle(state);
  return { ...chip("coverage_state", state, StatusIconMap[state] || "Info", coverageTone[state]), label: s.label };
}

export function verdictChip(v: Verdict): ChipSpec {
  switch (v) {
    case "supports":
      return chip("verdict", v, "CheckCircle", "ok");
    case "partial":
      return chip("verdict", v, "AlertTriangle", "warn");
    case "contradicts":
      return chip("verdict", v, "XOctagon", "bad");
    case "irrelevant":
      return chip("verdict", v, "Minus", "muted");
  }
}

export type CertaintyLabel = "supported" | "contested" | "single-origin" | "assumed";

export function certaintyChip(c: CertaintyLabel): ChipSpec {
  switch (c) {
    case "supported":
      return chip("certainty", c, "CheckCircle", "ok");
    case "contested":
      return chip("certainty", c, "Zap", "bad"); // Zap marks conflict
    case "single-origin":
      return chip("certainty", c, "AlertTriangle", "warn");
    case "assumed":
      return chip("certainty", c, "HelpCircle", "muted");
  }
}

/** Typed failure names (SSOT section 18) and source statuses. */
export function failureChip(name: string): ChipSpec {
  return chip("failure", name, "XOctagon", "bad");
}

export function sourceStatusChip(s: SourceStatus): ChipSpec {
  switch (s) {
    case "found":
      return chip("source_status", s, "Search", "muted");
    case "fetched":
      return chip("source_status", s, "CheckCircle", "ok");
    case "SOURCE_UNAVAILABLE":
    case "SOURCE_EMPTY":
      return chip("source_status", s, "XOctagon", "bad");
  }
}

export function outcomeChip(o: ChallengeOutcome | null | undefined): ChipSpec {
  switch (o) {
    case "strengthened":
      return chip("challenge_outcome", o, "CheckCircle", "ok");
    case "weakened":
      return chip("challenge_outcome", o, "ArrowDown", "bad");
    case "unresolved":
      return chip("challenge_outcome", o, "HelpCircle", "warn");
    default:
      return chip("challenge_outcome", "pending", "Clock", "muted");
  }
}

export function conflictStatusChip(s: ConflictStatus): ChipSpec {
  return s === "open" ? chip("conflict_status", s, "Zap", "bad") : chip("conflict_status", s, "CheckCircle", "ok");
}

/** Label plus one-sentence meaning, e.g. "Different units. The sources use different units...". */
export const conflictKindText = Object.fromEntries(
  (Object.keys(GLOSSARY.conflict_kind) as ConflictKind[]).map((k) => {
    const g = gloss("conflict_kind", k);
    return [k, `${g.label}. ${g.meaning}`];
  }),
) as Record<ConflictKind, string>;

export function finalStateChip(f: FinalState): ChipSpec {
  switch (f) {
    case "SUFFICIENT":
      return chip("final_state", f, "CheckCircle", "ok");
    case "SUFFICIENT_WITH_CAVEATS":
      return chip("final_state", f, "AlertTriangle", "warn");
    case "INSUFFICIENT":
      return chip("final_state", f, "Circle", "bad");
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

