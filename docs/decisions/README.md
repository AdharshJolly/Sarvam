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

## Change log (SSOT section 21)

| ID | Hour | Change | Reason | Impact |
| --- | --- | --- | --- | --- |
| CL-01 | 0 | G0: providers fixed as Tavily (search) and an OpenAI-compatible LLM endpoint; httpx moved from dev to runtime dependencies; stdlib `.env` reader added to `contracts/config.py`; `RunCreate` request model lives in `backend/app.py` (not yet in `contracts/`). | SSOT names no provider; gateway needs httpx at runtime; `.env.example` needs a loader. | No schema or event change. `RunCreate` TS type pending until Bun is available for `make contracts`. |
| CL-02 | 1 | Add event type `phase.entered` (payload `{phase, reason}`). | SSOT FR-22 requires an event per state transition, but the 22 listed types contain no phase transition, so the UI stepper could not be driven deterministically. | Additive. 22 SSOT types plus 1. |
| CL-03 | 1 | Add contracts `Phase`, `RunCreate` (moved from `backend/app.py`, closes the CL-01 pending item), `BudgetUsage`, `Plan*`, `DimensionRollup`, `RoundRollups`, `RunSummary`, `RunState`, `ClaimEvidence`, `CitationRef`, `ReportView`. | SSOT section 11 endpoints need typed responses; frontend types are generated from them. | Additive. `schema.json` and `types.ts` regenerated. |
| CL-04 | 1 | Add one payload model per event type plus `EVENT_PAYLOADS`; `append_event` validates payloads before insert. | Event payload shapes were undefined (events.py docstring: "added as implemented"). | Invalid payloads now raise `ValueError`; existing tests updated. |
| CL-05 | 1 | Add `Thresholds.queries_per_task=2`, `results_per_query=6`, `sources_per_task=4`, `max_initial_tasks=10`; add backend-internal `contracts/llm.py` (not exported to TypeScript). | FR-02/FR-04 arithmetic can exceed MAX_SEARCHES=24 in round 0; planner limited to 4-5 dimensions x 2 slots (decision B-12). | Backend only; budgets unchanged. |
