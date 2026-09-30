"""Create or promote the preset admin account (ADR B-36).

    uv run python -m backend.admin.seed                       # admin@sarvam.local, random password
    uv run python -m backend.admin.seed --email me@x.io --password '...'
    uv run python -m backend.admin.seed --reset-password      # rotate an existing admin's password

Idempotent: re-running never creates a second account and never changes a password unless
`--reset-password` is given. The generated password is printed once and is not stored anywhere else.
"""

from __future__ import annotations

import argparse
import secrets
import sqlite3
from dataclasses import dataclass

from backend import auth
from backend.store.db import init_db
from contracts.config import Settings

DEFAULT_EMAIL = "admin@sarvam.local"
DEFAULT_NAME = "Sarvam Admin"


@dataclass(frozen=True)
class SeedResult:
    created: bool
    promoted: bool  # an existing account was made admin or re-enabled
    password: str | None  # only set when this call created the account or reset the password


def ensure_admin(
    conn: sqlite3.Connection,
    email: str,
    display_name: str,
    password: str | None,
    *,
    reset_password: bool = False,
) -> SeedResult:
    email = email.strip().lower()
    row = conn.execute("SELECT id, role, disabled FROM users WHERE email = ?", (email,)).fetchone()

    if row is None:
        chosen = password or secrets.token_urlsafe(16)
        user, _ = auth.register_user(conn, email, chosen, display_name, admin_emails=(email,))
        # register_user opens a session; a seed must not leave a live token behind.
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user.id,))
        conn.commit()
        return SeedResult(created=True, promoted=False, password=chosen)

    promoted = row["role"] != "admin" or bool(row["disabled"])
    conn.execute("UPDATE users SET role = 'admin', disabled = 0 WHERE id = ?", (row["id"],))
    conn.commit()
    new_password = None
    if reset_password:
        new_password = password or secrets.token_urlsafe(16)
        auth.update_user(conn, row["id"], password=new_password)
    return SeedResult(created=False, promoted=promoted, password=new_password)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Create or promote the preset Sarvam admin account.")
    p.add_argument("--email", default=DEFAULT_EMAIL)
    p.add_argument("--name", default=DEFAULT_NAME)
    p.add_argument("--password", default=None, help="default: a random 22-character password")
    p.add_argument("--reset-password", action="store_true")
    p.add_argument("--db", default=None, help="default: SARVAM_DB_PATH / data/sarvam.db")
    args = p.parse_args(argv)

    db_path = args.db or Settings.from_env().db_path
    conn = init_db(db_path)
    try:
        result = ensure_admin(
            conn, args.email, args.name, args.password, reset_password=args.reset_password
        )
    except auth.AuthError as exc:
        print(f"error: {exc}")
        return 1
    finally:
        conn.close()

    print(f"database : {db_path}")
    print(f"email    : {args.email.strip().lower()}")
    if result.created:
        print(f"password : {result.password}")
        print("status   : created (admin)")
    elif result.password:
        print(f"password : {result.password}")
        print("status   : password reset" + (", promoted to admin" if result.promoted else ""))
    else:
        print("password : (unchanged)")
        print("status   : " + ("promoted to admin" if result.promoted else "already an admin"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
