# LLM Optimization Implementation Report

Date: 30 September 2026. Question: "Should a company launch an electric scooter subscription service in
Bengaluru in 2027?" Providers: Gemini (`gemini-3.1-flash-lite` fast, `gemini-3.6-flash` strong) through the
OpenAI-compatible endpoint, Tavily search (Exa fallback), `SARVAM_LLM_CONCURRENCY=2`. Raw data:
`docs/benchmarks/*.json` (per-run, per-role). Anything not measured is marked NOT VERIFIED.

## Executive Summary

- Instrumentation first: every `gateway.llm` call now produces an `LLMOpStats` record (run, role, prompt, model,
  validation attempts, provider requests and retries, input/output/total tokens, cost and its source, latency,
  status). Budget semantics are documented and unchanged.
- Cost accounting is honest: provider-reported, locally estimated (only if a price is configured) or
  unavailable, never mixed. On the live Gemini endpoint cost is **unavailable**, so `MAX_COST_USD` cannot bind
  (OP-02).
- Baseline (3 live runs): about 114 to 118 LLM attempts, 267k to 321k tokens, 160 to 195 s. The extractor is
  about 100 calls and 85 percent of input tokens. Every run ended on the **search** budget, not LLM budget.
- Two defaults changed (B-32): compact JSON on, extractor context K=6 to 5. Measured saving about 19 percent
  of tokens for K=5 and 7 percent for compact JSON, **within about 20 percent run-to-run noise** (n=2 per config).
  Planner/extractor/etc. output-ceiling reductions were rejected (they broke the planner).
- The experiment matrix was stopped part-way at the user's request to protect provider credits: verifier batch
  and concurrency are NOT VERIFIED. The final optimized config was NOT re-run 3 times (NOT VERIFIED).
- Offline: 478 tests pass; G1, G2, G3 (21 tests) pass. G4 is not started; replay of live recordings is not
  faithful (OP-01).

## Baseline

Config: defaults at the time (K=6, pretty JSON, batch 5, concurrency 2). 3 runs, `docs/benchmarks/baseline.json`.

| Metric | Run 1 | Run 2 | Run 3 |
| --- | --- | --- | --- |
| Wall time (s) | 159.5 | 174.7 | 195.2 |
| Searches / fetches | 24 / 40 | 24 / 40 | 22 / 40 |
| LLM attempts (budget counter) | 114 | 118 | 114 |
| LLM operations | 114 | 117 | 113 |
| Validation retries / provider retries | 0 / 0 | 1 / 0 | 1 / 0 |
| Input / output / total tokens | 250,576 / 8,600 / 266,908 | 248,769 / 11,719 / 269,561 | 300,213 / 10,918 / 321,272 |
| Cost | unavailable | unavailable | unavailable |
| Claims (non-rejected) | 27 (2 contested) | 34 | 33 (1 partial) |
| Coverage last round (G/A/R) | 4 / 2 / 4 | 4 / 4 / 2 | 6 / 3 / 1 |
| Conflicts | 2 explained, 1 open | 3 explained | 7 explained |
| Rounds / challenge | 1 round, challenge outcome none | same | same |
| Stop | INSUFFICIENT / budget | SUFFICIENT_WITH_CAVEATS / budget | SUFFICIENT_WITH_CAVEATS / budget |
| Report verification | verified, 0 dropped | verified, 0 dropped | verified, 0 dropped |

A first baseline attempt on a network with a TLS interception problem failed before any claims (archived in
`docs/benchmarks/_failed_network/`, not used).

## Optimized State

Changed defaults (decision B-32, change-log CL-07): `SARVAM_LLM_COMPACT_JSON=1`, `passages_per_slot_source=5`.
All other knobs are environment-selectable and unchanged by default. **NOT VERIFIED:** a 3-run baseline-style
measurement of this exact combined configuration was not run (credit limits). The figures below come from the
single-knob experiments, which share the same code.

| Config (one knob) | n | Mean total tokens | vs baseline mean 285,914 | Attempts | Claims | Stop states | Validation retries |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Baseline | 3 | 285,914 | | 114 to 118 | 27, 34, 33 | INSUFF, SWC, SWC | 0, 1, 1 |
| Compact JSON | 2 | 267,452 | -6.5% | 103, 125 | 46, 42 | SWC, INSUFF | 2, 2 |
| K=5 | 2 | 230,950 | -19.2% | 104, 102 | 34, 25 | SWC, SWC | 1, 0 |
| K=4 | 2 | 259,742 | -9.2% | 135, 105 | 50, 32 | SWC, INSUFF | 2, 3 |

SWC = SUFFICIENT_WITH_CAVEATS. Baseline totals alone span 267k to 321k, so none of these differences is
statistically established.

## LLM Usage by Role

Baseline run 1 / 2 / 3 (operations; input tokens):

| Role | Ops | Input tokens | Output tokens | Notes |
| --- | --- | --- | --- | --- |
| Extractor | 102 / 104 / 96 | 224k / 217k / 258k | 4.0k / 5.6k / 4.4k | about 85 percent of input; FAST tier |
| Verifier | 6 / 7 / 7 | 12k / 15k / 15k | 1.6k to 2.0k | batches of 5 pairs |
| Explainer | 3 / 3 / 7 | 4.6k / 4.4k / 12k | 0.1k to 0.3k | |
| Challenger | 1 / 1 / 1 | 4.6k to 4.7k | 0.4k to 0.5k | one round only (search budget gone) |
| Writer | 1 / 1 / 1 | 3.3k / 3.9k / 8.7k | 1.0k to 2.4k | |
| Planner | 1 / 1 / 1 | 1.4k to 4.1k | 1.2k to 2.4k | up to 2 attempts |

## Budget Semantics

- `max_llm_calls` counts **validation attempts**: each loop iteration inside `gateway.llm` passes `_before` and
  increments once. One logical operation uses 1 to 3. Provider 429/5xx retries inside an attempt
  (up to 3, with 5/15/30 s backoff) are **not** counted. Replay counts the same way. Unchanged; now documented in
  code and tested. Observed: no provider retries in any valid run.
- Limits checked before each call in this order: wall hard, cost, then the resource limit. 80 percent warnings
  once per limit. Soft wall time flips a flag the controller reads; `BudgetExceeded` is typed BLOCKED and takes
  the wrap-up path. Covered by existing tests (search, fetch, LLM attempts, warning, soft/hard time, forced-low
  LLM budget in G3, follow-up round limit in the controller tests) plus the new cost tests.
- Observed live: search budget (24) is the binding limit in all 9 valid runs (OP-03).

## Cost Accounting

Reported cost (provider `usage.cost`) > local estimate (tokens x `SARVAM_LLM_PRICE_FAST/STRONG`, USD per 1M
tokens, unset by default) > unavailable. Only the first two count against `MAX_COST_USD`. Unavailable raises
one `budget.warning` (`cost_unavailable`). Tests: below / at / above budget, estimated not reported as actual,
unavailable not counted. Gemini pricing NOT VERIFIED, so no defaults are shipped.

## Optimization Experiments

| Experiment | Result |
| --- | --- |
| A. Low output ceilings (planner 1800, extractor 1200, verifier 800, challenger 1800, writer 2500, explainer 700) | **Rejected.** Both runs failed at the planner in about 32 s (3 attempts, truncation; baseline planner emitted up to 2,399 output tokens). Real output sizes are small (extractor about 40 tokens per call) so ceilings save almost nothing anyway. |
| B. Compact JSON | **Adopted.** About -7 percent tokens, no quality loss seen; validation retries 2 per run vs 0 to 1 (n=2, not established). Safe because the payload data is unchanged. |
| C. Extractor K | **K=5 adopted** (-19 percent tokens, claims and coverage comparable, n=2). K=4 gave no saving (more validation retries and calls) and more variance: rejected. |
| D. Verifier batch 5, 8, 10 | NOT VERIFIED (knob exists, run not executed). |
| E. LLM concurrency 2, 4, 6, 8 | NOT VERIFIED (knob exists, run not executed). |
| F. Writer input reduction | Not changed: one call, 3 to 9k input tokens, under 4 percent of run tokens; reduction would risk evidence quality for little gain. |
| G. Challenger | Not changed: one call per run, 0.4 to 0.5k output. The challenger was not skipped or shortened; the assurance system is intact. |

## Quality/Regression Results

- Offline suite (excluding live-provider tests): **478 passed**. One existing assertion was updated
  (`test_runner_wiring`: the fake LLM reports no cost, so the new one-time `cost_unavailable` warning now appears
  at event index 2). No other test was weakened.
- Live runs: all 9 valid runs completed with report verification passing and 0 dropped sentences. Quote guard,
  verifier, origins, conflicts, coverage, challenge, stop policy and report verifier were untouched.
- Claim quality was not audited by a human (audit sheet not filled). NOT VERIFIED beyond counts.

## Reliability

No provider retries (429/5xx) in any valid run at concurrency 2. Failed operations: none in baseline. The
low-ceiling config showed the validation path working (3 attempts then a typed STEP_FAILED, run ended `failed`
with the event visible). Rate limits under higher concurrency NOT VERIFIED.

## Gate/Test Results

| Gate | Result |
| --- | --- |
| G0 | Not re-run (live cases need keys) |
| G1 | Offline `test_g1.py` passed (part of 21); live G1 tests not re-run (OP-09) |
| G2 | Passed (offline) |
| G3 | Passed (offline) |
| G4 | **Not ready.** Empty suite. Offline replay runs and is labelled REPLAY but does not reproduce a live run (OP-01). Forced-low-budget is covered by G2/G3 tests. Failure-state UI coverage (T24) and M0/M1 acceptance not done. |
| `make check` | Not green: ruff errors in untracked scripts (OP-07). Frontend typecheck/build not run. |

## Documentation Audit

| Document | Status | Action |
| --- | --- | --- |
| SSOT v2 (.docx) | Not modified. `max_llm_calls` meaning (attempts) and cost-unavailable behavior are not stated there: documentation gap, recorded in B-32 | none |
| `docs/STATUS.md` | Was stale (T25 "not started", "cache empty", G3 not in `make gates`, no live measurements) | updated |
| `PHASE_STATUS.md` | Does not exist; `STATUS.md` fills that role | none |
| `OPEN_PROBLEMS.md` | Was missing | created with OP-01 to OP-11 |
| `docs/decisions/README.md` | Current up to B-31 | B-32, CL-07 added |
| `docs/README.md` | Missing two docs | updated |
| `README.md`, `CLAUDE.md` | Not audited in detail. CLAUDE.md says `make fixtures`/`record`/`replay` do not exist: still true for record/replay; `make benchmark-llm` is new | NOT VERIFIED / left as is |
| `docs/audit/README.md` and `audit_sheet.csv` | README says CSV template and sampler are not written; both exist untracked | drift noted, not changed |
| `docs/architecture/README.md` | Not audited against code | NOT VERIFIED |
| `.env.example` | Missing new variables | updated |

Implementation vs SSOT: extractor K and compact JSON are intentional changes (B-32); SSOT `passages_per_slot`
(5.1 lists 6) now differs, documented. The SSOT was not edited.

## Remaining Problems

See `docs/OPEN_PROBLEMS.md`: OP-01 replay fidelity, OP-02 cost not enforceable, OP-03 search budget binds,
OP-04 extractor call volume, OP-05 unmeasured knobs, OP-06 G4, OP-07 lint, OP-08 record scripts, OP-09 live tests.

## Next Implementation Opportunities

Analysis only; nothing below was implemented. "Readiness" is relative to the current code.

| Candidate | Readiness | Why it matters | Dependencies | Effort | Risk | Contract/schema | Budget impact | Record/replay | When |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fix replay fidelity (OP-01) + G4 suite | Gateway record/replay exists; scripts unreviewed | Required by the USP (LIVE vs REPLAY) and G4 | none | Small to medium | Low | none | none | Is the subject | **Next** |
| Extractor batching (several slots per call) | Code paths clear (claims.py) | Attacks 85 percent of tokens and about 100 calls | A measured K/compact baseline (done) | Medium | Medium: prompt, schema (`ClaimList`), quote guard must still hold | Backend-internal `contracts/llm.py`, change-log row | Large reduction in calls | Changes LLM keys, re-record | **Next** (needs approval) |
| Search budget policy (OP-03) | Measured | Every run ends on budget | none | Small | Low | none (config) | Trade searches for time | Re-record | **Next** |
| Cost/latency/token panel | Data exists (`llm_ops`, events carry tokens/cost) | Makes usage visible to users | Persist op stats (events already carry totals) | Small to medium | Low | Possibly additive event/REST fields | none | Show mode label | Later, after replay fix |
| Baseline comparison | `scripts/naive_baseline.py` exists (untracked) | Demonstrates the USP | Clean script, lint | Small | Low | none | One extra live call set | Needs recording | Later |
| Decision sensitivity | Claims, coverage available | Shows what could change the answer | Stable writer output | Medium | Medium | Report contract | Some LLM calls | Yes | Later |
| Prompt-injection demo | Untrusted-tag handling exists | Safety proof | Fixture page | Small | Low | none | none | Fixture based | Later |
| Human source control | No UI/API | User steering | REST + UI | Medium | Medium | New endpoints/contracts | none | Affects determinism | Roadmap-only for now |
| PDF export | none | Deliverable | Report view | Small to medium | Low | none | none | none | Later |
| PDF ingestion | SSRF/content-type guard blocks it | More sources | Fetcher, parser dependency | Medium | Medium (new dependency) | Source kinds | Fetch budget | Fetch recording | Roadmap-only |
| Run history / diff | Runs stored in SQLite | Comparison of runs | Multi-run UI | Medium | Low | REST additions | none | Replay helps | Later |
| Larger golden set | `fixtures/questions.yaml`, audit sheet | Evaluation credibility | Credits per run | Medium | Low | none | Large LLM spend | Recorded runs | Later |
| Freshness/staleness | `backend/intel/freshness.py` (27 lines) | Evidence quality | Dates on sources | Small to medium | Low | Possibly coverage fields | none | none | Later |
| Evidence graph | Origins, claims, conflicts stored | Explainability | UI | Medium to large | Low | none | none | none | Roadmap-only |
| Semantic/vector retrieval | BM25 only | Better passage selection | New dependency and index | Large | High (violates "no vector DB" rule) | none | Embedding calls | New cache kind | Roadmap-only |
| Adaptive evidence budgets, context pruning | Needs per-slot yield data | Spend where coverage is RED | Extractor batching, op stats | Medium | Medium | none | Reduces waste | Re-record | Later |
| Role/model routing | Tier mapping exists (`ROLE_SETTINGS`) | Cheaper FAST tier for more roles | Per-role quality measure | Small | Medium | config | Cost | Re-record | Later |
| Challenge targeting / source prioritisation | Challenge runs once (budget) | More useful challenges | Search policy (OP-03) | Medium | Medium | none | Changes spend | Re-record | Later |
| Evaluation automation | `make benchmark-llm`, summary script | Repeatable, cheaper decisions | Replay fidelity | Small | Low | none | Uses recorded runs | Central | **Next** (after replay) |

## Dependency-Aware Implementation Sequence

1. Review and lint the record/replay scripts, add `make record` / `make replay`, fix OP-01 (record one run,
   replay it, compare the event sequence and stored claims). Unblocks everything that needs deterministic runs.
2. Decide the search-budget policy (OP-03) with a recorded before/after; then re-record the canonical runs.
3. Evaluation automation: benchmark against recorded runs so later LLM changes cost no credits where possible.
4. T24 failure states end to end and the G4 suite.
5. Extractor batching (needs explicit approval: prompt and schema change), measured with the harness.
6. Cost/latency/token panel, baseline comparison, decision sensitivity, prompt-injection demo, PDF export.
7. Larger golden set, run history/diff, freshness, adaptive budgets, routing, challenge targeting.
8. Roadmap-only: human source control, PDF ingestion, evidence graph, semantic retrieval.

## Files changed in this work

`backend/gateway/{__init__,core,llm}.py`, `backend/controller.py`, `backend/intel/verify.py`,
`contracts/config.py`, `Makefile`, `.env.example`, `tests/unit/test_llm_accounting.py`,
`tests/unit/test_runner_wiring.py`, `scripts/{benchmark_llm,bench_summary,run_experiments}.{py,sh}`,
`docs/{STATUS,OPEN_PROBLEMS,LLM_OPTIMIZATION_REPORT,README}.md`, `docs/decisions/README.md`,
`docs/benchmarks/` (raw data; the `.db` files can be deleted). Nothing is committed.
