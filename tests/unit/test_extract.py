from pathlib import Path

from backend.pipeline.extract import (
    clean_html,
    has_overlap,
    rank_passages,
    split_passages,
)
from contracts.config import Thresholds
from contracts.models import EvidenceSlot, Passage

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "html"
T = Thresholds()


def words(n: int, tag: str = "w", sentence: int = 20) -> str:
    out = []
    for i in range(n):
        out.append(f"{tag}{i}" + ("." if (i + 1) % sentence == 0 or i == n - 1 else ""))
    return " ".join(out)


def check_invariants(text: str, passages: list[tuple[str, int, int]]) -> None:
    last_end = 0
    for ptext, start, end in passages:
        assert text[start:end] == ptext  # offsets are exact
        assert start >= last_end  # ascending, never overlapping
        assert 0 < len(ptext.split()) <= T.passage_words_max
        last_end = end
    assert " ".join(p[0] for p in passages).split() == text.split()  # no words lost


def test_clean_html_extracts_article_text_and_date():
    html = (FIXTURES / "article.html").read_text(encoding="utf-8")
    text, published = clean_html(html, T.source_char_cap)
    assert "Rs. 1,299" in text and "Copyright Example News" not in text
    assert published is not None and published.date().isoformat() == "2025-03-14"


def test_clean_html_truncates_after_cleaning():
    html = (FIXTURES / "article.html").read_text(encoding="utf-8")
    full, _ = clean_html(html, 10_000)
    capped, _ = clean_html(html, 500)
    assert len(capped) == 500 and full.startswith(capped)
    assert "Copyright" not in capped  # the cap applies to the cleaned text, not the raw page


def test_clean_html_empty_shell_yields_nothing():
    html = (FIXTURES / "empty_shell.html").read_text(encoding="utf-8")
    assert clean_html(html, T.source_char_cap)[0] == ""


def test_fixture_article_splits_into_valid_passages():
    html = (FIXTURES / "article.html").read_text(encoding="utf-8")
    text, _ = clean_html(html, T.source_char_cap)
    passages = split_passages(text, T)
    check_invariants(text, passages)
    assert len(passages) >= 2  # paragraphs of ~100 words merge only while they fit in 200


def test_paragraphs_merge_until_minimum_words():
    text = "\n".join([words(50, "a"), words(50, "b"), words(50, "c"), words(50, "d")])
    passages = split_passages(text, T)
    check_invariants(text, passages)
    assert [len(p[0].split()) for p in passages] == [150, 50] or len(passages) == 1


def test_long_paragraph_is_cut_at_sentence_boundaries():
    text = words(450)
    passages = split_passages(text, T)
    check_invariants(text, passages)
    assert len(passages) >= 3
    assert all(p[0].endswith(".") for p in passages)  # cut on sentence ends


def test_single_endless_sentence_is_hard_split_by_words():
    text = " ".join(f"x{i}" for i in range(500))
    passages = split_passages(text, T)
    check_invariants(text, passages)
    assert [len(p[0].split()) for p in passages][:2] == [200, 200]


def test_trailing_short_chunk_merges_into_previous_when_it_fits():
    text = "\n".join([words(150, "a"), words(50, "b")])
    passages = split_passages(text, T)
    check_invariants(text, passages)
    assert len(passages) == 1 and len(passages[0][0].split()) == 200


def test_trailing_short_chunk_stays_when_merge_would_exceed_max():
    text = "\n".join([words(180, "a"), words(60, "b")])
    passages = split_passages(text, T)
    check_invariants(text, passages)
    assert [len(p[0].split()) for p in passages] == [180, 60]


def test_empty_and_short_text():
    assert split_passages("", T) == []
    assert split_passages("   \n\n  ", T) == []
    short = split_passages(words(30), T)
    assert len(short) == 1 and len(short[0][0].split()) == 30


SLOT = EvidenceSlot(
    id="D2S1",
    run_id="R1",
    dimension_id="D2",
    name="Competitor pricing",
    description="Monthly subscription prices of scooter players",
    attributes=["monthly_price_inr", "deposit_inr"],
)


def passage(i: int, text: str) -> Passage:
    return Passage(id=f"P{i}", source_id="S1", idx=i, text=text, char_start=0, char_end=len(text))


def test_bm25_ranks_the_relevant_passage_first_and_is_deterministic():
    ps = [
        passage(0, "The city council debated parking rules for delivery vans last spring."),
        passage(
            1, "Competitor pricing: the monthly subscription price is Rs 1,299 plus a deposit."
        ),
        passage(2, "Battery swap stations are being installed near metro stations."),
        passage(
            3, "Subscription plans from competitors differ; monthly price depends on the model."
        ),
    ]
    a = rank_passages(SLOT, ps, 6)
    b = rank_passages(SLOT, ps, 6)
    assert [p.id for p in a] == [p.id for p in b]
    assert a[0].id == "P1" and a[1].id == "P3"
    assert len(rank_passages(SLOT, ps, 2)) == 2
    assert rank_passages(SLOT, [], 6) == []


def test_bm25_ties_keep_passage_order():
    ps = [passage(i, "nothing relevant here at all") for i in range(4)]
    assert [p.id for p in rank_passages(SLOT, ps, 6)] == ["P0", "P1", "P2", "P3"]


def test_overlap_detects_relevance_even_when_bm25_scores_zero():
    only = [passage(0, "The monthly subscription price is listed.")]
    assert has_overlap(SLOT, only[0])
    assert not has_overlap(SLOT, passage(1, "Completely unrelated gardening advice."))
