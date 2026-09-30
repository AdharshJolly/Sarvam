"""Plain-language glossary (B-38): complete, pinned headline labels, rendered into the report."""

import pytest

from contracts import glossary
from contracts.glossary import CHALLENGE_PENDING, GLOSSARY, READING_GUIDE, TABLE_ENUMS


@pytest.mark.parametrize("table", sorted(TABLE_ENUMS))
def test_every_enum_value_has_a_complete_entry(table):
    expected = {m.value for m in TABLE_ENUMS[table]}
    if table == "challenge_outcome":
        expected.add(CHALLENGE_PENDING)
    assert set(GLOSSARY[table]) == expected  # a new enum value without wording fails the build
    for key, e in GLOSSARY[table].items():
        assert e.label.strip() and e.meaning.strip(), f"{table}.{key}"


def test_every_table_is_covered_by_an_enum():
    assert set(GLOSSARY) == set(TABLE_ENUMS)


def test_headline_labels_are_the_owner_approved_wording():
    final = {k: v.label for k, v in GLOSSARY["final_state"].items()}
    assert final == {
        "SUFFICIENT": "Answer is solid",
        "SUFFICIENT_WITH_CAVEATS": "Answer is solid, with caveats",
        "INSUFFICIENT": "Not enough to answer yet",
    }
    cov = {k: v.label for k, v in GLOSSARY["coverage_state"].items()}
    assert cov == {
        "GREEN": "Well supported",
        "AMBER": "Partly supported",
        "RED": "Not enough evidence",
    }


def test_reading_guide_has_no_citation_marker():
    # A bracketed id would be mistaken for a real citation by the citation checker.
    assert READING_GUIDE and all("[C" not in line for line in READING_GUIDE)


def test_generated_typescript_is_current():
    from contracts.schema_export import GLOSSARY_PATH

    assert GLOSSARY_PATH.read_text(encoding="utf-8") == glossary.glossary_ts()


def test_lookup_of_an_unknown_value_is_loud():
    with pytest.raises(KeyError):
        glossary.entry("final_state", "MAYBE")


def test_gap_text_matches_the_shared_cases_and_always_has_a_next_step():
    for c in glossary.GAP_CASES:
        g = glossary.gap_text(c["state"], c["origins"], c["claims"], c["conflicts"])
        assert g.reason == c["reason"]
        assert g.next_step.strip(), c  # every non-green gap tells the reader what to do


def test_gap_text_is_loud_on_an_unknown_state():
    with pytest.raises(KeyError):
        glossary.gap_text("PURPLE", 0, 0, 0)
