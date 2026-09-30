// Writes each mock scenario's Event[] to src/mocks/data/<scenario>.json so the Python drift guard
// (tests/unit/test_frontend_mocks.py) can validate them against contracts.events.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SCENARIOS, buildScenario } from "../src/mocks/scenarios";

const dir = fileURLToPath(new URL("../src/mocks/data/", import.meta.url));
mkdirSync(dir, { recursive: true });
for (const s of SCENARIOS) {
  const { events } = buildScenario(s.id);
  writeFileSync(`${dir}${s.id}.json`, `${JSON.stringify(events, null, 2)}\n`, "utf8");
  console.log(`wrote ${s.id}.json (${events.length} events)`);
}
