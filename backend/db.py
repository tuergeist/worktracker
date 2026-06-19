"""PostgreSQL persistence layer for the golf training app.

Uses psycopg 3. A thin connection wrapper keeps the call sites in app.py
unchanged: it translates the historical ``?`` placeholders to ``%s`` and
exposes ``cursor.lastrowid`` (via ``RETURNING id``) plus ``fetchone/fetchall/
rowcount`` like the previous sqlite3 layer.

Timestamps are stored as TEXT in UTC ("YYYY-MM-DD HH:MM:SS") so the JSON API
contract (frontend does ``new Date(value + "Z")``) is preserved verbatim.

Configure with DATABASE_URL, e.g.
    postgresql://worktracker:worktracker@localhost:5432/worktracker

Data model:
  users      — lightweight profiles (no auth)
  exercises  — shared training catalogue (default + custom)
  sessions   — one recorded attempt of an exercise, belongs to a user
  clubs      — driving-range club catalogue
  shots      — one driving-range shot
"""
import os
import time

import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://worktracker:worktracker@localhost:5432/worktracker"
)

# UTC, second precision, no timezone suffix — matches the old sqlite format.
_TS_DEFAULT = "to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD HH24:MI:SS')"

SCHEMA = f"""
CREATE TABLE IF NOT EXISTS users (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT {_TS_DEFAULT}
);

CREATE TABLE IF NOT EXISTS exercises (
    id          SERIAL PRIMARY KEY,
    name        TEXT    NOT NULL,
    category    TEXT    NOT NULL DEFAULT 'putting',
    distance_cm INTEGER NOT NULL,
    num_balls   INTEGER NOT NULL DEFAULT 10,
    is_default  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT {_TS_DEFAULT}
);

CREATE TABLE IF NOT EXISTS sessions (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exercise_id  INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    played_at    TEXT    NOT NULL DEFAULT {_TS_DEFAULT},
    results_json TEXT    NOT NULL,
    note         TEXT
);

CREATE TABLE IF NOT EXISTS clubs (
    id         SERIAL PRIMARY KEY,
    name       TEXT    NOT NULL,
    abbr       TEXT    NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 100,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT {_TS_DEFAULT}
);

-- One driving-range shot. drift_m is signed: negative = left, positive = right.
CREATE TABLE IF NOT EXISTS shots (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    club_id    INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    carry_m    DOUBLE PRECISION NOT NULL,
    drift_m    DOUBLE PRECISION NOT NULL DEFAULT 0,
    tags_json  TEXT NOT NULL DEFAULT '[]',
    note       TEXT,
    played_at  TEXT NOT NULL DEFAULT {_TS_DEFAULT}
);
"""

# (name, category, distance_cm, num_balls)
DEFAULT_EXERCISES = [
    ("Putten 1m", "putting", 100, 10),
    ("Putten 2m", "putting", 200, 10),
    ("Putten 3m", "putting", 300, 10),
]

DEFAULT_USER = "Spieler 1"

# (name, abbr, sort_order)
DEFAULT_CLUBS = [
    ("Driver", "Dr", 10),
    ("Holz 3", "3W", 20),
    ("Hybrid", "Hy", 30),
    ("Eisen 5", "5i", 50),
    ("Eisen 6", "6i", 60),
    ("Eisen 7", "7i", 70),
    ("Eisen 8", "8i", 80),
    ("Eisen 9", "9i", 90),
    ("Pitching Wedge", "PW", 100),
    ("Sand Wedge", "SW", 110),
]

# Suggested shot quality tags (configurable later; served to the frontend).
DEFAULT_SHOT_TAGS = [
    "fett", "getoppt", "dünn", "sauber", "slice", "hook", "push", "pull",
]


# --------------------------------------------------------------- compat layer
class _Cursor:
    """Mimics the sqlite3 cursor surface used across app.py."""

    def __init__(self, cur, lastrowid=None):
        self._cur = cur
        self.lastrowid = lastrowid
        self.rowcount = cur.rowcount

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()


class _Connection:
    """psycopg connection wrapper that accepts ``?`` placeholders and provides
    ``lastrowid`` for INSERTs (auto-appends ``RETURNING id``)."""

    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql, params=()):
        q = sql.replace("?", "%s")
        is_insert = q.lstrip()[:6].lower() == "insert"
        lastrowid = None
        if is_insert and "returning" not in q.lower():
            q = q.rstrip().rstrip(";") + " RETURNING id"
        cur = self._conn.execute(q, tuple(params))
        if is_insert:
            row = cur.fetchone()
            lastrowid = row["id"] if row else None
        return _Cursor(cur, lastrowid)

    def executemany(self, sql, seq):
        cur = self._conn.cursor()
        cur.executemany(sql.replace("?", "%s"), [tuple(p) for p in seq])
        return _Cursor(cur)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc_type is None:
            self._conn.commit()
        else:
            self._conn.rollback()
        self._conn.close()
        return False


def get_conn() -> _Connection:
    return _Connection(psycopg.connect(DATABASE_URL, row_factory=dict_row))


# ------------------------------------------------------------------ lifecycle
def init_db(retries: int = 30, delay: float = 1.0) -> None:
    """Create tables and seed defaults. Retries the initial connect so the app
    can start before Postgres is ready (k8s / compose ordering)."""
    last_err = None
    for _ in range(retries):
        try:
            with get_conn() as conn:
                for stmt in SCHEMA.split(";"):
                    if stmt.strip():
                        conn.execute(stmt)
            break
        except psycopg.OperationalError as err:  # DB not up yet
            last_err = err
            time.sleep(delay)
    else:
        raise RuntimeError(f"Datenbank nicht erreichbar: {last_err}")
    seed_defaults()


def seed_defaults() -> None:
    """Ensure a default user, default exercises, and default clubs exist."""
    with get_conn() as conn:
        if conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"] == 0:
            conn.execute("INSERT INTO users (name) VALUES (?)", (DEFAULT_USER,))

        if conn.execute(
            "SELECT COUNT(*) AS c FROM exercises WHERE is_default = 1"
        ).fetchone()["c"] == 0:
            conn.executemany(
                "INSERT INTO exercises (name, category, distance_cm, num_balls, is_default) "
                "VALUES (?, ?, ?, ?, 1)",
                DEFAULT_EXERCISES,
            )

        if conn.execute(
            "SELECT COUNT(*) AS c FROM clubs WHERE is_default = 1"
        ).fetchone()["c"] == 0:
            conn.executemany(
                "INSERT INTO clubs (name, abbr, sort_order, is_default) VALUES (?, ?, ?, 1)",
                DEFAULT_CLUBS,
            )
