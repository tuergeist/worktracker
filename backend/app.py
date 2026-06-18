"""Golf training app — FastAPI backend.

Serves a JSON API under /api and the static frontend at /.
Run with:  uvicorn backend.app:app --reload
"""
import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from . import db
from .models import ExerciseCreate, SessionCreate
from .stats import aggregate_stats, session_stats

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

app = FastAPI(title="Golf Training — Putting")

db.init_db()


# ---------------------------------------------------------------- helpers
def _exercise_dict(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "category": row["category"],
        "distance_cm": row["distance_cm"],
        "distance_m": round(row["distance_cm"] / 100, 2),
        "num_balls": row["num_balls"],
        "is_default": bool(row["is_default"]),
        "created_at": row["created_at"],
    }


def _session_dict(row) -> dict:
    results = json.loads(row["results_json"])
    return {
        "id": row["id"],
        "exercise_id": row["exercise_id"],
        "played_at": row["played_at"],
        "results": results,
        "note": row["note"],
        "stats": session_stats(results),
    }


# --------------------------------------------------------------- exercises
@app.get("/api/exercises")
def list_exercises():
    with db.get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM exercises ORDER BY category, distance_cm, id"
        ).fetchall()
    return [_exercise_dict(r) for r in rows]


@app.post("/api/exercises", status_code=201)
def create_exercise(body: ExerciseCreate):
    with db.get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO exercises (name, category, distance_cm, num_balls, is_default) "
            "VALUES (?, ?, ?, ?, 0)",
            (body.name, body.category, body.distance_cm, body.num_balls),
        )
        row = conn.execute(
            "SELECT * FROM exercises WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
    return _exercise_dict(row)


@app.delete("/api/exercises/{exercise_id}", status_code=204)
def delete_exercise(exercise_id: int):
    with db.get_conn() as conn:
        cur = conn.execute("DELETE FROM exercises WHERE id = ?", (exercise_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Exercise not found")
    return None


# ---------------------------------------------------------------- sessions
@app.post("/api/sessions", status_code=201)
def create_session(body: SessionCreate):
    with db.get_conn() as conn:
        ex = conn.execute(
            "SELECT * FROM exercises WHERE id = ?", (body.exercise_id,)
        ).fetchone()
        if ex is None:
            raise HTTPException(404, "Exercise not found")
        if any(p < 1 for p in body.results):
            raise HTTPException(400, "Each ball needs at least 1 putt")
        cur = conn.execute(
            "INSERT INTO sessions (exercise_id, results_json, note) VALUES (?, ?, ?)",
            (body.exercise_id, json.dumps(body.results), body.note),
        )
        row = conn.execute(
            "SELECT * FROM sessions WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
    return _session_dict(row)


@app.get("/api/sessions")
def list_sessions(exercise_id: int):
    with db.get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM sessions WHERE exercise_id = ? ORDER BY played_at DESC, id DESC",
            (exercise_id,),
        ).fetchall()
    return [_session_dict(r) for r in rows]


@app.delete("/api/sessions/{session_id}", status_code=204)
def delete_session(session_id: int):
    with db.get_conn() as conn:
        cur = conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Session not found")
    return None


@app.get("/api/exercises/{exercise_id}/stats")
def exercise_stats(exercise_id: int):
    sessions = list_sessions(exercise_id)  # newest-first, each with 'stats'
    return aggregate_stats(sessions)


# ----------------------------------------------------------------- static
# Mounted last so /api routes take precedence.
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
