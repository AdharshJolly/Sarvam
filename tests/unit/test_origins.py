"""T10: origin clustering signals S0-S4, one at a time (SSOT 9.6)."""

from __future__ import annotations

import random

from backend.intel.analyze import assign_origin_ids
from backend.intel.origins import (
    ClaimFact,
    OriginInput,
    OriginResult,
    attributions,
    cluster_origins,
    distinctive_grams,
    jaccard,
    registrable_domain,
    shingles,
)
from contracts.config import Thresholds
from contracts.models import Origin, OriginMethod

FILLER = (
    "the quarterly report describes battery swapping at compact urban depots where riders "
    "exchange depleted packs for charged ones within minutes and operators track every pack "
    "with telemetry so that degraded cells are retired before they fail in service"
)


def src(n, domain, text="", *, full=None, claims=(), stype="news", tier=2, publisher=None):
    return OriginInput(
        source_id=f"S{n}",
        domain=domain,
        publisher=publisher,
        source_type=stype,
        authority_tier=tier,
        claim_text=text,
        full_text=full if full is not None else text,
        claims=tuple(claims),
    )


def groups(result):
    return sorted(tuple(o.source_ids) for o in result.origins)


def price(value=1299, *, entity="VoltRide basic plan", period="month"):
    return ClaimFact(entity, "monthly_price_inr", period, value)


# ---------------------------------------------------------------- S1 domain


def test_registrable_domain_handles_subdomains_ports_and_multi_part_suffixes():
    assert registrable_domain("www.example.com") == "example.com"
    assert registrable_domain("news.example.com:8080") == "example.com"
    assert registrable_domain("a.b.example.co.in") == "example.co.in"
    assert registrable_domain("transport.karnataka.gov.in") == "karnataka.gov.in"
    assert registrable_domain("example.org") == "example.org"


def test_s1_same_registrable_domain_is_one_origin():
    r = cluster_origins([src(1, "news.example.co.in"), src(2, "www.example.co.in", "other")])
    assert groups(r) == [("S1", "S2")]
    assert r.origins[0].method is OriginMethod.DOMAIN


def test_s1_different_domains_with_the_same_words_are_not_merged_by_domain():
    r = cluster_origins([src(1, "example.co.in"), src(2, "example.org", "other words")])
    assert groups(r) == [("S1",), ("S2",)]


def test_s1_syndication_network_members_share_an_origin():
    r = cluster_origins([src(1, "livemint.com", "a"), src(2, "hindustantimes.com", "b")])
    assert groups(r) == [("S1", "S2")] and r.origins[0].method is OriginMethod.DOMAIN


# ---------------------------------------------------------------- S2 near duplicate


def test_s2_near_duplicate_text_joins_and_different_text_does_not():
    a = src(1, "a.example", FILLER + " Alpha desk.")
    b = src(2, "b.example", FILLER + " Beta desk.")
    c = src(
        3,
        "c.example",
        "completely different writing about fuel prices and parking rules "
        "in the suburbs of another city with nothing in common at all",
    )
    r = cluster_origins([a, b, c])
    assert groups(r) == [("S1", "S2"), ("S3",)]
    assert r.origins[0].method is OriginMethod.NEAR_DUPLICATE


def test_s2_uses_the_configured_threshold_inclusively():
    a, b = (
        src(1, "a.example", FILLER + " one two three"),
        src(2, "b.example", FILLER + " four five six"),
    )
    j = jaccard(shingles(a.claim_text, 5), shingles(b.claim_text, 5))
    assert 0.6 < j < 1.0
    assert groups(cluster_origins([a, b], Thresholds(near_duplicate_jaccard=j))) == [("S1", "S2")]
    above = Thresholds(near_duplicate_jaccard=min(1.0, j + 0.01))
    assert groups(cluster_origins([a, b], above)) == [("S1",), ("S2",)]


# ---------------------------------------------------------------- S3 shared number and phrase

SHARED = "the plan bundles insurance free servicing and swappable battery"


def test_s3_same_value_same_key_and_a_shared_phrase_merge():
    a = src(1, "a.example", "Launch notes. " + SHARED + " for riders.", claims=[price()])
    b = src(2, "b.example", "Different intro entirely. " + SHARED + " today.", claims=[price()])
    r = cluster_origins([a, b])
    assert groups(r) == [("S1", "S2")] and r.origins[0].method is OriginMethod.SHARED_NUMBER


def test_s3_entity_subset_counts_as_the_same_key():
    a = src(1, "a.example", SHARED + " a", claims=[price(entity="VoltRide basic plan")])
    b = src(2, "b.example", SHARED + " b", claims=[price(entity="basic plan")])
    assert groups(cluster_origins([a, b])) == [("S1", "S2")]


def test_s3_needs_the_phrase_the_value_and_the_same_key():
    text_a, text_b = "intro one " + SHARED, "intro two " + SHARED
    same_value_no_phrase = cluster_origins(
        [
            src(1, "a.example", "first writer words alone here", claims=[price()]),
            src(2, "b.example", "second author different sentence", claims=[price()]),
        ]
    )
    phrase_other_value = cluster_origins(
        [
            src(1, "a.example", text_a, claims=[price(1299)]),
            src(2, "b.example", text_b, claims=[price(1599)]),
        ]
    )
    phrase_other_period = cluster_origins(
        [
            src(1, "a.example", text_a, claims=[price(period="month")]),
            src(2, "b.example", text_b, claims=[price(period="day")]),
        ]
    )
    phrase_other_entity = cluster_origins(
        [
            src(1, "a.example", text_a, claims=[price(entity="VoltRide basic plan")]),
            src(2, "b.example", text_b, claims=[price(entity="Zipwheel day pass")]),
        ]
    )
    for r in (same_value_no_phrase, phrase_other_value, phrase_other_period, phrase_other_entity):
        assert groups(r) == [("S1",), ("S2",)]


def test_distinctive_grams_ignore_filler_only_sequences():
    assert distinctive_grams("and the of the to a in on at be it", 6) == set()
    assert distinctive_grams("battery swapping stations open near metro stops", 6)


# ---------------------------------------------------------------- S4 attribution


def test_attribution_patterns_extract_capitalised_entities_only():
    assert attributions("According to Reuters, prices rose.") == ["Reuters"]
    assert attributions("as per VoltRide Mobility's own release, the price is X") == [
        "VoltRide Mobility"
    ]
    assert attributions("Source: VoltRide Mobility") == ["VoltRide Mobility"]
    assert attributions("Data from the Transport Department shows growth.") == [
        "Transport Department"
    ]
    assert attributions("according to analysts, prices rose; according to the company") == []
    assert attributions("According to a VoltRide Press Release the fee is low") == ["VoltRide"]


def test_a_possessive_entity_is_an_attribution_only_before_a_source_noun():
    # seen on real pages: "according to India's EV policy" names a thing, not a publisher
    assert attributions("According to India's EV policy, subsidies end in 2027.") == []
    assert attributions("according to Bengaluru's transport plan the rules change") == []
    assert attributions("according to Acme's latest report, sales rose") == ["Acme"]
    assert attributions("as per Acme Mobility's own release, the price is X") == ["Acme Mobility"]


def test_s4_joins_the_origin_of_a_retrieved_publisher_it_names():
    reuters = src(1, "www.reuters.com", "Wire story about scooter demand in the city")
    blog = src(2, "someblog.example", "as written", full="According to Reuters, demand is rising.")
    r = cluster_origins([reuters, blog])
    assert groups(r) == [("S1", "S2")] and r.origins[0].method is OriginMethod.ATTRIBUTION


def test_s4_unretrieved_primary_gets_its_own_origin_shared_by_everyone_citing_it():
    a = src(1, "a.example", "alpha words", full="alpha words. Source: Acme Mobility")
    b = src(2, "b.example", "beta words", full="beta text as per Acme Mobility's filing")
    c = src(3, "c.example", "gamma words")
    r = cluster_origins([a, b, c])
    assert groups(r) == [("S1", "S2"), ("S3",)]
    origin = r.origins[0]
    assert origin.label == "Acme Mobility" and origin.entity == "Acme Mobility"
    assert origin.method is OriginMethod.ATTRIBUTION


def test_s4_a_source_naming_its_own_site_is_not_merged_with_itself_or_others():
    a = src(1, "acme.example", "alpha", full="Source: Acme")
    b = src(2, "other.example", "beta")
    r = cluster_origins([a, b])
    assert groups(r) == [("S1",), ("S2",)]
    assert r.origins[0].entity == "Acme" and r.origins[1].entity is None


# ---------------------------------------------------------------- S0 and labels


def test_s0_a_source_with_no_signal_is_its_own_origin_with_method_none():
    r = cluster_origins([src(1, "a.example", "one thing"), src(2, "b.example", "another thing")])
    assert [o.method for o in r.origins] == [OriginMethod.NONE, OriginMethod.NONE]
    assert [o.label for o in r.origins] == ["a.example", "b.example"]


def test_label_is_the_most_primary_member():
    blog = src(1, "news.example.com", "x", stype="blog", tier=3)
    gov = src(
        2, "www.example.com", "y", stype="regulator", tier=1, publisher="example.com regulator"
    )
    r = cluster_origins([blog, gov])
    assert groups(r) == [("S1", "S2")] and r.origins[0].label == "example.com regulator"


def test_clustering_is_deterministic_for_any_input_order():
    items = [
        src(1, "a.example", FILLER + " x"),
        src(2, "b.example", FILLER + " y"),
        src(3, "c.example", "unrelated text about something else entirely here today"),
        src(4, "d.example", "m", full="Source: Acme Mobility"),
        src(5, "e.example", "n", full="According to Acme Mobility"),
    ]
    expected = cluster_origins(items)
    for seed in range(5):
        shuffled = items[:]
        random.Random(seed).shuffle(shuffled)
        got = cluster_origins(shuffled)
        assert [(o.label, o.method, o.source_ids) for o in got.origins] == [
            (o.label, o.method, o.source_ids) for o in expected.origins
        ]


# ---------------------------------------------------------------- stable ids


def _origin(oid, members):
    return Origin(id=oid, run_id="R1", label=oid, member_source_ids=members)


def test_origin_ids_are_stable_when_clusters_merge_or_grow():
    previous = [_origin("O1", ["S1"]), _origin("O2", ["S2"]), _origin("O3", ["S3"])]
    clusters = [
        OriginResult("a", OriginMethod.DOMAIN, ["S1", "S3"]),  # O1 and O3 merged -> keeps O1
        OriginResult("b", OriginMethod.NONE, ["S2", "S4"]),  # O2 grows -> keeps O2
        OriginResult("c", OriginMethod.NONE, ["S5"]),  # brand new -> O4
    ]
    ids = [o.id for o in assign_origin_ids("R1", previous, clusters)]
    assert ids == ["O1", "O2", "O4"]


def test_origin_ids_start_at_one_and_never_reuse_an_id_in_the_same_pass():
    clusters = [
        OriginResult("a", OriginMethod.NONE, ["S1"]),
        OriginResult("b", OriginMethod.NONE, ["S2"]),
    ]
    assert [o.id for o in assign_origin_ids("R1", [], clusters)] == ["O1", "O2"]
    previous = [_origin("O1", ["S1", "S2"])]
    split = assign_origin_ids("R1", previous, clusters)
    assert [o.id for o in split] == ["O1", "O2"]
