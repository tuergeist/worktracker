"""scratchlab — FastAPI backend.

Async SQLAlchemy (ORM) persistence + fastapi-users auth (Google OAuth, cookie
session). All domain endpoints require login and scope per-user data to the
authenticated user. Serves the JSON API under /api and the static frontend at /.

Run with:  uvicorn backend.app:app --reload
"""
import base64
import json
import os
import sys
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

# Reuse the standalone putt-analyzer module (green-photo analysis).
sys.path.insert(0, str(Path(__file__).parent.parent / "tools" / "putt-analyzer"))
try:
    import putt_analyze
except Exception:  # heavy deps (numpy/scipy/PIL) may be absent in some setups
    putt_analyze = None

from . import db
from .db import Club, Exercise, Session, Shot, User, get_async_session
from .models import (
    ClubCreate,
    ClubUpdate,
    ExerciseCreate,
    ExerciseUpdate,
    SessionCreate,
    SessionUpdate,
    ShotCreate,
)
from .schemas import UserRead, UserUpdate
from .stats import aggregate_stats, club_stats, session_stats
from .users import auth_backend, current_active_user, fastapi_users, google_oauth_client
from .users import SESSION_SECRET, get_jwt_strategy

# Dev-only password-less login for local/automated testing. Never enable in prod.
DEV_LOGIN = os.environ.get("DEV_LOGIN", "").lower() in ("1", "true", "yes")

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Schema is applied by Alembic (migrate step); here we just wait for the DB
    # and seed the global default catalogue (idempotent).
    await db.wait_for_db()
    await db.seed_defaults()
    yield


app = FastAPI(title="scratchlab", lifespan=lifespan)


# ------------------------------------------------------------------ auth routes
# Google OAuth: GET /api/auth/google/authorize -> {authorization_url};
# GET /api/auth/google/callback -> sets cookie + 302 to "/".
app.include_router(
    fastapi_users.get_oauth_router(
        google_oauth_client,
        auth_backend,
        SESSION_SECRET,
        associate_by_email=True,
        is_verified_by_default=True,
    ),
    prefix="/api/auth/google",
    tags=["auth"],
)
# Cookie auth: POST /api/auth/cookie/logout (login-by-password unused for now).
app.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="/api/auth/cookie",
    tags=["auth"],
)
# User self-service: GET /api/users/me, PATCH /api/users/me.
app.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/api/users",
    tags=["users"],
)


# ---------------------------------------------------------------- serializers
def _exercise_dict(e: Exercise, session_count: int = 0) -> dict:
    return {
        "id": e.id,
        "name": e.name,
        "category": e.category,
        "distance_cm": e.distance_cm,
        "distance_m": round(e.distance_cm / 100, 2),
        "num_balls": e.num_balls,
        "is_default": bool(e.is_default),
        "created_at": e.created_at,
        "session_count": session_count,
    }


def _session_dict(s: Session) -> dict:
    results = json.loads(s.results_json)
    return {
        "id": s.id,
        "user_id": s.user_id,
        "exercise_id": s.exercise_id,
        "played_at": s.played_at,
        "results": results,
        "note": s.note,
        "stats": session_stats(results),
    }


def _club_dict(c: Club) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "abbr": c.abbr,
        "sort_order": c.sort_order,
        "is_default": bool(c.is_default),
        "created_at": c.created_at,
    }


def _shot_dict(s: Shot) -> dict:
    return {
        "id": s.id,
        "user_id": s.user_id,
        "club_id": s.club_id,
        "carry_m": s.carry_m,
        "drift_m": s.drift_m,
        "tags": json.loads(s.tags_json),
        "note": s.note,
        "played_at": s.played_at,
    }


# --------------------------------------------------------------- exercises
@app.get("/api/exercises")
async def list_exercises(
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    rows = (
        await session.scalars(
            select(Exercise).order_by(Exercise.category, Exercise.distance_cm, Exercise.id)
        )
    ).all()
    # session counts are per-user; one grouped query, then map onto the list
    counts = dict(
        (
            await session.execute(
                select(Session.exercise_id, func.count(Session.id))
                .where(Session.user_id == user.id)
                .group_by(Session.exercise_id)
            )
        ).all()
    )
    return [_exercise_dict(e, counts.get(e.id, 0)) for e in rows]


@app.post("/api/exercises", status_code=201)
async def create_exercise(
    body: ExerciseCreate,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    ex = Exercise(
        name=body.name,
        category=body.category,
        distance_cm=body.distance_cm,
        num_balls=body.num_balls,
        is_default=False,
    )
    session.add(ex)
    await session.commit()
    await session.refresh(ex)
    return _exercise_dict(ex)


@app.patch("/api/exercises/{exercise_id}")
async def update_exercise(
    exercise_id: int,
    body: ExerciseUpdate,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    ex = await session.get(Exercise, exercise_id)
    if ex is None:
        raise HTTPException(404, "Exercise not found")
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(400, "No fields to update")
    for k, v in fields.items():
        setattr(ex, k, v)
    await session.commit()
    await session.refresh(ex)
    return _exercise_dict(ex)


@app.delete("/api/exercises/{exercise_id}", status_code=204)
async def delete_exercise(
    exercise_id: int,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    ex = await session.get(Exercise, exercise_id)
    if ex is None:
        raise HTTPException(404, "Exercise not found")
    await session.delete(ex)
    await session.commit()
    return None


# ---------------------------------------------------------------- sessions
@app.post("/api/sessions", status_code=201)
async def create_session(
    body: SessionCreate,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    if await session.get(Exercise, body.exercise_id) is None:
        raise HTTPException(404, "Exercise not found")
    if any(p < 1 for p in body.results):
        raise HTTPException(400, "Each ball needs at least 1 putt")
    s = Session(
        user_id=user.id,
        exercise_id=body.exercise_id,
        results_json=json.dumps(body.results),
        note=body.note,
    )
    session.add(s)
    await session.commit()
    await session.refresh(s)
    return _session_dict(s)


async def _user_sessions(session: AsyncSession, user_id: int, exercise_id: int):
    return (
        await session.scalars(
            select(Session)
            .where(Session.exercise_id == exercise_id, Session.user_id == user_id)
            .order_by(Session.played_at.desc(), Session.id.desc())
        )
    ).all()


@app.get("/api/sessions")
async def list_sessions(
    exercise_id: int,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    rows = await _user_sessions(session, user.id, exercise_id)
    return [_session_dict(s) for s in rows]


@app.patch("/api/sessions/{session_id}")
async def update_session(
    session_id: int,
    body: SessionUpdate,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    s = await session.get(Session, session_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(404, "Session not found")
    s.played_at = body.played_at
    await session.commit()
    await session.refresh(s)
    return _session_dict(s)


@app.delete("/api/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: int,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    result = await session.execute(
        delete(Session).where(Session.id == session_id, Session.user_id == user.id)
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Session not found")
    await session.commit()
    return None


@app.get("/api/exercises/{exercise_id}/stats")
async def exercise_stats(
    exercise_id: int,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    rows = await _user_sessions(session, user.id, exercise_id)  # newest-first
    return aggregate_stats([_session_dict(s) for s in rows])


# ----------------------------------------------------------- range: clubs
@app.get("/api/shot-tags")
async def shot_tags(user: User = Depends(current_active_user)):
    return db.DEFAULT_SHOT_TAGS


@app.get("/api/clubs")
async def list_clubs(
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    rows = (
        await session.scalars(select(Club).order_by(Club.sort_order, Club.id))
    ).all()
    return [_club_dict(c) for c in rows]


@app.post("/api/clubs", status_code=201)
async def create_club(
    body: ClubCreate,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    c = Club(name=body.name, abbr=body.abbr, sort_order=body.sort_order, is_default=False)
    session.add(c)
    await session.commit()
    await session.refresh(c)
    return _club_dict(c)


@app.patch("/api/clubs/{club_id}")
async def update_club(
    club_id: int,
    body: ClubUpdate,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    c = await session.get(Club, club_id)
    if c is None:
        raise HTTPException(404, "Club not found")
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(400, "No fields to update")
    for k, v in fields.items():
        setattr(c, k, v)
    await session.commit()
    await session.refresh(c)
    return _club_dict(c)


@app.delete("/api/clubs/{club_id}", status_code=204)
async def delete_club(
    club_id: int,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    c = await session.get(Club, club_id)
    if c is None:
        raise HTTPException(404, "Club not found")
    await session.delete(c)
    await session.commit()
    return None


# ------------------------------------------------------------- range: shots
@app.post("/api/shots", status_code=201)
async def create_shot(
    body: ShotCreate,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    if await session.get(Club, body.club_id) is None:
        raise HTTPException(404, "Club not found")
    s = Shot(
        user_id=user.id,
        club_id=body.club_id,
        carry_m=body.carry_m,
        drift_m=body.drift_m,
        tags_json=json.dumps(body.tags),
        note=body.note,
    )
    session.add(s)
    await session.commit()
    await session.refresh(s)
    return _shot_dict(s)


async def _user_shots(session: AsyncSession, user_id: int, club_id: int):
    return (
        await session.scalars(
            select(Shot)
            .where(Shot.club_id == club_id, Shot.user_id == user_id)
            .order_by(Shot.played_at.desc(), Shot.id.desc())
        )
    ).all()


@app.get("/api/shots")
async def list_shots(
    club_id: int,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    rows = await _user_shots(session, user.id, club_id)
    return [_shot_dict(s) for s in rows]


@app.delete("/api/shots/{shot_id}", status_code=204)
async def delete_shot(
    shot_id: int,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    result = await session.execute(
        delete(Shot).where(Shot.id == shot_id, Shot.user_id == user.id)
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Shot not found")
    await session.commit()
    return None


@app.get("/api/clubs/{club_id}/stats")
async def club_statistics(
    club_id: int,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    rows = await _user_shots(session, user.id, club_id)  # newest-first
    return club_stats([_shot_dict(s) for s in rows])


# ------------------------------------------------------- green photo analysis
@app.post("/api/analyze-putt")
async def analyze_putt(
    photo: UploadFile = File(...),
    putter_inch: int = 34,
    user: User = Depends(current_active_user),
):
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


# ------------------------------------------------------------- dev login
@app.get("/api/auth/dev-login")
async def dev_login(session: AsyncSession = Depends(get_async_session)):
    """Password-less login for local dev / automated tests. Gated by DEV_LOGIN;
    returns 404 unless explicitly enabled (never set in production)."""
    if not DEV_LOGIN:
        raise HTTPException(404, "Not found")
    user = (
        await session.scalars(select(User).where(User.email == "dev@scratchlab.app"))
    ).first()
    if user is None:
        user = User(
            email="dev@scratchlab.app",
            hashed_password="!dev",  # unusable password; dev login is cookie-only
            is_active=True,
            is_verified=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
    # Reuse the cookie backend → sets the auth cookie + 302 redirect to "/".
    return await auth_backend.login(get_jwt_strategy(), user)


# ----------------------------------------------------------------- static
# Frontend assets are served under stable, unhashed names (index.html, js/*.js,
# styles.css). Without Cache-Control browsers cache them heuristically and serve
# stale markup for hours after a deploy (users saw old UI: missing buttons etc).
# no-cache = revalidate via ETag on every request (cheap 304s), always current.
@app.middleware("http")
async def _revalidate_static(request, call_next):
    resp = await call_next(request)
    if not request.url.path.startswith("/api"):
        ct = resp.headers.get("content-type", "")
        if any(t in ct for t in ("text/html", "javascript", "text/css")):
            resp.headers["Cache-Control"] = "no-cache"
    return resp


# Mounted last so /api routes take precedence.
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
