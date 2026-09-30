"""T09 on the fixture corpus: a separate judge labels every claim in batches of five (FR-10)."""

from __future__ import annotations

import asyncio
import json

import pytest

from backend.gateway import BudgetExceeded
from backend.intel.verify import BATCH_SIZE, run_verify
from backend.store import repo
from backend.store.events import read_events
from contracts.events import EventType
from contracts.models import Budget
from tests.support.corpus import RUN_ID, build_corpus, expected, verifier_script


@pytest.fixture()
def corpus(tmp_path):
    return build_corpus(tmp_path, verdicts=False)


def verify(corpus, script=None, **kwargs):
    gateway, llm = corpus.llm_gateway({"verifier.v1": script or verifier_script(corpus)}, **kwargs)
    n = asyncio.run(run_verify(gateway, corpus.conn, corpus.em, corpus.settings, RUN_ID))
    return n, llm, gateway


def heads(llm):
    return [json.loads(c["messages"][1]["content"].split("\n\n<source")[0]) for c in llm.calls]


def events(corpus, type_):
    return [e for e in read_events(corpus.conn, RUN_ID) if e.type is type_]


def test_every_claim_starts_pending_and_gets_the_expected_verdict(corpus):
    assert {c.status.value for c in repo.list_claims(corpus.conn, RUN_ID)} == {"pending"}
    n, _, _ = verify(corpus)
    assert n == 16
    links = repo.latest_verdicts(corpus.conn, RUN_ID)
    for spec in expected("claims")["claims"]:
        link = links[corpus.claim_ids[spec["key"]]]
        assert link.verdict.value == spec["verdict"], spec["key"]
        assert link.verdict_rationale == spec["rationale"]


def test_verdicts_set_claim_status_and_only_supports_and_partial_stay_evidence(corpus):
    verify(corpus)
    status = {c.id: c.status.value for c in repo.list_claims(corpus.conn, RUN_ID)}
    assert status[corpus.claim_ids["F02.basic"]] == "supported"
    assert status[corpus.claim_ids["F12.review"]] == "partial"
    assert status[corpus.claim_ids["F13.cake"]] == "rejected"  # irrelevant: dropped
    assert sum(s == "supported" for s in status.values()) == 14


def test_contradicts_also_drops_the_claim_but_keeps_the_verdict_for_the_audit(corpus):
    verify(corpus, verifier_script(corpus, {"F08.basic": "contradicts"}))
    claim = repo.get_claim(corpus.conn, corpus.claim_ids["F08.basic"])
    assert claim.status.value == "rejected"
    assert repo.latest_verdicts(corpus.conn, RUN_ID)[claim.id].verdict.value == "contradicts"


def test_calls_carry_about_five_pairs_each(corpus):
    _, llm, _ = verify(corpus)
    sizes = [len(h["pairs"]) for h in heads(llm)]
    assert BATCH_SIZE == 5 and sorted(sizes) == [1, 5, 5, 5] and sum(sizes) == 16
    assert {c["prompt_id"] for c in llm.calls} == {"verifier.v1"}


def test_the_verifier_is_a_separate_call_that_never_sees_the_extractors_work(corpus):
    _, llm, _ = verify(corpus)
    assert llm.calls and all(c["prompt_id"] == "verifier.v1" for c in llm.calls)
    for call, head in zip(llm.calls, heads(llm), strict=True):
        system, user = call["messages"][0]["content"], call["messages"][1]["content"]
        assert "Prompt id: verifier.v1" in system and "independent claim verifier" in system
        for pair in head["pairs"]:
            claim = repo.get_claim(corpus.conn, pair["claim_id"])
            assert set(pair) == {"claim_id", "claim_text", "passage_id"}
            assert pair["claim_text"] == claim.text
            assert claim.quote not in user.split("<source")[0]  # no extractor quote in the head
            for field in (claim.entity, claim.attribute, claim.slot_id):
                assert field is None or f'"{field}"' not in user.split("<source")[0]
        for pair in head["pairs"]:
            assert f'<source id="{pair["passage_id"]}" untrusted="true">' in user


def test_passages_are_untrusted_and_an_injected_instruction_changes_nothing(corpus):
    _, llm, _ = verify(corpus)
    injected = [
        c
        for c in llm.calls
        if "ignore previous instructions" in c["messages"][1]["content"].lower()
    ]
    assert len(injected) == 1
    user = injected[0]["messages"][1]["content"]
    assert user.lower().index("ignore previous instructions") > user.index("<source")
    assert (
        repo.latest_verdicts(corpus.conn, RUN_ID)[corpus.claim_ids["F12.review"]].verdict.value
        == "partial"
    )


def test_verdict_events_are_emitted_per_claim_with_metrics_once_per_call(corpus):
    verify(corpus, tokens=40, cost_usd=0.001)
    evs = events(corpus, EventType.CLAIM_VERIFIED)
    assert len(evs) == 16
    assert {e.payload["verdict"] for e in evs} == {"supports", "partial", "irrelevant"}
    assert sum(e.tokens == 40 for e in evs) == 4  # one per call
    phases = [e.payload["phase"] for e in events(corpus, EventType.PHASE_ENTERED)]
    assert phases[-1] == "VERIFY"


def test_only_new_claims_are_judged_in_a_follow_up_round(corpus):
    verify(corpus)
    n, llm, _ = verify(corpus)
    assert n == 0 and llm.calls == []
    new = repo.insert_claim(
        corpus.conn,
        RUN_ID,
        slot_id="D3S2",
        text="Another opinion.",
        round=1,
        quote="a subscription works out cheaper than buying a scooter",
        passage_id=repo.list_passages(corpus.conn, corpus.source_ids["F12"])[0].id,
    )
    gateway, llm2 = corpus.llm_gateway(
        {
            "verifier.v1": lambda m: json.dumps(
                {
                    "verdicts": [
                        {
                            "claim_id": new.id,
                            "passage_id": new.passage_id,
                            "verdict": "supports",
                            "rationale": "ok",
                        }
                    ]
                }
            )
        }
    )
    assert (
        asyncio.run(run_verify(gateway, corpus.conn, corpus.em, corpus.settings, RUN_ID, round=1))
        == 1
    )
    assert len(llm2.calls) == 1 and len(heads(llm2)[0]["pairs"]) == 1


def test_claims_whose_quote_was_not_proven_are_never_judged(corpus):
    claim = repo.insert_claim(
        corpus.conn,
        RUN_ID,
        slot_id="D3S2",
        text="Unproven.",
        quote="not actually in the page at all",
        passage_id=repo.list_passages(corpus.conn, corpus.source_ids["F12"])[0].id,
        quote_verified=False,
    )
    n, llm, _ = verify(corpus)
    assert n == 16 and claim.id not in json.dumps(heads(llm))


def test_unknown_duplicate_and_repeated_verdicts_are_ignored(corpus):
    def greedy(messages):
        head = json.loads(messages[1]["content"].split("\n\n<source")[0])
        rows = [
            {
                "claim_id": p["claim_id"],
                "passage_id": p["passage_id"],
                "verdict": "irrelevant",
                "rationale": "first",
            }
            for p in head["pairs"]
        ]
        rows += [
            {
                "claim_id": p["claim_id"],
                "passage_id": p["passage_id"],
                "verdict": "supports",
                "rationale": "second",
            }
            for p in head["pairs"]
        ]
        rows.append(
            {
                "claim_id": "C9999",
                "passage_id": "P9999",
                "verdict": "supports",
                "rationale": "made up",
            }
        )
        rows.append(
            {
                "claim_id": head["pairs"][0]["claim_id"],
                "passage_id": "P9999",
                "verdict": "supports",
                "rationale": "wrong passage",
            }
        )
        return json.dumps({"verdicts": rows})

    n, _, _ = verify(corpus, greedy)
    assert n == 16
    assert {v.verdict.value for v in repo.latest_verdicts(corpus.conn, RUN_ID).values()} == {
        "irrelevant"
    }
    assert len(events(corpus, EventType.CLAIM_VERIFIED)) == 16


def test_pairs_the_model_skipped_are_asked_once_more_then_left_pending_with_a_warning(corpus):
    def skipping(messages):
        head = json.loads(messages[1]["content"].split("\n\n<source")[0])
        first = head["pairs"][0]
        row = {"claim_id": first["claim_id"], "passage_id": first["passage_id"]}
        return json.dumps({"verdicts": [{**row, "verdict": "supports", "rationale": "ok"}]})

    n, llm, _ = verify(corpus, skipping)
    # batches of 5, 5, 5 and 1: each call answers one pair; the single extra call answers one
    # more; a batch of one is finished by its first call
    assert len(llm.calls) == 7 and n == 7
    assert len(repo.list_unverified_claims(corpus.conn, RUN_ID)) == 9
    (warning,) = events(corpus, EventType.BUDGET_WARNING)
    assert warning.payload == {"limit": "verifier_unverified_claims", "used": 9, "max": 16}


def test_a_missing_pair_is_recovered_by_the_single_extra_call(corpus):
    calls = {"n": 0}
    full = verifier_script(corpus)

    def flaky(messages):
        calls["n"] += 1
        data = json.loads(full(messages))
        if calls["n"] == 1:
            data["verdicts"] = data["verdicts"][:-1]  # first call drops the last pair
        return json.dumps(data)

    n, llm, _ = verify(corpus, flaky)
    assert n == 16 and len(llm.calls) == 5
    assert repo.list_unverified_claims(corpus.conn, RUN_ID) == []
    assert events(corpus, EventType.BUDGET_WARNING) == []


def test_an_unusable_judge_leaves_claims_pending_and_visible_not_supported(corpus):
    n, _, _ = verify(corpus, "not json")
    assert n == 0
    assert {c.status.value for c in repo.list_claims(corpus.conn, RUN_ID)} == {"pending"}
    (warning,) = events(corpus, EventType.BUDGET_WARNING)
    assert (
        warning.payload["limit"] == "verifier_unverified_claims" and warning.payload["used"] == 16
    )


def test_budget_exhaustion_persists_finished_work_then_raises(corpus):
    gateway, _ = corpus.llm_gateway({"verifier.v1": verifier_script(corpus)})
    gateway.budget = Budget(max_llm_calls=2)
    with pytest.raises(BudgetExceeded):
        asyncio.run(run_verify(gateway, corpus.conn, corpus.em, corpus.settings, RUN_ID))
    stored = len(repo.latest_verdicts(corpus.conn, RUN_ID))
    assert 0 < stored < 16
    assert len(repo.list_unverified_claims(corpus.conn, RUN_ID)) == 16 - stored
