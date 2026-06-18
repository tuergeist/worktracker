"""SQLite persistence layer for the golf training app.

Kept dependency-free (stdlib sqlite3) so it is easy to reuse and extend.

Data model:
  users      — lightweight profiles (no auth)
  exercises  — shared training catalogue (default + custom)
  sessions   — one recorded attempt of an exercise, belongs to a user
"""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "worktracker.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exercises (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    category    TEXT    NOT NULL DEFAULT 'putting',
    distance_cm INTEGER NOT NULL,
    num_balls   INTEGER NOT NULL DEFAULT 10,
    is_default  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exercise_id  INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    played_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    results_json TEXT    NOT NULL,
    note         TEXT
);
"""

# (name, category, distance_cm, num_balls)
DEFAULT_EXERCISES = [
    ("Putten 1m", "putting", 100, 10),
    ("Putten 2m", "putting", 200, 10),
    ("Putten 3m", "putting", 300, 10),
]

DEFAULT_USER = "Spieler 1"


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(SCHEMA)
        _migrate(conn)
    seed_defaults()


def _migrate(conn: sqlite3.Connection) -> None:
    """Lightweight migrations for databases created before multi-user."""
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(sessions)")}
    if "user_id" not in cols:
        # SQLite can't add a NOT NULL column without a default; add nullable
        # and backfill in seed_defaults().
        conn.execute("ALTER TABLE sessions ADD COLUMN user_id INTEGER REFERENCES users(id)")


def seed_defaults() -> None:
    """Ensure a default user, default exercises, and that every session has a user."""
    with get_conn() as conn:
        if conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"] == 0:
            conn.execute("INSERT INTO users (name) VALUES (?)", (DEFAULT_USER,))

        default_user_id = conn.execute(
            "SELECT id FROM users ORDER BY id LIMIT 1"
        ).fetchone()["id"]
        conn.execute(
            "UPDATE sessions SET user_id = ? WHERE user_id IS NULL", (default_user_id,)
        )

        if conn.execute(
            "SELECT COUNT(*) AS c FROM exercises WHERE is_default = 1"
        ).fetchone()["c"] == 0:
            conn.executemany(
                "INSERT INTO exercises (name, category, distance_cm, num_balls, is_default) "
                "VALUES (?, ?, ?, ?, 1)",
                DEFAULT_EXERCISES,
            )
