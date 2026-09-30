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
          className="rounded border p-1"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
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
          className="rounded border p-1"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
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
        className="rounded border px-2 py-1"
        style={{ borderColor: "var(--border)" }}
        disabled={!runId}
        onClick={() => runId && mockControl.skipToEnd(runId)}
      >
        Skip to end
      </button>
    </div>
  );
}
