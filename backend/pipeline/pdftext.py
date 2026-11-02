"""PDF text for ACQUIRE: page text in reading order, wrapped lines rejoined, capped like HTML text.

PDF extraction keeps the visual line breaks of the page. Passages are built from lines, so a
sentence split across two lines would be cut in half and a verbatim quote of it would fail the
quote guard. `reflow` rejoins those lines with a conservative rule and leaves headings alone.
"""

from __future__ import annotations

import io
import logging
import re
from datetime import UTC, datetime

from pypdf import PdfReader
from pypdf.errors import PdfReadError

MAX_PAGES = 300  # bounds CPU on very long reports; the char cap usually stops earlier
EDGE_LINES = 2  # lines at the top and bottom of a page that may be a running header or footer
_TERMINAL = ".!?:;"
_OPENERS = "\u201c\u2018\"'("
# A line ending in one of these words always continues: no heading or sentence ends on "the".
_CONTINUES = frozenset(
    "a an and are as at be by for from in into is its of on or that the their this to under "
    "was were which with".split()
)
_PRIVATE_USE = re.compile("[\ue000-\uf8ff]")  # font-specific bullet glyphs
_DIGITS = re.compile(r"\d+")
_SPACES = re.compile("[ \t\u00a0]+")

# pypdf logs a warning for every malformed object it skips; that is noise for untrusted inputs.
logging.getLogger("pypdf").setLevel(logging.ERROR)


class UnreadablePdf(Exception):
    """The bytes are not a PDF pypdf can open (corrupt, truncated, or encrypted)."""


def _joins(prev: str, nxt: str) -> bool:
    """Is `nxt` the continuation of the sentence on `prev`?"""
    if nxt[0].islower():
        return True  # a sentence never starts lowercase
    if prev[-1] in _TERMINAL:
        return False
    if prev.rsplit(" ", 1)[-1].lower() in _CONTINUES:
        return True
    if prev[-1].islower() and nxt[0] in _OPENERS:
        return True  # 'named' + a quoted name
    return nxt[0].isdigit() or prev[-1] in ",(-"


def reflow(page_text: str) -> str:
    """One line per paragraph or heading.

    Wrapped lines are joined, hyphenated line breaks undone and runs of spaces collapsed.
    """
    out: list[str] = []
    for raw in page_text.splitlines():
        line = _SPACES.sub(" ", _PRIVATE_USE.sub("", raw)).strip()
        if not line:
            continue
        if out and _joins(out[-1], line):
            prev = out[-1]
            if prev.endswith("-") and line[0].islower():
                out[-1] = prev[:-1] + line  # "infra-" + "structure"
            else:
                out[-1] = f"{prev} {line}"
        else:
            out.append(line)
    return "\n".join(out)


def _line_key(line: str) -> str:
    """Page-independent form of a line: page numbers and spacing do not count."""
    return _SPACES.sub(" ", _DIGITS.sub("#", line)).strip().lower()


def drop_running_lines(pages: list[str]) -> list[str]:
    """Remove running headers and footers.

    A running line is one of the first or last EDGE_LINES lines of a page whose text (page numbers
    ignored) is at an edge of at least half the pages. Body lines are never touched, so repeated
    sentences in the body survive. Needs three or more pages.
    """
    if len(pages) < 3:
        return pages

    def edges(page: str) -> list[str]:
        lines = [ln for ln in page.splitlines() if ln.strip()]
        return lines[:EDGE_LINES] + lines[-EDGE_LINES:]

    seen: dict[str, int] = {}
    for page in pages:
        for key in {_line_key(ln) for ln in edges(page)}:
            seen[key] = seen.get(key, 0) + 1
    limit = max(3, (len(pages) + 1) // 2)
    running = {k for k, n in seen.items() if n >= limit}

    def strip(page: str) -> str:
        lines = [ln for ln in page.splitlines() if ln.strip()]
        n = len(lines)
        keep = [
            ln
            for i, ln in enumerate(lines)
            if not ((i < EDGE_LINES or i >= n - EDGE_LINES) and _line_key(ln) in running)
        ]
        return "\n".join(keep)

    return [strip(page) for page in pages]


def _published(reader: PdfReader) -> datetime | None:
    try:
        meta = reader.metadata
        created = meta.creation_date if meta else None
    except (PdfReadError, ValueError, TypeError):
        return None
    if created is None:
        return None
    return created if created.tzinfo else created.replace(tzinfo=UTC)


def clean_pdf(body: bytes, char_cap: int) -> tuple[str, datetime | None]:
    """Reflowed text of the PDF (LF line endings, at most `char_cap` chars) and its creation date.

    Empty text means the PDF has no text layer (scanned or image-only). Raises UnreadablePdf when
    the bytes cannot be opened as a PDF at all.
    """
    try:
        reader = PdfReader(io.BytesIO(body))
        if reader.is_encrypted:
            raise UnreadablePdf("encrypted")
        pages = reader.pages
        count = len(pages)
    except UnreadablePdf:
        raise
    except Exception as exc:  # pypdf raises many types for corrupt input; all mean "cannot open"
        raise UnreadablePdf(type(exc).__name__) from exc

    # Raw text first (headers and footers can only be told apart across pages), with headroom
    # over the cap because running lines are removed before the text is capped.
    raw: list[str] = []
    size = 0
    broken = 0
    for i in range(min(count, MAX_PAGES)):
        try:
            page = pages[i].extract_text() or ""
        except Exception:  # one broken page must not lose the rest of the document
            broken += 1
            continue
        raw.append(page)
        size += len(page)
        if size >= 2 * char_cap:
            break
    if not any(p.strip() for p in raw) and broken:
        raise UnreadablePdf(f"{broken} page(s) could not be read")
    parts = [t for t in (reflow(p) for p in drop_running_lines(raw)) if t]
    text = "\n".join(parts)[:char_cap].strip()
    return text, _published(reader)
