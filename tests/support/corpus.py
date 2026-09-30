"""Loads the fixture corpus (SSOT 16.2, task T08) into a real store through the real pipeline.

Sources are qualified by `discover.classify`, fetched through `run_acquire` (a FakeFetcher serves
the HTML, F14 answers 403), split into passages by `run_extract`, and the seeded claims are inserted
only if the quote guard proves their quote occurs in the stored passage. Verdicts are optional so a
test can run the verifier itself or seed the verdicts a good judge returns.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from backend.gateway import GatewayError
from backend.gateway.core import ToolGateway
from backend.pipeline.acquire import run_acquire
from backend.pipeline.claims import quote_in_passage
from backend.pipeline.discover import canonicalize_url, classify
from backend.pipeline.extract import run_extract
from backend.store import repo
from backend.store.db import init_db
from backend.store.emit import Emitter
from contracts.config import Settings
from contracts.models import Budget, FailureType, Mode, Plan, Verdict
from tests.support.fakes import FakeFetcher, FakeLLM, html_result

ROOT = Path(__file__).resolve().parents[2]
CORPUS_DIR = ROOT / "fixtures" / "corpus"
EXPECTED_DIR = ROOT / "fixtures" / "expected"
RUN_ID = "R1"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def manifest() -> dict[str, Any]:
    return load_json(CORPUS_DIR / "manifest.json")


def expected(name: str) -> Any:
    return load_json(EXPECTED_DIR / f"{name}.json")


def as_of() -> datetime:
    return datetime.fromisoformat(manifest()["as_of"] + "T00:00:00+00:00")


@dataclass
class Corpus:
    settings: Settings
    conn: Any
    gateway: ToolGateway
    em: Emitter
    run_id: str = RUN_ID
    source_ids: dict[str, str] = field(default_factory=dict)  # F02 -> S2
    claim_ids: dict[str, str] = field(default_factory=dict)  # F02.basic -> C3

    def fixture_of_source(self, source_id: str) -> str:
        return next(f for f, s in self.source_ids.items() if s == source_id)

    def key_of_claim(self, claim_id: str) -> str:
        return next(k for k, c in self.claim_ids.items() if c == claim_id)

    def llm_gateway(self, script: dict[str, Any], **kwargs: Any) -> tuple[ToolGateway, FakeLLM]:
        """A gateway whose LLM is a FakeLLM with `script` (prompt id -> scripted responses)."""
        llm = FakeLLM(script, **kwargs)
        gateway = ToolGateway(settings=self.settings, budget=Budget(), mode=Mode.LIVE, llm=llm)
        return gateway, llm


def build_corpus(
    tmp_path: Path,
    *,
    claims: bool = True,
    verdicts: bool = True,
    only: set[str] | None = None,
    thresholds: Any = None,
) -> Corpus:
    """Create run R1 with the fixture plan, fetched sources, passages and (optionally) claims."""
    kwargs: dict[str, Any] = {"thresholds": thresholds} if thresholds is not None else {}
    settings = Settings(
        env="test", db_path=tmp_path / "corpus.db", artifact_dir=tmp_path / "art", **kwargs
    )
    conn = init_db(settings.db_path)
    budget = Budget()
    conn.execute(
        "INSERT INTO runs (id, question, mode, budget_json, started_at) VALUES (?,?,?,?,?)",
        (
            RUN_ID,
            "Should a company launch an electric scooter subscription service in Bengaluru?",
            "LIVE",
            budget.model_dump_json(),
            "2026-09-30T00:00:00+00:00",
        ),
    )
    conn.commit()
    plan = Plan.model_validate({**expected("plan"), "budget": budget.model_dump()})
    repo.insert_plan(conn, RUN_ID, plan)
    task_of_slot = {s.id: s.tasks[0].id for d in plan.dimensions for s in d.slots}
    slot_of_fixture: dict[str, str] = {}
    for spec in expected("claims")["claims"]:
        slot_of_fixture.setdefault(spec["fixture"], spec["slot"])

    docs = manifest()["documents"]
    script: dict[str, Any] = {}
    source_ids: dict[str, str] = {}
    for fid, doc in docs.items():
        if only is not None and fid not in only:
            continue
        url = doc["url"]
        stype, tier, domain = classify(url)
        source = repo.insert_source(
            conn,
            RUN_ID,
            url=url,
            canonical_url=canonicalize_url(url),
            domain=domain,
            publisher=domain,
            source_type=stype.value,
            authority_tier=tier,
            task_id=task_of_slot.get(slot_of_fixture.get(fid, "")),
        )
        source_ids[fid] = source.id
        if doc["fetch"] == "403":
            script[url] = GatewayError(FailureType.SOURCE_UNAVAILABLE, "http_403")
        else:
            html = (CORPUS_DIR / f"{fid}.html").read_text(encoding="utf-8")
            script[url] = html_result(url, html)

    gateway = ToolGateway(
        settings=settings, budget=budget, mode=Mode.LIVE, fetcher=FakeFetcher(script)
    )
    em = Emitter(conn, RUN_ID)
    asyncio.run(run_acquire(gateway, conn, em, settings, RUN_ID))
    run_extract(conn, em, settings, RUN_ID)
    corpus = Corpus(settings, conn, gateway, em, source_ids=source_ids)
    if claims:
        seed_claims(corpus, verdicts=verdicts, only=only)
    return corpus


def seed_claims(corpus: Corpus, *, verdicts: bool, only: set[str] | None = None) -> None:
    """Insert the seeded claims; each quote must be proven by the quote guard (FR-09)."""
    for spec in expected("claims")["claims"]:
        fid = spec["fixture"]
        if only is not None and fid not in only:
            continue
        passages = repo.list_passages(corpus.conn, corpus.source_ids[fid])
        match = next((p for p in passages if quote_in_passage(spec["quote"], p.text).ok), None)
        assert match is not None, f"quote of {spec['key']} is not in any passage of {fid}"
        claim = repo.insert_claim(
            corpus.conn,
            RUN_ID,
            slot_id=spec["slot"],
            text=spec["text"],
            quote=spec["quote"],
            passage_id=match.id,
            entity=spec.get("entity"),
            attribute=spec.get("attribute"),
            value_num=spec.get("value"),
            unit=spec.get("unit"),
            period=spec.get("period"),
        )
        corpus.claim_ids[spec["key"]] = claim.id
        if verdicts:
            repo.record_verdict(
                corpus.conn, claim.id, Verdict(spec["verdict"]), spec.get("rationale", "")
            )


def explainer_script(corpus: Corpus) -> Any:
    """FakeLLM responder for `explainer.v1`: answers from expected/conflicts.json, keyed by the two
    fixture claim keys of the conflict it is asked about."""
    script = expected("conflicts")["llm_explainer_script"]

    def respond(messages: list[dict[str, str]]) -> str:
        head = json.loads(messages[1]["content"].split("\n\n<source")[0])
        keys = sorted(corpus.key_of_claim(c["id"]) for c in head["conflict"]["claims"])
        return json.dumps(script["|".join(keys)])

    return respond


def verifier_script(corpus: Corpus, overrides: dict[str, str] | None = None) -> Any:
    """FakeLLM responder for `verifier.v1`: the verdict a good judge gives for each seeded claim
    (expected/claims.json), keyed by claim id. `overrides` maps claim keys to other verdicts."""
    specs = {c["key"]: c for c in expected("claims")["claims"]}

    def respond(messages: list[dict[str, str]]) -> str:
        head = json.loads(messages[1]["content"].split("\n\n<source")[0])
        out = []
        for pair in head["pairs"]:
            key = corpus.key_of_claim(pair["claim_id"])
            spec = specs[key]
            verdict = (overrides or {}).get(key, spec["verdict"])
            out.append(
                {
                    "claim_id": pair["claim_id"],
                    "passage_id": pair["passage_id"],
                    "verdict": verdict,
                    "rationale": spec.get("rationale", ""),
                }
            )
        return json.dumps({"verdicts": out})

    return respond
