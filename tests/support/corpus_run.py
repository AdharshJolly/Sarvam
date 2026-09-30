"""The fixture corpus as a complete offline run: fake search, fetcher and LLM wired into the real
app, so a POST /api/runs walks the real controller over the 14 fixture documents (gate G2)."""

from __future__ import annotations

import json
import re

from backend.controller import RunnerDeps
from backend.gateway import GatewayError
from backend.gateway.search import SearchHit
from backend.pipeline.claims import quote_in_passage
from backend.pipeline.discover import second_query
from contracts.models import FailureType, Scope
from tests.support.corpus import CORPUS_DIR, expected, manifest
from tests.support.fakes import FakeFetcher, FakeLLM, FakeSearch, html_result
from tests.support.m0 import challenger as m0_challenger


def _head(messages: list[dict[str, str]]) -> dict:
    return json.loads(messages[1]["content"].split("\n\n<source")[0])


def extractor(messages: list[dict[str, str]]) -> str:
    """Returns the seeded claims of the slot being asked about whose quote is in a shown passage.
    Per passage, identical quotes count once and a quote that is only a fragment of another
    matching quote is dropped (a short seeded quote must not shadow another page's claim)."""
    head = _head(messages)
    blocks = re.findall(
        r'<source id="(P\d+)" untrusted="true">\n(.*?)\n</source>', messages[1]["content"], re.S
    )
    claims = []
    for pid, text in blocks:
        matching = [
            spec
            for spec in expected("claims")["claims"]
            if spec["slot"] == head["slot"]["id"] and quote_in_passage(spec["quote"], text).ok
        ]
        quotes = {spec["quote"] for spec in matching}
        kept: dict[str, dict] = {}
        for spec in matching:
            fragment = any(spec["quote"] != q and spec["quote"] in q for q in quotes)
            if not fragment and spec["quote"] not in kept:
                kept[spec["quote"]] = spec
        for spec in kept.values():
            claims.append(
                {
                    "slot_id": spec["slot"],
                    "text": spec["text"],
                    "entity": spec.get("entity"),
                    "attribute": spec.get("attribute"),
                    "value": spec.get("value"),
                    "unit": spec.get("unit"),
                    "period": spec.get("period"),
                    "passage_id": pid,
                    "quote": spec["quote"],
                }
            )
    return json.dumps({"claims": claims})


def verifier(messages: list[dict[str, str]]) -> str:
    """A good judge: the verdict of the seeded claim with the same text."""
    by_text = {c["text"]: c for c in expected("claims")["claims"]}
    out = []
    for pair in _head(messages)["pairs"]:
        spec = by_text.get(pair["claim_text"])  # not a seeded claim: a challenge attack
        out.append(
            {
                "claim_id": pair["claim_id"],
                "passage_id": pair["passage_id"],
                "verdict": spec["verdict"] if spec else "irrelevant",
                "rationale": spec["rationale"] if spec else "The passage does not address it.",
            }
        )
    return json.dumps({"verdicts": out})


def writer(messages: list[dict[str, str]]) -> str:
    """A faithful writer: one finding per claim it was given, worded exactly like the claim, plus
    one sentence that cites nothing (the verifier must remove it)."""
    head = json.loads(messages[1]["content"])
    by_dim: dict[str, list[dict]] = {}
    for c in head["claims"]:
        by_dim.setdefault(c["dimension_id"], []).append(c)
    sections = [
        {
            "dimension_id": dim,
            "heading": dim,
            "findings": [{"text": c["text"], "claim_ids": [c["id"]]} for c in cs],
        }
        for dim, cs in by_dim.items()
    ]
    if sections:
        sections[0]["findings"].append({"text": "Everyone agrees on this.", "claim_ids": []})
    return json.dumps(
        {"decision_summary": "Pricing and permits are documented.", "sections": sections}
    )


def explainer(messages: list[dict[str, str]]) -> str:
    text_of = {c["key"]: c["text"] for c in expected("claims")["claims"]}
    answers = {
        frozenset(text_of[k] for k in pair.split("|")): ans
        for pair, ans in expected("conflicts")["llm_explainer_script"].items()
    }
    texts = frozenset(c["text"] for c in _head(messages)["conflict"]["claims"])
    return json.dumps(answers[texts])


class CorpusSearch(FakeSearch):
    """A provider that finds the pages relevant to each slot: the fixtures whose seeded claims
    target the slot (plus F14 for charging infrastructure). A query is matched to its task by text
    (the task query or its differently phrased second query). Pages held back from round 0 are
    found by follow-up queries: a gap query that names a slot finds that slot's held-back pages, any
    other follow-up query (a challenge) finds `challenge_hits`."""

    def __init__(
        self,
        hits_by_slot: dict[str, list[SearchHit]],
        slot_of_query: dict[str, str],
        followup_by_slot: dict[str, list[SearchHit]] | None = None,
        slot_names: dict[str, str] | None = None,
        challenge_hits: list[SearchHit] | None = None,
    ):
        super().__init__()
        self.hits_by_slot = hits_by_slot
        self.slot_of_query = slot_of_query
        self.followup_by_slot = followup_by_slot or {}
        self.slot_names = slot_names or {}
        self.challenge_hits = challenge_hits or []

    async def search(self, query: str, *, max_results: int = 8) -> list[SearchHit]:
        self.calls.append(query)
        if query in self.slot_of_query:
            return list(self.hits_by_slot.get(self.slot_of_query[query], []))
        for slot_id, name in self.slot_names.items():
            if name.lower() in query.lower():
                return list(self.followup_by_slot.get(slot_id, []))
        return list(self.challenge_hits)


def corpus_deps(
    *,
    llm_script: dict | None = None,
    sleep=None,
    withhold: frozenset[str] = frozenset(),
    challenge_pages: frozenset[str] = frozenset(),
) -> RunnerDeps:
    docs = manifest()["documents"]
    plan = {**expected("plan"), "budget": {"max_searches": 999}}
    hit_of = {fid: SearchHit(url=d["url"], title=fid, snippet="s") for fid, d in docs.items()}
    hits_by_slot: dict[str, list[SearchHit]] = {}
    for spec in expected("claims")["claims"]:
        if spec["fixture"] in withhold:
            continue  # held back from round 0: only a follow-up search can find it
        bucket = hits_by_slot.setdefault(spec["slot"], [])
        if hit_of[spec["fixture"]] not in bucket:
            bucket.append(hit_of[spec["fixture"]])
    followup_by_slot: dict[str, list[SearchHit]] = {}
    for spec in expected("claims")["claims"]:
        if spec["fixture"] in withhold and spec["fixture"] not in challenge_pages:
            followup_by_slot.setdefault(spec["slot"], []).append(hit_of[spec["fixture"]])
    slot_names = {s["id"]: s["name"] for d in plan["dimensions"] for s in d["slots"]}
    hits_by_slot["D4S2"] = [hit_of["F14"]]  # the page that answers 403
    slot_of_query: dict[str, str] = {}
    for dim in plan["dimensions"]:
        for slot in dim["slots"]:
            for task in slot["tasks"]:
                slot_of_query[task["query"]] = slot["id"]
                slot_of_query[second_query(task["query"], slot["name"], Scope())] = slot["id"]
    pages = {}
    for fid, d in docs.items():
        if d["fetch"] == "403":
            pages[d["url"]] = GatewayError(FailureType.SOURCE_UNAVAILABLE, "http_403")
        else:
            html = (CORPUS_DIR / f"{fid}.html").read_text(encoding="utf-8")
            pages[d["url"]] = html_result(d["url"], html)
    script = {
        "planner.v1": plan,
        "extractor.v1": extractor,
        "verifier.v1": verifier,
        "explainer.v1": explainer,
        "writer.v1": writer,
        "challenger.v1": m0_challenger,
    }
    script.update(llm_script or {})
    return RunnerDeps(
        search=CorpusSearch(
            hits_by_slot,
            slot_of_query,
            followup_by_slot,
            slot_names,
            [hit_of[f] for f in sorted(challenge_pages)],
        ),
        fetcher=FakeFetcher(pages),
        llm=FakeLLM(script, tokens=10, cost_usd=0.001),
        sleep=sleep,
    )
