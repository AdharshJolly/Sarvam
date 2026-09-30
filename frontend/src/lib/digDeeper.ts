import type { Scope } from "@contracts/types";

/**
 * "Dig deeper" on a gap (B-38 follow-up). It does not start anything: it carries a focused question
 * to the new-run form, where the person reviews it and presses Start. A follow-up is a new run, so
 * a live run is only ever started by that explicit press. Per-viewer, survives one page hop.
 */
export interface DigDeeperDraft {
  question: string;
  scope: Scope;
  fromRunId: string;
}

const KEY = "sarvam.digDeeperDraft";
const MAX_QUESTION = 2000; // RunCreate.question max_length

/** A question aimed at one gap, keeping the original question as context. */
export function digDeeperQuestion(original: string, keyPoint: string, reason: string): string {
  const head = `What more can be established about "${keyPoint}"? Currently ${reason}. Context: `;
  return (head + original.trim()).slice(0, MAX_QUESTION);
}

export function saveDraft(draft: DigDeeperDraft): void {
  try {
    globalThis.sessionStorage?.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Storage can be blocked; the form then simply opens empty.
  }
}

/** Read without consuming, so a double render (StrictMode) cannot lose it. */
export function peekDraft(): DigDeeperDraft | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<DigDeeperDraft>;
    if (typeof d.question !== "string" || typeof d.fromRunId !== "string") return null;
    return { question: d.question, scope: d.scope ?? {}, fromRunId: d.fromRunId };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    globalThis.sessionStorage?.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
