import { useState } from "react";
import { mockControl } from "../mocks/mockRuntime";
import { SCENARIOS, type ScenarioId } from "../mocks/scenarios";

/** Dev-only scenario picker; rendered only in mock mode. */
export function MockControls({ runId }: { runId: string | null }) {
  const [scenario, setScenario] = useState<ScenarioId>(mockControl.scenario);
  const [eps, setEps] = useState(mockControl.eventsPerSecond);
  return (
    <div className="mock-controls flex flex-wrap items-center gap-3 text-base">
      <label>
        Scenario{" "}
        <select
          value={scenario}
          className="rounded border border-border-hairline bg-surface text-text p-1 focus-visible:outline-brand-secondary"
          onChange={(e) => {
            const id = e.target.value as ScenarioId;
            setScenario(id);
            mockControl.setScenario(id);
          }}
        >
          {SCENARIOS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Speed{" "}
        <select
          value={eps}
          className="rounded border border-border-hairline bg-surface text-text p-1 focus-visible:outline-brand-secondary"
          onChange={(e) => {
            const n = Number(e.target.value);
            setEps(n);
            mockControl.setSpeed(n);
          }}
        >
          {[2, 6, 15, 40].map((n) => (
            <option key={n} value={n}>
              {n} events/s
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="rounded border border-border-hairline px-2 py-1 hover:bg-surface-2 transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
        disabled={!runId}
        onClick={() => runId && mockControl.skipToEnd(runId)}
      >
        Skip to end
      </button>
    </div>
  );
}
