import { useCallback } from "react";
import type { StopGap } from "../components/StopCard";
import { digDeeperQuestion, saveDraft } from "../lib/digDeeper";
import { useSession } from "./useRunSession";

/** Handler for the "Dig deeper" button: prefill the new-run form from a gap, then open it. */
export function useDigDeeper(): ((gap: StopGap) => void) | undefined {
  const { view, runId, newRun } = useSession();
  const run = view.run;
  const open = useCallback(
    (gap: StopGap) => {
      if (!run || !runId) return;
      saveDraft({
        question: digDeeperQuestion(run.question, gap.name, gap.reason),
        scope: run.scope ?? {},
        fromRunId: runId,
      });
      newRun();
    },
    [run, runId, newRun],
  );
  return run ? open : undefined;
}
