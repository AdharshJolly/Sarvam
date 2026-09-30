import type {
  BudgetUsage,
  BudgetWarningPayload,
  Challenge,
  ChallengeCreatedPayload,
  ChallengeOutcomePayload,
  Claim,
  ClaimCreatedPayload,
  ClaimRejectedPayload,
  ClaimVerifiedPayload,
  ConflictDetectedPayload,
  Conflict,
  CoverageCell,
  CoverageUpdatedPayload,
  DimensionRollup,
  Event,
  FailureType,
  Origin,
  OriginUpdatedPayload,
  PassagesCreatedPayload,
  PhaseEnteredPayload,
  Phase,
  Plan,
  PlanCreatedPayload,
  ReportDraftPayload,
  ReportVerifiedPayload,
  Run,
  RunCompletedPayload,
  RunFailedPayload,
  RunStartedPayload,
  RunState,
  RunSummary,
  RoundStartedPayload,
  Source,
  SourceFailedPayload,
  SourceFetchedPayload,
  SourceFoundPayload,
  StopDecidedPayload,
  StopDecision,
  Task,
  TaskStartedPayload,
  Verdict,
} from "@contracts/types";
import type { ConnectionState } from "../api/sse";

export type TimelineKind = "phase" | "source" | "claim" | "assurance" | "failure" | "other";

export interface TimelineItem {
  id: number;
  ts: string;
  type: Event["type"];
  round: number;
  text: string;
  kind: TimelineKind;
  stepMs: number | null;
  tokens: number | null;
  costUsd: number | null;
  claimId?: string;
  sourceId?: string;
  failure?: FailureType;
}

export interface RunView {
  run: Run | null;
  phase: Phase | null;
  nowReason: string;
  plan: Plan | null;
  tasks: Record<string, Task>;
  sources: Record<string, Source>;
  passageCounts: Record<string, number>;
  claims: Record<string, Claim>;
  rejectedClaims: ClaimRejectedPayload[];
  verdicts: Record<string, Verdict>;
  origins: Record<string, Origin>;
  conflicts: Record<string, Conflict>;
  coverageByRound: Record<number, CoverageCell[]>;
  rollupsByRound: Record<number, DimensionRollup[]>;
  challenges: Record<string, Challenge>;
  stop: StopDecision | null;
  reportVersion: number | null;
  budgetWarnings: BudgetWarningPayload[];
  failure: RunFailedPayload | null;
  usage: BudgetUsage;
  timeline: TimelineItem[];
  connection: ConnectionState;
  lastEventId: number;
}

export type RunAction =
  | { type: "hydrate"; state: RunState }
  | { type: "event"; event: Event }
  | { type: "summary"; summary: RunSummary }
  | { type: "connection"; state: ConnectionState }
  | { type: "reset" };

export const initialView: RunView = {
  run: null,
  phase: null,
  nowReason: "",
  plan: null,
  tasks: {},
  sources: {},
  passageCounts: {},
  claims: {},
  rejectedClaims: [],
  verdicts: {},
  origins: {},
  conflicts: {},
  coverageByRound: {},
  rollupsByRound: {},
  challenges: {},
  stop: null,
  reportVersion: null,
  budgetWarnings: [],
  failure: null,
  usage: {},
  timeline: [],
  connection: "closed",
  lastEventId: 0,
};

const byId = <T extends { id: string }>(list: T[] | undefined): Record<string, T> =>
  Object.fromEntries((list ?? []).map((x) => [x.id, x]));

function groupCells(cells: CoverageCell[]): Record<number, CoverageCell[]> {
  const out: Record<number, CoverageCell[]> = {};
  for (const c of cells) out[c.round] = [...(out[c.round] ?? []), c];
  return out;
}

function planTasks(plan: Plan, runId: string): Record<string, Task> {
  const out: Record<string, Task> = {};
  for (const d of plan.dimensions)
    for (const s of d.slots ?? [])
      for (const t of s.tasks ?? [])
        out[t.id] = { id: t.id, run_id: runId, slot_id: s.id, query_text: t.query, kind: "initial", round: 0, status: "pending" };
  return out;
}

/** Typed payload access. The wire payload is a JSON object; each event type maps to one generated model. */
function pl<T>(e: Event): T {
  return (e.payload ?? {}) as unknown as T;
}

function assertNever(x: never): never {
  throw new Error(`Unhandled event type: ${String(x)}`);
}

interface Summarised {
  text: string;
  kind: TimelineKind;
  claimId?: string;
  sourceId?: string;
  failure?: FailureType;
}

function applyEvent(v: RunView, e: Event): { view: RunView; note: Summarised } {
  const t = e.type;
  switch (t) {
    case "run.started": {
      const p = pl<RunStartedPayload>(e);
      return { view: v, note: { kind: "phase", text: `Run started (${p.mode}): ${p.question}` } };
    }
    case "phase.entered": {
      const p = pl<PhaseEnteredPayload>(e);
      return {
        view: { ...v, phase: p.phase, nowReason: p.reason },
        note: { kind: "phase", text: `${p.phase.replace("_", " ")}: ${p.reason}` },
      };
    }
    case "plan.created": {
      const p = pl<PlanCreatedPayload>(e);
      const runId = v.run?.id ?? e.run_id;
      return {
        view: { ...v, plan: p.plan, tasks: { ...planTasks(p.plan, runId), ...v.tasks } },
        note: { kind: "phase", text: `Plan created: ${p.plan.dimensions.length} dimensions` },
      };
    }
    case "task.started": {
      const p = pl<TaskStartedPayload>(e);
      const prev = v.tasks[p.task_id];
      const task: Task = {
        id: p.task_id,
        run_id: e.run_id,
        slot_id: p.slot_id,
        query_text: p.query_text,
        kind: p.kind,
        round: e.round ?? prev?.round ?? 0,
        status: "running",
      };
      return {
        view: { ...v, tasks: { ...v.tasks, [p.task_id]: task }, nowReason: p.reason || v.nowReason },
        note: { kind: "phase", text: `Task ${p.task_id} (${p.kind}): ${p.query_text}` },
      };
    }
    case "source.found": {
      const p = pl<SourceFoundPayload>(e);
      return {
        view: { ...v, sources: { ...v.sources, [p.source.id]: p.source } },
        note: { kind: "source", sourceId: p.source.id, text: `Source ${p.source.id} found: ${p.source.domain}` },
      };
    }
    case "source.fetched": {
      const p = pl<SourceFetchedPayload>(e);
      const s = v.sources[p.source_id];
      return {
        view: s ? { ...v, sources: { ...v.sources, [p.source_id]: { ...s, status: "fetched", content_hash: p.content_hash } } } : v,
        note: { kind: "source", sourceId: p.source_id, text: `Source ${p.source_id} fetched (${p.chars} chars)` },
      };
    }
    case "source.failed": {
      const p = pl<SourceFailedPayload>(e);
      const s = v.sources[p.source_id];
      const status = p.failure === "SOURCE_EMPTY" ? "SOURCE_EMPTY" : "SOURCE_UNAVAILABLE";
      return {
        view: s
          ? { ...v, sources: { ...v.sources, [p.source_id]: { ...s, status, fail_reason: p.reason } } }
          : v,
        note: { kind: "failure", failure: p.failure, sourceId: p.source_id, text: `Source ${p.source_id} failed: ${p.reason}` },
      };
    }
    case "passages.created": {
      const p = pl<PassagesCreatedPayload>(e);
      return {
        view: { ...v, passageCounts: { ...v.passageCounts, [p.source_id]: p.count } },
        note: { kind: "source", sourceId: p.source_id, text: `${p.count} passages stored for ${p.source_id}` },
      };
    }
    case "claim.created": {
      const p = pl<ClaimCreatedPayload>(e);
      return {
        view: { ...v, claims: { ...v.claims, [p.claim.id]: p.claim } },
        note: { kind: "claim", claimId: p.claim.id, text: `Claim ${p.claim.id}: ${p.claim.text}` },
      };
    }
    case "claim.rejected": {
      const p = pl<ClaimRejectedPayload>(e);
      return {
        view: { ...v, rejectedClaims: [...v.rejectedClaims, p] },
        note: { kind: "failure", failure: "CLAIM_REJECTED", text: `Claim rejected by quote guard: ${p.reason}` },
      };
    }
    case "claim.verified": {
      const p = pl<ClaimVerifiedPayload>(e);
      return {
        view: { ...v, verdicts: { ...v.verdicts, [p.claim_id]: p.verdict } },
        note: { kind: "claim", claimId: p.claim_id, text: `Claim ${p.claim_id} verdict: ${p.verdict}. ${p.rationale}` },
      };
    }
    case "origin.updated": {
      const p = pl<OriginUpdatedPayload>(e);
      const sources = { ...v.sources };
      for (const sid of p.origin.member_source_ids ?? []) {
        const s = sources[sid];
        if (s) sources[sid] = { ...s, origin_id: p.origin.id };
      }
      return {
        view: { ...v, sources, origins: { ...v.origins, [p.origin.id]: p.origin } },
        note: { kind: "assurance", text: `Origin ${p.origin.id}: ${p.origin.label}` },
      };
    }
    case "conflict.detected": {
      const p = pl<ConflictDetectedPayload>(e);
      return {
        view: { ...v, conflicts: { ...v.conflicts, [p.conflict.id]: p.conflict } },
        note: { kind: "assurance", text: `Conflict ${p.conflict.id} (${p.conflict.kind ?? "genuine"}): ${p.conflict.claim_a} vs ${p.conflict.claim_b}` },
      };
    }
    case "coverage.updated": {
      const p = pl<CoverageUpdatedPayload>(e);
      return {
        view: {
          ...v,
          coverageByRound: { ...v.coverageByRound, [p.round]: p.cells },
          rollupsByRound: { ...v.rollupsByRound, [p.round]: p.rollups },
        },
        note: { kind: "assurance", text: `Coverage updated for round ${p.round}` },
      };
    }
    case "round.started": {
      const p = pl<RoundStartedPayload>(e);
      return {
        view: { ...v, nowReason: p.reason },
        note: { kind: "phase", text: `Round ${p.round} started: ${p.reason}` },
      };
    }
    case "challenge.created": {
      const p = pl<ChallengeCreatedPayload>(e);
      return {
        view: { ...v, challenges: { ...v.challenges, [p.challenge.id]: p.challenge } },
        note: { kind: "assurance", text: `Challenge ${p.challenge.id}: ${p.challenge.attack}` },
      };
    }
    case "challenge.outcome": {
      const p = pl<ChallengeOutcomePayload>(e);
      const c = v.challenges[p.challenge_id];
      return {
        view: c ? { ...v, challenges: { ...v.challenges, [c.id]: { ...c, outcome: p.outcome } } } : v,
        note: { kind: "assurance", text: `Challenge ${p.challenge_id} outcome: ${p.outcome}` },
      };
    }
    case "stop.decided": {
      const p = pl<StopDecidedPayload>(e);
      return {
        view: { ...v, stop: p.decision },
        note: { kind: "phase", text: `Stop decided: ${p.decision.state} (${p.decision.termination_reason})` },
      };
    }
    case "report.draft": {
      const p = pl<ReportDraftPayload>(e);
      return { view: v, note: { kind: "other", text: `Report draft v${p.version} written` } };
    }
    case "report.verified": {
      const p = pl<ReportVerifiedPayload>(e);
      return {
        view: { ...v, reportVersion: p.version },
        note: { kind: "other", text: `Report v${p.version} verified (${p.dropped_count} sentences removed)` },
      };
    }
    case "budget.warning": {
      const p = pl<BudgetWarningPayload>(e);
      return {
        view: { ...v, budgetWarnings: [...v.budgetWarnings, p] },
        note: { kind: "failure", text: `Budget warning: ${p.limit} at ${p.used} of ${p.max}` },
      };
    }
    case "run.completed": {
      const p = pl<RunCompletedPayload>(e);
      const run = v.run
        ? { ...v.run, status: "completed" as const, stop_state: p.stop_state ?? null, termination_reason: p.termination_reason ?? null }
        : v.run;
      return { view: { ...v, run }, note: { kind: "phase", text: `Run completed: ${p.stop_state ?? "no stop state"}` } };
    }
    case "run.failed": {
      const p = pl<RunFailedPayload>(e);
      const run = v.run ? { ...v.run, status: "failed" as const } : v.run;
      return {
        view: { ...v, run, failure: p },
        note: { kind: "failure", failure: p.failure, text: `Run failed: ${p.message}` },
      };
    }
    default:
      return assertNever(t);
  }
}

/** Pure, idempotent per event id: an event with id <= lastEventId is ignored. */
export function reduce(view: RunView, action: RunAction): RunView {
  switch (action.type) {
    case "reset":
      return initialView;
    case "connection":
      return { ...view, connection: action.state };
    case "summary": {
      const s = action.summary;
      return {
        ...view,
        run: s.run,
        phase: s.phase ?? view.phase,
        usage: s.usage ?? view.usage,
        stop: s.stop ?? view.stop,
      };
    }
    case "hydrate": {
      const s = action.state;
      const runId = s.run.id;
      const cells = s.coverage ?? [];
      return {
        ...initialView,
        connection: view.connection,
        usage: view.usage,
        run: s.run,
        phase: s.phase ?? null,
        plan: s.plan ?? null,
        tasks: { ...(s.plan ? planTasks(s.plan, runId) : {}), ...byId(s.tasks) },
        sources: byId(s.sources),
        origins: byId(s.origins),
        claims: byId(s.claims),
        conflicts: byId(s.conflicts),
        coverageByRound: groupCells(cells),
        rollupsByRound: Object.fromEntries((s.rollups ?? []).map((r) => [r.round, r.rollups ?? []])),
        challenges: byId(s.challenges),
        stop: s.stop ?? null,
        reportVersion: s.report_version ?? null,
        lastEventId: s.last_event_id ?? 0,
        nowReason: view.nowReason,
      };
    }
    case "event": {
      const e = action.event;
      const { view: next, note } = applyEvent(view, e);
      const item: TimelineItem = {
        id: e.id,
        ts: e.ts,
        type: e.type,
        round: e.round ?? 0,
        text: note.text,
        kind: note.kind,
        stepMs: e.step_ms ?? null,
        tokens: e.tokens ?? null,
        costUsd: e.cost_usd ?? null,
        ...(note.claimId ? { claimId: note.claimId } : {}),
        ...(note.sourceId ? { sourceId: note.sourceId } : {}),
        ...(note.failure ? { failure: note.failure } : {}),
      };

      if (e.id <= view.lastEventId) {
        if (view.timeline.some((t) => t.id === e.id)) return view;
        return {
          ...view,
          timeline: [...view.timeline, item].sort((a, b) => a.id - b.id),
        };
      }
      return { ...next, lastEventId: e.id, timeline: [...next.timeline, item] };
    }
  }
}

export function reduceAll(events: Event[], start: RunView = initialView): RunView {
  return events.reduce((v, event) => reduce(v, { type: "event", event }), start);
}
