"""Record/replay boundary (SSOT FR-26, ADR-108).

RECORD stores the raw provider response (search, fetch and every individual LLM attempt) under
record_dir. REPLAY serves them deterministically with no network and no API keys; a miss is a typed
BLOCKED error. A replayed run is always labelled REPLAY and never presented as live.

Files are flat and content-addressed: <record_dir>/<kind>-<key[:16]>.json.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Awaitable, Callable
from enum import StrEnum
from pathlib import Path
from typing import Any

from backend.gateway import GatewayError
from contracts.models import FailureType


class RecordMode(StrEnum):
    OFF = "off"
    RECORD = "record"
    REPLAY = "replay"


def cache_key(key_material: dict[str, Any]) -> str:
    canonical = json.dumps(key_material, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class RecordReplay:
    def __init__(self, record_dir: str | Path, mode: RecordMode) -> None:
        self.record_dir = Path(record_dir)
        self.mode = mode

    def _path(self, kind: str, key: str) -> Path:
        return self.record_dir / f"{kind}-{key[:16]}.json"

    async def call(
        self,
        kind: str,
        key_material: dict[str, Any],
        live: Callable[[], Awaitable[dict[str, Any]]],
    ) -> dict[str, Any]:
        """Return the JSON-serialisable response for one provider call (live, recorded or replayed).

        Typed GatewayErrors are recorded and replayed too, so failure paths reproduce.
        """
        if self.mode is RecordMode.OFF:
            return await live()
        key = cache_key(key_material)
        path = self._path(kind, key)
        if self.mode is RecordMode.REPLAY:
            if not path.exists():
                raise GatewayError(FailureType.BLOCKED, f"replay miss: {kind}-{key[:16]}")
            saved = json.loads(path.read_text(encoding="utf-8"))
            if "error" in saved:
                err = saved["error"]
                raise GatewayError(FailureType(err["failure"]), err["message"])
            return saved["response"]
        try:
            response = await live()
        except GatewayError as exc:
            self._write(path, {"key": key_material, "error": _error(exc)})
            raise
        self._write(path, {"key": key_material, "response": response})
        return response

    def _write(self, path: Path, data: dict[str, Any]) -> None:
        self.record_dir.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2, sort_keys=True, default=str), encoding="utf-8")


def _error(exc: GatewayError) -> dict[str, str]:
    return {"failure": exc.failure.value, "message": exc.message}
