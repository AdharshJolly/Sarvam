# Sarvam build status and next plan

Snapshot of 30 September 2026, after gate G3 (offline). Task IDs and gates are from SSOT sections 14 and
13.3. The SSOT wins if this file disagrees; update this file whenever a task lands.

## Gate status

| Gate | State | Evidence |
| --- | --- | --- |
| G0 | Done | `tests/gates/g0` (live cases need provider keys) |
| G1 | Done | `tests/gates/g1/test_g1.py` (offline); `test_g1_live*.py` need keys |
| G2 | Done | `tests/gates/g2/test_g2.py`, `tests/fixtures/*` |
| G3 | Done, offline only | `tests/gates/g3/test_g3.py`: fake search, fetcher and LLM over the fixture corpus. Not yet run against real providers. |
| G4 | Not started | `tests/gates/g4/` is empty |

## Task cards

| Task | State | Where |
| --- | --- | --- |
| T01 scaffold, contracts, store | Done | `contracts/`, `backend/store/` |
| T02 ToolGateway | Done | `backend/gateway/` |
| T03 planner | Done | `backend/pipeline/plan.py` |
| T04 discover and qualify | Done | `backend/pipeline/discover.py` |
| T05 acquire, extract, passages | Done | `backend/pipeline/acquire.py`, `extract.py` |
| T06 claims and quote guard | Done | `backend/pipeline/claims.py` (delta-only per round, B-30) |
| T07 writer v0 and renderer | Done | `backend/synth/writer.py`, `render.py` |
| T08 fixture corpus | Done | `fixtures/`, `tests/fixtures/` |
| T09 independent verifier | Done | `backend/intel/verify.py` |
| T10 origin clustering | Done | `backend/intel/origins.py` |
| T11 numeric and conflicts | Done | `backend/intel/numeric.py`, `conflicts.py` |
| T12 coverage and gap tasks | Done | `backend/intel/coverage.py`, `gaps.py`, `analyze.py` |
| T13 challenge loop and outcome rule | Done | `backend/intel/challenge.py`, `prompts/challenger.v1.md`, `tests/unit/test_challenge.py` |
| T14 controller rounds, wrap-up, stop policy | Done | `backend/controller.py` (`run_research`), `backend/intel/stop.py`, `tests/unit/test_stop.py` |
| T15 report verifier and certainty labels | Done | `backend/synth/report_verify.py`, `render.py`, `tests/unit/test_report_verify.py` |
| T16-T21 frontend (shell, plan/sources, matrix, drawer, conflicts/challenge/stop, report) | Done | `frontend/src/`. Built against mocks and REST/SSE contracts; not yet watched against a real multi-round run. The commit "T22: UI/UX overhaul" is a UI polish pass, not the SSOT T22 harness. |
| T22 test harness (unit, fixture, gate suites under `make check`) | Partly | `make check`, `make fixtures`, `make gates` exist; `make gates` does not yet list G3 |
| T23 golden questions and audit sheet | Partly | `fixtures/questions.yaml` exists; audit CSV template and sampler script do not |
| T24 failure states end to end | Not started | Typed failures exist in the backend; UI coverage of all SSOT 18 states not verified |
| T25 record 3 canonical runs, offline replay | Not started | Record/replay exists in the gateway (T02); no `make record` / `make replay`, `cache/recorded/` empty |
| T26 README, one-command run, clean checkout | Not started | |

## How a run works now

```
PLAN
round 0:   DISCOVER > ACQUIRE > EXTRACT > CLAIMS > VERIFY > ANALYZE          (coverage round 0)
loop:      stop policy says continue?
             CHALLENGE (attacks + gap tasks, paced to the search budget)      round.started
             DISCOVER > ACQUIRE > EXTRACT > CLAIMS > VERIFY                   delta only
             resolve challenges by rule > ANALYZE                             (coverage round r)
STOP_POLICY  final_decision(coverage, conflicts, challenges, reason)          stop.decided
SYNTHESIZE   writer > report verifier > render > citation proof               report.draft, report.verified
```

A stop request, the soft time limit, a budget limit or a provider outage at any point takes the wrap-up
path (coverage scored from stored evidence with no LLM call, then STOP_POLICY and SYNTHESIZE). Follow-up
rounds end on: criteria met, zero marginal gain after a completed challenge, `MAX_FOLLOWUP_ROUNDS`, or a hard
limit. Decisions B-27 to B-31 in `docs/decisions/README.md` record every choice the SSOT left open.

## What has been tested and what has not

Tested (offline, deterministic): every unit above; the full lifecycle on the fixture corpus with two pages held
back so a follow-up round changes the matrix and adds a conflict; wrap-up on a forced-low LLM budget and on a
user stop; the stop decision recomputed from the stored tables equals the stored one; every report citation
resolves to a stored passage containing its quote.

Not tested: any real provider (search, fetch, LLM) through the round loop; cost and latency of a multi-round run
against NFR-01 and NFR-02; the frontend against a real multi-round event stream; the REPLAY path.

## Next flow

1. **Measure a live run** (needs keys): run the canonical question, note searches, fetches, LLM calls, cost and
   wall time per round. Round 0 uses 16 to 20 of 24 searches (B-12), so follow-up rounds get about 2 to 4 tasks;
   decide whether to raise `MAX_SEARCHES` or cut round-0 tasks. Fix whatever the real corpus breaks (prompts,
   thresholds) with fixtures first.
2. **Watch the UI on a live multi-round run**: matrix round selector, challenge panel outcomes, stop card,
   certainty chips, conflicts section. File UI fixes as bug fixes, not features.
3. **T24 failure states end to end**: force each SSOT 18 failure in a test; check the event and the UI state.
4. **T25 record and replay**: record three canonical runs into `cache/recorded/`, add `make record` and
   `make replay`, prove offline replay gives the same event sequence with the network off (FR-25, FR-26, NFR-03,
   NFR-07). Replay must show REPLAY, never LIVE.
5. **T23 audit sheet**: CSV template and sampler script (20 sentences, stratified by dimension).
6. **G4 suite**: three replayable runs, failure states visible, forced-low-budget test (partly covered by G2/G3),
   M0 and M1 acceptance checklist (SSOT 16.5).
7. **T26 README and run command** on a clean checkout. Freeze at hour 22; ranked additions (SSOT 15) only after
   G4.

## Known limits and risks

| Risk | Note |
| --- | --- |
| Free-tier LLM limits | Gemini 429 and 503 handling is in the gateway (B-19, B-20). Challenge rounds add LLM calls; check `MAX_LLM_CALLS=250` and cost against the 3 USD cap on a live run. |
| Search budget | Follow-up tasks are paced to the remaining searches (B-28); a run that exhausts them ends `budget` with the challenge not completed. |
| One search phrasing per challenge | Each attack searches its first query plus discover's rephrasing (B-29). |
| `assumed` label and "System inference" | Not produced; needs a writer contract change (B-31). |
| Numeric rate table | INR rates in `backend/intel/numeric.py` are approximate and dated (B-26). |
