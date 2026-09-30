"""Plain-SQL persistence helpers returning contract models (no ORM, SSOT ADR-101).

Insert helpers that allocate a global id (`next_id`) insert the row and commit in one transaction,
so concurrent runs never collide (decision B-09).
"""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Callable
from datetime import UTC, datetime

from backend.intel.coverage import CoverageDimension, CoverageSlot, rollup_dimensions
from backend.store.ids import next_id
from contracts.config import Thresholds
from contracts.events import EventType
from contracts.models import (
    Budget,
    BudgetUsage,
    Challenge,
    CitationRef,
    Claim,
    ClaimEvidence,
    Conflict,
    CoverageCell,
    CoverageState,
    Dimension,
    DimensionRollup,
    EvidenceLink,
    EvidenceSlot,
    Mode,
    Origin,
    Passage,
    Phase,
    Plan,
    PlanDimension,
    PlanSlot,
    PlanTask,
    Report,
    ReportView,
    RoundRollups,
    Run,
    RunState,
    RunSummary,
    Scope,
    Source,
    StopDecision,
    Task,
    Verdict,
)


def _dt(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


# ---------------------------------------------------------------- runs


def row_to_run(row: sqlite3.Row) -> Run:
    user_id = row["user_id"] if "user_id" in row.keys() else None
    return Run(
        id=row["id"],
        user_id=user_id,
        question=row["question"],
        scope=Scope.model_validate_json(row["scope_json"]),
        mode=Mode(row["mode"]),
        budget=Budget.model_validate_json(row["budget_json"]),
        status=row["status"],
        stop_state=row["stop_state"],
        termination_reason=row["termination_reason"],
        started_at=datetime.fromisoformat(row["started_at"]),
        ended_at=_dt(row["ended_at"]),
    )


def get_run(conn: sqlite3.Connection, run_id: str) -> Run | None:
    row = conn.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
    return row_to_run(row) if row else None


def set_run_status(
    conn: sqlite3.Connection,
    run_id: str,
    status: str,
    *,
    termination_reason: str | None = None,
    stop_state: str | None = None,
    ended: bool = False,
) -> None:
    conn.execute(
        "UPDATE runs SET status=?, termination_reason=COALESCE(?, termination_reason),"
        " stop_state=COALESCE(?, stop_state), ended_at=CASE WHEN ? THEN ? ELSE ended_at END"
        " WHERE id=?",
        (status, termination_reason, stop_state, int(ended), now_iso(), run_id),
    )
    conn.commit()


def get_phase(conn: sqlite3.Connection, run_id: str) -> Phase | None:
    """Current phase = payload of the latest phase.entered event (no phase column)."""
    row = conn.execute(
        "SELECT payload_json FROM events WHERE run_id=? AND type=? ORDER BY id DESC LIMIT 1",
        (run_id, EventType.PHASE_ENTERED.value),
    ).fetchone()
    return Phase(json.loads(row["payload_json"])["phase"]) if row else None


def build_usage(
    conn: sqlite3.Connection, run_id: str, thresholds: Thresholds | None = None
) -> BudgetUsage:
    """Usage reconstructed from events (the live gateway meters are more exact while running).

    searches is approximated as started tasks x queries per task; llm_calls counts events that
    carry token counts; cost sums reported cost_usd.
    """
    t = thresholds or Thresholds()
    counts = {
        r["type"]: r["n"]
        for r in conn.execute(
            "SELECT type, COUNT(*) AS n FROM events WHERE run_id=? GROUP BY type", (run_id,)
        )
    }
    agg = conn.execute(
        "SELECT COALESCE(SUM(cost_usd), 0) AS cost,"
        " SUM(CASE WHEN tokens IS NOT NULL THEN 1 ELSE 0 END) AS llm,"
        " MIN(ts) AS t0, MAX(ts) AS t1 FROM events WHERE run_id=?",
        (run_id,),
    ).fetchone()
    elapsed = 0.0
    if agg["t0"] and agg["t1"]:
        elapsed = (
            datetime.fromisoformat(agg["t1"]) - datetime.fromisoformat(agg["t0"])
        ).total_seconds()
    return BudgetUsage(
        searches=counts.get(EventType.TASK_STARTED.value, 0) * t.queries_per_task,
        fetches=counts.get(EventType.SOURCE_FETCHED.value, 0)
        + counts.get(EventType.SOURCE_FAILED.value, 0),
        llm_calls=agg["llm"] or 0,
        cost_usd=float(agg["cost"]),
        elapsed_seconds=elapsed,
    )


def last_event_id(conn: sqlite3.Connection, run_id: str) -> int:
    row = conn.execute("SELECT COALESCE(MAX(id), 0) FROM events WHERE run_id=?", (run_id,))
    return int(row.fetchone()[0])


# ---------------------------------------------------------------- plan rows


def insert_plan(conn: sqlite3.Connection, run_id: str, plan: Plan) -> None:
    """Persist dimensions, slots and initial tasks for a normalised plan (round 0)."""
    for dim in plan.dimensions:
        conn.execute(
            "INSERT INTO dimensions (id, run_id, name, description, critical) VALUES (?,?,?,?,?)",
            (dim.id, run_id, dim.name, dim.description, int(dim.critical)),
        )
        for slot in dim.slots:
            conn.execute(
                "INSERT INTO slots (id, run_id, dimension_id, name, description, critical,"
                " attributes_json, min_independent, primary_ok) VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    slot.id,
                    run_id,
                    dim.id,
                    slot.name,
                    slot.description,
                    int(slot.critical),
                    json.dumps(slot.attributes),
                    slot.min_independent,
                    int(slot.primary_ok),
                ),
            )
            for task in slot.tasks:
                conn.execute(
                    "INSERT INTO tasks (id, run_id, slot_id, query_text, kind, round, status)"
                    " VALUES (?,?,?,?, 'initial', 0, 'pending')",
                    (task.id, run_id, slot.id, task.query),
                )
    conn.commit()


def get_plan(conn: sqlite3.Connection, run_id: str) -> Plan | None:
    run = get_run(conn, run_id)
    dims = conn.execute("SELECT * FROM dimensions WHERE run_id=? ORDER BY rowid", (run_id,))
    dims = list(dims)
    if run is None or not dims:
        return None
    out: list[PlanDimension] = []
    for d in dims:
        slots: list[PlanSlot] = []
        for s in conn.execute(
            "SELECT * FROM slots WHERE run_id=? AND dimension_id=? ORDER BY rowid",
            (run_id, d["id"]),
        ):
            tasks = [
                PlanTask(id=t["id"], query=t["query_text"])
                for t in conn.execute(
                    "SELECT * FROM tasks WHERE run_id=? AND slot_id=? AND kind='initial'"
                    " ORDER BY rowid",
                    (run_id, s["id"]),
                )
            ]
            slots.append(
                PlanSlot(
                    id=s["id"],
                    name=s["name"],
                    description=s["description"],
                    critical=bool(s["critical"]),
                    attributes=json.loads(s["attributes_json"]),
                    min_independent=s["min_independent"],
                    primary_ok=bool(s["primary_ok"]),
                    tasks=tasks,
                )
            )
        out.append(
            PlanDimension(
                id=d["id"],
                name=d["name"],
                description=d["description"],
                critical=bool(d["critical"]),
                slots=slots,
            )
        )
    return Plan(dimensions=out, budget=run.budget)


def list_slots(conn: sqlite3.Connection, run_id: str) -> list[EvidenceSlot]:
    return [
        EvidenceSlot(
            id=s["id"],
            run_id=run_id,
            dimension_id=s["dimension_id"],
            name=s["name"],
            description=s["description"],
            critical=bool(s["critical"]),
            attributes=json.loads(s["attributes_json"]),
            min_independent=s["min_independent"],
            primary_ok=bool(s["primary_ok"]),
        )
        for s in conn.execute("SELECT * FROM slots WHERE run_id=? ORDER BY rowid", (run_id,))
    ]


def list_dimensions(conn: sqlite3.Connection, run_id: str) -> list[Dimension]:
    return [
        Dimension(
            id=d["id"],
            run_id=run_id,
            name=d["name"],
            description=d["description"],
            critical=bool(d["critical"]),
        )
        for d in conn.execute("SELECT * FROM dimensions WHERE run_id=? ORDER BY rowid", (run_id,))
    ]


def _task(row: sqlite3.Row) -> Task:
    return Task(
        id=row["id"],
        run_id=row["run_id"],
        slot_id=row["slot_id"],
        query_text=row["query_text"],
        kind=row["kind"],
        round=row["round"],
        status=row["status"],
    )


def list_tasks(
    conn: sqlite3.Connection, run_id: str, *, status: str | None = None, round: int | None = None
) -> list[Task]:
    sql, args = "SELECT * FROM tasks WHERE run_id=?", [run_id]
    if status is not None:
        sql, args = sql + " AND status=?", args + [status]
    if round is not None:
        sql, args = sql + " AND round=?", args + [round]
    return [_task(r) for r in conn.execute(sql + " ORDER BY rowid", args)]


def set_task_status(conn: sqlite3.Connection, run_id: str, task_id: str, status: str) -> None:
    conn.execute("UPDATE tasks SET status=? WHERE run_id=? AND id=?", (status, run_id, task_id))
    conn.commit()


# ---------------------------------------------------------------- sources, passages, claims


def _source(row: sqlite3.Row) -> Source:
    return Source(
        id=row["id"],
        run_id=row["run_id"],
        url=row["url"],
        canonical_url=row["canonical_url"],
        domain=row["domain"],
        publisher=row["publisher"],
        source_type=row["source_type"],
        authority_tier=row["authority_tier"],
        published_at=_dt(row["published_at"]),
        retrieved_at=_dt(row["retrieved_at"]),
        content_hash=row["content_hash"],
        status=row["status"],
        fail_reason=row["fail_reason"],
        origin_id=row["origin_id"],
        task_id=row["task_id"],
    )


def source_exists(conn: sqlite3.Connection, run_id: str, canonical_url: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sources WHERE run_id=? AND canonical_url=?", (run_id, canonical_url)
    ).fetchone()
    return row is not None


def insert_source(
    conn: sqlite3.Connection,
    run_id: str,
    *,
    url: str,
    canonical_url: str,
    domain: str,
    publisher: str | None,
    source_type: str,
    authority_tier: int,
    task_id: str | None,
) -> Source:
    sid = next_id(conn, "S")
    conn.execute(
        "INSERT INTO sources (id, run_id, url, canonical_url, domain, publisher, source_type,"
        " authority_tier, status, task_id) VALUES (?,?,?,?,?,?,?,?, 'found', ?)",
        (
            sid,
            run_id,
            url,
            canonical_url,
            domain,
            publisher,
            source_type,
            authority_tier,
            task_id,
        ),
    )
    conn.commit()
    return get_source(conn, sid)  # type: ignore[return-value]


def get_source(conn: sqlite3.Connection, source_id: str) -> Source | None:
    row = conn.execute("SELECT * FROM sources WHERE id=?", (source_id,)).fetchone()
    return _source(row) if row else None


def list_sources(
    conn: sqlite3.Connection, run_id: str, *, status: str | None = None
) -> list[Source]:
    sql, args = "SELECT * FROM sources WHERE run_id=?", [run_id]
    if status is not None:
        sql, args = sql + " AND status=?", args + [status]
    return [_source(r) for r in conn.execute(sql + " ORDER BY rowid", args)]


def update_source(conn: sqlite3.Connection, source_id: str, **fields: object) -> None:
    allowed = {
        "status",
        "fail_reason",
        "content_hash",
        "retrieved_at",
        "published_at",
        "origin_id",
    }
    bad = set(fields) - allowed
    if bad:
        raise ValueError(f"cannot update source fields: {sorted(bad)}")
    if not fields:
        return
    cols = ", ".join(f"{k}=?" for k in fields)
    conn.execute(f"UPDATE sources SET {cols} WHERE id=?", [*fields.values(), source_id])
    conn.commit()


def _passage(row: sqlite3.Row) -> Passage:
    return Passage(
        id=row["id"],
        source_id=row["source_id"],
        idx=row["idx"],
        text=row["text"],
        char_start=row["char_start"],
        char_end=row["char_end"],
    )


def insert_passages(
    conn: sqlite3.Connection, source_id: str, items: list[tuple[str, int, int]]
) -> list[Passage]:
    """Insert (text, char_start, char_end) rows for a source in one transaction."""
    out: list[Passage] = []
    for idx, (text, start, end) in enumerate(items):
        pid = next_id(conn, "P")
        conn.execute(
            "INSERT INTO passages (id, source_id, idx, text, char_start, char_end)"
            " VALUES (?,?,?,?,?,?)",
            (pid, source_id, idx, text, start, end),
        )
        out.append(
            Passage(id=pid, source_id=source_id, idx=idx, text=text, char_start=start, char_end=end)
        )
    conn.commit()
    return out


def get_passage(conn: sqlite3.Connection, passage_id: str) -> Passage | None:
    row = conn.execute("SELECT * FROM passages WHERE id=?", (passage_id,)).fetchone()
    return _passage(row) if row else None


def list_passages(conn: sqlite3.Connection, source_id: str) -> list[Passage]:
    rows = conn.execute("SELECT * FROM passages WHERE source_id=? ORDER BY idx", (source_id,))
    return [_passage(r) for r in rows]


def _claim(row: sqlite3.Row) -> Claim:
    return Claim(
        id=row["id"],
        run_id=row["run_id"],
        slot_id=row["slot_id"],
        round=row["round"],
        text=row["text"],
        entity=row["entity"],
        attribute=row["attribute"],
        value_num=row["value_num"],
        unit=row["unit"],
        period=row["period"],
        quote=row["quote"],
        passage_id=row["passage_id"],
        quote_verified=bool(row["quote_verified"]),
        status=row["status"],
    )


def insert_claim(
    conn: sqlite3.Connection,
    run_id: str,
    *,
    slot_id: str,
    text: str,
    quote: str,
    passage_id: str,
    round: int = 0,
    entity: str | None = None,
    attribute: str | None = None,
    value_num: float | None = None,
    unit: str | None = None,
    period: str | None = None,
    quote_verified: bool = True,
) -> Claim:
    cid = next_id(conn, "C")
    conn.execute(
        "INSERT INTO claims (id, run_id, slot_id, round, text, entity, attribute, value_num,"
        " unit, period, quote, passage_id, quote_verified, status)"
        " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending')",
        (
            cid,
            run_id,
            slot_id,
            round,
            text,
            entity,
            attribute,
            value_num,
            unit,
            period,
            quote,
            passage_id,
            int(quote_verified),
        ),
    )
    conn.commit()
    return get_claim(conn, cid)  # type: ignore[return-value]


def get_claim(conn: sqlite3.Connection, claim_id: str) -> Claim | None:
    row = conn.execute("SELECT * FROM claims WHERE id=?", (claim_id,)).fetchone()
    return _claim(row) if row else None


def list_claims(
    conn: sqlite3.Connection, run_id: str, *, include_rejected: bool = True
) -> list[Claim]:
    sql = "SELECT * FROM claims WHERE run_id=?"
    if not include_rejected:
        sql += " AND status != 'rejected'"
    return [_claim(r) for r in conn.execute(sql + " ORDER BY rowid", (run_id,))]


# Verdict -> claim status (FR-10, decision B-21). Only supports and partial stay evidence; a claim
# its own passage contradicts, or that is irrelevant to its slot, is dropped as `rejected`.
# `contested` is never set here: it means "member of an open numeric conflict" (SSOT 9.11) and is
# derived by the conflict detector.
VERDICT_STATUS = {
    Verdict.SUPPORTS: "supported",
    Verdict.PARTIAL: "partial",
    Verdict.CONTRADICTS: "rejected",
    Verdict.IRRELEVANT: "rejected",
}


def record_verdict(
    conn: sqlite3.Connection, claim_id: str, verdict: Verdict, rationale: str = ""
) -> EvidenceLink:
    """Store the judge's verdict for a claim-passage pair and update the claim status."""
    claim = get_claim(conn, claim_id)
    if claim is None:
        raise ValueError(f"unknown claim {claim_id}")
    lid = next_id(conn, "L")
    conn.execute(
        "INSERT INTO evidence_links (id, claim_id, passage_id, verdict, verdict_rationale)"
        " VALUES (?,?,?,?,?)",
        (lid, claim_id, claim.passage_id, verdict.value, rationale),
    )
    conn.execute("UPDATE claims SET status=? WHERE id=?", (VERDICT_STATUS[verdict], claim_id))
    conn.commit()
    return EvidenceLink(
        id=lid,
        claim_id=claim_id,
        passage_id=claim.passage_id,
        verdict=verdict,
        verdict_rationale=rationale,
    )


def latest_verdicts(conn: sqlite3.Connection, run_id: str) -> dict[str, EvidenceLink]:
    """Most recent evidence link per claim of the run."""
    out: dict[str, EvidenceLink] = {}
    rows = conn.execute(
        "SELECT l.* FROM evidence_links l JOIN claims c ON c.id=l.claim_id"
        " WHERE c.run_id=? ORDER BY l.rowid",
        (run_id,),
    )
    for r in rows:
        out[r["claim_id"]] = EvidenceLink(
            id=r["id"],
            claim_id=r["claim_id"],
            passage_id=r["passage_id"],
            verdict=r["verdict"],
            verdict_rationale=r["verdict_rationale"],
        )
    return out


def list_unverified_claims(conn: sqlite3.Connection, run_id: str) -> list[Claim]:
    """Quote-verified claims that no judge has labelled yet (FR-10, delta-only per FR-16)."""
    rows = conn.execute(
        "SELECT * FROM claims WHERE run_id=? AND quote_verified=1 AND status='pending'"
        " AND id NOT IN (SELECT claim_id FROM evidence_links) ORDER BY rowid",
        (run_id,),
    )
    return [_claim(r) for r in rows]


def set_claim_statuses(conn: sqlite3.Connection, statuses: dict[str, str]) -> None:
    """Bulk status update (used by conflict detection to mark/unmark `contested`)."""
    conn.executemany(
        "UPDATE claims SET status=? WHERE id=?", [(st, cid) for cid, st in statuses.items()]
    )
    conn.commit()


# ---------------------------------------------------------------- reports


def insert_report(
    conn: sqlite3.Connection,
    run_id: str,
    *,
    markdown: str,
    dropped_sentences: list[str],
    certainty_state: str | None = None,
) -> Report:
    version = conn.execute(
        "SELECT COALESCE(MAX(version), 0) + 1 FROM reports WHERE run_id=?", (run_id,)
    ).fetchone()[0]
    rid = next_id(conn, "RP")
    conn.execute(
        "INSERT INTO reports (id, run_id, version, markdown, certainty_state,"
        " dropped_sentences_json) VALUES (?,?,?,?,?,?)",
        (rid, run_id, version, markdown, certainty_state, json.dumps(dropped_sentences)),
    )
    conn.commit()
    return Report(
        id=rid,
        run_id=run_id,
        version=version,
        markdown=markdown,
        certainty_state=certainty_state,
        dropped_sentences=dropped_sentences,
    )


def build_report_view(conn: sqlite3.Connection, run_id: str) -> ReportView | None:
    row = conn.execute(
        "SELECT * FROM reports WHERE run_id=? ORDER BY version DESC LIMIT 1", (run_id,)
    ).fetchone()
    if row is None:
        return None
    cited = sorted(set(_cited_claim_ids(row["markdown"])))
    citations: list[CitationRef] = []
    for cid in cited:
        r = conn.execute(
            "SELECT c.id AS cid, c.passage_id AS pid, s.id AS sid, s.url AS url FROM claims c"
            " JOIN passages p ON p.id=c.passage_id JOIN sources s ON s.id=p.source_id"
            " WHERE c.id=? AND c.run_id=?",
            (cid, run_id),
        ).fetchone()
        if r:
            citations.append(
                CitationRef(
                    claim_id=r["cid"], passage_id=r["pid"], source_id=r["sid"], url=r["url"]
                )
            )
    return ReportView(
        run_id=run_id,
        version=row["version"],
        markdown=row["markdown"],
        certainty_state=row["certainty_state"],
        dropped_sentences=json.loads(row["dropped_sentences_json"]),
        citations=citations,
    )


def _cited_claim_ids(markdown: str) -> list[str]:
    import re

    return re.findall(r"\[(C\d+)\]", markdown)


# ---------------------------------------------------------------- snapshots


def _origins(conn: sqlite3.Connection, run_id: str) -> list[Origin]:
    return [
        Origin(
            id=r["id"],
            run_id=run_id,
            label=r["label"],
            method=r["method"],
            member_source_ids=json.loads(r["members_json"]),
        )
        for r in conn.execute("SELECT * FROM origins WHERE run_id=? ORDER BY rowid", (run_id,))
    ]


def list_origins(conn: sqlite3.Connection, run_id: str) -> list[Origin]:
    return _origins(conn, run_id)


def replace_origins(conn: sqlite3.Connection, run_id: str, origins: list[Origin]) -> None:
    """Replace the run's origin rows and point every member source at its origin (one
    transaction). Origins are recomputed after every round; ids are kept stable by the caller."""
    conn.execute("DELETE FROM origins WHERE run_id=?", (run_id,))
    conn.execute("UPDATE sources SET origin_id=NULL WHERE run_id=?", (run_id,))
    for o in origins:
        conn.execute(
            "INSERT INTO origins (id, run_id, label, method, members_json) VALUES (?,?,?,?,?)",
            (o.id, run_id, o.label, o.method.value, json.dumps(o.member_source_ids)),
        )
        conn.executemany(
            "UPDATE sources SET origin_id=? WHERE id=?",
            [(o.id, sid) for sid in o.member_source_ids],
        )
    conn.commit()


def _conflicts(conn: sqlite3.Connection, run_id: str) -> list[Conflict]:
    return [
        Conflict(
            id=r["id"],
            run_id=run_id,
            slot_id=r["slot_id"],
            claim_a=r["claim_a"],
            claim_b=r["claim_b"],
            delta_pct=r["delta_pct"],
            kind=r["kind"],
            status=r["status"],
            explanation=r["explanation"],
        )
        for r in conn.execute("SELECT * FROM conflicts WHERE run_id=? ORDER BY rowid", (run_id,))
    ]


def list_conflicts(conn: sqlite3.Connection, run_id: str) -> list[Conflict]:
    return _conflicts(conn, run_id)


def insert_conflict(
    conn: sqlite3.Connection,
    run_id: str,
    *,
    slot_id: str,
    claim_a: str,
    claim_b: str,
    delta_pct: float,
    kind: str,
    status: str,
    explanation: str | None,
) -> Conflict:
    cid = next_id(conn, "X")
    conn.execute(
        "INSERT INTO conflicts (id, run_id, slot_id, claim_a, claim_b, delta_pct, kind, status,"
        " explanation) VALUES (?,?,?,?,?,?,?,?,?)",
        (cid, run_id, slot_id, claim_a, claim_b, delta_pct, kind, status, explanation),
    )
    conn.commit()
    return next(c for c in _conflicts(conn, run_id) if c.id == cid)


def update_conflict(conn: sqlite3.Connection, conflict_id: str, **fields: object) -> None:
    allowed = {"claim_a", "claim_b", "delta_pct", "kind", "status", "explanation"}
    bad = set(fields) - allowed
    if bad:
        raise ValueError(f"cannot update conflict fields: {sorted(bad)}")
    if fields:
        cols = ", ".join(f"{k}=?" for k in fields)
        conn.execute(f"UPDATE conflicts SET {cols} WHERE id=?", [*fields.values(), conflict_id])
        conn.commit()


def _coverage(conn: sqlite3.Connection, run_id: str) -> list[CoverageCell]:
    return [
        CoverageCell(
            id=r["id"],
            run_id=run_id,
            round=r["round"],
            slot_id=r["slot_id"],
            state=r["state"],
            independent_origins=r["independent_origins"],
            supporting_claims=r["supporting_claims"],
            open_conflicts=r["open_conflicts"],
            reason=r["reason"],
        )
        for r in conn.execute("SELECT * FROM coverage WHERE run_id=? ORDER BY rowid", (run_id,))
    ]


def list_coverage(
    conn: sqlite3.Connection, run_id: str, *, round: int | None = None
) -> list[CoverageCell]:
    cells = _coverage(conn, run_id)
    return cells if round is None else [c for c in cells if c.round == round]


def replace_coverage_round(
    conn: sqlite3.Connection, run_id: str, round: int, cells: list[dict]
) -> list[CoverageCell]:
    """Store the coverage matrix of one round (idempotent: the round's rows are replaced).
    `cells` hold slot_id, state, independent_origins, supporting_claims, open_conflicts, reason."""
    conn.execute("DELETE FROM coverage WHERE run_id=? AND round=?", (run_id, round))
    for cell in cells:
        cid = next_id(conn, "V")
        conn.execute(
            "INSERT INTO coverage (id, run_id, round, slot_id, state, independent_origins,"
            " supporting_claims, open_conflicts, reason) VALUES (?,?,?,?,?,?,?,?,?)",
            (
                cid,
                run_id,
                round,
                cell["slot_id"],
                cell["state"],
                cell["independent_origins"],
                cell["supporting_claims"],
                cell["open_conflicts"],
                cell["reason"],
            ),
        )
    conn.commit()
    return list_coverage(conn, run_id, round=round)


def insert_task(
    conn: sqlite3.Connection, run_id: str, *, slot_id: str, query: str, kind: str, round: int
) -> Task:
    """Add a follow-up task (gap or challenge). Task ids are per run: T1, T2, ..."""
    row = conn.execute(
        "SELECT COALESCE(MAX(CAST(SUBSTR(id, 2) AS INTEGER)), 0) + 1 FROM tasks WHERE run_id=?",
        (run_id,),
    ).fetchone()
    tid = f"T{row[0]}"
    conn.execute(
        "INSERT INTO tasks (id, run_id, slot_id, query_text, kind, round, status)"
        " VALUES (?,?,?,?,?,?, 'pending')",
        (tid, run_id, slot_id, query, kind, round),
    )
    conn.commit()
    return next(t for t in list_tasks(conn, run_id) if t.id == tid)


def _challenges(conn: sqlite3.Connection, run_id: str) -> list[Challenge]:
    return [
        Challenge(
            id=r["id"],
            run_id=run_id,
            round=r["round"],
            attack=r["attack"],
            target_slot=r["target_slot"],
            target_claim=r["target_claim"],
            required_evidence=r["required_evidence"],
            would_change_if=r["would_change_if"],
            followup_task_ids=json.loads(r["followup_task_ids"]),
            outcome=r["outcome"],
        )
        for r in conn.execute("SELECT * FROM challenges WHERE run_id=? ORDER BY rowid", (run_id,))
    ]


def list_challenges(conn: sqlite3.Connection, run_id: str) -> list[Challenge]:
    return _challenges(conn, run_id)


def insert_challenge(
    conn: sqlite3.Connection,
    run_id: str,
    *,
    round: int,
    attack: str,
    target_slot: str | None,
    target_claim: str | None,
    required_evidence: str,
    would_change_if: str,
    followup_task_ids: list[str],
) -> Challenge:
    cid = next_id(conn, "H")
    conn.execute(
        "INSERT INTO challenges (id, run_id, round, attack, target_slot, target_claim,"
        " required_evidence, would_change_if, followup_task_ids) VALUES (?,?,?,?,?,?,?,?,?)",
        (
            cid,
            run_id,
            round,
            attack,
            target_slot,
            target_claim,
            required_evidence,
            would_change_if,
            json.dumps(followup_task_ids),
        ),
    )
    conn.commit()
    return next(c for c in _challenges(conn, run_id) if c.id == cid)


def set_challenge_outcome(conn: sqlite3.Connection, challenge_id: str, outcome: str) -> None:
    conn.execute("UPDATE challenges SET outcome=? WHERE id=?", (outcome, challenge_id))
    conn.commit()


def _stop(conn: sqlite3.Connection, run_id: str) -> StopDecision | None:
    row = conn.execute(
        "SELECT payload_json FROM events WHERE run_id=? AND type=? ORDER BY id DESC LIMIT 1",
        (run_id, EventType.STOP_DECIDED.value),
    ).fetchone()
    if row is None:
        return None
    return StopDecision.model_validate(json.loads(row["payload_json"])["decision"])


def build_run_summary(
    conn: sqlite3.Connection, run_id: str, usage: BudgetUsage | None = None
) -> RunSummary | None:
    run = get_run(conn, run_id)
    if run is None:
        return None
    return RunSummary(
        run=run,
        phase=get_phase(conn, run_id),
        usage=usage or build_usage(conn, run_id),
        stop=_stop(conn, run_id),
    )


def build_rollups(conn: sqlite3.Connection, run_id: str) -> list[RoundRollups]:
    """Dimension rollups per round, derived from the stored coverage cells (SSOT 9.8)."""
    slots = [
        CoverageSlot(s.id, s.dimension_id, s.name, s.critical, s.min_independent, s.primary_ok)
        for s in list_slots(conn, run_id)
    ]
    dims = [CoverageDimension(d.id, d.name) for d in list_dimensions(conn, run_id)]
    by_round: dict[int, dict[str, CoverageState]] = {}
    for cell in _coverage(conn, run_id):
        by_round.setdefault(cell.round, {})[cell.slot_id] = cell.state
    return [
        RoundRollups(
            round=rnd,
            rollups=[
                DimensionRollup(dimension_id=r.dimension_id, state=r.state, reason=r.reason)
                for r in rollup_dimensions(dims, slots, states)
            ],
        )
        for rnd, states in sorted(by_round.items())
    ]


def build_run_state(conn: sqlite3.Connection, run_id: str) -> RunState | None:
    run = get_run(conn, run_id)
    if run is None:
        return None
    report = conn.execute("SELECT MAX(version) FROM reports WHERE run_id=?", (run_id,)).fetchone()[
        0
    ]
    return RunState(
        run=run,
        phase=get_phase(conn, run_id),
        plan=get_plan(conn, run_id),
        tasks=list_tasks(conn, run_id),
        sources=list_sources(conn, run_id),
        origins=_origins(conn, run_id),
        # Quote-guard rejects are events only (D6); claims the judge dropped are excluded here too.
        claims=list_claims(conn, run_id, include_rejected=False),
        conflicts=_conflicts(conn, run_id),
        coverage=_coverage(conn, run_id),
        rollups=build_rollups(conn, run_id),
        challenges=_challenges(conn, run_id),
        stop=_stop(conn, run_id),
        report_version=report,
        last_event_id=last_event_id(conn, run_id),
    )


LocateQuote = Callable[[str, str], tuple[int, int] | None]


def build_claim_evidence(
    conn: sqlite3.Connection,
    run_id: str,
    claim_id: str,
    locate_quote: LocateQuote | None = None,
) -> ClaimEvidence | None:
    claim = get_claim(conn, claim_id)
    if claim is None or claim.run_id != run_id:
        return None
    passage = get_passage(conn, claim.passage_id)
    source = get_source(conn, passage.source_id) if passage else None
    if passage is None or source is None:
        return None
    span = locate_quote(claim.quote, passage.text) if locate_quote else None
    origin = None
    if source.origin_id:
        row = conn.execute(
            "SELECT * FROM origins WHERE run_id=? AND id=?", (run_id, source.origin_id)
        ).fetchone()
        if row:
            origin = Origin(
                id=row["id"],
                run_id=run_id,
                label=row["label"],
                method=row["method"],
                member_source_ids=json.loads(row["members_json"]),
            )
    link = conn.execute(
        "SELECT verdict, verdict_rationale FROM evidence_links WHERE claim_id=? ORDER BY rowid"
        " DESC LIMIT 1",
        (claim_id,),
    ).fetchone()
    established = origin is not None and origin.method != "none"
    return ClaimEvidence(
        claim=claim,
        passage=passage,
        quote_start=span[0] if span else None,
        quote_end=span[1] if span else None,
        source=source,
        origin=origin,
        verdict=Verdict(link["verdict"]) if link else None,
        verdict_rationale=link["verdict_rationale"] if link else "",
        independence="established" if established else "unestablished",
    )
