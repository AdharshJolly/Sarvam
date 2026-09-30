"""Text extraction, passage splitting and BM25 ranking (SSOT FR-07, FR-08, task T05).

All deterministic. Passages are immutable citation targets: for every stored passage,
`cleaned_text[char_start:char_end] == text` and passages never overlap.
"""

from __future__ import annotations

import re
import sqlite3
from datetime import UTC, datetime

import trafilatura
from rank_bm25 import BM25Okapi

from backend.store import repo
from backend.store.emit import Emitter
from contracts.config import Settings, Thresholds
from contracts.events import EventType, PassagesCreatedPayload, PhaseEnteredPayload
from contracts.models import EvidenceSlot, Passage, Phase

SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


def clean_html(html: str, char_cap: int) -> tuple[str, datetime | None]:
    """Main article text (LF line endings, truncated AFTER cleaning) and its publication date."""
    text = trafilatura.extract(html, include_comments=False, include_tables=True) or ""
    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()[:char_cap]
    published: datetime | None = None
    meta = trafilatura.extract_metadata(html)
    if meta is not None and meta.date:
        try:
            published = datetime.fromisoformat(meta.date).replace(tzinfo=UTC)
        except ValueError:
            published = None
    return text, published


def _words(text: str, start: int, end: int) -> int:
    return len(text[start:end].split())


def _units(text: str, max_words: int) -> list[tuple[int, int]]:
    """Non-blank lines, each cut at sentence boundaries (then at words) to at most max_words."""
    units: list[tuple[int, int]] = []
    for line in re.finditer(r"[^\n]+", text):
        start, end = line.start(), line.end()
        stripped = text[start:end]
        start += len(stripped) - len(stripped.lstrip())
        end -= len(stripped) - len(stripped.rstrip())
        if start >= end:
            continue
        if _words(text, start, end) <= max_words:
            units.append((start, end))
            continue
        pieces: list[tuple[int, int]] = []
        cursor = start
        for m in SENTENCE_END.finditer(text, start, end):
            pieces.append((cursor, m.start()))
            cursor = m.end()
        pieces.append((cursor, end))
        current: tuple[int, int] | None = None
        for piece in pieces:
            for sub in _hard_split(text, piece, max_words):
                if current and _words(text, current[0], sub[1]) <= max_words:
                    current = (current[0], sub[1])
                else:
                    if current:
                        units.append(current)
                    current = sub
        if current:
            units.append(current)
    return units


def _hard_split(text: str, span: tuple[int, int], max_words: int) -> list[tuple[int, int]]:
    """Cut one over-long sentence into chunks of at most max_words words."""
    start, end = span
    if _words(text, start, end) <= max_words:
        return [span]
    out: list[tuple[int, int]] = []
    chunk_start, count = start, 0
    for m in re.finditer(r"\S+", text[start:end]):
        count += 1
        if count == max_words:
            out.append((chunk_start, start + m.end()))
            nxt = re.compile(r"\S").search(text, start + m.end(), end)
            chunk_start, count = (nxt.start() if nxt else end), 0
    if chunk_start < end:
        out.append((chunk_start, end))
    return out


def split_passages(text: str, thresholds: Thresholds | None = None) -> list[tuple[str, int, int]]:
    """Passages of 120-200 words (FR-07) as (text, char_start, char_end) with exact offsets."""
    t = thresholds or Thresholds()
    merged: list[tuple[int, int]] = []
    for unit in _units(text, t.passage_words_max):
        if merged:
            prev = merged[-1]
            if (
                _words(text, *prev) < t.passage_words_min
                and _words(text, prev[0], unit[1]) <= t.passage_words_max
            ):
                merged[-1] = (prev[0], unit[1])
                continue
        merged.append(unit)
    if len(merged) > 1 and _words(text, *merged[-1]) < t.passage_words_min:
        if _words(text, merged[-2][0], merged[-1][1]) <= t.passage_words_max:
            merged[-2:] = [(merged[-2][0], merged[-1][1])]
    return [(text[s:e], s, e) for s, e in merged]


def _tokens(text: str) -> list[str]:
    return re.findall(r"\w+", text.lower())


def slot_query_tokens(slot: EvidenceSlot) -> list[str]:
    attrs = " ".join(a.replace("_", " ") for a in slot.attributes)
    return _tokens(f"{slot.name} {slot.description} {attrs}")


def has_overlap(slot: EvidenceSlot, passage: Passage) -> bool:
    """True when the passage shares at least one word with the slot (BM25 can score 0 on tiny
    corpora, so relevance for skipping is decided by overlap, not by score sign)."""
    return bool(set(slot_query_tokens(slot)) & set(_tokens(passage.text)))


def rank_passages(slot: EvidenceSlot, passages: list[Passage], k: int) -> list[Passage]:
    """Top-k passages for the slot by BM25 (ties: word overlap, then order). Deterministic."""
    if not passages:
        return []
    docs = [_tokens(p.text) or [""] for p in passages]
    query = slot_query_tokens(slot)
    scores = BM25Okapi(docs).get_scores(query)
    # BM25 gives zero idf to words present in half the passages, so tiny corpora produce many ties:
    # break ties by query-word overlap, then by passage order (deterministic).
    overlap = [len(set(query) & set(d)) for d in docs]
    order = sorted(range(len(passages)), key=lambda i: (-float(scores[i]), -overlap[i], i))
    return [passages[i] for i in order[:k]]


def run_extract(
    conn: sqlite3.Connection, em: Emitter, settings: Settings, run_id: str, *, round: int = 0
) -> int:
    """EXTRACT phase: split each fetched source without passages. Returns passages created."""
    em.emit(
        EventType.PHASE_ENTERED,
        PhaseEnteredPayload(
            phase=Phase.EXTRACT, reason="Splitting fetched pages into citable passages."
        ),
        round=round,
    )
    total = 0
    for source in repo.list_sources(conn, run_id, status="fetched"):
        if repo.list_passages(conn, source.id):
            continue
        path = settings.artifact_dir / run_id / f"{source.id}.txt"
        text = path.read_text(encoding="utf-8")
        created = repo.insert_passages(conn, source.id, split_passages(text, settings.thresholds))
        em.emit(
            EventType.PASSAGES_CREATED,
            PassagesCreatedPayload(source_id=source.id, count=len(created)),
            round=round,
        )
        total += len(created)
    return total
