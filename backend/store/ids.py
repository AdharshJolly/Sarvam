"""Globally unique short ids (SSOT section 8; decision B-09).

`schema.sql` makes sources, passages, claims and other rows globally keyed, so ids such as S3 or
C41 must not repeat across runs. `next_id` takes the database write lock (BEGIN IMMEDIATE) and
returns MAX+1 for the prefix. The lock is held until the caller commits, so the caller must insert
the row in the same transaction (the `repo` insert helpers do exactly that).
"""

from __future__ import annotations

import sqlite3

# prefix -> owning table
ID_TABLES = {
    "S": "sources",
    "P": "passages",
    "C": "claims",
    "L": "evidence_links",
    "X": "conflicts",
    "V": "coverage",
    "H": "challenges",
    "RP": "reports",
}


def next_id(conn: sqlite3.Connection, prefix: str) -> str:
    table = ID_TABLES[prefix]  # KeyError for an unknown prefix is a programming error
    if not conn.in_transaction:
        conn.execute("BEGIN IMMEDIATE")
    start = len(prefix) + 1
    row = conn.execute(
        f"SELECT COALESCE(MAX(CAST(SUBSTR(id, {start}) AS INTEGER)), 0) + 1 FROM {table}"
    ).fetchone()
    return f"{prefix}{row[0]}"
