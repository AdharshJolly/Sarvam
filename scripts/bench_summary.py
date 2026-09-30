"""Print a compact summary table of one or more docs/benchmarks/<label>.json files."""

from __future__ import annotations

import json
import sys
from pathlib import Path

for label in sys.argv[1:]:
    data = json.loads(Path(f"docs/benchmarks/{label}.json").read_text(encoding="utf-8"))
    print(f"== {label}  knobs={ {k: v for k, v in data['knobs'].items() if k != 'budget'} }")
    for r in data["runs"]:
        c = r["claims"]
        print(
            f"  wall={r['wall_seconds']}s S/F={r['searches']}/{r['fetches']} "
            f"attempts={r['llm_calls_budget_counter']} ops={r['llm_operations']} "
            f"valretry={r['validation_retries']} provreq={r['provider_requests']} "
            f"provretry={r['provider_retries']} tok in/out/tot="
            f"{r['input_tokens']}/{r['output_tokens']}/{r['total_tokens']} "
            f"cost(rep/est/unavail)={r['cost_reported_usd']}/{r['cost_estimated_usd']}/"
            f"{r['cost_unavailable_ops']} claims={c} cov={r['coverage_last_round']} "
            f"rounds={r['rounds']} conf={r['conflicts']} chal={r['challenges']} "
            f"stop={r['stop_state']}/{r['termination_reason']} rv={r['report_verified']} "
            f"failed={r['failed_ops']}"
        )
        for role, v in r["by_role"].items():
            print(
                f"      {role:10s} ops={v['ops']:3d} att={v['validation_attempts']:3d} "
                f"retry={v['provider_retries']} in={v['input_tokens']:6d} "
                f"out={v['output_tokens']:6d} "
                f"lat={v['latency_ms'] // 1000}s fail={v['failed']}"
            )
