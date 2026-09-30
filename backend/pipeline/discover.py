"""Discover and qualify (SSOT FR-04, FR-05, 9.2, task T04). Queries and qualification are code.

Two differently phrased queries per task go through the gateway; hits are canonicalised,
de-duplicated per run, classified by rule (type and authority tier) and stored as `found` sources.
"""

from __future__ import annotations

import asyncio
import re
import sqlite3
from dataclasses import dataclass
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from backend.gateway import BudgetExceeded, CallMetrics, GatewayError
from backend.gateway.core import ToolGateway
from backend.gateway.search import SearchHit
from backend.store import repo
from backend.store.emit import Emitter
from contracts.config import Settings
from contracts.events import (
    EventType,
    PhaseEnteredPayload,
    SourceFoundPayload,
    TaskStartedPayload,
)
from contracts.models import EvidenceSlot, Phase, Scope, SourceType, Task

TRACKING_PARAMS = {"gclid", "fbclid", "ref", "mc_cid", "mc_eid"}
DEFAULT_PORTS = {"http": 80, "https": 443}
STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "in", "is", "it",
    "of", "on", "or", "that", "the", "to", "what", "which", "with",
}  # fmt: skip

REGULATOR_HOSTS = {"rbi.org.in"}
REGULATOR_SUFFIXES = (".gov.in", ".nic.in", ".gov")
COMPANY_PATH_WORDS = ("pricing", "plans", "about", "press", "newsroom", "investor")
NEWS_DOMAINS = (
    "economictimes.indiatimes.com", "livemint.com", "business-standard.com", "thehindu.com",
    "thehindubusinessline.com", "hindustantimes.com", "moneycontrol.com", "financialexpress.com",
    "ndtv.com", "timesofindia.indiatimes.com", "reuters.com", "bloomberg.com", "techcrunch.com",
    "inc42.com", "yourstory.com", "entrackr.com", "medianama.com",
)  # fmt: skip
REPORT_DOMAINS = (
    "mckinsey.com", "bcg.com", "statista.com", "ibef.org", "redseer.com", "nasscom.in",
    "gartner.com", "deloitte.com", "pwc.in", "kpmg.com",
)  # fmt: skip
BLOG_DOMAINS = (
    "blogspot.com", "medium.com", "substack.com", "wordpress.com", "reddit.com", "quora.com",
)  # fmt: skip


def canonicalize_url(url: str) -> str:
    """Lowercase scheme and host, drop default port, fragment and tracking params, sort the rest."""
    parts = urlsplit(url.strip())
    scheme = parts.scheme.lower()
    host = (parts.hostname or "").lower().removeprefix("www.")
    netloc = host
    if parts.port and parts.port != DEFAULT_PORTS.get(scheme):
        netloc = f"{host}:{parts.port}"
    query = sorted(
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if not k.lower().startswith("utm_") and k.lower() not in TRACKING_PARAMS
    )
    path = parts.path.rstrip("/") if parts.path != "/" else "/"
    return urlunsplit((scheme, netloc, path, urlencode(query), ""))


def _host_in(host: str, domains: tuple[str, ...] | set[str]) -> bool:
    return any(host == d or host.endswith("." + d) for d in domains)


def classify(url: str) -> tuple[SourceType, int, str]:
    """(source_type, authority_tier, domain) by rule, no LLM (SSOT 9.2). Lists are starters."""
    parts = urlsplit(url)
    host = (parts.hostname or "").lower().removeprefix("www.")
    path = parts.path.lower()
    is_gov = "gov" in host.split(".")  # ftc.gov, gov.uk, sebi.gov.in, x.gov.au
    if _host_in(host, REGULATOR_HOSTS) or host.endswith(REGULATOR_SUFFIXES) or is_gov:
        return SourceType.REGULATOR, 1, host
    if _host_in(host, NEWS_DOMAINS) or _host_in(host, REPORT_DOMAINS):
        return SourceType.NEWS, 2, host
    if _host_in(host, BLOG_DOMAINS) or "forum" in path:
        return SourceType.BLOG, 3, host
    if any(word in re.split(r"[/\-_.]", path) for word in COMPANY_PATH_WORDS):
        return SourceType.COMPANY_PRIMARY, 1, host
    return SourceType.UNKNOWN, 3, host


def _tokens(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOP_WORDS]


def second_query(task_query: str, slot_name: str, scope: Scope) -> str:
    """A differently phrased query: slot name, then the keywords reversed, then the place."""
    base = _tokens(task_query)
    slot = _tokens(slot_name)
    place = _tokens(scope.geography or scope.time_horizon or "")
    rest = [w for w in reversed(base) if w not in slot and w not in place]
    tokens = list(dict.fromkeys([*slot, *rest, *place]))
    if set(tokens) == set(base):  # never the same query after normalisation
        tokens.append("latest")
    return " ".join(tokens)


def queries_for(task: Task, slot: EvidenceSlot | None, scope: Scope, count: int) -> list[str]:
    out = [task.query_text]
    if count > 1:
        out.append(second_query(task.query_text, slot.name if slot else "", scope))
    return out[:count]


@dataclass
class _Found:
    hit: SearchHit
    metrics: CallMetrics


async def run_discover(
    gateway: ToolGateway,
    conn: sqlite3.Connection,
    em: Emitter,
    settings: Settings,
    run_id: str,
    scope: Scope,
    *,
    round: int = 0,
    reason: str = "Searching for sources for every evidence slot.",
) -> int:
    """DISCOVER phase for the pending tasks of `round`. Returns the number of new sources stored.

    A failed search blocks only its own task. BudgetExceeded is re-raised after every task that
    could finish has been persisted, so the controller can take the wrap-up path.
    """
    t = settings.thresholds
    em.emit(
        EventType.PHASE_ENTERED,
        PhaseEnteredPayload(phase=Phase.DISCOVER, reason=reason),
        round=round,
    )
    slots = {s.id: s for s in repo.list_slots(conn, run_id)}
    tasks = repo.list_tasks(conn, run_id, status="pending", round=round)
    budget_error: BudgetExceeded | None = None
    stored = 0

    async def one(task: Task) -> None:
        nonlocal budget_error, stored
        slot = slots.get(task.slot_id)
        em.emit(
            EventType.TASK_STARTED,
            TaskStartedPayload(
                task_id=task.id,
                slot_id=task.slot_id,
                query_text=task.query_text,
                kind=task.kind,
                reason=f"Searching for: {slot.name if slot else task.slot_id}.",
            ),
            round=round,
        )
        queries = queries_for(task, slot, scope, t.queries_per_task)
        results = await asyncio.gather(
            *(gateway.search(q, max_results=t.results_per_query) for q in queries),
            return_exceptions=True,
        )
        found: list[_Found] = []
        errors: list[GatewayError] = []
        for res in results:
            if isinstance(res, BudgetExceeded):
                budget_error = budget_error or res
            elif isinstance(res, GatewayError):
                errors.append(res)
            elif isinstance(res, BaseException):
                raise res
            else:
                found.extend(_Found(h, res.metrics) for h in res.value)
        if not found and (errors or budget_error):
            repo.set_task_status(conn, run_id, task.id, "blocked")
            err = errors[0] if errors else budget_error
            em.emit(
                EventType.TASK_STARTED,
                TaskStartedPayload(
                    task_id=task.id,
                    slot_id=task.slot_id,
                    query_text=task.query_text,
                    kind=task.kind,
                    reason=f"Task blocked ({err.failure.value}): {err.message or 'search failed'}.",
                ),
                round=round,
            )
            return
        stored += _store_sources(conn, em, settings, run_id, task, found, round)
        repo.set_task_status(conn, run_id, task.id, "done")

    await asyncio.gather(*(one(task) for task in tasks))
    if budget_error is not None:
        raise budget_error
    return stored


def _store_sources(
    conn: sqlite3.Connection,
    em: Emitter,
    settings: Settings,
    run_id: str,
    task: Task,
    found: list[_Found],
    round: int,
) -> int:
    candidates: list[tuple[int, str, str, SourceType, str, _Found]] = []
    seen: set[str] = set()
    for item in found:
        if urlsplit(item.hit.url).scheme.lower() not in ("http", "https"):
            continue
        canonical = canonicalize_url(item.hit.url)
        if canonical in seen or repo.source_exists(conn, run_id, canonical):
            continue  # duplicates are dropped (per run)
        seen.add(canonical)
        stype, tier, domain = classify(item.hit.url)
        candidates.append((tier, canonical, item.hit.url, stype, domain, item))
    candidates.sort(key=lambda c: c[0])  # stable: authority tier first, then provider order
    count = 0
    for tier, canonical, url, stype, domain, item in candidates[
        : settings.thresholds.sources_per_task
    ]:
        source = repo.insert_source(
            conn,
            run_id,
            url=url,
            canonical_url=canonical,
            domain=domain,
            publisher=domain,
            source_type=stype.value,
            authority_tier=tier,
            task_id=task.id,
        )
        if item.hit.cleaned_text:
            folder = settings.artifact_dir / run_id
            folder.mkdir(parents=True, exist_ok=True)
            (folder / f"{source.id}.provider.txt").write_text(
                item.hit.cleaned_text, encoding="utf-8", newline="\n"
            )
        em.emit(
            EventType.SOURCE_FOUND,
            SourceFoundPayload(source=source),
            round=round,
            metrics=item.metrics,
        )
        count += 1
    return count
