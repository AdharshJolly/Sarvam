"""SQLite access (SSOT ADR-101): plain sqlite3, WAL mode, foreign keys on, no ORM.

Migration strategy for a 24-hour MVP: schema.sql is idempotent (CREATE ... IF NOT EXISTS) and the
database carries PRAGMA user_version. Any schema change bumps SCHEMA_VERSION together with a
change-log row (SSOT section 21); an unknown version fails loudly instead of guessing.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

SCHEMA_VERSION = 1
SCHEMA_PATH = Path(__file__).with_name("schema.sql")


class SchemaVersionError(RuntimeError):
    """The database was created by an incompatible schema version."""


def connect(db_path: str | Path) -> sqlite3.Connection:
    path = Path(db_path)
    if str(path) != ":memory:":
        path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def init_db(db_path: str | Path) -> sqlite3.Connection:
    """Open the database, apply the schema if new, and verify the schema version."""
    conn = connect(db_path)
    version = conn.execute("PRAGMA user_version").fetchone()[0]
    if version not in (0, SCHEMA_VERSION):
        conn.close()
        raise SchemaVersionError(
            f"database schema version {version} != expected {SCHEMA_VERSION}; "
            "see SSOT section 21 (change control)"
        )
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    conn.execute(f"PRAGMA user_version={SCHEMA_VERSION}")
    conn.commit()
    return conn
