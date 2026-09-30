# Decisions and change log

ADRs 101-111 are defined in SSOT section 20 and are not duplicated here. Bootstrap-time decisions that
the SSOT leaves open are logged below. From hour 1 of the build, any change to contracts, the schema,
thresholds or the cut list requires a row in the change log and an update to the affected section in
the same commit (SSOT section 21).

## Bootstrap decisions

| ID | Decision | Reason |
| --- | --- | --- |
| B-01 | Product is named Sarvam; "ResearchOps" is used only for the challenge domain and the SSOT title. | Product identity. |
| B-02 | Bun workspace at the repo root (`frontend` only); Python via uv with `package = false`. | Bun-only JS tooling; backend is not a distributable package. |
| B-03 | `Run.status` values: queued, running, completed, failed. `SourceStatus`: found, fetched, SOURCE_UNAVAILABLE, SOURCE_EMPTY. | SSOT lists the columns but not the enum values; derived from section 18. |
| B-04 | `events.id` is an integer autoincrement so it can serve as the SSE `Last-Event-ID`. | SSOT requires Last-Event-ID reconnect. |
| B-05 | Contracts use `extra="forbid"`. | Prevents silent shape drift between backend and frontend. |
| B-06 | Schema versioning via `PRAGMA user_version` + idempotent `schema.sql`. | Simplest migration strategy for a 24-hour MVP. |
| B-07 | `uv.lock` is not committed. | CLAUDE.md rule "no dependency lockfile other than Bun's"; reversible (see final report). |
| B-08 | `controller.run_m0` is a minimal linear M0 driver, written as part of T07; T14 extends or replaces it. | No task card owns the M0 wiring, but G1 needs an end-to-end run before Stream B lands. |
| B-09 | Short ids (S3, P12, C41, ...) are allocated globally monotonic by `backend/store/ids.py::next_id` inside `BEGIN IMMEDIATE`; origins, dimensions, slots and tasks stay per-run. | `schema.sql` keys most tables globally, so ids would collide across runs. No schema change. |
| B-10 | The run task and each SSE stream open their own SQLite connection; `busy_timeout=5000`. The lifespan connection serves short request handlers only. | One shared connection is unsafe with concurrent writers and readers. `POST /runs` is `async def` and does a few sync SQLite calls on the event loop (acceptable for the MVP). |
| B-11 | SSE frames carry `id:` and `data:` only (no `event:` field); heartbeat is a `: keepalive` comment every 15 s. | `EventSource.onmessage` does not receive named events. |
| B-12 | Planner is limited to 4-5 dimensions x 2 slots x 1 task; discover uses exactly 2 queries per task (16-20 searches in round 0 against MAX_SEARCHES=24). | FR-02 plus FR-04 can exceed the budget in round 0. The default cap is not changed; G1 measures and reports. |
| B-13 | Gateway retries LLM HTTP 429 up to 3 times, honouring `Retry-After` (capped at 30 s); per-role `max_tokens` are 3000-6000. | Groq free tier allows 8,000 tokens per minute for `gpt-oss-120b`; unhandled 429s failed the live planner test. |
| B-14 | Quote guard keeps SSOT 9.4 (exact substring or partial ratio >= 0.95) and adds two rejections only: fewer than 4 words, and a fuzzy match must contain every number the quote states. | One altered digit scores about 0.97 on a short quote, which would let a changed price pass. Never loosens the guard. |
| B-15 | An extractor call is made per (source, relevant slot): own slot first, then other slots sharing content words, at most 3 slots per source. | Keeps LLM calls inside MAX_LLM_CALLS=250. The cap of 3 is a backend constant, not an SSOT value. |
| B-16 | A task whose searches all fail is marked `blocked` and a second `task.started` event carries the typed reason ("Task blocked (RATE_LIMITED): ..."). | No event type exists for task failure and none may be invented; reducers already key on task id. |
| B-17 | If the writer fails or the budget is exhausted, the report is rendered evidence-only (each verified claim cites itself) and says why. With no eligible claims the writer is not called. | Wrap-up must still produce a cited report (SSOT 7.1). |
| B-18 | M0 claims stay `pending` with `quote_verified=1`; the writer accepts them via `writer.eligible_statuses()`. Quote-guard rejects are events only. | No judge exists before M1 and `claims.passage_id` is NOT NULL (decision D6). |
| B-19 | LLM 429s with no `Retry-After` wait 5, 15, 30 s (cap 60 s) and a Google-style `retryDelay` in the error body is honoured. The live setup uses Gemini through its OpenAI-compatible endpoint with `SARVAM_LLM_CONCURRENCY=2`. | Gemini free tiers limit requests per minute (10-15), so short retries would fail. No new environment variable. |
| B-20 | LLM calls also retry transient provider overload (HTTP 500/502/503/504) with the same 5, 15, 30 s backoff; other 4xx are not retried. Strong model pinned to `gemini-3.6-flash` (3.7 and 3.8 returned 503 "high demand", 2.5 Flash returned 404 for new users). | Gemini capacity spikes are common and would otherwise fail the planner and end the run. |

## Change log (SSOT section 21)

| ID | Hour | Change | Reason | Impact |
| --- | --- | --- | --- | --- |
| CL-01 | 0 | G0: providers fixed as Tavily (search) and an OpenAI-compatible LLM endpoint; httpx moved from dev to runtime dependencies; stdlib `.env` reader added to `contracts/config.py`; `RunCreate` request model lives in `backend/app.py` (not yet in `contracts/`). | SSOT names no provider; gateway needs httpx at runtime; `.env.example` needs a loader. | No schema or event change. `RunCreate` TS type pending until Bun is available for `make contracts`. |
| CL-02 | 1 | Add event type `phase.entered` (payload `{phase, reason}`). | SSOT FR-22 requires an event per state transition, but the 22 listed types contain no phase transition, so the UI stepper could not be driven deterministically. | Additive. 22 SSOT types plus 1. |
| CL-03 | 1 | Add contracts `Phase`, `RunCreate` (moved from `backend/app.py`, closes the CL-01 pending item), `BudgetUsage`, `Plan*`, `DimensionRollup`, `RoundRollups`, `RunSummary`, `RunState`, `ClaimEvidence`, `CitationRef`, `ReportView`. | SSOT section 11 endpoints need typed responses; frontend types are generated from them. | Additive. `schema.json` and `types.ts` regenerated. |
| CL-04 | 1 | Add one payload model per event type plus `EVENT_PAYLOADS`; `append_event` validates payloads before insert. | Event payload shapes were undefined (events.py docstring: "added as implemented"). | Invalid payloads now raise `ValueError`; existing tests updated. |
| CL-05 | 1 | Add `Thresholds.queries_per_task=2`, `results_per_query=6`, `sources_per_task=4`, `max_initial_tasks=10`; add backend-internal `contracts/llm.py` (not exported to TypeScript). | FR-02/FR-04 arithmetic can exceed MAX_SEARCHES=24 in round 0; planner limited to 4-5 dimensions x 2 slots (decision B-12). | Backend only; budgets unchanged. |
