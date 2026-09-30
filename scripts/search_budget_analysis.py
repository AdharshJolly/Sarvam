"""Where does the search budget go? Offline analysis of stored runs (OP-03, plan phase 3).

For every search a run made (task x query) this lists: round, dimension, slot, query, result count,
stored sources, useful sources (a fetched source with a `supports` verdict), new independent origins
(first reached by that search), duplicate hits (URL already stored by an earlier search of the run),
derivative sources (source joined an origin an earlier search had already reached) and failed
sources. Hits come from the recorded provider responses (`cache/recorded`), so the script needs no
network and no keys; a query with no recording is shown as `no-record`.

Coverage is computed per round, not per search, so it is reported per round (slot states after each
round), never attributed to a single search.

    uv run python -m scripts.search_budget_analysis [db] [run_id ...]
"""

from __future__ import annotations

import json
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

from backend.gateway.record_replay import RecordMode, RecordReplay, cache_key
from backend.pipeline.discover import canonicalize_url, second_query
from contracts.config import Settings
from contracts.models import Scope


def _hits(rec: RecordReplay, provider: str, query: str, max_results: int) -> list[dict] | None:
    key = cache_key({"provider": provider, "query": query, "max_results": max_results})
    path = rec._path("search", key)
    if not path.exists():
        return None
    saved = json.loads(path.read_text(encoding="utf-8"))
    return saved["response"]["hits"] if "response" in saved else []


def analyse(conn: sqlite3.Connection, run_id: str, settings: Settings) -> list[dict]:
    rec = RecordReplay(settings.record_dir, RecordMode.REPLAY)
    t = settings.thresholds
    slots = {r["id"]: r for r in conn.execute("SELECT * FROM slots WHERE run_id=?", (run_id,))}
    tasks = conn.execute(
        "SELECT * FROM tasks WHERE run_id=? ORDER BY round, CAST(SUBSTR(id,2) AS INT)", (run_id,)
    ).fetchall()
    by_task: dict[str, list[sqlite3.Row]] = defaultdict(list)
    for s in conn.execute("SELECT * FROM sources WHERE run_id=?", (run_id,)):
        by_task[s["task_id"]].append(s)
    useful = {
        r[0]
        for r in conn.execute(
            "SELECT DISTINCT p.source_id FROM evidence_links l JOIN passages p ON p.id=l.passage_id"
            " JOIN claims c ON c.id=l.claim_id WHERE c.run_id=? AND l.verdict='supports'",
            (run_id,),
        )
    }
    origin_of = {}
    for o in conn.execute("SELECT * FROM origins WHERE run_id=?", (run_id,)):
        for sid in json.loads(o["members_json"]):
            origin_of[sid] = o["id"]

    rows: list[dict] = []
    seen_urls: set[str] = set()
    seen_origins: set[str] = set()
    provider = settings.search_provider or "tavily"
    for task in tasks:
        slot = slots.get(task["slot_id"])
        queries = [task["query_text"]]
        if t.queries_per_task > 1:
            queries.append(second_query(task["query_text"], slot["name"] if slot else "", Scope()))
        first_urls: set[str] = set()
        mine = by_task.get(task["id"], [])
        for qi, q in enumerate(queries[: t.queries_per_task]):
            hits = _hits(rec, provider, q, t.results_per_query)
            urls = [canonicalize_url(h["url"]) for h in hits or []]
            # a stored source belongs to the first query whose hits contain it
            stored = [
                s
                for s in mine
                if s["canonical_url"] in urls and s["canonical_url"] not in first_urls
            ]
            dup = sum(1 for u in urls if u in seen_urls or u in first_urls)
            new_origin = deriv = 0
            for s in stored:
                o = origin_of.get(s["id"])
                if o is None or o in seen_origins:
                    deriv += 1
                else:
                    seen_origins.add(o)
                    new_origin += 1
            rows.append(
                {
                    "round": task["round"],
                    "task": task["id"],
                    "kind": task["kind"],
                    "dimension": slot["dimension_id"] if slot else "?",
                    "slot": task["slot_id"],
                    "q": qi + 1,
                    "query": q,
                    "results": "no-record" if hits is None else len(urls),
                    "stored": len(stored),
                    "useful": sum(1 for s in stored if s["id"] in useful),
                    "new_origin": new_origin,
                    "duplicate_hits": dup,
                    "derivative": deriv,
                    "failed": sum(1 for s in stored if s["status"] not in ("fetched", "found")),
                }
            )
            first_urls.update(urls)
            seen_urls.update(s["canonical_url"] for s in stored)
    return rows


def coverage_by_round(conn: sqlite3.Connection, run_id: str) -> dict[int, dict[str, int]]:
    out: dict[int, dict[str, int]] = defaultdict(lambda: {"GREEN": 0, "AMBER": 0, "RED": 0})
    for r in conn.execute("SELECT round, state FROM coverage WHERE run_id=?", (run_id,)):
        out[r["round"]][r["state"]] += 1
    return dict(out)


def main(argv: list[str]) -> None:
    settings = Settings.from_env()
    db = Path(argv[0]) if argv else settings.db_path
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    run_ids = argv[1:] or [
        r[0] for r in conn.execute("SELECT id FROM runs WHERE mode='LIVE' ORDER BY started_at")
    ]
    for run_id in run_ids:
        rows = analyse(conn, run_id, settings)
        cov = coverage_by_round(conn, run_id)
        print(f"\n== {run_id}: {len(rows)} searches, coverage by round {cov}")
        print("rnd task kind      slot  q results stored useful new_org dup deriv fail query")
        for r in rows:
            print(
                f"{r['round']:>3} {r['task']:<4} {r['kind']:<9} {r['slot']:<5} {r['q']} "
                f"{r['results']!s:>8} {r['stored']:>6} {r['useful']:>6} {r['new_origin']:>10} "
                f"{r['duplicate_hits']:>8} {r['derivative']:>5} {r['failed']:>6} {r['query'][:55]}"
            )
        for q in (1, 2):
            sel = [r for r in rows if r["q"] == q and r["results"] != "no-record"]
            print(
                f"query #{q}: {len(sel)} searches, stored {sum(r['stored'] for r in sel)}, "
                f"useful {sum(r['useful'] for r in sel)}, "
                f"new origins {sum(r['new_origin'] for r in sel)}, "
                f"derivative {sum(r['derivative'] for r in sel)}"
            )


if __name__ == "__main__":
    main(sys.argv[1:])
