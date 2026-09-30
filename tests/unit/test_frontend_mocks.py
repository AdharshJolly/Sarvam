"""Drift guard: the frontend mock scenarios must be valid against the backend event contracts."""

import json
from pathlib import Path

import pytest

from contracts.events import EVENT_PAYLOADS, Event, EventType

DATA = Path(__file__).resolve().parents[2] / "frontend" / "src" / "mocks" / "data"
FILES = sorted(DATA.glob("*.json"))


def test_mock_data_exists() -> None:
    assert len(FILES) == 5, "run `bun run --cwd frontend gen:mocks` and commit the JSON"


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_scenario_events_match_contracts(path: Path) -> None:
    events = json.loads(path.read_text(encoding="utf-8"))
    assert events, "scenario has no events"
    for i, raw in enumerate(events, start=1):
        event = Event.model_validate(raw)
        assert event.id == i
        EVENT_PAYLOADS[EventType(event.type)].model_validate(event.payload)
