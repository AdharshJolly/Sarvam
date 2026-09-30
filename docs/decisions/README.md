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
| CL-01 | | | | |
