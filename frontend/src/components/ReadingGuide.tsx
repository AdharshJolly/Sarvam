import { GLOSSARY, READING_GUIDE } from "@contracts/glossary";
import { setReadingMode, useReadingMode } from "../lib/readingMode";
import { StateChip } from "./ui/StateChip";
import { coverageChip } from "./ui/chips";

/**
 * Legend plus the Simple / Detailed switch (decision B-38). Simple shows plain wording only;
 * Detailed adds the technical term (RED, SUFFICIENT_WITH_CAVEATS, ...) beside it.
 */
export function ReadingGuide() {
  const mode = useReadingMode();
  return (
    <details className="border-t border-border-hairline bg-surface-2 px-5 py-3 sm:px-6">
      <summary className="cursor-pointer text-sm font-semibold text-text">How to read these results</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-muted">
        {READING_GUIDE.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(["GREEN", "AMBER", "RED"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-sm text-text-muted">
            <StateChip spec={coverageChip(s)} />
            {GLOSSARY.coverage_state[s].meaning}
          </span>
        ))}
      </div>
      <fieldset className="mt-3 flex items-center gap-3 text-sm">
        <legend className="sr-only">Reading mode</legend>
        <span className="text-text-muted">Show technical terms:</span>
        {(["simple", "detailed"] as const).map((m) => (
          <label key={m} className="flex cursor-pointer items-center gap-1">
            <input type="radio" name="reading-mode" checked={mode === m} onChange={() => setReadingMode(m)} />
            {m === "simple" ? "Hide (simple)" : "Show (detailed)"}
          </label>
        ))}
      </fieldset>
    </details>
  );
}
