"""Quote guard and claim extraction (SSOT FR-08, FR-09, 9.3, 9.4, task T06).

Every claim carries a passage id and a verbatim quote that code proves occurs in that stored
passage. Failing claims are discarded and logged as `claim.rejected` events only (decision D6).
"""

from __future__ import annotations

import asyncio
import re
import sqlite3
import unicodedata
from dataclasses import dataclass

from rapidfuzz import fuzz

from backend.gateway import BudgetExceeded, CallMetrics, GatewayError
from backend.gateway.core import ToolGateway
from backend.gateway.llm import LLMRole
from backend.pipeline.discover import STOP_WORDS
from backend.pipeline.extract import rank_passages, slot_query_tokens
from backend.store import repo
from backend.store.emit import Emitter
from contracts.config import Settings
from contracts.events import (
    BudgetWarningPayload,
    ClaimCreatedPayload,
    ClaimRejectedPayload,
    EventType,
    PhaseEnteredPayload,
)
from contracts.llm import ClaimDraft, ClaimList
from contracts.models import EvidenceSlot, FailureType, Passage, Phase, Source

MIN_QUOTE_WORDS = 4
MAX_CLAIMS_PER_CALL = 6
MAX_SLOTS_PER_SOURCE = 3  # own slot first, then the best-scoring others (decision B-14)
STEP_FAILURE_WARNING_AT = 3

_CHAR_MAP = str.maketrans(
    {
        "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'",
        "“": '"', "”": '"', "„": '"', "″": '"',
        "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-",
        "―": "-", "−": "-",
    }
)  # fmt: skip
_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")


@dataclass(frozen=True)
class QuoteMatch:
    ok: bool
    start: int | None = None  # offsets in the ORIGINAL passage text
    end: int | None = None
    method: str = ""  # "exact" | "fuzzy"
    reason: str = ""  # why it failed: quote_too_short | quote_not_in_passage


def _normalise_with_map(text: str) -> tuple[str, list[int]]:
    """NFKC, lowercase, ASCII quotes and dashes, collapsed whitespace; plus an index map from each
    normalised character back to its position in the original text."""
    chars: list[str] = []
    index: list[int] = []
    for i, original in enumerate(text):
        for c in unicodedata.normalize("NFKC", original).lower().translate(_CHAR_MAP):
            if c.isspace():
                if chars and chars[-1] != " ":
                    chars.append(" ")
                    index.append(i)
            else:
                chars.append(c)
                index.append(i)
    while chars and chars[-1] == " ":
        chars.pop()
        index.pop()
    return "".join(chars), index


def normalise(text: str) -> str:
    return _normalise_with_map(text)[0]


def _numbers(text: str) -> set[str]:
    return {m.group().replace(",", "").rstrip(".") for m in _NUMBER.finditer(text)}


def quote_in_passage(quote: str, passage_text: str, fuzzy: float = 0.95) -> QuoteMatch:
    """Exact substring or fuzzy partial ratio >= `fuzzy` (SSOT 9.4) on normalised text.

    Two additions that only ever reject more: a quote under 4 words is refused, and a fuzzy match
    must contain every number the quote states (one altered digit scores ~0.97 on a short quote).
    """
    if len(quote.split()) < MIN_QUOTE_WORDS:
        return QuoteMatch(False, reason="quote_too_short")
    qn = normalise(quote)
    pn, index = _normalise_with_map(passage_text)
    if not qn or not pn:
        return QuoteMatch(False, reason="quote_not_in_passage")
    pos = pn.find(qn)
    if pos != -1:
        return QuoteMatch(True, index[pos], index[pos + len(qn) - 1] + 1, "exact")
    if len(qn) > len(pn):
        ratio = fuzz.ratio(qn, pn) / 100
        span = (0, len(pn))
    else:
        al = fuzz.partial_ratio_alignment(qn, pn)
        ratio = al.score / 100
        span = (al.dest_start, al.dest_end)
    if ratio >= fuzzy and span[1] > span[0] and _numbers(qn) <= _numbers(pn):
        return QuoteMatch(True, index[span[0]], index[span[1] - 1] + 1, "fuzzy")
    return QuoteMatch(False, reason="quote_not_in_passage")


def locate_quote(quote: str, passage_text: str) -> tuple[int, int] | None:
    """Character offsets of the quote inside the original passage text, or None."""
    m = quote_in_passage(quote, passage_text)
    return (m.start, m.end) if m.ok and m.start is not None and m.end is not None else None


# ---------------------------------------------------------------- extraction


def validate_draft(
    draft: ClaimDraft, slot: EvidenceSlot, passages: dict[str, Passage], fuzzy: float
) -> str | None:
    """Reason string when the claim must be rejected, else None. Deterministic."""
    passage = passages.get(draft.passage_id)
    if passage is None:
        return "unknown_passage"
    if not draft.text.strip():
        return "empty_claim_text"
    match = quote_in_passage(draft.quote, passage.text, fuzzy)
    if not match.ok:
        return match.reason
    if draft.attribute is not None and draft.attribute not in slot.attributes:
        return "attribute_not_in_slot"
    numeric = draft.attribute is not None or draft.value is not None
    if numeric and (
        draft.attribute is None
        or draft.value is None
        or not (draft.entity and draft.entity.strip())
        or not (draft.unit and draft.unit.strip())
    ):
        return "numeric_claim_incomplete"
    return None


def _relevant_slots(
    slots: list[EvidenceSlot], own_slot_id: str, passages: list[Passage], k: int
) -> list[tuple[EvidenceSlot, list[Passage]]]:
    """Own slot first, then other slots whose passages share content words with the slot."""
    out: list[tuple[int, int, EvidenceSlot, list[Passage]]] = []
    for order, slot in enumerate(slots):
        query = set(slot_query_tokens(slot)) - STOP_WORDS
        top = rank_passages(slot, passages, k)
        overlap = max(
            (len(query & (set(re.findall(r"\w+", p.text.lower())))) for p in top), default=0
        )
        if overlap > 0:
            own = 0 if slot.id == own_slot_id else 1
            out.append((own, order, slot, top))
    out.sort(key=lambda t: (t[0], t[1]))
    return [(s, top) for _, _, s, top in out[:MAX_SLOTS_PER_SOURCE]]


async def run_claims(
    gateway: ToolGateway,
    conn: sqlite3.Connection,
    em: Emitter,
    settings: Settings,
    run_id: str,
    *,
    round: int = 0,
    reason: str = "Extracting quote-verified claims from the stored passages.",
) -> int:
    """CLAIMS phase. Returns the number of claims stored.

    One extractor call per (source, relevant slot). A call that fails validation after retries
    (STEP_FAILED) or is rate limited is skipped and the run continues. BudgetExceeded and provider
    outages (BLOCKED) are re-raised after finished work has been persisted.
    """
    t = settings.thresholds
    em.emit(
        EventType.PHASE_ENTERED,
        PhaseEnteredPayload(phase=Phase.CLAIMS, reason=reason),
        round=round,
    )
    slots = repo.list_slots(conn, run_id)
    task_slot = {task.id: task.slot_id for task in repo.list_tasks(conn, run_id)}
    jobs: list[tuple[Source, EvidenceSlot, list[Passage]]] = []
    for source in repo.list_sources(conn, run_id, status="fetched"):
        passages = repo.list_passages(conn, source.id)
        if not passages:
            continue
        own_slot = task_slot.get(source.task_id or "", "")
        for slot, top in _relevant_slots(slots, own_slot, passages, t.passages_per_slot_source):
            jobs.append((source, slot, top))

    stored = failures = 0
    fatal: GatewayError | None = None
    seen = {(c.slot_id, c.passage_id, c.quote) for c in repo.list_claims(conn, run_id)}

    async def one(source: Source, slot: EvidenceSlot, top: list[Passage]) -> None:
        nonlocal stored, failures, fatal
        payload = {
            "slot": {
                "id": slot.id,
                "name": slot.name,
                "description": slot.description,
                "attributes": slot.attributes,
            },
            "allowed_attributes": slot.attributes,
            "passage_ids": [p.id for p in top],
            "untrusted": [{"id": p.id, "text": p.text} for p in top],
        }
        try:
            res = await gateway.llm(LLMRole.EXTRACTOR, "extractor.v1", ClaimList, payload)
        except BudgetExceeded as exc:
            fatal = fatal or exc
            return
        except GatewayError as exc:
            if exc.failure in (FailureType.STEP_FAILED, FailureType.RATE_LIMITED):
                failures += 1
                return
            fatal = fatal or exc
            return
        by_id = {p.id: p for p in top}
        metrics: CallMetrics | None = res.metrics
        for draft in res.value.claims[:MAX_CLAIMS_PER_CALL]:
            why = validate_draft(draft, slot, by_id, t.quote_fuzzy_ratio)
            if why is not None:
                em.emit(
                    EventType.CLAIM_REJECTED,
                    ClaimRejectedPayload(
                        slot_id=slot.id,
                        passage_id=draft.passage_id if draft.passage_id in by_id else None,
                        quote=draft.quote,
                        reason=why,
                    ),
                    round=round,
                    metrics=metrics,
                )
                metrics = None  # the call's usage is recorded once
                continue
            key = (slot.id, draft.passage_id, draft.quote)
            if key in seen:
                continue
            seen.add(key)
            claim = repo.insert_claim(
                conn,
                run_id,
                slot_id=slot.id,
                text=draft.text.strip(),
                quote=draft.quote,
                passage_id=draft.passage_id,
                round=round,
                entity=draft.entity,
                attribute=draft.attribute,
                value_num=draft.value,
                unit=draft.unit,
                period=draft.period,
                quote_verified=True,
            )
            em.emit(
                EventType.CLAIM_CREATED,
                ClaimCreatedPayload(claim=claim),
                round=round,
                metrics=metrics,
            )
            metrics = None
            stored += 1

    await asyncio.gather(*(one(*job) for job in jobs))
    if failures >= STEP_FAILURE_WARNING_AT:
        em.emit(
            EventType.BUDGET_WARNING,
            BudgetWarningPayload(limit="extractor_step_failures", used=failures, max=len(jobs)),
            round=round,
        )
    if fatal is not None:
        raise fatal
    return stored
