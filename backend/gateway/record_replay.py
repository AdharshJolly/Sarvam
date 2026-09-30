"""Record/replay boundary (SSOT FR-26, ADR-108). Task T02 / M2.

RECORD stores search, fetch and LLM I/O under cache/recorded/. REPLAY serves them deterministically
with no network. A replayed run is always labelled REPLAY and never presented as live.
"""

from __future__ import annotations

from enum import StrEnum


class RecordMode(StrEnum):
    OFF = "off"
    RECORD = "record"
    REPLAY = "replay"
