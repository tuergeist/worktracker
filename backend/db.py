"""SQLite persistence layer for the golf training app.

Kept dependency-free (stdlib sqlite3) so it is easy to reuse and extend.
"""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "worktracker.db"

SCHEMA = """
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


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(SCHEMA)
    seed_defaults()


def seed_defaults() -> None:
    """Insert the built-in putting exercises once, if none exist yet."""
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT COUNT(*) AS c FROM exercises WHERE is_default = 1"
        ).fetchone()["c"]
        if existing == 0:
            conn.executemany(
                "INSERT INTO exercises (name, category, distance_cm, num_balls, is_default) "
                "VALUES (?, ?, ?, ?, 1)",
                DEFAULT_EXERCISES,
            )
