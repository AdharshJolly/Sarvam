"""T13: challenge loop and the rule-based outcome (SSOT 9.9, FR-15)."""

from __future__ import annotations

import asyncio
import json

import pytest

from backend.intel.analyze import run_analyze
from backend.intel.challenge import (
    outcome_by_rule,
    rank_for_attack,
    resolve_challenges,
    run_challenge,
    validate_attacks,
)
from backend.store import repo
from backend.store.events import read_events
from contracts.events import EventType
from contracts.llm import AttackDraft, AttackTarget
from contracts.models import ChallengeOutcome as O
from contracts.models import Scope, Verdict
from tests.support.corpus import RUN_ID, build_corpus, explainer_script

V = Verdict


# ---------------------------------------------------------------- the outcome rule


@pytest.mark.parametrize(
    "verdicts, want",
    [
        ([V.SUPPORTS], O.WEAKENED),
        ([V.IRRELEVANT, V.CONTRADICTS, V.SUPPORTS], O.WEAKENED),  # any support weakens
        ([V.CONTRADICTS, V.CONTRADICTS, V.PARTIAL], O.STRENGTHENED),  # 3 relevant, none support
        ([V.CONTRADICTS] * 6, O.STRENGTHENED),
        ([V.CONTRADICTS, V.PARTIAL], O.UNRESOLVED),  # only 2 relevant
        ([V.IRRELEVANT] * 5, O.UNRESOLVED),  # nothing relevant
        ([], O.UNRESOLVED),  # nothing found
    ],
)
def test_outcome_is_assigned_by_rule(verdicts, want):
    assert outcome_by_rule(verdicts) is want


# ---------------------------------------------------------------- attack validation


def attack(text="Rivals charge half", slot=None, claim=None, queries=("rival scooter price",)):
    return AttackDraft(
        attack_hypothesis=text,
        target=AttackTarget(slot_id=slot, claim_id=claim),
        followup_queries=list(queries),
        required_evidence="A price list",
        would_change_conclusion_if="Prices are lower",
    )


def test_attacks_are_capped_at_three_and_need_a_real_target_and_a_new_query():
    drafts = [
        attack("a", slot="S1"),
        attack("b", claim="C1"),  # the claim gives the slot
        attack("c", slot="NOPE"),  # invented slot: dropped
        attack("d", claim="C99"),  # invented claim: dropped
        attack("e", slot="S1", queries=("Already tried",)),  # nothing new to search
        attack("", slot="S1"),  # no hypothesis
        attack("f", slot="S2"),
        attack("g", slot="S2"),
    ]
    kept = validate_attacks(drafts, {"S1", "S2"}, {"C1": "S2"}, ["already  tried"])
    assert [a.hypothesis for a in kept] == ["a", "b", "f"]
    assert kept[1].slot_id == "S2" and kept[1].claim_id == "C1"


def test_at_most_two_queries_and_duplicates_are_dropped():
    (kept,) = validate_attacks(
        [attack(slot="S1", queries=("q one", "Q ONE", "q two", "q three"))], {"S1"}, {}, []
    )
    assert kept.queries == ("q one", "q two")


# ---------------------------------------------------------------- against the fixture corpus


@pytest.fixture()
def corpus(tmp_path):
    c = build_corpus(tmp_path)
    gateway, _ = c.llm_gateway({"explainer.v1": explainer_script(c)})
    asyncio.run(run_analyze(gateway, c.conn, c.em, c.settings, RUN_ID))
    return c


def challenger_reply(corpus, slot="D2S1"):
    return {
        "attacks": [
            {
                "attack_hypothesis": "Competitors undercut the quoted monthly fee",
                "target": {"slot_id": slot},
                "required_evidence": "A competitor price list",
                "followup_queries": ["competitor scooter subscription price Bengaluru"],
                "would_change_conclusion_if": "Rivals charge far less than the leader",
            },
            {
                "attack_hypothesis": "Permits cost more than stated",
                "target": {"claim_id": corpus.claim_ids["F07.basic"]},
                "followup_queries": ["Bengaluru operator permit fee"],
            },
        ]
    }


def test_the_challenger_gets_the_weakest_slots_first_and_claim_text_as_untrusted(corpus):
    gateway, llm = corpus.llm_gateway({"challenger.v1": challenger_reply(corpus)})
    asyncio.run(
        run_challenge(
            gateway, corpus.conn, corpus.em, RUN_ID, "Q?", Scope(geography="Bengaluru"), round=1
        )
    )
    (call,) = llm.calls
    body = call["messages"][1]["content"]
    head = json.loads(body.split("\n\n<source")[0])
    order = [c["state"] for c in head["coverage"]]
    assert order == sorted(order, key={"RED": 0, "AMBER": 1, "GREEN": 2}.get)
    assert head["round"] == 1 and head["already_tried"]
    assert all(c["id"].startswith("C") for c in head["top_claims"])
    assert 'untrusted="true"' in body and "text" not in head["top_claims"][0]


def test_each_attack_becomes_a_stored_challenge_with_one_challenge_task(corpus):
    gateway, _ = corpus.llm_gateway({"challenger.v1": challenger_reply(corpus)})
    made = asyncio.run(
        run_challenge(gateway, corpus.conn, corpus.em, RUN_ID, "Q?", Scope(), round=1)
    )
    assert len(made) == 2 and all(c.outcome is None for c in made)
    tasks = [t for t in repo.list_tasks(corpus.conn, RUN_ID) if t.kind.value == "challenge"]
    assert len(tasks) == 2 and all(t.round == 1 and t.status == "pending" for t in tasks)
    assert [c.followup_task_ids for c in made] == [[t.id] for t in tasks]
    assert made[1].target_slot == repo.get_claim(corpus.conn, made[1].target_claim).slot_id
    events = [e for e in read_events(corpus.conn, RUN_ID) if e.type is EventType.CHALLENGE_CREATED]
    assert [e.payload["challenge"]["id"] for e in events] == [c.id for c in made]
    assert repo.list_challenges(corpus.conn, RUN_ID) == made


def test_a_challenger_that_fails_its_schema_yields_no_attacks_and_a_warning(corpus):
    gateway, _ = corpus.llm_gateway({"challenger.v1": "not json"})
    made = asyncio.run(
        run_challenge(gateway, corpus.conn, corpus.em, RUN_ID, "Q?", Scope(), round=1)
    )
    assert made == []
    warnings = [e for e in read_events(corpus.conn, RUN_ID) if e.type is EventType.BUDGET_WARNING]
    assert any(w.payload["limit"] == "challenger_step_failed" for w in warnings)


def seed_followup_sources(corpus, task_id, fixtures):
    """Point already-fetched fixture sources at the challenge task, as discover would."""
    for fid in fixtures:
        corpus.conn.execute(
            "UPDATE sources SET task_id=? WHERE id=?", (task_id, corpus.source_ids[fid])
        )
    corpus.conn.commit()


def verdict_script(by_passage: dict[str, str] | str):
    def respond(messages):
        head = json.loads(messages[1]["content"].split("\n\n<source")[0])
        return json.dumps(
            {
                "verdicts": [
                    {
                        "claim_id": p["claim_id"],
                        "passage_id": p["passage_id"],
                        "verdict": by_passage
                        if isinstance(by_passage, str)
                        else by_passage.get(p["passage_id"], "irrelevant"),
                        "rationale": "r",
                    }
                    for p in head["pairs"]
                ]
            }
        )

    return respond


def one_challenge(corpus, fixtures):
    gateway, _ = corpus.llm_gateway({"challenger.v1": challenger_reply(corpus)})
    (first, *_) = asyncio.run(
        run_challenge(gateway, corpus.conn, corpus.em, RUN_ID, "Q?", Scope(), round=1)
    )
    seed_followup_sources(corpus, first.followup_task_ids[0], fixtures)
    return first


def test_a_supporting_passage_weakens_and_the_verifier_sees_the_attack_as_the_claim(corpus):
    first = one_challenge(corpus, ["F07", "F08"])
    passage = repo.list_passages(corpus.conn, corpus.source_ids["F08"])[0]
    gateway, llm = corpus.llm_gateway({"verifier.v1": verdict_script({passage.id: "supports"})})
    done = asyncio.run(resolve_challenges(gateway, corpus.conn, corpus.em, RUN_ID, round=1))
    assert first.id in [c.id for c in done]
    stored = next(c for c in repo.list_challenges(corpus.conn, RUN_ID) if c.id == first.id)
    assert stored.outcome is O.WEAKENED
    head = json.loads(llm.calls[0]["messages"][1]["content"].split("\n\n<source")[0])
    assert {p["claim_text"] for p in head["pairs"]} == {first.attack}
    assert len(head["pairs"]) <= 5
    out = [e for e in read_events(corpus.conn, RUN_ID) if e.type is EventType.CHALLENGE_OUTCOME]
    assert {"challenge_id": first.id, "outcome": "weakened"} in [e.payload for e in out]


def test_three_relevant_passages_none_supporting_strengthens(corpus):
    first = one_challenge(corpus, ["F07", "F08", "F10"])
    gateway, _ = corpus.llm_gateway({"verifier.v1": verdict_script("contradicts")})
    asyncio.run(resolve_challenges(gateway, corpus.conn, corpus.em, RUN_ID, round=1))
    stored = next(c for c in repo.list_challenges(corpus.conn, RUN_ID) if c.id == first.id)
    assert stored.outcome is O.STRENGTHENED


def test_too_little_relevant_evidence_is_unresolved(corpus):
    first = one_challenge(corpus, ["F07"])
    gateway, _ = corpus.llm_gateway({"verifier.v1": verdict_script("irrelevant")})
    asyncio.run(resolve_challenges(gateway, corpus.conn, corpus.em, RUN_ID, round=1))
    stored = next(c for c in repo.list_challenges(corpus.conn, RUN_ID) if c.id == first.id)
    assert stored.outcome is O.UNRESOLVED


def test_no_new_passages_is_unresolved_without_calling_the_verifier(corpus):
    first = one_challenge(corpus, [])
    gateway, llm = corpus.llm_gateway({"verifier.v1": verdict_script("supports")})
    asyncio.run(resolve_challenges(gateway, corpus.conn, corpus.em, RUN_ID, round=1))
    assert llm.calls == []
    stored = next(c for c in repo.list_challenges(corpus.conn, RUN_ID) if c.id == first.id)
    assert stored.outcome is O.UNRESOLVED


def test_a_verifier_failure_leaves_the_challenge_undecided(corpus):
    first = one_challenge(corpus, ["F07", "F08", "F10"])
    gateway, _ = corpus.llm_gateway({"verifier.v1": "garbage"})
    done = asyncio.run(resolve_challenges(gateway, corpus.conn, corpus.em, RUN_ID, round=1))
    assert first.id not in [c.id for c in done]  # the other attack found nothing: unresolved
    stored = next(c for c in repo.list_challenges(corpus.conn, RUN_ID) if c.id == first.id)
    assert (
        stored.outcome is None
    )  # not concluded from a gap; the round is not a completed challenge


def test_only_the_named_round_is_resolved_and_resolving_twice_is_a_noop(corpus):
    first = one_challenge(corpus, ["F07", "F08", "F10"])
    gateway, llm = corpus.llm_gateway({"verifier.v1": verdict_script("contradicts")})
    assert asyncio.run(resolve_challenges(gateway, corpus.conn, corpus.em, RUN_ID, round=2)) == []
    assert llm.calls == []
    asyncio.run(resolve_challenges(gateway, corpus.conn, corpus.em, RUN_ID, round=1))
    n = len(llm.calls)
    asyncio.run(resolve_challenges(gateway, corpus.conn, corpus.em, RUN_ID, round=1))
    assert len(llm.calls) == n and first.id


def test_rank_for_attack_prefers_word_overlap_and_keeps_order_on_ties(corpus):
    passages = [p for fid in ("F07", "F08", "F10") for p in
                repo.list_passages(corpus.conn, corpus.source_ids[fid])]  # fmt: skip
    ranked = rank_for_attack(passages, "monthly price plan", 2)
    assert len(ranked) == 2
    assert rank_for_attack(passages, "zzzz qqqq", 3) == passages[:3]
