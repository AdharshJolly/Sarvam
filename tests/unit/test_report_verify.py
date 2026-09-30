"""T15: report verifier and certainty labels (SSOT 9.11, FR-19, FR-20)."""

from __future__ import annotations

from backend.synth.report_verify import (
    allowed_numbers,
    normalise_number,
    numbers_in,
    verify_report,
)
from contracts.llm import ReportDraft, ReportFindingDraft, ReportSectionDraft
from contracts.models import (
    CertaintyLabel,
    Claim,
    ClaimStatus,
    CoverageState,
    Dimension,
    Run,
    Scope,
)

G, A = CoverageState.GREEN, CoverageState.AMBER


def claim(cid, text, *, slot="S1", status=ClaimStatus.SUPPORTED, value=None, quote=None):
    return Claim(
        id=cid,
        run_id="R1",
        slot_id=slot,
        text=text,
        quote=quote or text,
        passage_id="P1",
        quote_verified=True,
        status=status,
        value_num=value,
    )


DIMS = [Dimension(id="D1", run_id="R1", name="Pricing")]
CLAIMS = [
    claim("C1", "The basic plan costs Rs 1,299 per month", value=1299.0),
    claim("C2", "The permit fee is Rs 5,000 per operator", slot="S2"),
    claim("C3", "The premium plan costs Rs 2,070", slot="S3", status=ClaimStatus.CONTESTED),
]
STATE = {"S1": G, "S2": A, "S3": G}


def draft(*findings, summary="The evidence is thin."):
    return ReportDraft(
        decision_summary=summary,
        sections=[
            ReportSectionDraft(dimension_id="D1", heading="Pricing", findings=list(findings))
        ],
    )


def finding(text, *ids):
    return ReportFindingDraft(text=text, claim_ids=list(ids))


def verify(d, allowed=None):
    return verify_report(d, CLAIMS, DIMS, STATE, allowed or set())


# ---------------------------------------------------------------- number handling


def test_numbers_are_normalised_across_formats():
    assert normalise_number("1,299") == "1299" and normalise_number("12.50") == "12.5"
    assert normalise_number("3.0") == "3" and normalise_number("2070.0") == "2070"
    assert numbers_in("From Rs. 1,299, up to 2,070.5 or 12%.") == {"1299", "2070.5", "12"}
    assert numbers_in("no digits here") == set()


# ---------------------------------------------------------------- the planted draft


def test_an_unsupported_sentence_and_an_altered_number_are_both_caught():
    report = verify(
        draft(
            finding("Plans start at Rs 1,299 per month.", "C1"),  # fine
            finding("Plans start at Rs 1,399 per month.", "C1"),  # one altered digit
            finding(
                "Everyone loves the plan.",
            ),  # no claim id
            finding("The fee is Rs 5,000.", "C99"),  # invented claim id
        )
    )
    (section,) = report.sections
    assert [f.text for f in section.findings] == ["Plans start at Rs 1,299 per month."]
    assert set(report.dropped) == {
        "Plans start at Rs 1,399 per month.",
        "Everyone loves the plan.",
        "The fee is Rs 5,000.",
    }


def test_a_number_may_come_from_any_of_the_cited_claims():
    report = verify(
        draft(finding("Rs 1,299 for the plan and Rs 5,000 for the permit.", "C1", "C2"))
    )
    assert report.sections and not report.dropped
    report = verify(draft(finding("Rs 1,299 for the plan and Rs 5,000 for the permit.", "C1")))
    assert not report.sections and len(report.dropped) == 1  # 5,000 is in C2, which is not cited


def test_numbers_the_reader_wrote_need_no_source():
    run = Run(
        id="R1",
        question="Should we launch in 2027?",
        scope=Scope(geography="Bengaluru"),
        mode="LIVE",
        budget={},
        started_at="2026-01-01T00:00:00+00:00",
    )
    allowed = allowed_numbers(run)
    assert allowed == {"2027"}
    assert not verify(draft(finding("Pricing for 2027 starts at Rs 1,299.", "C1")), allowed).dropped
    assert verify(draft(finding("Pricing for 2028 starts at Rs 1,299.", "C1")), allowed).dropped


def test_an_unknown_dimension_drops_the_finding():
    d = ReportDraft(
        decision_summary="x",
        sections=[
            ReportSectionDraft(
                dimension_id="D9", heading="?", findings=[finding("Fee Rs 5,000.", "C2")]
            )
        ],
    )
    report = verify(d)
    assert report.sections == [] and report.dropped == ["Fee Rs 5,000."]


def test_summary_sentences_with_an_unknown_number_are_removed():
    report = verify(
        draft(summary="Plans start at Rs 1,299. The market is worth 900 crore. Data is thin.")
    )
    assert report.decision_summary == "Plans start at Rs 1,299. Data is thin."
    assert report.dropped == ["The market is worth 900 crore."]


# ---------------------------------------------------------------- certainty labels


def test_certainty_labels_follow_the_claims_and_the_slot_state():
    report = verify(
        draft(
            finding("Plans start at Rs 1,299 per month.", "C1"),  # GREEN slot
            finding("The permit fee is Rs 5,000.", "C2"),  # AMBER slot
            finding("The premium plan costs Rs 2,070.", "C3"),  # contested claim
            finding("Rs 1,299 against Rs 5,000.", "C1", "C2"),  # mixed: not all GREEN
            finding("Rs 1,299 against Rs 2,070.", "C1", "C3"),  # any contested wins
        )
    )
    labels = [f.certainty for f in report.sections[0].findings]
    assert labels == [
        CertaintyLabel.SUPPORTED,
        CertaintyLabel.SINGLE_ORIGIN,
        CertaintyLabel.CONTESTED,
        CertaintyLabel.SINGLE_ORIGIN,
        CertaintyLabel.CONTESTED,
    ]


def test_a_finding_with_no_coverage_information_is_not_called_supported():
    report = verify_report(
        draft(finding("Plans start at Rs 1,299.", "C1")), CLAIMS, DIMS, {}, set()
    )
    assert report.sections[0].findings[0].certainty is CertaintyLabel.SINGLE_ORIGIN
