"""Replay one recorded run offline and compare it with the live run (OP-01). No credits.

Set the same SARVAM_* knobs and SARVAM_RECORD_DIR as the recording run, then:

    uv run python -m scripts.replay_check docs/benchmarks/canon-b3-o3-1.db

The replay uses the recorded run's question, scope and budget in a fresh database, with provider
keys blanked so any attempt to reach a live provider fails. Settings knobs that change requests
(batch size, floor, K) must match the recording run. Exit status is 0 only when every event and
stored row matches.
"""

from __future__ import annotations

import asyncio
import os
import sqlite3
import sys
import tempfile
from pathlib import Path

from backend.controller import RunHandle, run_research
from backend.store.db import init_db
from contracts.config import Settings

EVENTS = "SELECT type, round, tokens, cost_usd, payload_json FROM events WHERE run_id=? ORDER BY id"
TABLES = {
    "sources": "SELECT id, url, status, content_hash, fail_reason FROM sources ORDER BY id",
    "passages": "SELECT id, source_id, text FROM passages ORDER BY id",
    "claims": "SELECT id, slot_id, text, quote, status FROM claims ORDER BY id",
    "coverage": "SELECT round, slot_id, state, independent_origins FROM coverage ORDER BY id",
    "conflicts": "SELECT slot_id, claim_a, claim_b, status FROM conflicts ORDER BY id",
}


def snapshot(db: Path, run_id: str) -> dict[str, list[tuple]]:
    conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    out = {"events": conn.execute(EVENTS, (run_id,)).fetchall()}
    out |= {name: conn.execute(sql).fetchall() for name, sql in TABLES.items()}
    conn.close()
    return out


async def replay(src: Path, work: Path) -> tuple[str, Path]:
    conn = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
    run_id, question, scope, budget = conn.execute(
        "SELECT id, question, scope_json, budget_json FROM runs"
    ).fetchone()
    conn.close()
    for key in ("SARVAM_LLM_API_KEY", "SARVAM_SEARCH_API_KEY", "SARVAM_SEARCH_FALLBACK_API_KEY"):
        os.environ[key] = "offline-replay-no-key"
    db = work / "replay.db"
    init_db(db).close()
    conn = sqlite3.connect(db)
    conn.execute(
        "INSERT INTO runs (id, question, scope_json, mode, budget_json, status, started_at)"
        " VALUES (?, ?, ?, 'REPLAY', ?, 'queued', datetime('now'))",
        (run_id, question, scope, budget),
    )
    conn.commit()
    conn.close()
    settings = Settings.from_env().model_copy(update={"db_path": db})
    await run_research(run_id, settings=settings, handle=RunHandle())
    return run_id, db


def main(src: Path) -> int:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        run_id, replayed = asyncio.run(replay(src, Path(tmp)))
        live, rep = snapshot(src, run_id), snapshot(replayed, run_id)
    bad = 0
    for name in live:
        a, b = live[name], rep[name]
        same = a == b
        bad += not same
        print(f"{name:<10} live={len(a):>4} replay={len(b):>4} {'MATCH' if same else 'DIFFERENT'}")
        if not same:
            first = next(
                (i for i, (x, y) in enumerate(zip(a, b, strict=False)) if x != y),
                min(len(a), len(b)),
            )
            print(f"  first difference at row {first}:")
            print("   live  :", str(a[first] if first < len(a) else None)[:300])
            print("   replay:", str(b[first] if first < len(b) else None)[:300])
    print("REPLAY FAITHFUL" if not bad else f"REPLAY DIFFERS in {bad} table(s)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1])))
