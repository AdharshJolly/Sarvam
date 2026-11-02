"""Pages the user adds to a run (CL-20): stored at creation, fetched first, matched to any slot."""

import asyncio

import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.gateway.core import ToolGateway
from backend.pipeline.acquire import _pick
from backend.pipeline.claims import _relevant_slots
from backend.pipeline.discover import run_discover
from backend.store import repo
from backend.store.emit import Emitter
from backend.store.events import read_events
from contracts.config import Settings
from contracts.events import EventType
from contracts.models import Mode, Plan, Scope, Source
from tests.support.data import plan_dict
from tests.support.fakes import FakeSearch
from tests.unit.test_extractor_min_overlap import OWN, PASSAGES, STRONG, WEAK, ids, passage, slot

PDF = "https://www.niti.gov.in/sites/default/files/2025-01/EV-report.pdf"
BLOG = "https://someone.medium.com/scooters?utm_source=x"


@pytest.fixture
def client(tmp_path):
    with TestClient(
        create_app(Settings(db_path=tmp_path / "t.db", artifact_dir=tmp_path / "a", env="test"))
    ) as c:
        yield c


def create(client, **body):
    return client.post("/api/runs", json={"question": "Should we launch X?", **body})


# ---------------------------------------------------------------- API


def test_pinned_urls_become_found_sources_without_a_task(client):
    res = create(client, pinned_urls=[PDF, BLOG, f" {PDF} "])
    assert res.status_code == 201
    sources = repo.list_sources(client.app.state.db, res.json()["id"])
    assert [(s.domain, s.authority_tier, s.status, s.task_id) for s in sources] == [
        ("niti.gov.in", 1, "found", None),
        ("someone.medium.com", 3, "found", None),
    ]  # classified by rule like any page; the duplicate collapses
    assert sources[1].canonical_url == "https://someone.medium.com/scooters"


@pytest.mark.parametrize(
    "urls",
    [
        ["ftp://files.example/a.pdf"],
        ["javascript:alert(1)"],
        ["not a url"],
        ["https://"],
        [f"https://e.example/{i}" for i in range(6)],
    ],
)
def test_bad_pinned_urls_are_rejected_before_a_run_exists(client, urls):
    assert create(client, pinned_urls=urls).status_code == 422
    assert client.app.state.db.execute("SELECT COUNT(*) FROM runs").fetchone()[0] == 0


def test_a_recorded_demo_cannot_take_pinned_urls(client):
    res = create(client, mode="REPLAY", pinned_urls=[PDF])
    assert res.status_code == 422 and "live" in res.json()["detail"].lower()


def test_no_pinned_urls_means_no_sources(client):
    rid = create(client).json()["id"]
    assert repo.list_sources(client.app.state.db, rid) == []


# ---------------------------------------------------------------- DISCOVER


def test_discover_announces_pinned_pages_and_never_duplicates_them(client):
    rid = create(client, pinned_urls=[PDF]).json()["id"]
    conn = client.app.state.db
    repo.insert_plan(conn, rid, Plan.model_validate(plan_dict(4)))
    settings = client.app.state.settings
    first_task = "electric scooter subscription Demand 1"
    search = FakeSearch(script={first_task: [_hit(PDF), _hit("https://new.example/a")]}, default=[])
    gw = ToolGateway(settings=settings, budget=repo.get_run(conn, rid).budget, mode=Mode.LIVE,
                     search=search)  # fmt: skip
    asyncio.run(run_discover(gw, conn, Emitter(conn, rid), settings, rid, Scope()))
    found = [e for e in read_events(conn, rid) if e.type is EventType.SOURCE_FOUND]
    assert (
        found[0].payload["source"]["url"] == PDF and found[0].payload["source"]["task_id"] is None
    )
    urls = [s.url for s in repo.list_sources(conn, rid)]
    assert urls.count(PDF) == 1 and "https://new.example/a" in urls


def _hit(url):
    from backend.gateway.search import SearchHit

    return SearchHit(url=url, title="t", snippet="s")


# ---------------------------------------------------------------- ACQUIRE


def src(sid: str, task: str | None) -> Source:
    return Source(id=sid, run_id="R1", url=f"https://{sid}.example", canonical_url=sid,
                  domain=f"{sid}.example", task_id=task)  # fmt: skip


def test_pinned_pages_are_picked_before_any_discovered_page():
    sources = [src("S1", "T1"), src("S2", "T1"), src("S3", "T2"), src("S4", None)]
    assert [s.id for s in _pick(sources, 2)] == ["S1", "S4"]  # source order, pinned always in
    assert [s.id for s in _pick(sources, 1)] == ["S4"]


# ---------------------------------------------------------------- CLAIMS


def test_a_pinned_page_is_matched_to_its_best_slots_without_the_floor():
    # No own slot: the slots that share the most words come first (ties in plan order), and the
    # floor does not apply. Fleet shares 4 words; price and parking share 1 each.
    text = [passage("The scooter fleet deployed in the city; fleet size grew. Parking.")]
    out = _relevant_slots([OWN, WEAK, STRONG], None, text, 5, min_other_overlap=99)
    assert ids(out) == ["B", "A", "C"]


def test_a_pinned_page_still_needs_some_overlap():
    unrelated = slot("D", "tax", "gst rates")
    assert ids(_relevant_slots([unrelated], None, PASSAGES, 5)) == []
