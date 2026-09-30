"""Audit sampler (SSOT 16.3): 20 findings sentences, stratified across dimensions, reproducible."""

from scripts.sampler import findings_by_dimension, stratified_sample

REPORT = """# Q

## Findings by dimension

### Demand
- Demand is growing quickly in the city across segments. [C1] {{certainty:supported}}
- Riders travel twenty kilometres a day on average. [C2] [C3] {{certainty:supported}}
- Weekend demand is higher than weekday demand overall. [C4] {{certainty:partial}}

### Competition
- Yulu operates a large fleet across the city today. [C5] {{certainty:single-origin}}

### Regulation
- A commercial permit is required to operate rentals. [C6] {{certainty:supported}}
- No bullet here has a citation so it is skipped entirely.

## Conflicts and unresolved items
- Not a finding: [C9] {{certainty:supported}}
"""


def test_findings_are_grouped_by_dimension_and_uncited_lines_are_skipped():
    groups = findings_by_dimension(REPORT)
    assert list(groups) == ["Demand", "Competition", "Regulation"]
    assert [len(v) for v in groups.values()] == [3, 1, 1]
    assert all("{{" not in s and "[C" in s for v in groups.values() for s in v)


def test_sample_covers_every_dimension_before_repeating_one():
    rows = stratified_sample(findings_by_dimension(REPORT), 3, seed=1)
    assert sorted(d for d, _ in rows) == ["Competition", "Demand", "Regulation"]


def test_sample_is_seeded_capped_and_never_repeats_a_sentence():
    groups = findings_by_dimension(REPORT)
    a = stratified_sample(groups, 20, seed=7)
    assert a == stratified_sample(groups, 20, seed=7)
    assert len(a) == 5 and len({s for _, s in a}) == 5


def test_evidence_pack_lists_the_quote_and_source_of_every_cited_claim():
    from scripts.sampler import evidence_pack

    claims = {"C1": ("the quote one", "https://a.example/1", "supported")}
    sample = [("Demand", "Demand is growing quickly. [C1] [C2]")]
    text = evidence_pack(sample, claims)
    assert "the quote one" in text and "https://a.example/1" in text
    assert "C2" in text and "not found" in text  # a cited id missing from the run is flagged
