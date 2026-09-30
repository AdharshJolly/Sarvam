#!/usr/bin/env bash
# Controlled LLM experiments: one knob per config, same canonical question, N runs each (live).
# Usage: bash scripts/run_experiments.sh [RUNS]   (results: docs/benchmarks/<label>.json)
set -u
RUNS="${1:-2}"
run() {
  label="$1"; shift
  echo "### $label"
  env "$@" PYTHONUNBUFFERED=1 uv run python -m scripts.benchmark_llm --label "$label" --runs "$RUNS"
}
run exp_tokens_lowceil SARVAM_LLM_MAX_TOKENS=planner=1800,extractor=1200,verifier=800,challenger=1800,writer=2500,explainer=700
run exp_compact_json SARVAM_LLM_COMPACT_JSON=1
run exp_k5 SARVAM_PASSAGES_PER_SLOT=5
run exp_k4 SARVAM_PASSAGES_PER_SLOT=4
run exp_batch8 SARVAM_VERIFIER_BATCH_SIZE=8
run exp_batch10 SARVAM_VERIFIER_BATCH_SIZE=10
run exp_conc4 SARVAM_LLM_CONCURRENCY=4
run exp_conc6 SARVAM_LLM_CONCURRENCY=6
run exp_conc8 SARVAM_LLM_CONCURRENCY=8
echo ALL_DONE
