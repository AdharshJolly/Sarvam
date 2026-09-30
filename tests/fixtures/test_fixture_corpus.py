"""T08: the fixture corpus is itself tested, so the intelligence tests stand on known ground."""

from __future__ import annotations

import re

import pytest

from backend.gateway.llm import render_payload
from backend.intel.freshness import freshness_bucket
from backend.pipeline.claims import quote_in_passage, validate_draft
from backend.store import repo
from contracts.llm import ClaimDraft
from tests.support.corpus import (
    CORPUS_DIR,
    RUN_ID,
    as_of,
    build_corpus,
    expected,
    manifest,
)

FIXTURE_IDS = [f"F{i:02d}" for i in range(1, 15)]


@pytest.fixture(scope="module")
def corpus(tmp_path_factory):
    return build_corpus(tmp_path_factory.mktemp("corpus"), verdicts=False)


def test_corpus_has_the_fourteen_documents_of_ssot_16_2():
    assert sorted(manifest()["documents"]) == FIXTURE_IDS
    for fid in FIXTURE_IDS:
        assert (CORPUS_DIR / f"{fid}.html").is_file()
    assert sorted(expected("sources")["sources"]) == FIXTURE_IDS


def test_every_document_uses_a_fictional_or_platform_domain():
    for fid, doc in manifest()["documents"].items():
        host = doc["url"].split("/")[2]
        assert host.endswith((".example", ".gov.in", "blogspot.com")), fid


def test_plan_satisfies_fr_02():
    plan = expected("plan")["dimensions"]
    assert len(plan) >= 4
    for dim in plan:
        assert 2 <= len(dim["slots"]) <= 4
        for slot in dim["slots"]:
            assert slot["tasks"], slot["id"]


def test_sources_are_qualified_fetched_and_dated_as_expected(corpus):
    want = expected("sources")["sources"]
    for fid, spec in want.items():
        source = repo.get_source(corpus.conn, corpus.source_ids[fid])
        assert source.source_type.value == spec["source_type"], fid
        assert source.authority_tier == spec["authority_tier"], fid
        assert source.status.value == spec["status"], fid
        assert freshness_bucket(source.published_at, as_of()) == spec["freshness"], fid


def test_f14_403_is_a_typed_failure_with_no_passages(corpus):
    source = repo.get_source(corpus.conn, corpus.source_ids["F14"])
    assert (source.status.value, source.fail_reason) == ("SOURCE_UNAVAILABLE", "http_403")
    assert repo.list_passages(corpus.conn, source.id) == []


def test_passages_reproduce_the_cleaned_text_exactly(corpus):
    for fid, sid in corpus.source_ids.items():
        if fid == "F14":
            continue
        text = (corpus.settings.artifact_dir / RUN_ID / f"{sid}.txt").read_text(encoding="utf-8")
        passages = repo.list_passages(corpus.conn, sid)
        assert passages, fid
        for p in passages:
            assert text[p.char_start : p.char_end] == p.text


def test_seeded_claims_are_valid_extractor_output_with_proven_quotes(tmp_path):
    full = build_corpus(tmp_path, verdicts=False)
    specs = expected("claims")["claims"]
    assert len(full.claim_ids) == len(specs) == 16
    slots = {s.id: s for s in repo.list_slots(full.conn, RUN_ID)}
    for spec in specs:
        claim = repo.get_claim(full.conn, full.claim_ids[spec["key"]])
        passage = repo.get_passage(full.conn, claim.passage_id)
        assert quote_in_passage(claim.quote, passage.text).ok
        draft = ClaimDraft(
            slot_id=spec["slot"],
            text=spec["text"],
            entity=spec.get("entity"),
            attribute=spec.get("attribute"),
            value=spec.get("value"),
            unit=spec.get("unit"),
            period=spec.get("period"),
            passage_id=claim.passage_id,
            quote=spec["quote"],
        )
        assert validate_draft(draft, slots[spec["slot"]], {passage.id: passage}, 0.95) is None


def test_a_planted_altered_digit_quote_is_rejected_by_the_quote_guard(corpus):
    passage = repo.list_passages(corpus.conn, corpus.source_ids["F02"])[0]
    good = "Monthly plans start at Rs. 1,299 for a basic scooter with a standard battery"
    assert quote_in_passage(good, passage.text).ok
    assert not quote_in_passage(good.replace("1,299", "1,399"), passage.text).ok


def _shingles(text: str, n: int = 5) -> set[str]:
    words = re.findall(r"[a-z0-9]+", text.lower())
    return {" ".join(words[i : i + n]) for i in range(len(words) - n + 1)}


def _jaccard(corpus, a: str, b: str) -> float:
    def text(fid: str) -> str:
        return " ".join(p.text for p in repo.list_passages(corpus.conn, corpus.source_ids[fid]))

    sa, sb = _shingles(text(a)), _shingles(text(b))
    return len(sa & sb) / len(sa | sb)


def test_press_release_outlets_are_near_duplicates_and_the_rest_are_not(corpus):
    for a, b in (("F02", "F03"), ("F02", "F04"), ("F03", "F04")):
        assert _jaccard(corpus, a, b) >= 0.60, (a, b)
    # F05 is a rewrite, F06-F08 are independent writing: all stay below the S2 threshold.
    for other in ("F02", "F03", "F04"):
        assert _jaccard(corpus, "F05", other) < 0.60
    for fid in ("F05", "F06", "F07", "F08"):
        assert _jaccard(corpus, fid, "F02") < 0.60


def test_f12_injection_text_is_data_inside_an_escaped_source_block(corpus):
    marker = "ignore previous instructions"
    hits = [
        fid
        for fid in FIXTURE_IDS
        if (CORPUS_DIR / f"{fid}.html").read_text(encoding="utf-8").lower().count(marker)
    ]
    assert hits == ["F12"]
    passage = repo.list_passages(corpus.conn, corpus.source_ids["F12"])[0]
    rendered = render_payload({"untrusted": [{"id": passage.id, "text": passage.text}]})
    assert rendered.startswith("{}") and f'<source id="{passage.id}" untrusted="true">' in rendered
    assert marker in rendered.lower()  # present, but only inside the untrusted block
    assert rendered.index("<source") < rendered.lower().index(marker)


def test_freshness_buckets():
    from datetime import UTC, datetime

    now = datetime(2026, 9, 30, tzinfo=UTC)
    assert freshness_bucket(None, now) == "unknown"
    assert freshness_bucket(datetime(2026, 1, 1, tzinfo=UTC), now) == "under_12_months"
    assert freshness_bucket(datetime(2024, 6, 1, tzinfo=UTC), now) == "12_to_36_months"
    assert freshness_bucket(datetime(2019, 6, 10, tzinfo=UTC), now) == "over_36_months"
