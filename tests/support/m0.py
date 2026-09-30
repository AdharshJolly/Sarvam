"""A complete offline M0 scenario: fake search, fetcher and LLM wired into the real app."""

from __future__ import annotations

import json
import re
import time
from pathlib import Path

from backend.controller import RunnerDeps, run_research
from backend.gateway.search import SearchHit
from tests.support.data import plan_dict
from tests.support.fakes import FakeFetcher, FakeLLM, FakeSearch, html_result

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "html"
ARTICLE = (FIXTURES / "article.html").read_text(encoding="utf-8")
GOOD_QUOTE = "Monthly plans start at Rs. 1,299 for a basic scooter"
BAD_QUOTE = GOOD_QUOTE.replace("1,299", "1,399")  # one altered digit

URLS = [
    "https://www.ecozaar.example/plans",  # company_primary, tier 1
    "https://www.livemint.com/companies/ev-scooters",  # news, tier 2
    "https://someone.medium.com/ev-scooters",  # blog, tier 3
    "https://random-site.example/ev-article",  # unknown, tier 3
]


def extractor(messages):
    """One valid claim and one altered-digit claim per call that sees the planted sentence."""
    user = messages[1]["content"]
    head = json.loads(user.split("\n\n<source")[0])
    blocks = re.findall(r'<source id="(P\d+)" untrusted="true">\n(.*?)\n</source>', user, re.S)
    claims = []
    for pid, text in blocks:
        if GOOD_QUOTE in text:
            claim = {
                "slot_id": head["slot"]["id"],
                "text": "Monthly plans start at 1299 INR",
                "passage_id": pid,
                "quote": GOOD_QUOTE,
            }
            if "monthly_price_inr" in head["allowed_attributes"]:
                claim.update(
                    entity="basic plan",
                    attribute="monthly_price_inr",
                    value=1299,
                    unit="INR",
                    period="month",
                )
            claims += [claim, {**claim, "quote": BAD_QUOTE}]
            break
    return json.dumps({"claims": claims})


def writer(messages):
    """Cites real claims, plus one uncited sentence and one invented citation (both must drop)."""
    head = json.loads(messages[1]["content"])
    by_dim: dict[str, list[dict]] = {}
    for c in head["claims"][:6]:
        by_dim.setdefault(c["dimension_id"], []).append(c)
    sections = [
        {
            "dimension_id": dim,
            "heading": dim,
            "findings": [
                {"text": "Plans start at Rs. 1,299 per month.", "claim_ids": [c["id"]]} for c in cs
            ],
        }
        for dim, cs in by_dim.items()
    ]
    if sections:
        sections[0]["findings"] += [
            {"text": "An uncited sentence.", "claim_ids": []},
            {"text": "An invented citation.", "claim_ids": ["C9999"]},
        ]
    return json.dumps(
        {
            "decision_summary": "The evidence shows monthly pricing from Rs. 1,299.",
            "sections": sections,
        }
    )


def verifier(messages):
    """A judge that finds every claim supported by its passage."""
    head = json.loads(messages[1]["content"].split("\n\n<source")[0])
    verdicts = [
        {
            "claim_id": p["claim_id"],
            "passage_id": p["passage_id"],
            "verdict": "supports",
            "rationale": "The passage states the claim.",
        }
        for p in head["pairs"]
    ]
    return json.dumps({"verdicts": verdicts})


def challenger(messages):
    """One attack on the weakest slot with a query that was not tried before (unique per round)."""
    head = json.loads(messages[1]["content"].split("\n\n<source")[0])
    slot = head["coverage"][0]["slot_id"]
    return json.dumps(
        {
            "attacks": [
                {
                    "attack_hypothesis": "Rival operators charge far less than the leader",
                    "target": {"slot_id": slot},
                    "required_evidence": "A rival price list",
                    "followup_queries": [f"rival scooter price comparison round {head['round']}"],
                    "would_change_conclusion_if": "Rivals charge much less",
                }
            ]
        }
    )


def scenario_deps(*, hits=None, fetch=None, llm_script=None, sleep=None) -> RunnerDeps:
    hit_list = hits or [SearchHit(url=u, title=u, snippet="s") for u in URLS]
    pages = fetch or {u: html_result(u, ARTICLE) for u in URLS}
    script = {
        "planner.v1": plan_dict(4),
        "extractor.v1": extractor,
        "verifier.v1": verifier,
        "writer.v1": writer,
        "challenger.v1": challenger,
    }
    script.update(llm_script or {})
    return RunnerDeps(
        search=FakeSearch(default=hit_list),
        fetcher=FakeFetcher(pages),
        llm=FakeLLM(script, tokens=10, cost_usd=0.001),
        sleep=sleep,
    )


def runner_for(deps: RunnerDeps):
    async def runner(run_id, settings, handle):
        await run_research(run_id, settings=settings, handle=handle, deps=deps)

    return runner


def wait_for_status(client, rid, statuses=("completed", "failed"), timeout=15.0) -> dict:
    end = time.time() + timeout
    while time.time() < end:
        body = client.get(f"/api/runs/{rid}").json()
        if body["run"]["status"] in statuses:
            return body
        time.sleep(0.05)
    raise AssertionError(f"run {rid} did not reach {statuses}")


def read_events(client, rid) -> list[dict]:
    with client.stream("GET", f"/api/runs/{rid}/events") as r:
        text = r.read().decode()
    return [json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")]
