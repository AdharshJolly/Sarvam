# Audit and evaluation

Manual audit protocol (SSOT 16.3): sample up to 20 findings sentences from a completed report, stratified
across dimensions; two reviewers label each supported, partial or unsupported; report the unsupported rate
and inter-rater disagreement unadjusted.

## Files

- `audit_sheet.csv`: the sample, label columns blank. Columns: `run_id, dimension, sentence,
  reviewer_1_label, reviewer_2_label, notes`.
- `evidence_pack.md`: for each sampled sentence, the quote, source URL and status of every claim it cites
  (what the evidence drawer shows). Reviewers work from this file.

## Regenerating

    uv run python -m scripts.sampler <run db> [run_id]

Sentences are the cited bullets under "Findings by dimension", taken round-robin across dimensions with a
fixed seed (reproducible). Current sample: run `R_BENCH_canon-b3-o3_1_179e` (`docs/benchmarks/canon-b3-o3-1.db`,
batch 3 and floor 3). That report has only 15 cited findings, so the sample is all 15 (5 dimensions), below
the 20 the protocol asks for. Nothing has been labelled yet; labels must come from two people, never from
the model that wrote the report.
