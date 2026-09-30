import { GLOSSARY } from "@contracts/glossary";
import type { CoverageCell, CoverageState } from "@contracts/types";

export interface GapText {
  /** Full plain sentence: what is missing and why ("only one independent source, so it is partly supported"). */
  reason: string;
  /** What a reader can do about it. */
  next_step: string;
}

/**
 * Plain-English reason and next step for one non-green cell. Mirrors `gap_text` in
 * contracts/glossary.py; both are checked against the generated GAP_CASES so they cannot drift.
 * Built from stored cell fields only, never by parsing the raw reason string.
 */
export function gapText(
  state: CoverageState,
  origins: number,
  claims: number,
  conflicts: number,
): GapText {
  const cov = GLOSSARY.coverage_state[state];
  let why: string;
  let step: string;
  if (claims === 0 && origins === 0 && conflicts === 0) {
    why = "no usable evidence was found";
    step = cov.next_step;
  } else if (conflicts > 0) {
    why = "sources disagree and the difference is not yet explained";
    step = GLOSSARY.conflict_status.open.next_step;
  } else if (origins <= 1) {
    why = "only one independent source";
    step = GLOSSARY.certainty["single-origin"].next_step;
  } else {
    why = "the sources found only partly back this point";
    step = cov.next_step;
  }
  return {
    reason: `${why}, so ${state === "AMBER" ? "it is " : "there is "}${cov.label.toLowerCase()}`,
    next_step: step,
  };
}

/** Gap text for a stored cell, or for a slot that has no cell yet. */
export function gapTextForCell(cell: CoverageCell | undefined): GapText {
  if (!cell) return gapText("RED", 0, 0, 0);
  return gapText(
    cell.state,
    cell.independent_origins ?? 0,
    cell.supporting_claims ?? 0,
    cell.open_conflicts ?? 0,
  );
}
