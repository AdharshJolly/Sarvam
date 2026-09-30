"""LLM benchmark harness: run the canonical question N times and report LLM usage and outcome.

    uv run python -m scripts.benchmark_llm --label baseline --runs 3
    SARVAM_LLM_MAX_TOKENS=planner=1800 uv run python -m scripts.benchmark_llm --label tokens

Each run uses a fresh database under the output directory. Configuration comes from the normal
SARVAM_* environment (Settings.from_env), so experiments are plain environment overrides. Results go
to docs/benchmarks/<label>.json. Set SARVAM_RECORD=1 to also record provider responses for replay.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sqlite3
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path

from backend.controller import RunHandle, run_research
from backend.store.db import init_db
from contracts.config import Settings
from contracts.models import Mode, Scope

QUESTION = "Should a company launch an electric scooter subscription service in Bengaluru in 2027?"
OUT_DIR = Path("docs/benchmarks")


def _q(conn: sqlite3.Connection, sql: str, *args) -> list[tuple]:
    return [tuple(r) for r in conn.execute(sql, args).fetchall()]


def collect(conn: sqlite3.Connection, run_id: str, handle: RunHandle, wall: float) -> dict:
    gw = handle.gateway
    usage = gw.usage() if gw else None
    ops = gw.llm_ops if gw else []
    by_role: dict[str, dict] = {}
    for o in ops:
        r = by_role.setdefault(
            o.role,
            dict(
                ops=0,
                validation_attempts=0,
                provider_requests=0,
                provider_retries=0,
                input_tokens=0,
                output_tokens=0,
                total_tokens=0,
                cost_usd=0.0,
                latency_ms=0,
                failed=0,
            ),
        )
        r["ops"] += 1
        r["validation_attempts"] += o.validation_attempts
        r["provider_requests"] += o.provider_requests
        r["provider_retries"] += o.provider_retries
        r["input_tokens"] += o.input_tokens or 0
        r["output_tokens"] += o.output_tokens or 0
        r["total_tokens"] += o.total_tokens or 0
        r["cost_usd"] += o.cost_usd or 0.0
        r["latency_ms"] += o.latency_ms
        r["failed"] += o.status != "ok"
    claims = dict(
        _q(conn, "SELECT status, COUNT(*) FROM claims WHERE run_id=? GROUP BY status", run_id)
    )
    last_round = (_q(conn, "SELECT MAX(round) FROM coverage WHERE run_id=?", run_id)[0][0]) or 0
    cov = dict(
        _q(
            conn,
            "SELECT state, COUNT(*) FROM coverage WHERE run_id=? AND round=? GROUP BY state",
            run_id,
            last_round,
        )
    )
    conflicts = dict(
        _q(conn, "SELECT status, COUNT(*) FROM conflicts WHERE run_id=? GROUP BY status", run_id)
    )
    challenges = dict(
        _q(
            conn,
            "SELECT COALESCE(outcome,'none'), COUNT(*) FROM challenges WHERE run_id=? GROUP BY 1",
            run_id,
        )
    )
    etypes = dict(
        _q(conn, "SELECT type, COUNT(*) FROM events WHERE run_id=? GROUP BY type", run_id)
    )
    run = _q(conn, "SELECT status, stop_state, termination_reason FROM runs WHERE id=?", run_id)[0]
    rv = _q(
        conn, "SELECT payload_json FROM events WHERE run_id=? AND type='report.verified'", run_id
    )
    report = json.loads(rv[-1][0]) if rv else None
    cb = gw.cost_breakdown() if gw else None
    return dict(
        run_id=run_id,
        wall_seconds=round(wall, 1),
        status=run[0],
        stop_state=run[1],
        termination_reason=run[2],
        searches=usage.searches if usage else None,
        fetches=usage.fetches if usage else None,
        llm_calls_budget_counter=usage.llm_calls if usage else None,  # = validation attempts
        llm_operations=len(ops),
        validation_retries=sum(max(o.validation_attempts - 1, 0) for o in ops),
        provider_requests=sum(o.provider_requests for o in ops),
        provider_retries=sum(o.provider_retries for o in ops),
        input_tokens=sum(o.input_tokens or 0 for o in ops),
        output_tokens=sum(o.output_tokens or 0 for o in ops),
        total_tokens=sum(o.total_tokens or 0 for o in ops),
        cost_reported_usd=cb.reported_usd if cb else None,
        cost_estimated_usd=cb.estimated_usd if cb else None,
        cost_unavailable_ops=cb.unavailable_ops if cb else None,
        claims=claims,
        coverage_last_round=cov,
        rounds=last_round,
        conflicts=conflicts,
        challenges=challenges,
        events=etypes,
        report_verified=report,
        by_role=by_role,
        extractor_batching=dict(
            batch_size=gw.settings.extractor_batch_size if gw else None,
            ops=sum(1 for o in ops if o.role == "extractor"),
            slots=sum(o.meta.get("batch_slots", 0) for o in ops if o.role == "extractor"),
            unique_passages=sum(
                o.meta.get("batch_passages", 0) for o in ops if o.role == "extractor"
            ),
        ),
        failed_ops=[[o.role, o.status] for o in ops if o.status != "ok"],
    )


async def one(settings: Settings, label: str, i: int) -> dict:
    run_id = f"R_BENCH_{label}_{i}_{uuid.uuid4().hex[:4]}"
    db = OUT_DIR / f"{label}-{i}.db"
    db.parent.mkdir(parents=True, exist_ok=True)
    db.unlink(missing_ok=True)
    init_db(db).close()
    st = settings.model_copy(update={"db_path": db})
    conn = sqlite3.connect(db)
    conn.execute(
        "INSERT INTO runs (id, question, scope_json, mode, budget_json, status, started_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            run_id,
            QUESTION,
            Scope().model_dump_json(),
            Mode.LIVE.value,
            st.budget.model_dump_json(),
            "queued",
            datetime.now(UTC).isoformat(),
        ),
    )
    conn.commit()
    handle = RunHandle()
    start = time.perf_counter()
    err = None
    try:
        await run_research(run_id, settings=st, handle=handle)
    except Exception as exc:  # noqa: BLE001 - the harness reports the failure and moves on
        err = f"{type(exc).__name__}: {exc}"
    res = collect(conn, run_id, handle, time.perf_counter() - start)
    res["harness_error"] = err
    conn.close()
    return res


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", required=True)
    ap.add_argument("--runs", type=int, default=3)
    args = ap.parse_args()
    settings = Settings.from_env()
    knobs = dict(
        max_tokens=settings.llm_max_tokens,
        compact_json=settings.llm_compact_json,
        passages_per_slot=settings.thresholds.passages_per_slot_source,
        verifier_batch=settings.verifier_batch_size,
        extractor_batch=settings.extractor_batch_size,
        extractor_min_overlap=settings.thresholds.extractor_min_overlap,
        llm_concurrency=settings.llm_concurrency,
        models=[settings.llm_model_fast, settings.llm_model_strong],
        budget=settings.budget.model_dump(),
    )
    results = []
    for i in range(args.runs):
        print(f"[{args.label}] run {i + 1}/{args.runs}", flush=True)
        results.append(await one(settings, args.label, i + 1))
        print(
            json.dumps(
                {
                    k: results[-1][k]
                    for k in (
                        "wall_seconds",
                        "status",
                        "stop_state",
                        "termination_reason",
                        "llm_calls_budget_counter",
                        "total_tokens",
                        "cost_reported_usd",
                        "claims",
                        "harness_error",
                    )
                }
            ),
            flush=True,
        )
        (OUT_DIR / f"{args.label}.json").write_text(
            json.dumps(
                dict(label=args.label, question=QUESTION, knobs=knobs, runs=results), indent=1
            ),
            encoding="utf-8",
        )


if __name__ == "__main__":
    asyncio.run(main())
