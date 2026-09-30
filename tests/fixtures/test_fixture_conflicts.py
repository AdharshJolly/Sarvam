"""T11 on the fixture corpus: planted conflicts found, unit trap explained by rule (SSOT 16.1)."""

from __future__ import annotations

import asyncio
import json

import pytest

from backend.gateway import BudgetExceeded
from backend.intel.analyze import update_conflicts
from backend.store import repo
from backend.store.events import read_events
from contracts.events import EventType
from contracts.models import Budget, Mode
from tests.support.corpus import RUN_ID, build_corpus, expected, explainer_script


@pytest.fixture()
def corpus(tmp_path):
    return build_corpus(tmp_path)


def analyse(corpus, script=None, **gateway_kwargs):
    gateway, llm = corpus.llm_gateway(
        {"explainer.v1": script or explainer_script(corpus)}, **gateway_kwargs
    )
    changed = asyncio.run(
        update_conflicts(gateway, corpus.conn, corpus.em, corpus.settings, RUN_ID)
    )
    return changed, llm


def stored(corpus):
    return {
        frozenset(corpus.key_of_claim(c) for c in (x.claim_a, x.claim_b)): x
        for x in repo.list_conflicts(corpus.conn, RUN_ID)
    }


def test_all_planted_conflicts_are_found_with_no_false_positive(corpus):
    analyse(corpus)
    want = expected("conflicts")["conflicts"]
    got = stored(corpus)
    assert set(got) == {frozenset(w["claims"]) for w in want}  # recall 3/3, precision 3/3
    for spec in want:
        row = got[frozenset(spec["claims"])]
        assert row.kind.value == spec["kind"], spec["claims"]
        assert row.status.value == spec["status"], spec["claims"]
        assert row.slot_id == spec["slot"]
        assert row.delta_pct == pytest.approx(spec["delta_pct"], abs=0.01)
        assert row.explanation


def test_the_unit_trap_needs_no_llm_and_the_others_are_explained_by_the_explainer(corpus):
    _, llm = analyse(corpus)
    assert [c["prompt_id"] for c in llm.calls] == ["explainer.v1", "explainer.v1"]
    asked = {
        tuple(
            sorted(
                json.loads(c["messages"][1]["content"].split("\n\n<source")[0])["conflict"][
                    "claims"
                ][i]["id"]
                for i in (0, 1)
            )
        )
        for c in llm.calls
    }
    unit_trap = {corpus.claim_ids["F07.premium"], corpus.claim_ids["F09.premium"]}
    assert all(not unit_trap <= set(ids) for ids in asked)


def test_the_explainer_sees_the_claims_and_their_passages_inside_untrusted_source_blocks(corpus):
    _, llm = analyse(corpus)
    for call in llm.calls:
        system, user = call["messages"][0]["content"], call["messages"][1]["content"]
        assert "Prompt id: explainer.v1" in system and "<source" in system  # untrusted notice
        head = json.loads(user.split("\n\n<source")[0])
        assert len(head["conflict"]["claims"]) == 2
        shown = {
            repo.get_claim(corpus.conn, c["id"]).passage_id for c in head["conflict"]["claims"]
        }
        assert user.count('untrusted="true"') == len(shown)  # one block per distinct passage
        assert "untrusted" not in head  # passage text is only ever inside <source> blocks


def test_no_claim_is_dropped_and_contested_marks_exactly_the_open_conflict_members(corpus):
    before = len(repo.list_claims(corpus.conn, RUN_ID))
    analyse(corpus)
    claims = {c.id: c for c in repo.list_claims(corpus.conn, RUN_ID)}
    assert len(claims) == before
    contested = {
        corpus.key_of_claim(c.id) for c in claims.values() if c.status.value == "contested"
    }
    assert contested == set(expected("conflicts")["contested_claims"])
    assert claims[corpus.claim_ids["F12.review"]].status.value == "partial"
    assert claims[corpus.claim_ids["F13.cake"]].status.value == "rejected"
    assert claims[corpus.claim_ids["F07.premium"]].status.value == "supported"  # explained


def test_conflict_events_carry_metrics_only_for_llm_explained_conflicts(corpus):
    analyse(corpus, tokens=50, cost_usd=0.002)
    events = [e for e in read_events(corpus.conn, RUN_ID) if e.type is EventType.CONFLICT_DETECTED]
    assert len(events) == 3
    by_kind = {e.payload["conflict"]["kind"]: e for e in events}
    assert by_kind["unit_error"].tokens is None
    assert by_kind["genuine"].tokens == 50 and by_kind["definition"].cost_usd == 0.002


def test_a_second_pass_changes_nothing_and_calls_no_llm(corpus):
    analyse(corpus)
    events = len(list(read_events(corpus.conn, RUN_ID)))
    changed, llm = analyse(corpus)
    assert changed == [] and llm.calls == []
    assert len(list(read_events(corpus.conn, RUN_ID))) == events


def test_an_unusable_explainer_leaves_the_conflict_open_visible_and_retried(corpus):
    changed, _ = analyse(corpus, script="not json at all")
    rows = stored(corpus)
    genuine = rows[frozenset({"F07.basic", "F08.basic"})]
    assert (genuine.kind.value, genuine.status.value, genuine.explanation) == (
        "genuine",
        "open",
        None,
    )
    assert rows[frozenset({"F07.premium", "F09.premium"})].status.value == "explained"
    warnings = [e for e in read_events(corpus.conn, RUN_ID) if e.type is EventType.BUDGET_WARNING]
    assert warnings[0].payload["limit"] == "explainer_step_failures"
    # the next pass retries and resolves it
    analyse(corpus)
    assert stored(corpus)[frozenset({"F11.broad", "F11.narrow"})].kind.value == "definition"


def test_an_explained_verdict_without_an_explanation_cannot_hide_a_conflict(corpus):
    script = json.dumps({"kind": "scope_difference", "explanation": "  "})
    analyse(corpus, script=script)
    row = stored(corpus)[frozenset({"F07.basic", "F08.basic"})]
    assert (row.kind.value, row.status.value) == ("genuine", "open")


def test_budget_exhaustion_persists_what_was_decided_then_raises(corpus):
    gateway, _ = corpus.llm_gateway({"explainer.v1": explainer_script(corpus)})
    gateway.budget = Budget(max_llm_calls=0)
    with pytest.raises(BudgetExceeded):
        asyncio.run(update_conflicts(gateway, corpus.conn, corpus.em, corpus.settings, RUN_ID))
    rows = stored(corpus)
    assert rows[frozenset({"F07.premium", "F09.premium"})].status.value == "explained"
    assert rows[frozenset({"F07.basic", "F08.basic"})].status.value == "open"
    assert corpus.gateway.mode is Mode.LIVE
