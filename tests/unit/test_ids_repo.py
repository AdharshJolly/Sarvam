import threading

import pytest

from backend.store import repo
from backend.store.db import init_db
from backend.store.emit import Emitter
from backend.store.ids import next_id
from contracts.events import EventType
from contracts.models import Phase


def _run(conn, run_id):
    conn.execute(
        "INSERT INTO runs (id, question, mode, budget_json, started_at) VALUES (?,?,?,?,?)",
        (run_id, "q", "LIVE", "{}", "2026-01-01T00:00:00+00:00"),
    )
    conn.commit()


def _src(conn, run_id, n):
    return repo.insert_source(
        conn,
        run_id,
        url=f"https://a.example/{n}",
        canonical_url=f"a.example/{n}",
        domain="a.example",
        publisher="a.example",
        source_type="news",
        authority_tier=2,
        task_id=None,
    )


def test_next_id_monotonic_and_unique_across_runs(tmp_path):
    conn = init_db(tmp_path / "t.db")
    _run(conn, "R1")
    _run(conn, "R2")
    ids = [_src(conn, r, i).id for i, r in enumerate(["R1", "R2", "R1", "R2"])]
    assert ids == ["S1", "S2", "S3", "S4"]
    assert next_id(conn, "RP") == "RP1"  # two-letter prefix
    conn.rollback()
    with pytest.raises(KeyError):
        next_id(conn, "Z")


def test_next_id_safe_under_two_threads(tmp_path):
    path = tmp_path / "t.db"
    setup = init_db(path)
    _run(setup, "R1")
    results: list[str] = []
    errors: list[Exception] = []

    def worker(offset):
        from backend.store.db import connect

        c = connect(path)
        try:
            for i in range(25):
                results.append(_src(c, "R1", offset * 100 + i).id)
        except Exception as exc:  # noqa: BLE001 - surfaced by the assertion below
            errors.append(exc)
        finally:
            c.close()

    threads = [threading.Thread(target=worker, args=(n,)) for n in (1, 2)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert not errors
    assert len(results) == 50 and len(set(results)) == 50


def test_repo_round_trip_phase_usage_and_report(tmp_path):
    conn = init_db(tmp_path / "t.db")
    _run(conn, "R1")
    em = Emitter(conn, "R1")
    assert repo.get_phase(conn, "R1") is None
    em.emit(EventType.PHASE_ENTERED, {"phase": "PLAN", "reason": "start"})
    em.emit(EventType.PHASE_ENTERED, {"phase": "DISCOVER", "reason": "next"})
    assert repo.get_phase(conn, "R1") == Phase.DISCOVER
    src = _src(conn, "R1", 1)
    psg = repo.insert_passages(conn, src.id, [("hello world text", 0, 16)])[0]
    claim = repo.insert_claim(
        conn, "R1", slot_id="D1S1", text="t", quote="hello world", passage_id=psg.id
    )
    assert claim.status == "pending" and claim.quote_verified is True
    rep = repo.insert_report(
        conn, "R1", markdown=f"# x\n- fact [{claim.id}] [C999]", dropped_sentences=[]
    )
    assert rep.version == 1 and rep.id == "RP1"
    view = repo.build_report_view(conn, "R1")
    assert [c.claim_id for c in view.citations] == [claim.id]  # unknown C999 is not a citation row
    state = repo.build_run_state(conn, "R1")
    assert state.phase == Phase.DISCOVER and state.report_version == 1
    assert [c.id for c in state.claims] == [claim.id] and state.last_event_id == 2
    ev = repo.build_claim_evidence(conn, "R1", claim.id, lambda q, t: (0, 11))
    assert (ev.quote_start, ev.quote_end, ev.independence) == (0, 11, "unestablished")
    assert repo.build_claim_evidence(conn, "OTHER", claim.id) is None
    assert repo.build_usage(conn, "R1").fetches == 0


def test_update_source_rejects_unknown_fields(tmp_path):
    conn = init_db(tmp_path / "t.db")
    _run(conn, "R1")
    s = _src(conn, "R1", 1)
    repo.update_source(conn, s.id, status="fetched", content_hash="h")
    assert repo.get_source(conn, s.id).status == "fetched"
    with pytest.raises(ValueError):
        repo.update_source(conn, s.id, url="x")
