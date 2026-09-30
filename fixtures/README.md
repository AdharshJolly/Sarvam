# Fixtures

Synthetic corpus and expected results for the intelligence layer (SSOT 16.2, task T08). It makes
origins, conflicts, coverage and the verifier testable without network or LLM variance. All names,
companies and domains are fictional (`.example`, plus a government suffix and a blog platform).

| Path | What it is |
| --- | --- |
| `corpus/F01.html` ... `F14.html` | The 14 documents. What each one tests is in `corpus/manifest.json`. |
| `corpus/manifest.json` | URL per document, how the fake fetcher answers (F14 answers 403), the `as_of` date. |
| `expected/plan.json` | The plan the scenario runs under: 4 dimensions, 8 evidence slots. |
| `expected/claims.json` | The claims a good extractor returns, with the verdict a good verifier gives. |
| `expected/sources.json` | Expected qualification (type, tier), fetch status and freshness bucket. |
| `expected/origins.json` | Expected origin clusters, the signals that must fire, and what must never merge. |
| `expected/conflicts.json` | The three planted conflicts and how they are explained (rule or scripted explainer). |
| `expected/coverage.json` | Expected matrix cells, dimension rollups and gap tasks. |
| `questions.yaml` | The five golden questions (SSOT 16.4). |

The scenario in one paragraph: a fictional scooter subscription, VoltRide, launched in Bengaluru. One
press release is copied by four outlets (F02-F05, one of them rewritten) and cited by a blog (F06): six
pages, one origin. The company pricing page (F07) and a news check (F08) are separate origins; F08
gives a different price (planted conflict 1, genuine). F09 quotes a per-day price for the premium plan
that equals F07's per-month price (planted unit trap, explained by rule). F11 gives two market-size
figures under different definitions (planted conflict 3, explained by the explainer).

Run it with `make fixtures`. The tests in `tests/fixtures/` build the corpus through the real
pipeline (`tests/support/corpus.py`): the fake fetcher serves the HTML, `run_acquire` and
`run_extract` create sources and passages, and every seeded quote must pass the quote guard.
`tests/gates/g2` drives the same corpus through `POST /api/runs`.

Changing an expected file changes what the algorithms must do. Do it only with a decision or
change-log row (SSOT 21), never to make a failing test pass.
