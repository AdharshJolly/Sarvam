"""Record/replay fidelity (SSOT FR-26, OP-01): a replayed run is event-for-event the recorded run.

The record run is perturbed on purpose: providers answer after random delays (so real concurrency
reorders completions), some pages time out once (the acquire retry path) and the fetch budget is
tight (so the order in which fetches are admitted decides which sources are fetched). The replay
has no providers at all; it must still reproduce every event except timestamps and step timings.
"""

from __future__ import annotations

import asyncio
import inspect
import random
import sqlite3
from datetime import UTC, datetime

import pytest

from backend.controller import RunnerDeps, run_research
from backend.gateway import GatewayError
from backend.store.db import init_db
from contracts.config import Settings, Thresholds
from contracts.models import Budget, FailureType, Mode, Scope
from tests.support.corpus import manifest
from tests.support.corpus_run import corpus_deps

QUESTION = "Should a company launch an electric scooter subscription service in Bengaluru in 2027?"
RUN_ID = "R_FIDELITY"


class Jitter:
    """Wraps a fake provider: every call suspends for a random time before answering."""

    def __init__(self, inner, rng: random.Random):
        self._inner, self._rng = inner, rng
        self.name = getattr(inner, "name", "fake")

    def __getattr__(self, attr):
        target = getattr(self._inner, attr)
        if not inspect.iscoroutinefunction(target):
            return target

        async def call(*args, **kwargs):
            await asyncio.sleep(self._rng.random() * 0.004)
            return await target(*args, **kwargs)

        return call


class TimeoutOnce:
    """A fetcher whose chosen URLs time out on the first request only."""

    def __init__(self, inner, urls: set[str]):
        self._inner, self._pending = inner, set(urls)

    async def fetch(self, url: str):
        if url in self._pending:
            self._pending.discard(url)
            raise GatewayError(FailureType.SOURCE_UNAVAILABLE, "timeout")
        return await self._inner.fetch(url)


def settings(tmp_path, name: str) -> Settings:
    return Settings(
        env="test",
        db_path=tmp_path / f"{name}.db",
        artifact_dir=tmp_path / f"{name}_art",
        record_dir=tmp_path / "recorded",
        search_provider="fake-search",  # replay derives the key's provider name from settings
        llm_model_fast="fast-m",
        llm_model_strong="strong-m",
        thresholds=Thresholds(sources_per_task=8),
    )


def start_run(st: Settings, mode: Mode, budget: Budget) -> None:
    init_db(st.db_path).close()
    conn = sqlite3.connect(st.db_path)
    conn.execute(
        "INSERT INTO runs (id, question, scope_json, mode, budget_json, status, started_at)"
        " VALUES (?, ?, ?, ?, ?, 'queued', ?)",
        (
            RUN_ID,
            QUESTION,
            Scope().model_dump_json(),
            mode.value,
            budget.model_dump_json(),
            datetime.now(UTC).isoformat(),
        ),
    )
    conn.commit()
    conn.close()


def events_of(st: Settings) -> list[tuple]:
    """Every event with its identity and payload; timestamps and step timings are dropped."""
    conn = sqlite3.connect(st.db_path)
    rows = conn.execute(
        "SELECT type, round, tokens, cost_usd, payload_json FROM events WHERE run_id=? ORDER BY id",
        (RUN_ID,),
    ).fetchall()
    conn.close()
    return rows


def tables_of(st: Settings) -> dict[str, list[tuple]]:
    conn = sqlite3.connect(st.db_path)
    out = {
        "sources": conn.execute(
            "SELECT id, url, status, content_hash, fail_reason FROM sources ORDER BY id"
        ).fetchall(),
        "passages": conn.execute("SELECT id, source_id, text FROM passages ORDER BY id").fetchall(),
        "claims": conn.execute(
            "SELECT id, slot_id, text, quote FROM claims ORDER BY id"
        ).fetchall(),
    }
    conn.close()
    return out


async def record_then_replay(tmp_path, monkeypatch, seed: int, max_fetches: int):
    docs = manifest()["documents"]
    flaky = {d["url"] for fid, d in sorted(docs.items())[:3] if d["fetch"] != "403"}
    budget = Budget(max_searches=40, max_fetches=max_fetches)

    rec = settings(tmp_path, f"rec{seed}")
    start_run(rec, Mode.LIVE, budget)
    deps = corpus_deps(withhold=frozenset({"F08", "F10"}), challenge_pages=frozenset({"F08"}))
    rng = random.Random(seed)
    deps = RunnerDeps(
        search=Jitter(deps.search, rng),
        fetcher=Jitter(TimeoutOnce(deps.fetcher, flaky), rng),
        llm=Jitter(deps.llm, rng),
        sleep=deps.sleep,
    )
    monkeypatch.setenv("SARVAM_RECORD", "1")
    await run_research(RUN_ID, settings=rec, deps=deps)
    monkeypatch.delenv("SARVAM_RECORD")

    rep = settings(tmp_path, f"rep{seed}")
    start_run(rep, Mode.REPLAY, budget)
    await run_research(RUN_ID, settings=rep)
    return rec, rep


@pytest.mark.parametrize("seed,max_fetches", [(1, 40), (2, 12), (3, 16), (4, 16)])
def test_a_replayed_run_reproduces_the_recorded_run_event_for_event(
    tmp_path, monkeypatch, seed, max_fetches
):
    rec, rep = asyncio.run(record_then_replay(tmp_path, monkeypatch, seed, max_fetches))
    recorded, replayed = events_of(rec), events_of(rep)
    assert [e[0] for e in recorded] == [e[0] for e in replayed]  # types and order
    assert recorded == replayed  # source identities, verdicts, coverage, stop, report, citations
    assert tables_of(rec) == tables_of(rep)
    types = {e[0] for e in recorded}
    assert {"stop.decided", "report.verified"} <= types
    if max_fetches >= 16:  # enough budget to reach the claims (12 ends in wrap-up during ACQUIRE)
        assert {"claim.verified", "conflict.detected"} <= types
    if max_fetches >= 40:  # and to finish a whole challenge round
        assert {"challenge.outcome", "round.started"} <= types
    assert not [e for e in replayed if "replay miss" in e[4]]
