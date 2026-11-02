import asyncio
import time
from datetime import UTC, datetime

import pytest

from backend.pipeline.pdftext import UnreadablePdf, clean_pdf, clean_pdf_isolated, reflow
from tests.support.pdf import crashing_worker, hanging_worker, make_pdf

CAP = 60_000


def test_text_from_every_page_in_order():
    pdf = make_pdf([["First page sentence."], ["Second page sentence."]])
    text, _ = clean_pdf(pdf, CAP)
    assert text.index("First page sentence.") < text.index("Second page sentence.")


def test_wrapped_lines_are_joined_into_one_sentence():
    pdf = make_pdf([["Electric scooter sales in India rose to", "1.2 million units in FY2024."]])
    text, _ = clean_pdf(pdf, CAP)
    assert "Electric scooter sales in India rose to 1.2 million units in FY2024." in text.split(
        "\n"
    )


def test_headings_and_finished_sentences_stay_on_their_own_lines():
    lines = reflow("Market overview\nSales rose sharply.\nPrices fell.\nwhile demand held.").split(
        "\n"
    )
    assert lines == ["Market overview", "Sales rose sharply.", "Prices fell. while demand held."]


def test_a_line_ending_in_a_function_word_continues_even_before_a_capital():
    assert (
        reflow("development of charging in the\nState.") == "development of charging in the State."
    )


def test_a_quoted_name_after_an_unfinished_line_continues_it():
    assert reflow("an app named\n“BESCOM EV Mitra.”") == "an app named “BESCOM EV Mitra.”"


def test_private_use_glyphs_are_dropped():
    assert reflow(" Government will provide land.") == "Government will provide land."


def test_page_headers_and_footers_repeated_on_most_pages_are_removed():
    body = ["Opening sentence here.", "Middle sentence 7 repeats.", "Closing sentence here."]
    pages = [["Clean Mobility Policy 2025-2030", *body, f"{i} | P a g e"] for i in range(1, 6)]
    text, _ = clean_pdf(make_pdf(pages), CAP)
    assert "Clean Mobility Policy" not in text and "P a g e" not in text
    assert text.count("Middle sentence 7 repeats.") == 5  # a body line, even if on every page


def test_a_line_on_only_a_few_pages_is_kept():
    pages = [["Repeated twice."], ["Repeated twice."], ["Other."], ["Other two."], ["Other three."]]
    text, _ = clean_pdf(make_pdf(pages), CAP)
    assert text.count("Repeated twice.") == 2


def test_hyphenated_line_breaks_are_rejoined():
    assert reflow("charging infra-\nstructure is growing.") == "charging infrastructure is growing."


def test_runs_of_spaces_collapse_and_blank_lines_go():
    assert reflow("a  b   c\n\n\nNext line.") == "a b c\nNext line."


def test_text_is_capped():
    pdf = make_pdf([[f"Sentence number {i} is here." for i in range(40)]])
    text, _ = clean_pdf(pdf, 200)
    assert len(text) <= 200


def test_creation_date_becomes_published_date():
    _, published = clean_pdf(make_pdf([["Text."]], creation_date="D:20250314000000Z"), CAP)
    assert published == datetime(2025, 3, 14, tzinfo=UTC)
    _, none = clean_pdf(make_pdf([["Text."]]), CAP)
    assert none is None


def test_a_pdf_without_text_gives_empty_text():
    text, _ = clean_pdf(make_pdf([[]]), CAP)
    assert text == ""


def test_bytes_that_are_not_a_pdf_are_unreadable():
    with pytest.raises(UnreadablePdf):
        clean_pdf(b"<html>not a pdf</html>", CAP)


# ---------------------------------------------------------------- isolation (untrusted input)


def test_isolated_extraction_gives_the_same_result_as_in_process():
    pdf = make_pdf([["Electric scooter sales rose to", "1.2 million units."]], "D:20250314000000Z")
    assert asyncio.run(clean_pdf_isolated(pdf, CAP)) == clean_pdf(pdf, CAP)


def test_isolated_extraction_reports_unreadable_bytes():
    with pytest.raises(UnreadablePdf):
        asyncio.run(clean_pdf_isolated(b"not a pdf", CAP))


def test_a_pdf_that_parses_forever_is_killed_and_unreadable():
    start = time.monotonic()
    with pytest.raises(UnreadablePdf, match="timeout"):
        asyncio.run(clean_pdf_isolated(b"%PDF", CAP, timeout=1.0, target=hanging_worker))
    assert time.monotonic() - start < 15


def test_a_worker_that_dies_without_answering_is_unreadable():
    with pytest.raises(UnreadablePdf, match="worker"):
        asyncio.run(clean_pdf_isolated(b"%PDF", CAP, target=crashing_worker))
