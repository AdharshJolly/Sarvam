"""ACQUIRE holds part of the fetch budget back for follow-up rounds (CL-19)."""

import asyncio

from backend.gateway import GatewayError
from backend.pipeline.acquire import run_acquire
from backend.store import repo
from contracts.config import Thresholds
from contracts.events import EventType
from contracts.models import Budget, FailureType
from tests.support.fakes import FakeFetcher, html_result
from tests.unit.test_acquire import ARTICLE, Env


def url(task: int, i: int) -> str:
    return f"https://s{task}.example/{i}"


class RoundEnv(Env):
    """Two round-0 tasks with four sources each (best first, as discovery stores them)."""

    def __init__(self, tmp_path, *, max_fetches=8, followup_rounds=2, reserve=0.25, script=None):
        urls = [url(t, i) for t in (1, 2) for i in range(4)]
        script = script or {u: html_result(u, ARTICLE) for u in urls}
        super().__init__(
            tmp_path,
            FakeFetcher(script),
            [],
            budget=Budget(max_fetches=max_fetches, max_followup_rounds=followup_rounds),
            thresholds=Thresholds(followup_fetch_reserve=reserve),
        )
        self.fetcher = self.gateway._fetcher
        for t in (1, 2):
            self.add_task(t, round=0)
            for i in range(4):
                self.add_source(url(t, i), f"T{t}")

    def add_task(self, n: int, *, round: int) -> None:
        self.conn.execute(
            "INSERT INTO tasks (id, run_id, slot_id, query_text, kind, round) VALUES (?,?,?,?,?,?)",
            (f"T{n}", "R1", f"S{n}", "q", "initial" if round == 0 else "gap", round),
        )
        self.conn.commit()

    def add_source(self, u: str, task_id: str):
        s = repo.insert_source(
            self.conn,
            "R1",
            url=u,
            canonical_url=u,
            domain=u.split("/")[2],
            publisher=None,
            source_type="unknown",
            authority_tier=3,
            task_id=task_id,
        )
        self.sources.append(s)
        return s

    def run_round(self, round: int) -> int:
        return asyncio.run(
            run_acquire(self.gateway, self.conn, self.em, self.settings, "R1", round=round)
        )

    def status(self, u: str) -> str:
        return next(repo.get_source(self.conn, s.id).status for s in self.sources if s.url == u)


def test_round_zero_keeps_a_reserve_and_takes_the_best_sources_of_every_slot(tmp_path):
    env = RoundEnv(tmp_path)  # 8 fetches, 25% reserve: 6 in round 0
    assert env.run_round(0) == 6
    assert sorted(env.fetcher.calls) == sorted(url(t, i) for t in (1, 2) for i in range(3))
    assert env.status(url(1, 3)) == "found" and env.status(url(2, 3)) == "found"


def test_the_held_back_fetches_are_said_in_the_phase_event(tmp_path):
    env = RoundEnv(tmp_path)
    env.run_round(0)
    (phase,) = env.events(EventType.PHASE_ENTERED)
    assert "6 of 8" in phase.payload["reason"] and "2 fetches" in phase.payload["reason"]


def test_a_follow_up_round_fetches_its_own_sources_with_the_reserve(tmp_path):
    env = RoundEnv(tmp_path)
    env.run_round(0)
    env.add_task(3, round=1)
    new = [env.add_source(f"https://gap.example/{i}", "T3").url for i in range(2)]
    for u in new:
        env.fetcher.script[u] = html_result(u, ARTICLE)
    assert env.run_round(1) == 2
    assert env.fetcher.calls[-2:] == new
    assert env.status(url(1, 3)) == "found"  # round-0 leftovers are not fetched later


def test_no_reserve_without_follow_up_rounds(tmp_path):
    env = RoundEnv(tmp_path, followup_rounds=0)
    assert env.run_round(0) == 8


def test_a_zero_reserve_fetches_everything_as_before(tmp_path):
    env = RoundEnv(tmp_path, reserve=0.0)
    assert env.run_round(0) == 8
    (phase,) = env.events(EventType.PHASE_ENTERED)
    assert "held back" not in phase.payload["reason"]


def test_timeout_retries_do_not_eat_the_reserve(tmp_path):
    timeout = GatewayError(FailureType.SOURCE_UNAVAILABLE, "timeout")
    urls = [url(t, i) for t in (1, 2) for i in range(4)]
    script = {u: (timeout if u == url(1, 0) else html_result(u, ARTICLE)) for u in urls}
    env = RoundEnv(tmp_path, script=script)
    env.run_round(0)
    assert len(env.fetcher.calls) == 6  # the timed-out source is not retried into the reserve
    assert env.gateway.usage().fetches == 6
