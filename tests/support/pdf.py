"""Build small real PDFs in memory for tests (one text line per row, Helvetica, no dependencies)."""

from __future__ import annotations


def hanging_worker(conn, body: bytes, char_cap: int) -> None:
    """Stands in for a PDF that takes forever to parse (spawned in a child process by tests)."""
    import time

    time.sleep(60)


def crashing_worker(conn, body: bytes, char_cap: int) -> None:
    """Stands in for a worker killed by its memory limit: exits without sending a result."""
    import os

    os._exit(1)


def _escape(line: str) -> str:
    return line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def make_pdf(pages: list[list[str]], creation_date: str | None = None) -> bytes:
    """A valid PDF with one page per item; each string is drawn on its own line.

    `creation_date` uses the PDF date format, e.g. "D:20250314000000Z".
    """
    font_id = 3
    page_ids: list[int] = []
    next_id = 4
    page_objs: list[tuple[int, bytes]] = []
    for lines in pages:
        content_id, page_id = next_id, next_id + 1
        next_id += 2
        ops = ["BT", "/F1 11 Tf", "14 TL", "72 760 Td"]
        for line in lines:
            ops.append(f"({_escape(line)}) Tj T*")
        ops.append("ET")
        stream = "\n".join(ops).encode("latin-1")
        page_objs.append(
            (content_id, b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
        )
        page_objs.append(
            (
                page_id,
                (
                    f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
                    f"/Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {content_id} 0 R >>"
                ).encode(),
            )
        )
        page_ids.append(page_id)
    kids = " ".join(f"{p} 0 R" for p in page_ids)
    info_id = next_id
    objects_by_id: dict[int, bytes] = {
        1: b"<< /Type /Catalog /Pages 2 0 R >>",
        2: f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode(),
        3: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        info_id: (f"<< /CreationDate ({creation_date}) >>" if creation_date else "<< >>").encode(),
    }
    objects_by_id.update(dict(page_objs))

    out = bytearray(b"%PDF-1.4\n")
    offsets: dict[int, int] = {}
    for oid in sorted(objects_by_id):
        offsets[oid] = len(out)
        out += f"{oid} 0 obj\n".encode() + objects_by_id[oid] + b"\nendobj\n"
    xref = len(out)
    size = max(objects_by_id) + 1
    out += f"xref\n0 {size}\n0000000000 65535 f \n".encode()
    for oid in range(1, size):
        out += f"{offsets[oid]:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {size} /Root 1 0 R /Info {info_id} 0 R >>\n".encode()
    out += f"startxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


def malformed_worker(conn, body: bytes, char_cap: int) -> None:
    """Sends a well-formed JSON message with the wrong shape."""
    conn.send_bytes(b'{"status": "ok", "text": 42}')
    conn.close()


def pickle_worker(conn, body: bytes, char_cap: int) -> None:
    """Sends a pickled object instead of JSON: the parent must not unpickle it."""
    conn.send(("ok", "text", None))
    conn.close()
