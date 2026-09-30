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
from tests.support.m0 import writer as m0_writer


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
        spec = by_text[pair["claim_text"]]
        out.append(
            {
                "claim_id": pair["claim_id"],
                "passage_id": pair["passage_id"],
                "verdict": spec["verdict"],
                "rationale": spec["rationale"],
            }
        )
    return json.dumps({"verdicts": out})


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
    (the task query or its differently phrased second query)."""

    def __init__(self, hits_by_slot: dict[str, list[SearchHit]], slot_of_query: dict[str, str]):
        super().__init__()
        self.hits_by_slot = hits_by_slot
        self.slot_of_query = slot_of_query

    async def search(self, query: str, *, max_results: int = 8) -> list[SearchHit]:
        self.calls.append(query)
        return list(self.hits_by_slot.get(self.slot_of_query.get(query, ""), []))


def corpus_deps(*, llm_script: dict | None = None, sleep=None) -> RunnerDeps:
    docs = manifest()["documents"]
    plan = {**expected("plan"), "budget": {"max_searches": 999}}
    hit_of = {fid: SearchHit(url=d["url"], title=fid, snippet="s") for fid, d in docs.items()}
    hits_by_slot: dict[str, list[SearchHit]] = {}
    for spec in expected("claims")["claims"]:
        bucket = hits_by_slot.setdefault(spec["slot"], [])
        if hit_of[spec["fixture"]] not in bucket:
            bucket.append(hit_of[spec["fixture"]])
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
        "writer.v1": m0_writer,
    }
    script.update(llm_script or {})
    return RunnerDeps(
        search=CorpusSearch(hits_by_slot, slot_of_query),
        fetcher=FakeFetcher(pages),
        llm=FakeLLM(script, tokens=10, cost_usd=0.001),
        sleep=sleep,
    )
