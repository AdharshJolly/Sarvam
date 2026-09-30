import type {
  Claim,
  CoverageCell,
  CoverageState,
  Event,
  EventType,
  Origin,
  OriginMethod,
  Passage,
  Source,
  SourceStatus,
  SourceType,
} from "@contracts/types";

/** All fixture text is fictional; hosts use the reserved .invalid TLD. */
export interface DraftEvent {
  type: EventType;
  payload: Record<string, unknown>;
  round: number;
  stepMs: number | null;
  tokens: number | null;
  costUsd: number | null;
}

export function mkEvent(
  type: EventType,
  payload: object,
  opts: { round?: number; stepMs?: number; tokens?: number; costUsd?: number } = {},
): DraftEvent {
  return {
    type,
    payload: payload as Record<string, unknown>,
    round: opts.round ?? 0,
    stepMs: opts.stepMs ?? null,
    tokens: opts.tokens ?? null,
    costUsd: opts.costUsd ?? null,
  };
}

const T0 = Date.parse("2026-06-01T10:00:00Z");

/** Assigns sequential ids and timestamps (1.2 s apart). */
export function sequence(runId: string, drafts: DraftEvent[]): Event[] {
  return drafts.map((d, i) => ({
    id: i + 1,
    run_id: runId,
    ts: new Date(T0 + i * 1200).toISOString(),
    round: d.round,
    type: d.type,
    step_ms: d.stepMs,
    tokens: d.tokens,
    cost_usd: d.costUsd,
    payload: d.payload,
  }));
}

export function mkSource(
  runId: string,
  id: string,
  host: string,
  taskId: string,
  o: {
    type?: SourceType;
    tier?: number;
    published?: string | null;
    status?: SourceStatus;
    fail?: string;
  } = {},
): Source {
  return {
    id,
    run_id: runId,
    url: `https://${host}/${id.toLowerCase()}`,
    canonical_url: `https://${host}/${id.toLowerCase()}`,
    domain: host,
    publisher: host,
    source_type: o.type ?? "news",
    authority_tier: o.tier ?? 2,
    published_at: o.published === undefined ? "2026-03-15" : o.published,
    retrieved_at: "2026-06-01T10:00:00Z",
    content_hash: "",
    status: o.status ?? "found",
    fail_reason: o.fail ?? null,
    origin_id: null,
    task_id: taskId,
  };
}

export function mkPassage(id: string, sourceId: string, idx: number, text: string): Passage {
  const start = idx * 1000;
  return { id, source_id: sourceId, idx, text, char_start: start, char_end: start + text.length };
}

export function mkClaim(
  runId: string,
  id: string,
  slotId: string,
  passageId: string,
  text: string,
  quote: string,
  o: { round?: number; entity?: string; attribute?: string; value?: number; unit?: string; period?: string } = {},
): Claim {
  return {
    id,
    run_id: runId,
    slot_id: slotId,
    round: o.round ?? 0,
    text,
    entity: o.entity ?? null,
    attribute: o.attribute ?? null,
    value_num: o.value ?? null,
    unit: o.unit ?? null,
    period: o.period ?? null,
    quote,
    passage_id: passageId,
    quote_verified: true,
    status: "pending",
  };
}

export function mkOrigin(
  runId: string,
  id: string,
  label: string,
  method: OriginMethod,
  members: string[],
): Origin {
  return { id, run_id: runId, label, method, member_source_ids: members };
}

export function mkCell(
  runId: string,
  round: number,
  slotId: string,
  state: CoverageState,
  origins: number,
  claims: number,
  openConflicts: number,
  reason: string,
): CoverageCell {
  return {
    id: `V-${round}-${slotId}`,
    run_id: runId,
    round,
    slot_id: slotId,
    state,
    independent_origins: origins,
    supporting_claims: claims,
    open_conflicts: openConflicts,
    reason,
  };
}
