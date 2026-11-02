"""Acquire: fetch, clean and store pages (FR-06, task T05).

One bad source never aborts the run: every failure becomes a typed `source.failed` event and a
stored status (SOURCE_UNAVAILABLE or SOURCE_EMPTY). Timeouts are retried once, nothing else.
"""

from __future__ import annotations

import asyncio
import hashlib
import math
import sqlite3
from datetime import datetime

from backend.gateway import BudgetExceeded, GatewayError
from backend.gateway.core import GatewayResult, ToolGateway
from backend.gateway.fetch import FetchResult
from backend.pipeline.extract import clean_html
from backend.pipeline.pdftext import UnreadablePdf, clean_pdf_isolated
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

PROVIDER_TEXT_MIN_WORDS = 100  # usable provider-supplied cleaned text
PDF_WORKERS = 2  # PDF parser processes at once


def _provider_text(settings: Settings, run_id: str, source: Source) -> str | None:
    path = settings.artifact_dir / run_id / f"{source.id}.provider.txt"
    if not path.exists():
        return None
    text = path.read_text(encoding="utf-8").replace("\r\n", "\n").strip()
    text = text[: settings.thresholds.source_char_cap]
    return text if len(text.split()) >= PROVIDER_TEXT_MIN_WORDS else None


async def _fetch(gateway: ToolGateway, url: str) -> GatewayResult[FetchResult] | Exception:
    """One fetch; a typed failure is returned (not raised) so the caller decides in source order."""
    try:
        return await gateway.fetch(url)
    except GatewayError as exc:  # includes BudgetExceeded
        return exc


def _round_sources(conn: sqlite3.Connection, run_id: str, round: int) -> list[Source]:
    """`found` sources, in source order, except those of another round's tasks (round-0 pages
    held back for the reserve are not fetched by a later round)."""
    other = {t.id for t in repo.list_tasks(conn, run_id) if t.round != round}
    return [s for s in repo.list_sources(conn, run_id, status="found") if s.task_id not in other]


def _allowance(gateway: ToolGateway, settings: Settings, round: int) -> tuple[int | None, int]:
    """(fetches round 0 may use, fetches held back), or (None, 0) when nothing is held back."""
    budget = gateway.budget
    share = settings.thresholds.followup_fetch_reserve
    if round != 0 or budget.max_followup_rounds == 0 or share <= 0:
        return None, 0
    reserve = math.ceil(budget.max_fetches * share)
    return max(0, budget.max_fetches - reserve - gateway.usage().fetches), reserve


def _pick(sources: list[Source], limit: int) -> list[Source]:
    """At most `limit` sources: pages the user added (no task, CL-20) first, then each task's best
    (discovery stores them best first) in turn, so every slot gets evidence before any slot gets
    its fourth page. Returned in source order."""
    pinned = [s.id for s in sources if s.task_id is None]
    chosen: set[str] = set(pinned[:limit])
    queues: dict[str, list[Source]] = {}
    for s in sources:
        if s.task_id is not None:
            queues.setdefault(s.task_id, []).append(s)
    depth = 0
    while len(chosen) < limit and any(depth < len(q) for q in queues.values()):
        for q in queues.values():
            if depth < len(q) and len(chosen) < limit:
                chosen.add(q[depth].id)
        depth += 1
    return [s for s in sources if s.id in chosen]


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
    """ACQUIRE phase for this round's sources still in `found`. Returns the number fetched.

    Round 0 leaves `followup_fetch_reserve` of the fetch budget for follow-up rounds (CL-19); the
    sources it does not fetch stay `found`. BudgetExceeded is re-raised after the in-flight fetches
    finish and are persisted.
    """
    found = _round_sources(conn, run_id, round)
    allowance, reserve = _allowance(gateway, settings, round)
    sources = found if allowance is None else _pick(found, allowance)
    if reserve:
        reason = (
            f"Fetching {len(sources)} of {len(found)} discovered pages; {reserve} fetches are "
            "held back for follow-up research."
        )
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

    def settle(source: Source, result: GatewayResult[FetchResult] | Exception) -> None:
        nonlocal budget_error
        if isinstance(result, BudgetExceeded):
            budget_error = budget_error or result
            return
        if isinstance(result, GatewayError):
            exc = result
            if exc.failure is FailureType.SOURCE_EMPTY and use_provider_text(source, None):
                return
            why = exc.message or exc.failure.value
            if exc.failure not in (FailureType.SOURCE_UNAVAILABLE, FailureType.SOURCE_EMPTY):
                why = f"{exc.failure.value}: {why}"
            mark_failed(source, exc.failure, why)
            return
        res, metrics = result.value, result.metrics
        is_pdf = res.content_type == "application/pdf"
        folder = settings.artifact_dir / run_id
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"{source.id}.raw.{'pdf' if is_pdf else 'html'}").write_bytes(res.body)
        empty_reason = "empty_extraction"
        if is_pdf:
            empty_reason = "pdf_no_text"  # scanned or image-only: no text layer to quote from
            parsed = pdf_texts[source.id]
            if isinstance(parsed, UnreadablePdf):
                text, published, empty_reason = "", None, "pdf_unreadable"
            else:
                text, published = parsed
        else:
            text, published = clean_html(res.text(), settings.thresholds.source_char_cap)
        if text:
            store_text(source, text, published, None, metrics)
        elif not use_provider_text(source, metrics):
            mark_failed(source, FailureType.SOURCE_EMPTY, empty_reason)

    # Fetch budget is spent in a fixed order: every source is fetched once (in source order), and
    # only then are timeouts retried (in source order) with what is left. Concurrency changes how
    # fast this happens, never which requests are made, so a replay reproduces a live run (FR-26).
    # Results are stored and emitted in source order for the same reason.
    outcomes = list(await asyncio.gather(*(_fetch(gateway, s.url) for s in sources)))
    retry = [
        i
        for i, r in enumerate(outcomes)
        if isinstance(r, GatewayError)
        and not isinstance(r, BudgetExceeded)
        and r.message == "timeout"
    ]
    if allowance is not None:  # retries never spend the follow-up reserve
        retry = retry[: max(0, allowance - len(sources))]
    again = await asyncio.gather(*(_fetch(gateway, sources[i].url) for i in retry))
    for i, result in zip(retry, again, strict=True):
        # No budget left for the single permitted retry: give up on this source only, never the run.
        outcomes[i] = outcomes[i] if isinstance(result, BudgetExceeded) else result
    # PDFs are parsed in killable worker processes (untrusted input), a few at a time, before the
    # results are stored in source order.
    pdf_slots = asyncio.Semaphore(PDF_WORKERS)

    async def parse_pdf(body: bytes) -> tuple[str, datetime | None] | UnreadablePdf:
        async with pdf_slots:
            try:
                return await clean_pdf_isolated(body, settings.thresholds.source_char_cap)
            except UnreadablePdf as exc:
                return exc

    pdf_jobs = {
        s.id: r.value.body
        for s, r in zip(sources, outcomes, strict=True)
        if isinstance(r, GatewayResult) and r.value.content_type == "application/pdf"
    }
    parsed_pdfs = await asyncio.gather(*(parse_pdf(b) for b in pdf_jobs.values()))
    pdf_texts = dict(zip(pdf_jobs, parsed_pdfs, strict=True))
    for source, result in zip(sources, outcomes, strict=True):
        settle(source, result)
    if budget_error is not None:
        raise budget_error
    return fetched
