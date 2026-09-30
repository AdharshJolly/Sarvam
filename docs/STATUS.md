# Sarvam build status and next plan

Snapshot of 30 September 2026 (HEAD `35fcb54`, "G2: wire VERIFY and ANALYZE into the run"). Task IDs and gates are
from SSOT section 14 and 13.3. The SSOT wins if this file disagrees; update this file whenever a task lands.

## Gate status

| Gate | State | Evidence |
| --- | --- | --- |
| G0 | Done | `tests/gates/g0` (live cases need provider keys) |
| G1 | Done | `tests/gates/g1/test_g1.py` |
| G2 | Done | `tests/gates/g2/test_g2.py`, `tests/fixtures/*` |
| **G3** | **Next** | Full lifecycle with a challenge round, stop state and verified report. `tests/gates/g3/` is empty. |
| G4 | Not started | `tests/gates/g4/` is empty. |

## Task cards

| Task | State | Where |
| --- | --- | --- |
| T01 scaffold, contracts, store | Done | `contracts/`, `backend/store/` |
| T02 ToolGateway | Done | `backend/gateway/` |
| T03 planner | Done | `backend/pipeline/plan.py` |
| T04 discover and qualify | Done | `backend/pipeline/discover.py` |
| T05 acquire, extract, passages | Done | `backend/pipeline/acquire.py`, `extract.py` |
| T06 claims and quote guard | Done | `backend/pipeline/claims.py` |
| T07 writer v0 and renderer | Done | `backend/synth/writer.py`, `render.py` |
| T08 fixture corpus | Done | `fixtures/`, `tests/fixtures/` |
| T09 independent verifier | Done | `backend/intel/verify.py` |
| T10 origin clustering | Done | `backend/intel/origins.py` |
| T11 numeric and conflicts | Done | `backend/intel/numeric.py`, `conflicts.py` |
| T12 coverage and gap tasks | Done | `backend/intel/coverage.py`, `gaps.py`, `analyze.py` |
| **T13 challenge loop and outcome rule** | **Not started** | `backend/intel/challenge.py` is a 1-line stub; `challenger.v1.md` prompt exists |
| **T14 controller rounds, wrap-up, stop policy** | **Not started** | `backend/intel/stop.py` is a 1-line stub; `controller.run_m0` is linear (B-08) |
| **T15 report verifier and certainty labels** | **Not started** | `backend/synth/report_verify.py` is a 1-line stub |
| T16-T21 frontend (shell, plan/sources, matrix, drawer, conflicts/challenge/stop, report) | Done | `frontend/src/`. The commit "T22: UI/UX overhaul" is a UI polish pass, not the SSOT T22 harness. |
| T22 test harness (unit, fixture, gate suites under `make check`) | Partly | `make check`, `make fixtures`, `make gates` exist; G3 and G4 suites do not |
| T23 golden questions and audit sheet | Partly | `fixtures/questions.yaml` exists; audit CSV template and sampler script do not |
| T24 failure states end to end | Not started | Typed failures exist in the backend; UI coverage of all of SSOT 18 not verified |
| T25 record 3 canonical runs, offline replay | Not started | Record/replay exists in the gateway (T02); no `make record` / `make replay`, `cache/recorded/` empty |
| T26 README, one-command run, clean checkout | Not started | |

## Why T13 to T15 are next

The product claim is "research that knows when it isn't done". Today a run stops after one pass, `run.completed`
carries `stop_state=None`, and no challenge or `stop.decided` event is ever emitted. The UI already has the Challenge
panel and Stop card (T20) waiting on those events. Nothing in M1 or G3 is met until T13 to T15 land, and T24 and T25
both depend on T14. The critical path is T13, T14, G3, then T15 (T15 can run in parallel with T13 once the
`report.verified` event shape is agreed).

## Plan

Follow the SSOT task-card flow: tests first, fixtures before prompts, deterministic before LLM, one commit per task,
`make check` green before each commit. Log any contract or schema change in `docs/decisions/README.md`.

### T13 Challenge loop and outcome rule (`backend/intel/challenge.py`, est. 1.5 h)

1. Tests first on the fixture corpus: `ChallengeSet` output is capped at 3 attacks and 2 queries each, attacks target
   the weakest slots or claims, and outcomes follow the rule (any `supports` verdict on new passages is weakened; at
   least 3 relevant passages and none supporting is strengthened; otherwise unresolved). Use scripted LLM output from
   `tests/support/fakes.py`.
2. Challenger call (STRONG tier, `challenger.v1.md`, schema in `contracts/llm.py`) fed by coverage, top claims per slot,
   open conflicts and origin statistics.
3. Persist `challenges` rows, create follow-up tasks with `kind=challenge` via `repo`, emit `challenge.created`.
4. Outcome function is pure code over verdicts produced by the existing verifier (attack hypothesis as the claim);
   emit `challenge.outcome`.
5. Done when attacks generate tasks and outcomes are assigned by rule on the fixtures.

### T14 Controller, rounds, wrap-up, stop policy (`backend/controller.py`, `backend/intel/stop.py`, est. 2 h)

1. `stop.py` first: a pure function of coverage, conflicts and challenge outcomes returning `StopDecision` per SSOT 9.10
   (SUFFICIENT, SUFFICIENT_WITH_CAVEATS, INSUFFICIENT; marginal gain; hard limits win). Table-driven unit tests for every
   row of the SSOT table, plus a test that recomputes the state for every stored run from its tables.
2. Replace the linear `run_m0` with the round loop: round 0 (PLAN to ANALYZE), then CHALLENGE, then `round.started` and
   states 2 to 7 on the delta only, repeated up to `MAX_FOLLOWUP_ROUNDS`; at least one challenge round is mandatory
   unless a hard limit hits first. Confirm discover, acquire and claims skip already-processed sources and claims
   (FR-16); fix that inside the task if they do not.
3. Wrap-up path keeps working (budget, timeout, user stop, provider outage) and the stop card says the challenge was
   not completed. Emit `stop.decided`, set `runs.stop_state` and `termination_reason`, and pass `stop_state` into
   `run.completed`.
4. Add the G3 gate in `tests/gates/g3/`: full lifecycle on the fixture scenario with at least one challenge round,
   follow-up research, a stop state with reason, and the four visible moments present in `/state`. Resolve B-08
   (replace `run_m0`) in the decisions log.

### T15 Report verifier and certainty labels (`backend/synth/report_verify.py`, est. 1 h)

1. Test on a planted draft: a sentence with no claim ID and a sentence with an altered number are both caught.
2. Deterministic pass over the writer draft (FR-19); assign supported / contested / single-origin / assumed (FR-20,
   SSOT 9.11); recommendations only under "System inference" with at least two claims.
3. Emit `report.draft` and `report.verified`; render from the verified draft. The frontend report view (T21) already
   shows certainty chips, so check whether the `ReportView` contract needs a change before touching it.

### After G3

1. T24 failure states end to end: force each SSOT 18 failure in a test and check the event and the UI state.
2. T25 record three canonical runs into `cache/recorded/`, add `make record` and `make replay`, prove offline replay
   with identical event sequences (FR-25, FR-26, NFR-03, NFR-07).
3. T23 audit sheet: CSV template and sampler script (20 sentences, stratified by dimension).
4. Forced-low-budget test and the G4 suite, then T26 README run command on a clean checkout. Freeze at hour 22; ranked
   additions (SSOT 15) only after G4.

## Risks to watch

| Risk | Note |
| --- | --- |
| Free-tier LLM limits | Gemini 429 and 503 handling is in the gateway (B-19, B-20). Challenge rounds add LLM calls; check `MAX_LLM_CALLS=250` and cost against the 3 USD cap on a live run. |
| Round 0 search budget | 16 to 20 of 24 searches go to round 0 (B-12); challenge follow-ups need headroom. Measure before changing the default. |
| Delta-only follow-up | FR-16 is not confirmed in the current pipeline code; treat as part of T14. |
