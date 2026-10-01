"""Gate G4 (SSOT 13.3, M2): the committed recording replays offline; failures are typed.

Zero credits: no provider keys, and DNS is disabled so any attempt to reach the network fails.
The golden values come from `docs/benchmarks/canon-b3-o3.json`, the record of the live run that
`cache/recorded/` holds (`MANIFEST.json` carries the knobs REPLAY must use).
"""

from __future__ import annotations

import asyncio
import json
import socket
from pathlib import Path

import pytest

from backend.controller import RunHandle, run_research
from backend.intel.stop import recompute_stop
from backend.store import repo
from backend.store.db import init_db
from contracts.config import Settings
from contracts.events import EventType
from contracts.models import Budget

ROOT = Path(__file__).resolve().parents[3]
RECORDED = ROOT / "cache" / "recorded"
GOLDEN = json.loads((ROOT / "docs" / "benchmarks" / "canon-b3-o3.json").read_text("utf-8"))
RUN_GOLDEN = GOLDEN["runs"][0]
QUESTION = GOLDEN["question"]


def settings(tmp_path, record_dir: Path = RECORDED) -> Settings:
    return Settings(
        env="test",
        db_path=tmp_path / "g4.db",
        artifact_dir=tmp_path / "art",
        record_dir=record_dir,
        llm_model_fast="gemini-3.1-flash-lite",
        llm_model_strong="gemini-3.6-flash",
        search_provider="tavily",
    )


def start(st: Settings, question: str, mode: str):
    conn = init_db(st.db_path)
    conn.execute(
        "INSERT INTO runs (id, question, scope_json, mode, budget_json, status, started_at)"
        " VALUES ('R1', ?, '{}', ?, ?, 'queued', '2026-01-01T00:00:00+00:00')",
        (question, mode, Budget().model_dump_json()),
    )
    conn.commit()
    return conn


def execute(st: Settings, conn, handle: RunHandle | None = None) -> None:
    asyncio.run(run_research("R1", settings=st, handle=handle or RunHandle()))


def event_types(conn) -> list[str]:
    return [
        r["type"] for r in conn.execute("SELECT type FROM events WHERE run_id='R1' ORDER BY id")
    ]


@pytest.fixture(scope="module")
def replayed(tmp_path_factory):
    """Replay the recorded canonical run once, with the network unreachable."""
    tmp = tmp_path_factory.mktemp("g4")
    real = socket.getaddrinfo

    def no_network(*args, **kwargs):
        raise OSError("network disabled by the G4 gate")

    socket.getaddrinfo = no_network
    try:
        st = settings(tmp)
        conn = start(st, QUESTION, "REPLAY")
        execute(st, conn)
        yield conn
    finally:
        socket.getaddrinfo = real


def test_g4_the_recorded_canonical_run_replays_offline_and_completes(replayed):
    run = repo.get_run(replayed, "R1")
    assert run.mode.value == "REPLAY"  # a replayed run is never presented as live
    assert run.status.value == "completed"
    assert event_types(replayed)[-1] == EventType.RUN_COMPLETED.value


def test_g4_replay_reproduces_the_live_run_event_for_event(replayed):
    counts: dict[str, int] = {}
    for t in event_types(replayed):
        counts[t] = counts.get(t, 0) + 1
    # budget.warning depends on price configuration (the cost_unavailable warning), not on the run.
    drop = "budget.warning"
    assert {k: v for k, v in counts.items() if k != drop} == {
        k: v for k, v in RUN_GOLDEN["events"].items() if k != drop
    }


def test_g4_replay_reproduces_the_stop_decision_and_coverage(replayed):
    run = repo.get_run(replayed, "R1")
    assert run.stop_state.value == RUN_GOLDEN["stop_state"]
    assert run.termination_reason.value == RUN_GOLDEN["termination_reason"]
    last = replayed.execute("SELECT MAX(round) FROM coverage").fetchone()[0]
    cells = replayed.execute(
        "SELECT state, COUNT(*) FROM coverage WHERE round=? GROUP BY 1", (last,)
    )
    assert dict(cells.fetchall()) == RUN_GOLDEN["coverage_last_round"]
    assert recompute_stop(replayed, "R1").state.value == RUN_GOLDEN["stop_state"]


def test_g4_every_stored_claim_quote_exists_in_its_passage(replayed):
    rows = replayed.execute(
        "SELECT c.quote, p.text FROM claims c JOIN passages p ON p.id = c.passage_id"
        " WHERE c.status != 'rejected'"
    ).fetchall()
    assert len(rows) == RUN_GOLDEN["claims"]["supported"]
    assert all("".join(r["quote"].split()) in "".join(r["text"].split()) for r in rows)


def test_g4_the_replayed_report_is_verified_and_all_citations_resolve(replayed):
    view = repo.build_report_view(replayed, "R1")
    assert view is not None and view.citations
    claim_ids = {r["id"] for r in replayed.execute("SELECT id FROM claims")}
    assert {c.claim_id for c in view.citations} <= claim_ids
    assert len(view.dropped_sentences) == RUN_GOLDEN["report_verified"]["dropped_count"]


def test_g4_failed_sources_are_typed_and_visible_not_hidden(replayed):
    failed = replayed.execute("SELECT status FROM sources WHERE status = 'SOURCE_UNAVAILABLE'")
    assert len(failed.fetchall()) == RUN_GOLDEN["events"]["source.failed"]
    assert (
        event_types(replayed).count(EventType.SOURCE_FAILED.value)
        == RUN_GOLDEN["events"]["source.failed"]
    )


def test_g4_an_unrecorded_question_in_replay_fails_with_a_typed_event(tmp_path):
    st = settings(tmp_path)
    conn = start(st, "Is a question nobody recorded answerable offline?", "REPLAY")
    execute(st, conn)
    types = event_types(conn)
    assert types[-1] == EventType.RUN_FAILED.value
    payload = json.loads(
        conn.execute("SELECT payload_json FROM events WHERE type='run.failed'").fetchone()[0]
    )
    assert payload["failure"] and payload["message"]
    assert repo.get_run(conn, "R1").status.value == "failed"


def test_g4_a_live_run_without_provider_keys_is_blocked_with_a_typed_event(tmp_path):
    st = settings(tmp_path)  # no keys configured
    conn = start(st, QUESTION, "LIVE")
    execute(st, conn)
    payload = json.loads(
        conn.execute("SELECT payload_json FROM events WHERE type='run.failed'").fetchone()[0]
    )
    assert payload["failure"] == "BLOCKED"


def test_g4_a_user_stop_ends_in_a_decision_and_a_report(tmp_path):
    st = settings(tmp_path)
    conn = start(st, QUESTION, "REPLAY")
    handle = RunHandle()
    handle.stop_event.set()
    execute(st, conn, handle)
    run = repo.get_run(conn, "R1")
    assert run.termination_reason.value == "user_stopped" and run.stop_state is not None
    assert repo.build_report_view(conn, "R1") is not None
