"""Golf training app — FastAPI backend.

Serves a JSON API under /api and the static frontend at /.
Run with:  uvicorn backend.app:app --reload
"""
import base64
import json
import os
import sys
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles

# Reuse the standalone putt-analyzer module (green-photo analysis).
sys.path.insert(0, str(Path(__file__).parent.parent / "tools" / "putt-analyzer"))
try:
    import putt_analyze
except Exception:  # heavy deps (numpy/scipy/PIL) may be absent in some setups
    putt_analyze = None

from . import db
from .models import (
    ClubCreate,
    ClubUpdate,
    ExerciseCreate,
    ExerciseUpdate,
    SessionCreate,
    ShotCreate,
    UserCreate,
)
from .stats import aggregate_stats, club_stats, session_stats

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

app = FastAPI(title="scratchlab")

db.init_db()


# ---------------------------------------------------------------- helpers
def _user_dict(row) -> dict:
    return {"id": row["id"], "name": row["name"], "created_at": row["created_at"]}


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
        "user_id": row["user_id"],
        "exercise_id": row["exercise_id"],
        "played_at": row["played_at"],
        "results": results,
        "note": row["note"],
        "stats": session_stats(results),
    }


def _club_dict(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "abbr": row["abbr"],
        "sort_order": row["sort_order"],
        "is_default": bool(row["is_default"]),
        "created_at": row["created_at"],
    }


def _shot_dict(row) -> dict:
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "club_id": row["club_id"],
        "carry_m": row["carry_m"],
        "drift_m": row["drift_m"],
        "tags": json.loads(row["tags_json"]),
        "note": row["note"],
        "played_at": row["played_at"],
    }


# -------------------------------------------------------------------- users
@app.get("/api/users")
def list_users():
    with db.get_conn() as conn:
        rows = conn.execute("SELECT * FROM users ORDER BY id").fetchall()
    return [_user_dict(r) for r in rows]


@app.post("/api/users", status_code=201)
def create_user(body: UserCreate):
    with db.get_conn() as conn:
        cur = conn.execute("INSERT INTO users (name) VALUES (?)", (body.name,))
        row = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return _user_dict(row)


@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: int):
    with db.get_conn() as conn:
        remaining = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
        if remaining <= 1:
            raise HTTPException(400, "Cannot delete the last user")
        cur = conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "User not found")
    return None


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


@app.patch("/api/exercises/{exercise_id}")
def update_exercise(exercise_id: int, body: ExerciseUpdate):
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(400, "No fields to update")
    assignments = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [exercise_id]
    with db.get_conn() as conn:
        cur = conn.execute(
            f"UPDATE exercises SET {assignments} WHERE id = ?", values
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Exercise not found")
        row = conn.execute(
            "SELECT * FROM exercises WHERE id = ?", (exercise_id,)
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
        if conn.execute(
            "SELECT 1 FROM users WHERE id = ?", (body.user_id,)
        ).fetchone() is None:
            raise HTTPException(404, "User not found")
        if conn.execute(
            "SELECT 1 FROM exercises WHERE id = ?", (body.exercise_id,)
        ).fetchone() is None:
            raise HTTPException(404, "Exercise not found")
        if any(p < 1 for p in body.results):
            raise HTTPException(400, "Each ball needs at least 1 putt")
        cur = conn.execute(
            "INSERT INTO sessions (user_id, exercise_id, results_json, note) "
            "VALUES (?, ?, ?, ?)",
            (body.user_id, body.exercise_id, json.dumps(body.results), body.note),
        )
        row = conn.execute(
            "SELECT * FROM sessions WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
    return _session_dict(row)


@app.get("/api/sessions")
def list_sessions(exercise_id: int, user_id: int):
    with db.get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM sessions WHERE exercise_id = ? AND user_id = ? "
            "ORDER BY played_at DESC, id DESC",
            (exercise_id, user_id),
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
def exercise_stats(exercise_id: int, user_id: int):
    sessions = list_sessions(exercise_id, user_id)  # newest-first, each with 'stats'
    return aggregate_stats(sessions)


# ----------------------------------------------------------- range: clubs
@app.get("/api/shot-tags")
def shot_tags():
    return db.DEFAULT_SHOT_TAGS


@app.get("/api/clubs")
def list_clubs():
    with db.get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM clubs ORDER BY sort_order, id"
        ).fetchall()
    return [_club_dict(r) for r in rows]


@app.post("/api/clubs", status_code=201)
def create_club(body: ClubCreate):
    with db.get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO clubs (name, abbr, sort_order, is_default) VALUES (?, ?, ?, 0)",
            (body.name, body.abbr, body.sort_order),
        )
        row = conn.execute("SELECT * FROM clubs WHERE id = ?", (cur.lastrowid,)).fetchone()
    return _club_dict(row)


@app.patch("/api/clubs/{club_id}")
def update_club(club_id: int, body: ClubUpdate):
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(400, "No fields to update")
    assignments = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [club_id]
    with db.get_conn() as conn:
        cur = conn.execute(f"UPDATE clubs SET {assignments} WHERE id = ?", values)
        if cur.rowcount == 0:
            raise HTTPException(404, "Club not found")
        row = conn.execute("SELECT * FROM clubs WHERE id = ?", (club_id,)).fetchone()
    return _club_dict(row)


@app.delete("/api/clubs/{club_id}", status_code=204)
def delete_club(club_id: int):
    with db.get_conn() as conn:
        cur = conn.execute("DELETE FROM clubs WHERE id = ?", (club_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Club not found")
    return None


# ------------------------------------------------------------- range: shots
@app.post("/api/shots", status_code=201)
def create_shot(body: ShotCreate):
    with db.get_conn() as conn:
        if conn.execute("SELECT 1 FROM users WHERE id = ?", (body.user_id,)).fetchone() is None:
            raise HTTPException(404, "User not found")
        if conn.execute("SELECT 1 FROM clubs WHERE id = ?", (body.club_id,)).fetchone() is None:
            raise HTTPException(404, "Club not found")
        cur = conn.execute(
            "INSERT INTO shots (user_id, club_id, carry_m, drift_m, tags_json, note) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                body.user_id,
                body.club_id,
                body.carry_m,
                body.drift_m,
                json.dumps(body.tags),
                body.note,
            ),
        )
        row = conn.execute("SELECT * FROM shots WHERE id = ?", (cur.lastrowid,)).fetchone()
    return _shot_dict(row)


@app.get("/api/shots")
def list_shots(club_id: int, user_id: int):
    with db.get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM shots WHERE club_id = ? AND user_id = ? "
            "ORDER BY played_at DESC, id DESC",
            (club_id, user_id),
        ).fetchall()
    return [_shot_dict(r) for r in rows]


@app.delete("/api/shots/{shot_id}", status_code=204)
def delete_shot(shot_id: int):
    with db.get_conn() as conn:
        cur = conn.execute("DELETE FROM shots WHERE id = ?", (shot_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Shot not found")
    return None


@app.get("/api/clubs/{club_id}/stats")
def club_statistics(club_id: int, user_id: int):
    shots = list_shots(club_id, user_id)  # newest-first
    return club_stats(shots)


# ------------------------------------------------------- green photo analysis
@app.post("/api/analyze-putt")
async def analyze_putt(photo: UploadFile = File(...), putter_inch: int = 34):
    """Analyse a putting-green photo: detect hole/putter/balls and report the
    dispersion relative to the putter→hole line. Uses the Claude VLM + CV."""
    if putt_analyze is None:
        raise HTTPException(503, "Analyse nicht verfügbar (Abhängigkeiten fehlen).")
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise HTTPException(503, "ANTHROPIC_API_KEY ist nicht gesetzt.")
    if putter_inch not in (33, 34, 35):
        putter_inch = 34

    data = await photo.read()
    tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    tmp.write(data)
    tmp.close()
    out_png = tmp.name + ".png"
    try:
        res = putt_analyze.analyze(
            tmp.name, detector="hybrid", provider="anthropic", putter_inch=putter_inch
        )
        st = putt_analyze.putting_stats(res)
        putt_analyze.annotate(res, out_png)
        with open(out_png, "rb") as fh:
            annotated_b64 = base64.b64encode(fh.read()).decode()
    except Exception as exc:  # VLM/network/parse failures → surface to the client
        raise HTTPException(502, f"Analyse fehlgeschlagen: {exc}")
    finally:
        for p in (tmp.name, out_png):
            try:
                os.remove(p)
            except OSError:
                pass

    payload = {
        "total": res.total,
        "balls_in_hole": res.balls_in_hole,
        "within": res.within,
        "radius_m": res.radius_m,
        "annotated_png_b64": annotated_b64,
    }
    if st is not None:
        payload.update({
            "zones": {"good": st["good"], "bad": st["bad"], "mist": st["mist"]},
            "tendency": {
                # long > 0 = zu kurz; lat > 0 = rechts (see putt_analyze.putting_stats)
                "long_cm": round(st["mean_long"] * 100),
                "lat_cm": round(st["mean_lat"] * 100),
            },
            "dispersion": {
                "long_cm": round(st["std_long"] * 100),
                "lat_cm": round(st["std_lat"] * 100),
            },
            "balls": [
                {
                    "dist_m": round(b["dist"], 2),
                    "long_cm": round(b["long"] * 100),
                    "lat_cm": round(b["lat"] * 100),
                }
                for b in sorted(st["balls"], key=lambda b: b["dist"])
            ],
        })
    return payload


# ----------------------------------------------------------------- static
# Mounted last so /api routes take precedence.
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
