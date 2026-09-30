"""Would a relevance floor on (source, slot) extractor jobs lose real claims? Offline, no keys.

For every stored run it rebuilds the extractor jobs the pipeline would create (`_relevant_slots`),
adds deterministic relevance features (query-word overlap, BM25 of the best passage), and labels
each job yielding when a stored claim exists for that (source, slot). It then reports, per candidate
floor, how many jobs a floor would skip and how many yielding jobs it would lose (OP-04).

    uv run python -m scripts.extractor_gate_analysis [db ...]
"""

from __future__ import annotations

import re
import sqlite3
import sys
from pathlib import Path

from rank_bm25 import BM25Okapi

from backend.pipeline.claims import MAX_SLOTS_PER_SOURCE, _relevant_slots
from backend.pipeline.discover import STOP_WORDS
from backend.pipeline.extract import _tokens, slot_query_tokens
from backend.store import repo
from contracts.config import Settings

DEFAULT_DBS = sorted(Path("docs/benchmarks").glob("extractor-batch-[13]-*.db"))


def jobs(conn: sqlite3.Connection, run_id: str, k: int) -> list[dict]:
    slots = repo.list_slots(conn, run_id)
    task_slot = {t.id: t.slot_id for t in repo.list_tasks(conn, run_id)}
    claimed = {
        (sid, slot)
        for sid, slot in conn.execute(
            "SELECT p.source_id, c.slot_id FROM claims c JOIN passages p ON p.id = c.passage_id"
            " WHERE c.run_id = ?",
            (run_id,),
        )
    }
    out: list[dict] = []
    for source in repo.list_sources(conn, run_id, status="fetched"):
        passages = repo.list_passages(conn, source.id)
        if not passages:
            continue
        own = task_slot.get(source.task_id or "", "")
        bm25 = BM25Okapi([_tokens(p.text) or [""] for p in passages])
        for slot, top in _relevant_slots(slots, own, passages, k):
            query = slot_query_tokens(slot)
            scores = bm25.get_scores(query)
            qset = set(query) - STOP_WORDS
            overlap = max(
                (len(qset & set(re.findall(r"\w+", p.text.lower()))) for p in top), default=0
            )
            out.append(
                {
                    "own": slot.id == own,
                    "overlap": overlap,
                    "qsize": len(qset),
                    "bm25": float(max(scores)),
                    "passages": len(top),
                    "yield": (source.id, slot.id) in claimed,
                }
            )
    return out


def main(paths: list[Path]) -> None:
    k = Settings().thresholds.passages_per_slot_source
    rows: list[dict] = []
    for path in paths:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        for (run_id,) in conn.execute("SELECT id FROM runs").fetchall():
            rows += jobs(conn, run_id, k)
    yes = [r for r in rows if r["yield"]]
    print(f"jobs={len(rows)} yielding={len(yes)} (max {MAX_SLOTS_PER_SOURCE} slots per source)")
    for name in ("overlap", "bm25"):
        ys, ns = sorted(r[name] for r in yes), sorted(r[name] for r in rows if not r["yield"])
        print(f"{name}: yielding median={ys[len(ys) // 2]:.2f}, zero-yield={ns[len(ns) // 2]:.2f}")
    own, other = [r for r in rows if r["own"]], [r for r in rows if not r["own"]]
    print("yield rate: own-slot jobs", _rate(own), "| other-slot jobs", _rate(other))
    print("floor                       skipped  lost-yielding  passages-saved")
    for label, keep in (
        ("overlap >= 2", lambda r: r["overlap"] >= 2),
        ("overlap >= 3", lambda r: r["overlap"] >= 3),
        ("bm25 >= 1.0", lambda r: r["bm25"] >= 1.0),
        ("bm25 >= 2.0", lambda r: r["bm25"] >= 2.0),
        ("bm25 >= 3.0", lambda r: r["bm25"] >= 3.0),
        ("own, or overlap >= 3", lambda r: r["own"] or r["overlap"] >= 3),
        ("own, or overlap >= 4", lambda r: r["own"] or r["overlap"] >= 4),
        ("own, or overlap >= 5", lambda r: r["own"] or r["overlap"] >= 5),
        ("own, or overlap >= 6", lambda r: r["own"] or r["overlap"] >= 6),
        ("overlap >= 3, other >= 5", lambda r: r["overlap"] >= (3 if r["own"] else 5)),
        ("own, or bm25 >= 2.0", lambda r: r["own"] or r["bm25"] >= 2.0),
    ):
        skip = [r for r in rows if not keep(r)]
        lost = sum(r["yield"] for r in skip)
        print(
            f"{label:<26} {len(skip):>4}/{len(rows)}   {lost:>3}/{len(yes)} ({lost / len(yes):.0%})"
            f"     {sum(r['passages'] for r in skip)}"
        )


def _rate(rs: list[dict]) -> str:
    return f"{sum(r['yield'] for r in rs)}/{len(rs)}"


if __name__ == "__main__":
    main([Path(a) for a in sys.argv[1:]] or DEFAULT_DBS)
