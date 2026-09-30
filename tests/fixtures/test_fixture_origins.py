"""T10 on the fixture corpus: a press release copied across four sites is one origin (SSOT 16.2)."""

from __future__ import annotations

import pytest

from backend.intel.analyze import origin_inputs, update_origins
from backend.intel.origins import cluster_origins
from backend.store import repo
from backend.store.events import read_events
from contracts.events import EventType
from tests.support.corpus import RUN_ID, build_corpus, expected


@pytest.fixture()
def corpus(tmp_path):
    return build_corpus(tmp_path)


def _fixture_sets(corpus) -> dict[frozenset[str], object]:
    return {
        frozenset(corpus.fixture_of_source(s) for s in o.member_source_ids): o
        for o in repo.list_origins(corpus.conn, RUN_ID)
    }


def test_origin_clusters_match_the_expected_json(corpus):
    update_origins(corpus.conn, corpus.em, corpus.settings, RUN_ID)
    actual = _fixture_sets(corpus)
    want = expected("origins")["origins"]
    assert set(actual) == {frozenset(o["sources"]) for o in want}
    for spec in want:
        origin = actual[frozenset(spec["sources"])]
        assert origin.method.value == spec["method"], spec["sources"]
        assert origin.label == spec["label"], spec["sources"]


def test_press_release_copies_collapse_to_one_origin_and_the_blog_joins_it(corpus):
    update_origins(corpus.conn, corpus.em, corpus.settings, RUN_ID)
    release = {corpus.source_ids[f] for f in ("F02", "F03", "F04", "F05", "F06")}
    origins = {
        o.id for o in repo.list_origins(corpus.conn, RUN_ID) if set(o.member_source_ids) == release
    }
    assert len(origins) == 1
    origin_ids = {repo.get_source(corpus.conn, s).origin_id for s in release}
    assert origin_ids == origins


def test_expected_signals_fire_and_unrelated_sources_never_merge(corpus):
    clustering = cluster_origins(origin_inputs(corpus.conn, RUN_ID), corpus.settings.thresholds)
    fired = set()
    for e in clustering.edges:
        a = corpus.fixture_of_source(e.a) if e.a.startswith("S") else e.a
        b = corpus.fixture_of_source(e.b) if e.b.startswith("S") else e.b
        fired.add((frozenset({a, b}), e.signal.value))
    for edge in expected("origins")["edges"]:
        assert (frozenset({edge["a"], edge["b"]}), edge["signal"]) in fired, edge
    cluster_of = {}
    for n, o in enumerate(clustering.origins):
        for sid in o.source_ids:
            cluster_of[corpus.fixture_of_source(sid)] = n
    for a, b in expected("origins")["never_merged"]:
        assert cluster_of[a] != cluster_of[b], (a, b)


def test_unestablished_independence_is_method_none_and_the_failed_fetch_has_no_origin(corpus):
    update_origins(corpus.conn, corpus.em, corpus.settings, RUN_ID)
    by_fixture = {
        corpus.fixture_of_source(s): o
        for o in repo.list_origins(corpus.conn, RUN_ID)
        for s in o.member_source_ids
    }
    for fid in expected("origins")["unestablished"]:
        assert by_fixture[fid].method.value == "none", fid
    assert "F14" not in by_fixture
    assert repo.get_source(corpus.conn, corpus.source_ids["F14"]).origin_id is None


def test_origin_events_are_emitted_once_per_changed_origin_and_the_pass_is_idempotent(corpus):
    changed = update_origins(corpus.conn, corpus.em, corpus.settings, RUN_ID)
    events = [e for e in read_events(corpus.conn, RUN_ID) if e.type is EventType.ORIGIN_UPDATED]
    assert len(events) == len(changed) == len(expected("origins")["origins"])
    assert {e.payload["origin"]["id"] for e in events} == {o.id for o in changed}
    assert update_origins(corpus.conn, corpus.em, corpus.settings, RUN_ID) == []
    again = [e for e in read_events(corpus.conn, RUN_ID) if e.type is EventType.ORIGIN_UPDATED]
    assert len(again) == len(events)
