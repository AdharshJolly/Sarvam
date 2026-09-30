import { GLOSSARY } from "@contracts/glossary";
import type { Phase } from "@contracts/types";
import type { ReadingMode } from "./readingMode";

/** Plain name of a lifecycle step ("Checking quotes"); an unknown value is shown as given. */
export function phaseName(p: Phase): string {
  const rows = GLOSSARY.phase as Record<string, { label: string }>;
  return rows[p]?.label ?? p;
}

export function phaseHint(p: Phase): string {
  const rows = GLOSSARY.phase as Record<string, { meaning: string }>;
  return rows[p]?.meaning ?? "";
}

/**
 * Activity-timeline label for an event type. Simple mode reads the plain glossary wording; Detailed
 * keeps the technical uppercase form ("CLAIM VERIFIED") so the log can be matched to the event names.
 */
export function eventLabel(type: string, mode: ReadingMode): string {
  const rows = GLOSSARY.event as Record<string, { label: string }>;
  if (mode === "detailed" || !rows[type]) return type.replace(/[._]/g, " ").toUpperCase();
  return rows[type].label;
}

export function eventHint(type: string): string {
  const rows = GLOSSARY.event as Record<string, { meaning: string }>;
  return rows[type]?.meaning ?? "";
}
