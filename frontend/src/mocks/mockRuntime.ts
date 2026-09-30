import type {
  BudgetUsage,
  ClaimEvidence,
  Event,
  Run,
  RunCreate,
  RunState,
  RunSummary,
} from "@contracts/types";
import { ApiError, type RunApi } from "../api/client";
import type { ConnectionState, OpenStream } from "../api/sse";
import { type RunView, initialView, reduceAll } from "../state/runStore";
import { type Scenario, type ScenarioId, SCENARIOS, buildScenario } from "./scenarios";

/** In-browser stand-in for the backend: same RunApi and stream interfaces, scripted from typed fixtures. */

interface MockRun {
  scenario: Scenario;
  events: Event[];
  played: number;
  timer: ReturnType<typeof setInterval> | null;
  listeners: Set<(e: Event) => void>;
  stopped: boolean;
}

const runs = new Map<string, MockRun>();
let counter = 0;

export const mockControl = {
  scenario: "complete" as ScenarioId,
  eventsPerSecond: 6,
  setScenario(id: ScenarioId) {
    mockControl.scenario = id;
  },
  setSpeed(eps: number) {
    mockControl.eventsPerSecond = eps;
    for (const r of runs.values()) if (r.timer) restart(r);
  },
  skipToEnd(runId: string) {
    const r = runs.get(runId);
    if (!r) return;
    while (r.played < r.events.length) step(r);
  },
};

function step(r: MockRun) {
  if (r.played >= r.events.length) {
    if (r.timer) clearInterval(r.timer);
    r.timer = null;
    return;
  }
  const e = r.events[r.played];
  r.played += 1;
  if (e) for (const l of r.listeners) l(e);
  if (r.played >= r.events.length && r.timer) {
    clearInterval(r.timer);
    r.timer = null;
  }
}

function restart(r: MockRun) {
  if (r.timer) clearInterval(r.timer);
  r.timer = setInterval(() => step(r), Math.max(20, 1000 / mockControl.eventsPerSecond));
}

function startRun(scenario: Scenario, playedAll: boolean): MockRun {
  const r: MockRun = {
    scenario,
    events: [...scenario.events],
    played: playedAll ? scenario.events.length : 0,
    timer: null,
    listeners: new Set(),
    stopped: false,
  };
  runs.set(scenario.runId, r);
  if (!playedAll) restart(r);
  return r;
}

function ensureRun(id: string): MockRun {
  const existing = runs.get(id);
  if (existing) return existing;
  const m = /^mock-(.+)-(\d+)$/.exec(id);
  const sc = m ? SCENARIOS.find((s) => s.id === m[1]) : undefined;
  if (!sc || !m) throw new ApiError(404, "404 Not Found", `Unknown run ${id}`);
  return startRun(buildScenario(sc.id, Number(m[2])), true); // reload: show the finished run
}

function baseRun(r: MockRun): Run {
  const started = r.events[0];
  const p = (started?.payload ?? {}) as { question?: string; mode?: Run["mode"]; budget?: Run["budget"] };
  return {
    id: r.scenario.runId,
    question: p.question ?? r.scenario.question,
    scope: {},
    mode: p.mode ?? "LIVE",
    budget: p.budget ?? {},
    status: r.played === 0 ? "queued" : "running",
    stop_state: null,
    termination_reason: null,
    started_at: started?.ts ?? new Date().toISOString(),
    ended_at: null,
  };
}

function viewOf(r: MockRun): RunView {
  return reduceAll(r.events.slice(0, r.played), { ...initialView, run: baseRun(r) });
}

function usageOf(r: MockRun): BudgetUsage {
  const played = r.events.slice(0, r.played);
  const first = played[0];
  const last = played[played.length - 1];
  return {
    searches: played.filter((e) => e.type === "task.started").length,
    fetches: played.filter((e) => e.type === "source.fetched" || e.type === "source.failed").length,
    llm_calls: played.filter((e) => (e.tokens ?? 0) > 0).length,
    cost_usd: played.reduce((n, e) => n + (e.cost_usd ?? 0), 0),
    elapsed_seconds: first && last ? (Date.parse(last.ts) - Date.parse(first.ts)) / 1000 + 4 : 0,
  };
}

function summaryOf(r: MockRun): RunSummary {
  const v = viewOf(r);
  return { run: v.run ?? baseRun(r), phase: v.phase, usage: usageOf(r), stop: v.stop };
}

function stateOf(r: MockRun): RunState {
  const v = viewOf(r);
  const cells = Object.values(v.coverageByRound).flat();
  return {
    run: v.run ?? baseRun(r),
    phase: v.phase,
    plan: v.plan,
    tasks: Object.values(v.tasks),
    sources: Object.values(v.sources),
    origins: Object.values(v.origins),
    claims: Object.values(v.claims),
    conflicts: Object.values(v.conflicts),
    coverage: cells,
    rollups: Object.entries(v.rollupsByRound).map(([round, rollups]) => ({ round: Number(round), rollups })),
    challenges: Object.values(v.challenges),
    stop: v.stop,
    report_version: v.reportVersion,
    last_event_id: r.played,
  };
}

function claimEvidence(r: MockRun, claimId: string): ClaimEvidence {
  const v = viewOf(r);
  const claim = v.claims[claimId];
  if (!claim) throw new ApiError(404, "404 Not Found", `Unknown claim ${claimId}`);
  const passage = r.scenario.passages[claim.passage_id];
  const source = passage ? v.sources[passage.source_id] : undefined;
  if (!passage || !source) throw new ApiError(404, "404 Not Found", `No stored passage for ${claimId}`);
  const at = passage.text.indexOf(claim.quote);
  const origin = source.origin_id ? (v.origins[source.origin_id] ?? null) : null;
  return {
    claim,
    passage,
    quote_start: at >= 0 ? at : null,
    quote_end: at >= 0 ? at + claim.quote.length : null,
    source,
    origin,
    verdict: v.verdicts[claimId] ?? null,
    verdict_rationale: v.verdicts[claimId]
      ? (r.events.find((e) => e.type === "claim.verified" && (e.payload as { claim_id?: string })?.claim_id === claimId)
          ?.payload as { rationale?: string } | undefined)?.rationale ?? ""
      : "",
    independence: !origin || origin.method === "none" ? "unestablished" : "established",
  };
}

export const mockApi: RunApi = {
  async createRun(body: RunCreate): Promise<Run> {
    if (!body.question.trim()) throw new ApiError(422, "422", "question must not be blank");
    counter += 1;
    const r = startRun(buildScenario(mockControl.scenario, counter), false);
    return baseRun(r);
  },
  async getRun(id) {
    return summaryOf(ensureRun(id));
  },
  async getState(id) {
    return stateOf(ensureRun(id));
  },
  async getClaim(id, cid) {
    return claimEvidence(ensureRun(id), cid);
  },
  async getReport(id) {
    const r = ensureRun(id);
    const at = r.scenario.reportAtEvent;
    if (!r.scenario.report || at === null || r.played < at)
      throw new ApiError(404, "404 Not Found", "No report exists yet");
    return r.scenario.report;
  },
  async stopRun(id) {
    const r = ensureRun(id);
    if (r.played >= r.events.length) throw new ApiError(409, "409 Conflict", "Run is not running");
    // Cut the script short and append a user_stopped wrap-up.
    const played = r.events.slice(0, r.played);
    const last = played[played.length - 1];
    let nextId = (last?.id ?? 0) + 1;
    const mk = (type: Event["type"], payload: object): Event => ({
      id: nextId++,
      run_id: id,
      ts: new Date(Date.parse(last?.ts ?? new Date().toISOString()) + 1000).toISOString(),
      round: last?.round ?? 0,
      type,
      step_ms: null,
      tokens: null,
      cost_usd: null,
      payload: payload as Record<string, unknown>,
    });
    r.events = [
      ...played,
      mk("phase.entered", { phase: "STOP_POLICY", reason: "Stopped by user; wrapping up with the evidence in hand" }),
      mk("stop.decided", {
        decision: {
          state: "INSUFFICIENT",
          termination_reason: "user_stopped",
          critical_slots: { green: 0, amber: 0, red: 0 },
          open_conflicts: 0,
          challenge_rounds_completed: 0,
          caveats: ["The run was stopped before the analysis finished."],
        },
      }),
      mk("run.completed", { stop_state: "INSUFFICIENT", termination_reason: "user_stopped" }),
    ];
    r.stopped = true;
    restart(r);
    return summaryOf(r);
  },
};

export const openMockStream: OpenStream = (runId, handlers, after = 0) => {
  let r: MockRun;
  try {
    r = ensureRun(runId);
  } catch {
    handlers.onState?.("closed");
    return { close: () => undefined };
  }
  const run = r;
  const emitState = (s: ConnectionState) => handlers.onState?.(s);
  emitState("connecting");
  queueMicrotask(() => {
    emitState("open");
    for (const e of run.events.slice(0, run.played)) if (e.id > after) handlers.onEvent(e);
    run.listeners.add(handlers.onEvent);
  });
  return {
    close: () => {
      run.listeners.delete(handlers.onEvent);
      emitState("closed");
    },
  };
};
