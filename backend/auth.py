"""Authentication and user session management for Sarvam.

Uses pure Python standard library (hashlib, secrets, sqlite3) for rock-solid
zero-dependency cryptography and session management across all platforms.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
from datetime import UTC, datetime, timedelta

from contracts.models import UserPublic

TOKEN_EXPIRY_DAYS = 7
PBKDF2_ITERATIONS = 100_000


def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PBKDF2_ITERATIONS,
    ).hex()


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _row_to_user(row: sqlite3.Row) -> UserPublic:
    last_login = (
        datetime.fromisoformat(row["last_login_at"]) if row["last_login_at"] else None
    )
    return UserPublic(
        id=row["id"],
        email=row["email"],
        display_name=row["display_name"],
        created_at=datetime.fromisoformat(row["created_at"]),
        last_login_at=last_login,
    )


class AuthError(ValueError):
    """Raised on authentication or registration failure."""


def register_user(
    conn: sqlite3.Connection,
    email: str,
    password: str,
    display_name: str,
) -> tuple[UserPublic, str]:
    """Register a new user, create an active session token, and return (UserPublic, token)."""
    clean_email = email.strip().lower()
    clean_name = display_name.strip()
    if not clean_email or "@" not in clean_email:
        raise AuthError("Invalid email address")
    if len(password) < 6:
        raise AuthError("Password must be at least 6 characters")
    if not clean_name:
        raise AuthError("Display name is required")

    existing = conn.execute("SELECT id FROM users WHERE email = ?", (clean_email,)).fetchone()
    if existing:
        raise AuthError("An account with this email already exists")

    user_id = f"usr_{secrets.token_hex(8)}"
    salt = secrets.token_hex(16)
    password_hash = _hash_password(password, salt)
    now = datetime.now(UTC).isoformat()

    conn.execute(
        "INSERT INTO users (id, email, display_name, password_hash, salt, created_at, last_login_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user_id, clean_email, clean_name, password_hash, salt, now, now),
    )

    token = secrets.token_urlsafe(32)
    token_hash = _hash_token(token)
    expires_at = (datetime.now(UTC) + timedelta(days=TOKEN_EXPIRY_DAYS)).isoformat()

    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token_hash, user_id, now, expires_at),
    )
    conn.commit()

    user_row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _row_to_user(user_row), token


def login_user(
    conn: sqlite3.Connection,
    email: str,
    password: str,
) -> tuple[UserPublic, str]:
    """Validate credentials, issue a new session token, update last_login_at, and return (UserPublic, token)."""
    clean_email = email.strip().lower()
    row = conn.execute("SELECT * FROM users WHERE email = ?", (clean_email,)).fetchone()
    if not row:
        raise AuthError("Invalid email or password")

    expected_hash = row["password_hash"]
    salt = row["salt"]
    computed_hash = _hash_password(password, salt)

    if not hmac.compare_digest(expected_hash, computed_hash):
        raise AuthError("Invalid email or password")

    user_id = row["id"]
    now = datetime.now(UTC).isoformat()

    conn.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (now, user_id))

    token = secrets.token_urlsafe(32)
    token_hash = _hash_token(token)
    expires_at = (datetime.now(UTC) + timedelta(days=TOKEN_EXPIRY_DAYS)).isoformat()

    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token_hash, user_id, now, expires_at),
    )
    conn.commit()

    updated_row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _row_to_user(updated_row), token


def get_user_by_token(conn: sqlite3.Connection, token: str) -> UserPublic | None:
    """Validate a session token and return the associated UserPublic, or None if invalid/expired."""
    if not token:
        return None
    token_hash = _hash_token(token)
    now = datetime.now(UTC).isoformat()

    session_row = conn.execute(
        "SELECT user_id, expires_at FROM sessions WHERE token_hash = ?",
        (token_hash,),
    ).fetchone()

    if not session_row:
        return None

    if session_row["expires_at"] < now:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
        conn.commit()
        return None

    user_row = conn.execute(
        "SELECT * FROM users WHERE id = ?", (session_row["user_id"],)
    ).fetchone()
    return _row_to_user(user_row) if user_row else None


def logout_user(conn: sqlite3.Connection, token: str) -> None:
    """Invalidate a session token."""
    if not token:
        return
    token_hash = _hash_token(token)
    conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
    conn.commit()


def update_user(
    conn: sqlite3.Connection,
    user_id: str,
    display_name: str | None = None,
    password: str | None = None,
) -> UserPublic:
    """Update user's profile display name or password."""
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        raise AuthError("User not found")

    clean_name = display_name.strip() if display_name is not None else row["display_name"]
    if not clean_name:
        raise AuthError("Display name cannot be blank")

    if password is not None:
        if len(password) < 6:
            raise AuthError("Password must be at least 6 characters")
        salt = secrets.token_hex(16)
        password_hash = _hash_password(password, salt)
        conn.execute(
            "UPDATE users SET display_name = ?, password_hash = ?, salt = ? WHERE id = ?",
            (clean_name, password_hash, salt, user_id),
        )
    else:
        conn.execute(
            "UPDATE users SET display_name = ? WHERE id = ?",
            (clean_name, user_id),
        )
    conn.commit()

    updated = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _row_to_user(updated)


def delete_user_account(conn: sqlite3.Connection, user_id: str) -> None:
    """Permanently delete user account and sessions, setting past run user_ids to NULL for anonymization."""
    conn.execute("UPDATE runs SET user_id = NULL WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()

