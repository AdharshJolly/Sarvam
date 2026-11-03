"""The question's place (CL-23): read from the scope or the question, never from an LLM."""

from backend.intel.place import place_of
from contracts.models import Scope

Q = "Should a company launch an electric scooter subscription service in Bengaluru in 2027?"


def test_the_place_is_read_from_the_question():
    place = place_of(Q, Scope())
    assert place.names == ("Bengaluru",)
    assert {"bengaluru", "bangalore", "karnataka", "india"} <= place.terms
    assert "2027" not in place.terms


def test_a_place_at_the_start_and_a_two_word_place_are_found():
    assert place_of("In Tamil Nadu, is demand rising?", Scope()).names == ("Tamil", "Nadu")


def test_the_scope_geography_wins_over_the_question():
    assert place_of(Q, Scope(geography="Pune")).names == ("Pune",)


def test_a_question_without_a_place_has_none():
    place = place_of("Is a scooter subscription profitable?", Scope())
    assert not place
    assert not place.is_local("https://x.in/a", "Bengaluru")


def test_a_hit_is_local_when_it_names_the_place_or_its_region():
    place = place_of(Q, Scope())
    assert place.is_local("https://a.example/x", "Scooter rentals in Bangalore")
    assert place.is_local("https://a.example/x", "Karnataka EV policy 2025")
    assert place.is_local("https://news.example.in/x", "scooter market")  # Indian host
    assert not place.is_local("https://a.example/us-scooters", "Scooter rentals in Austin")
