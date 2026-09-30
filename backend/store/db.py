"""SQLite access (SSOT ADR-101): plain sqlite3, WAL mode, foreign keys on, no ORM.

Migration strategy for a 24-hour MVP: schema.sql is idempotent (CREATE ... IF NOT EXISTS) and the
database carries PRAGMA user_version. Any schema change bumps SCHEMA_VERSION together with a
change-log row (SSOT section 21); an unknown version fails loudly instead of guessing.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

SCHEMA_VERSION = 4
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
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


# (table, column, DDL) for columns added after schema v1; applied to older databases (B-32, B-33).
_LATER_COLUMNS = (
    (
        "users",
        "role",
        "role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'))",
    ),
    ("users", "disabled", "disabled INTEGER NOT NULL DEFAULT 0"),
    ("users", "quota_usd", "quota_usd REAL"),
    ("runs", "hidden", "hidden INTEGER NOT NULL DEFAULT 0"),
)


def _add_missing_columns(conn: sqlite3.Connection) -> None:
    for table, column, ddl in _LATER_COLUMNS:
        cols = [c[1] for c in conn.execute(f"PRAGMA table_info({table})").fetchall()]
        if cols and column not in cols:  # empty cols = table absent; schema.sql will create it
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {ddl}")


def init_db(db_path: str | Path) -> sqlite3.Connection:
    """Open the database, apply the schema if new, and verify the schema version."""
    conn = connect(db_path)
    version = conn.execute("PRAGMA user_version").fetchone()[0]
    if version not in (0, 1, 2, 3, SCHEMA_VERSION):
        conn.close()
        raise SchemaVersionError(
            f"database schema version {version} != expected {SCHEMA_VERSION}; "
            "see SSOT section 21 (change control)"
        )
    if version == 1:
        # Migrate runs table to include user_id if needed
        cols = [c[1] for c in conn.execute("PRAGMA table_info(runs)").fetchall()]
        if "user_id" not in cols:
            conn.execute("ALTER TABLE runs ADD COLUMN user_id TEXT REFERENCES users(id)")
    _add_missing_columns(conn)
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    conn.execute(f"PRAGMA user_version={SCHEMA_VERSION}")
    conn.commit()
    return conn
