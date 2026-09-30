"""Acquire: fetch, clean and store pages (SSOT FR-06, section 18, task T05).

One bad source never aborts the run: every failure becomes a typed `source.failed` event and a
stored status (SOURCE_UNAVAILABLE or SOURCE_EMPTY). Timeouts are retried once, nothing else.
"""

from __future__ import annotations

import asyncio
import hashlib
import sqlite3

from backend.gateway import BudgetExceeded, GatewayError
from backend.gateway.core import GatewayResult, ToolGateway
from backend.gateway.fetch import FetchResult
from backend.pipeline.extract import clean_html
from backend.store import repo
from backend.store.emit import Emitter
from contracts.config import Settings
from contracts.events import (
    EventType,
    PhaseEnteredPayload,
    SourceFailedPayload,
    SourceFetchedPayload,
)
from contracts.models import FailureType, Phase, Source, SourceStatus

PROVIDER_TEXT_MIN_WORDS = 100  # SSOT section 18: usable provider-supplied cleaned text


def _provider_text(settings: Settings, run_id: str, source: Source) -> str | None:
    path = settings.artifact_dir / run_id / f"{source.id}.provider.txt"
    if not path.exists():
        return None
    text = path.read_text(encoding="utf-8").replace("\r\n", "\n").strip()
    text = text[: settings.thresholds.source_char_cap]
    return text if len(text.split()) >= PROVIDER_TEXT_MIN_WORDS else None


async def _fetch_with_one_timeout_retry(
    gateway: ToolGateway, url: str
) -> GatewayResult[FetchResult]:
    try:
        return await gateway.fetch(url)
    except BudgetExceeded:
        raise
    except GatewayError as exc:
        if exc.message == "timeout":
            return await gateway.fetch(url)  # the single permitted retry
        raise


async def run_acquire(
    gateway: ToolGateway,
    conn: sqlite3.Connection,
    em: Emitter,
    settings: Settings,
    run_id: str,
    *,
    round: int = 0,
    reason: str = "Fetching the discovered pages and extracting their text.",
) -> int:
    """ACQUIRE phase for sources still in `found`. Returns the number of sources fetched.

    BudgetExceeded is re-raised after the in-flight fetches finish and are persisted.
    """
    em.emit(
        EventType.PHASE_ENTERED,
        PhaseEnteredPayload(phase=Phase.ACQUIRE, reason=reason),
        round=round,
    )
    budget_error: BudgetExceeded | None = None
    fetched = 0

    def mark_failed(source: Source, failure: FailureType, why: str) -> None:
        status = (
            SourceStatus.SOURCE_EMPTY
            if failure is FailureType.SOURCE_EMPTY
            else SourceStatus.SOURCE_UNAVAILABLE
        )
        repo.update_source(conn, source.id, status=status.value, fail_reason=why)
        stored_failure = (
            FailureType.SOURCE_EMPTY
            if status is SourceStatus.SOURCE_EMPTY
            else FailureType.SOURCE_UNAVAILABLE
        )
        em.emit(
            EventType.SOURCE_FAILED,
            SourceFailedPayload(source_id=source.id, failure=stored_failure, reason=why),
            round=round,
        )

    def store_text(source: Source, text: str, published, note: str | None, metrics) -> None:
        nonlocal fetched
        folder = settings.artifact_dir / run_id
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"{source.id}.txt").write_text(text, encoding="utf-8", newline="\n")
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        repo.update_source(
            conn,
            source.id,
            status=SourceStatus.FETCHED.value,
            content_hash=digest,
            retrieved_at=repo.now_iso(),
            published_at=published.isoformat() if published else None,
            fail_reason=note,
        )
        em.emit(
            EventType.SOURCE_FETCHED,
            SourceFetchedPayload(source_id=source.id, chars=len(text), content_hash=digest),
            round=round,
            metrics=metrics,
        )
        fetched += 1

    def use_provider_text(source: Source, metrics) -> bool:
        text = _provider_text(settings, run_id, source)
        if text is None:
            return False
        store_text(source, text, None, "provider_text_fallback", metrics)
        return True

    async def one(source: Source) -> None:
        nonlocal budget_error
        try:
            result = await _fetch_with_one_timeout_retry(gateway, source.url)
        except BudgetExceeded as exc:
            budget_error = budget_error or exc
            return
        except GatewayError as exc:
            if exc.failure is FailureType.SOURCE_EMPTY and use_provider_text(source, None):
                return
            why = exc.message or exc.failure.value
            if exc.failure not in (FailureType.SOURCE_UNAVAILABLE, FailureType.SOURCE_EMPTY):
                why = f"{exc.failure.value}: {why}"
            mark_failed(source, exc.failure, why)
            return
        res, metrics = result.value, result.metrics
        html = res.text()
        folder = settings.artifact_dir / run_id
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"{source.id}.raw.html").write_bytes(res.body)
        text, published = clean_html(html, settings.thresholds.source_char_cap)
        if text:
            store_text(source, text, published, None, metrics)
        elif not use_provider_text(source, metrics):
            mark_failed(source, FailureType.SOURCE_EMPTY, "empty_extraction")

    await asyncio.gather(*(one(s) for s in repo.list_sources(conn, run_id, status="found")))
    if budget_error is not None:
        raise budget_error
    return fetched
