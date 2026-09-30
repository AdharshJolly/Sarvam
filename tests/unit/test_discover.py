import asyncio

import pytest

from backend.gateway import BudgetExceeded, GatewayError
from backend.gateway.core import ToolGateway
from backend.gateway.search import SearchHit
from backend.pipeline.discover import canonicalize_url, classify, queries_for, run_discover
from backend.store import repo
from backend.store.db import init_db
from backend.store.emit import Emitter
from backend.store.events import read_events
from contracts.config import Settings
from contracts.events import EventType
from contracts.models import Budget, FailureType, Mode, Plan, Scope
from tests.support.data import plan_dict
from tests.support.fakes import FakeSearch


def hit(url, text=None):
    return SearchHit(url=url, title=url, snippet="s", cleaned_text=text)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (
            "HTTPS://WWW.Example.com:443/a/b/?utm_source=x&b=2&a=1#frag",
            "https://example.com/a/b?a=1&b=2",
        ),
        ("http://example.com/", "http://example.com/"),
        ("http://example.com:80/x", "http://example.com/x"),
        ("https://example.com:8443/x/", "https://example.com:8443/x"),
        (
            "https://example.com/p?gclid=1&fbclid=2&ref=3&mc_cid=4&mc_eid=5&keep=1",
            "https://example.com/p?keep=1",
        ),
        ("https://www.example.com/p?utm_campaign=z", "https://example.com/p"),
    ],
)
def test_canonicalize_url(raw, expected):
    assert canonicalize_url(raw) == expected


@pytest.mark.parametrize(
    ("url", "stype", "tier"),
    [
        ("https://morth.nic.in/ev-policy", "regulator", 1),
        ("https://www.rbi.org.in/Scripts/x.aspx", "regulator", 1),
        ("https://www.sebi.gov.in/legal", "regulator", 1),
        ("https://www.meity.gov.in/", "regulator", 1),
        ("https://www.ftc.gov/news", "regulator", 1),
        ("https://www.gov.uk/guidance", "regulator", 1),
        ("https://yulu.bike/pricing", "company_primary", 1),
        ("https://bounceshare.com/plans", "company_primary", 1),
        ("https://example.com/about-us", "company_primary", 1),
        ("https://example.com/newsroom/2026", "company_primary", 1),
        ("https://www.livemint.com/companies/story.html", "news", 2),
        ("https://economictimes.indiatimes.com/industry/x", "news", 2),
        ("https://www.reuters.com/markets/x", "news", 2),
        ("https://inc42.com/buzz/x", "news", 2),
        ("https://www.mckinsey.com/industries/report", "news", 2),
        ("https://www.statista.com/statistics/1", "news", 2),
        ("https://someone.medium.com/post", "blog", 3),
        ("https://myblog.blogspot.com/2020/x", "blog", 3),
        ("https://www.reddit.com/r/india/comments/x", "blog", 3),
        ("https://www.quora.com/How-much", "blog", 3),
        ("https://example.org/forum/thread-9", "blog", 3),
        ("https://random-site.example/article", "unknown", 3),
    ],
)
def test_classify_type_and_tier(url, stype, tier):
    got_type, got_tier, _ = classify(url)
    assert (got_type.value, got_tier) == (stype, tier)


def test_classify_domain_strips_www():
    assert classify("https://www.livemint.com/x")[2] == "livemint.com"


def test_two_distinct_deterministic_queries_per_task():
    from contracts.models import EvidenceSlot, Task

    task = Task(
        id="T1",
        run_id="R",
        slot_id="D1S1",
        query_text="electric scooter subscription Bengaluru price per month",
    )
    slot = EvidenceSlot(
        id="D1S1", run_id="R", dimension_id="D1", name="Competitor pricing", description="d"
    )
    scope = Scope(geography="Bengaluru")
    a = queries_for(task, slot, scope, 2)
    assert a == queries_for(task, slot, scope, 2)  # deterministic
    assert len(a) == 2 and a[0] == task.query_text
    norm = [frozenset(q.lower().split()) for q in a]
    assert norm[0] != norm[1]
    same = Task(
        id="T2", run_id="R", slot_id="D1S1", query_text="competitor pricing", kind="initial"
    )
    b = queries_for(same, slot, Scope(), 2)
    assert frozenset(b[0].split()) != frozenset(b[1].split())


class Env:
    def __init__(self, tmp_path, search, *, budget=None, scope=None):
        self.settings = Settings(
            env="test", db_path=tmp_path / "t.db", artifact_dir=tmp_path / "art"
        )
        self.conn = init_db(self.settings.db_path)
        self.budget = budget or Budget()
        self.scope = scope or Scope()
        self.conn.execute(
            "INSERT INTO runs (id, question, mode, budget_json, started_at) VALUES (?,?,?,?,?)",
            ("R1", "q", "LIVE", self.budget.model_dump_json(), "2026-01-01T00:00:00+00:00"),
        )
        self.conn.commit()
        from backend.pipeline.plan import normalise

        repo.insert_plan(self.conn, "R1", normalise(Plan.model_validate(plan_dict(4)), self.budget))
        self.search = search
        self.gateway = ToolGateway(
            settings=self.settings, budget=self.budget, mode=Mode.LIVE, search=search
        )
        self.em = Emitter(self.conn, "R1")

    def run(self):
        return asyncio.run(
            run_discover(self.gateway, self.conn, self.em, self.settings, "R1", self.scope)
        )


def test_duplicates_collapse_and_tracking_variants_are_one_source(tmp_path):
    search = FakeSearch(
        default=[
            hit("https://a.example/x?utm_source=1"),
            hit("https://www.a.example/x/"),
            hit("https://a.example/x"),
        ]
    )
    env = Env(tmp_path, search)
    assert env.run() == 1
    assert [s.canonical_url for s in repo.list_sources(env.conn, "R1")] == ["https://a.example/x"]
    assert all(t.status == "done" for t in repo.list_tasks(env.conn, "R1"))


def test_each_task_keeps_four_sources_ranked_by_tier(tmp_path):
    hits = [
        hit("https://someone.medium.com/a"),
        hit("https://random.example/a"),
        hit("https://www.ftc.gov/a"),
        hit("https://www.livemint.com/a"),
        hit("https://yulu.bike/pricing"),
        hit("https://www.reuters.com/a"),
    ]
    first_task = "electric scooter subscription Demand 1"
    search = FakeSearch(script={first_task: hits}, default=[])
    env = Env(tmp_path, search)
    env.run()
    sources = repo.list_sources(env.conn, "R1")
    assert len(sources) == 4
    assert [(s.authority_tier, s.domain) for s in sources] == [
        (1, "ftc.gov"),
        (1, "yulu.bike"),
        (2, "livemint.com"),
        (2, "reuters.com"),
    ]
    assert all(s.task_id == "T1" and s.status == "found" for s in sources)


def test_non_http_hits_are_dropped_and_provider_text_is_kept(tmp_path):
    hits = [hit("ftp://x.example/a"), hit("https://ok.example/a", text="provider cleaned text")]
    env = Env(tmp_path, FakeSearch(default=hits))
    env.run()
    (src,) = repo.list_sources(env.conn, "R1")
    path = env.settings.artifact_dir / "R1" / f"{src.id}.provider.txt"
    assert (
        src.url == "https://ok.example/a"
        and path.read_text(encoding="utf-8") == "provider cleaned text"
    )


def test_events_phase_task_started_and_source_found(tmp_path):
    env = Env(tmp_path, FakeSearch(default=[hit("https://ok.example/a")]))
    env.run()
    events = list(read_events(env.conn, "R1"))
    types = [e.type for e in events]
    assert types[0] is EventType.PHASE_ENTERED and events[0].payload["phase"] == "DISCOVER"
    assert types.count(EventType.TASK_STARTED) == 8 and types.count(EventType.SOURCE_FOUND) == 1
    found = next(e for e in events if e.type is EventType.SOURCE_FOUND)
    assert found.step_ms is not None and found.payload["source"]["authority_tier"] == 3


def test_a_failed_search_blocks_only_its_own_task(tmp_path):
    env = Env(tmp_path, FakeSearch())
    task = repo.list_tasks(env.conn, "R1")[0]
    slot = {s.id: s for s in repo.list_slots(env.conn, "R1")}[task.slot_id]
    boom = GatewayError(FailureType.BLOCKED, "provider down")
    script = {q: boom for q in queries_for(task, slot, env.scope, 2)}
    env = Env.__new__(Env)  # rebuild with the scripted search on a fresh db
    env.__init__(
        tmp_path / "again", FakeSearch(script=script, default=[hit("https://ok.example/a")])
    )
    env.run()
    statuses = {t.id: t.status for t in repo.list_tasks(env.conn, "R1")}
    assert statuses["T1"] == "blocked" and all(
        v == "done" for k, v in statuses.items() if k != "T1"
    )
    blocked = [
        e
        for e in read_events(env.conn, "R1")
        if e.type is EventType.TASK_STARTED and "blocked" in e.payload["reason"]
    ]
    assert len(blocked) == 1 and "BLOCKED" in blocked[0].payload["reason"]


def test_searches_count_against_the_budget_and_budget_error_surfaces(tmp_path):
    env = Env(
        tmp_path, FakeSearch(default=[hit("https://ok.example/a")]), budget=Budget(max_searches=3)
    )
    with pytest.raises(BudgetExceeded) as ei:
        env.run()
    assert ei.value.limit == "max_searches" and env.gateway.usage().searches == 3
    assert len(repo.list_sources(env.conn, "R1")) >= 1  # finished work was persisted first
