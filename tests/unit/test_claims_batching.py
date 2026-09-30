"""Extractor batching (SARVAM_EXTRACTOR_BATCH_SIZE): several slots of ONE source per LLM call.

Batch size 1 is the legacy path (covered by test_claims.py); these tests cover size > 1.
"""

import asyncio
import json
import re

import pytest

from backend.gateway import BudgetExceeded, GatewayError
from backend.pipeline.claims import run_claims
from backend.store import repo
from contracts.config import Settings, Thresholds
from contracts.events import EventType
from contracts.models import Budget, FailureType
from tests.support.fakes import FakeLLM
from tests.unit.test_claims import Env

DEMAND = "Demand for the monthly price of the basic plan is Rs. 1,299 and the fleet size is 4,000."
COMPETE = (
    "Competition among scooter operators on monthly price and fleet size is intense in the city."
)
REGULATE = "Regulation of scooter parking in the city is being tightened by the council this year."
Q_DEMAND = "Demand for the monthly price of the basic plan is Rs. 1,299"
Q_COMPETE = "Competition among scooter operators on monthly price and fleet size"
NON_NUMERIC = dict(attribute=None, value=None, entity=None, unit=None, period=None)


class BatchEnv(Env):
    """One source with several passages (task T1 -> slot D1S1)."""

    def __init__(self, tmp_path, *, batch, k=5, texts=(DEMAND, COMPETE, REGULATE), budget=None):
        super().__init__(tmp_path, texts=(), budget=budget)
        self.settings = Settings(
            env="test",
            db_path=tmp_path / "t.db",
            artifact_dir=tmp_path / "art",
            llm_model_fast="fast-m",
            llm_model_strong="strong-m",
            extractor_batch_size=batch,
            thresholds=Thresholds(passages_per_slot_source=k),
        )
        self.source_ids: list[str] = []
        self.add_source(texts)

    def run(self, llm):
        self.gw = self.gateway(llm)
        return asyncio.run(run_claims(self.gw, self.conn, self.em, self.settings, "R1"))

    def add_source(self, texts):
        n = len(self.source_ids)
        src = repo.insert_source(
            self.conn,
            "R1",
            url=f"https://a.example/{n}",
            canonical_url=f"a.example/{n}",
            domain="a.example",
            publisher="a.example",
            source_type="news",
            authority_tier=2,
            task_id="T1",
        )
        repo.update_source(self.conn, src.id, status="fetched")
        ps = repo.insert_passages(self.conn, src.id, [(t, 0, len(t)) for t in texts])
        self.source_ids.append(src.id)
        self.passages.extend(ps)
        return ps


def claim(slot_id, passage_id, quote=Q_DEMAND, **over):
    d = {
        "slot_id": slot_id,
        "text": "The basic plan costs 1299 INR per month",
        "entity": "basic plan",
        "attribute": "monthly_price_inr",
        "value": 1299,
        "unit": "INR",
        "period": "month",
        "passage_id": passage_id,
        "quote": quote,
    }
    d.update(over)
    return d


def reply(claims):
    return FakeLLM({"extractor.v1": json.dumps({"claims": claims})})


def head(call):
    return json.loads(call["messages"][1]["content"].split("\n\n<source")[0])


def source_ids(call):
    return re.findall(r'<source id="(P\d+)"', call["messages"][1]["content"])


def stored(env):
    return [(c.slot_id, c.passage_id) for c in repo.list_claims(env.conn, "R1")]


def reasons(env):
    return [e.payload["reason"] for e in env.events(EventType.CLAIM_REJECTED)]


# A. default and legacy payload
def test_default_batch_size_is_one_and_keeps_the_single_slot_payload(tmp_path):
    assert Settings().extractor_batch_size == 1
    env = BatchEnv(tmp_path, batch=1)
    llm = reply([])
    env.run(llm)
    assert len(llm.calls) == 3  # D1S1, D1S2, D2S1: one call per (source, slot)
    assert all("slot" in head(c) and "slots" not in head(c) for c in llm.calls)


def test_batch_size_env_parsing():
    assert Settings.from_env({"SARVAM_EXTRACTOR_BATCH_SIZE": "3"}).extractor_batch_size == 3
    assert Settings.from_env({}).extractor_batch_size == 1
    with pytest.raises(ValueError):
        Settings.from_env({"SARVAM_EXTRACTOR_BATCH_SIZE": "0"})


# B. grouping by source
def test_slots_of_one_source_share_one_call(tmp_path):
    env = BatchEnv(tmp_path, batch=3)
    llm = reply([])
    env.run(llm)
    (call,) = llm.calls
    assert [s["id"] for s in head(call)["slots"]] == ["D1S1", "D1S2", "D2S1"]
    (op,) = env.gw.llm_ops
    assert op.meta == {"batch_size": 3, "batch_slots": 3, "batch_passages": len(source_ids(call))}


def test_each_source_gets_its_own_call(tmp_path):
    env = BatchEnv(tmp_path, batch=3)
    env.add_source((DEMAND + " Extra.", COMPETE + " Extra."))
    llm = reply([])
    env.run(llm)
    assert len(llm.calls) == 2
    ids = [set(source_ids(c)) for c in llm.calls]
    assert ids[0].isdisjoint(ids[1])  # a batch never mixes passages of two sources


# C. batch size limit
def test_batch_size_limits_slots_per_call_in_stable_order(tmp_path):
    env = BatchEnv(tmp_path, batch=2)
    llm = reply([])
    env.run(llm)
    got = [[s["id"] for s in head(c)["slots"]] for c in llm.calls]
    assert got == [["D1S1", "D1S2"], ["D2S1"]]


# D. shared passages appear once; each slot lists only its own ranked passages
def test_shared_passages_are_sent_once(tmp_path):
    env = BatchEnv(tmp_path, batch=3, k=2)
    llm = reply([])
    env.run(llm)
    (call,) = llm.calls
    slots = head(call)["slots"]
    assert all(len(s["passage_ids"]) <= 2 for s in slots)
    union = {p for s in slots for p in s["passage_ids"]}
    assert sorted(source_ids(call)) == sorted(union)  # every id exactly once
    assert len(source_ids(call)) < sum(len(s["passage_ids"]) for s in slots)  # something is shared
    assert {"id", "name", "description", "allowed_attributes", "passage_ids"} == set(slots[0])


# E. slot / passage attribution
def test_claim_on_a_passage_not_allowed_for_its_slot_is_rejected(tmp_path):
    env = BatchEnv(tmp_path, batch=3, k=1)
    pa, pb = env.passages[0].id, env.passages[1].id
    llm = reply([claim("D1S1", pb, Q_COMPETE, **NON_NUMERIC)])  # pb is D2S1's passage, not D1S1's
    assert env.run(llm) == 0
    assert reasons(env) == ["passage_not_allowed_for_slot"]
    (ev,) = env.events(EventType.CLAIM_REJECTED)
    assert ev.payload["slot_id"] == "D1S1" and ev.payload["passage_id"] == pb and pa
    assert repo.list_claims(env.conn, "R1") == []


def test_slot_outside_the_batch_is_rejected(tmp_path):
    env = BatchEnv(tmp_path, batch=3)
    llm = reply([claim("D4S1", env.passages[0].id)])
    assert env.run(llm) == 0 and reasons(env) == ["slot_not_in_batch"]


# F. valid cross-slot output
def test_claims_for_different_slots_in_one_response_are_stored_with_their_slot(tmp_path):
    env = BatchEnv(tmp_path, batch=3, k=1)
    pa, pb = env.passages[0].id, env.passages[1].id
    llm = reply([claim("D1S1", pa), claim("D2S1", pb, Q_COMPETE, **NON_NUMERIC)])
    assert env.run(llm) == 2
    assert stored(env) == [("D1S1", pa), ("D2S1", pb)]
    assert all(c.quote_verified for c in repo.list_claims(env.conn, "R1"))


# G. quote guard
def test_altered_quote_is_rejected_in_a_batch(tmp_path):
    env = BatchEnv(tmp_path, batch=3)
    bad = Q_DEMAND.replace("1,299", "1,399")
    assert env.run(reply([claim("D1S1", env.passages[0].id, bad)])) == 0
    assert reasons(env) == ["quote_not_in_passage"]


# H. numeric validation uses the claim's own slot
def test_attribute_check_is_per_claim_slot(tmp_path):
    env = BatchEnv(tmp_path, batch=3)
    pa = env.passages[0].id
    # D1S1 allows monthly_price_inr; D1S2 has no attributes
    llm = reply([claim("D1S2", pa), claim("D1S1", pa)])
    assert env.run(llm) == 1
    assert reasons(env) == ["attribute_not_in_slot"]
    assert stored(env) == [("D1S1", pa)]


# I. failure semantics
def test_failed_batch_is_skipped_and_the_run_continues(tmp_path):
    env = BatchEnv(tmp_path, batch=3)
    env.add_source((DEMAND + " Extra.", COMPETE + " Extra."))
    second = env.passages[3].id
    ok = json.dumps({"claims": [claim("D1S1", second, Q_DEMAND)]})
    llm = FakeLLM({"extractor.v1": [GatewayError(FailureType.STEP_FAILED, "bad json"), ok]})
    assert env.run(llm) == 1
    assert stored(env) == [("D1S1", second)]


def test_budget_error_surfaces_after_finished_batches_are_stored(tmp_path):
    env = BatchEnv(tmp_path, batch=3, budget=Budget(max_llm_calls=1))
    env.add_source((DEMAND + " Extra.", COMPETE + " Extra."))
    llm = reply([claim("D1S1", env.passages[0].id)])
    with pytest.raises(BudgetExceeded):
        env.run(llm)
    assert len(repo.list_claims(env.conn, "R1")) == 1


# J. determinism
def test_same_input_gives_identical_batches_and_payloads(tmp_path):
    runs = []
    for name in ("a", "b"):
        env = BatchEnv(tmp_path / name, batch=2)
        env.add_source((DEMAND + " Extra.", COMPETE + " Extra."))
        llm = reply([])
        env.run(llm)
        runs.append([c["messages"][1]["content"] for c in llm.calls])
    # passage ids are global counters, so compare the structure with ids masked per run
    mask = lambda s: re.sub(r"\b[PS]\d+\b", "X", s)  # noqa: E731
    assert [mask(m) for m in runs[0]] == [mask(m) for m in runs[1]]


def test_claims_are_stored_in_batch_order_regardless_of_completion_order(tmp_path):
    env = BatchEnv(tmp_path, batch=3)
    env.add_source((DEMAND + " Extra.", COMPETE + " Extra."))
    first, second = env.passages[0].id, env.passages[3].id

    class Slow(FakeLLM):
        async def complete(self, model, messages, **kw):
            if first in messages[1]["content"]:
                await asyncio.sleep(0.05)  # the first batch answers last
            return await super().complete(model, messages, **kw)

    def respond(messages):
        pid = first if first in messages[1]["content"] else second
        return json.dumps({"claims": [claim("D1S1", pid)]})

    assert env.run(Slow({"extractor.v1": respond})) == 2
    assert [p for _, p in stored(env)] == [first, second]


def test_claim_cap_is_per_slot_not_per_call(tmp_path):
    env = BatchEnv(tmp_path, batch=3, k=1)
    pa, pb = env.passages[0].id, env.passages[1].id
    junk = [claim("D1S1", pa, f"not in the passage number {i} at all") for i in range(6)]
    # 7th D1S1 claim is valid but over the per-slot cap; D2S1 still gets its own allowance
    llm = reply([*junk, claim("D1S1", pa), claim("D2S1", pb, Q_COMPETE, **NON_NUMERIC)])
    assert env.run(llm) == 1
    assert stored(env) == [("D2S1", pb)]
    assert len(reasons(env)) == 6
