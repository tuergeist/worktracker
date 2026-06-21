"""Async SQLAlchemy 2.0 persistence layer for the golf training app.

Uses asyncpg via SQLAlchemy's async engine. The ORM models below back both the
domain tables and the fastapi-users auth tables (users + oauth_accounts).

Timestamps (played_at / created_at) are stored as TEXT in UTC
("YYYY-MM-DD HH:MM:SS") so the JSON API contract is preserved verbatim:
the frontend does ``new Date(value + "Z")`` and stats.py does ``played_at[:10]``.
The server default is computed in Postgres via to_char(now() AT TIME ZONE 'UTC').

Configure with DATABASE_URL, e.g.
    postgresql+asyncpg://worktracker:worktracker@localhost:5432/worktracker

Data model:
  users          — authenticated accounts (fastapi-users)
  oauth_accounts — linked OAuth identities (fastapi-users)
  exercises      — shared training catalogue (GLOBAL: default + custom)
  sessions       — one recorded attempt of an exercise, belongs to a user
  clubs          — driving-range club catalogue (GLOBAL)
  shots          — one driving-range shot, belongs to a user
"""
import asyncio
import os

import asyncpg
from fastapi import Depends
from fastapi_users.db import SQLAlchemyBaseOAuthAccountTable, SQLAlchemyBaseUserTable, SQLAlchemyUserDatabase
from sqlalchemy import ForeignKey, Integer, String, Text, Boolean, Float, func, select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, declared_attr, mapped_column, relationship

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://worktracker:worktracker@localhost:5432/worktracker",
)

# UTC, second precision, no timezone suffix — matches the historical TEXT format.
_TS_DEFAULT = text("to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD HH24:MI:SS')")


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------- auth tables
class OAuthAccount(SQLAlchemyBaseOAuthAccountTable[int], Base):
    __tablename__ = "oauth_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Base class defaults the FK to "user.id"; our user table is "users".
    @declared_attr
    def user_id(cls) -> Mapped[int]:
        return mapped_column(
            Integer, ForeignKey("users.id", ondelete="cascade"), nullable=False
        )


class User(SQLAlchemyBaseUserTable[int], Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    oauth_accounts: Mapped[list[OAuthAccount]] = relationship(
        "OAuthAccount", lazy="joined"
    )


# -------------------------------------------------------------- domain tables
class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False, default="putting")
    distance_cm: Mapped[int] = mapped_column(Integer, nullable=False)
    num_balls: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=_TS_DEFAULT)


class Club(Base):
    __tablename__ = "clubs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    abbr: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=_TS_DEFAULT)


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    exercise_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False
    )
    results_json: Mapped[str] = mapped_column(Text, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    played_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=_TS_DEFAULT)


class Shot(Base):
    __tablename__ = "shots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    club_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    carry_m: Mapped[float] = mapped_column(Float, nullable=False)
    drift_m: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    tags_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]", server_default="[]")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    played_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=_TS_DEFAULT)


# ----------------------------------------------------------------- defaults
# (name, category, distance_cm, num_balls)
DEFAULT_EXERCISES = [
    ("Putten 1m", "putting", 100, 10),
    ("Putten 2m", "putting", 200, 10),
    ("Putten 3m", "putting", 300, 10),
]

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


# ------------------------------------------------------------------ engine
engine = create_async_engine(DATABASE_URL)
async_session_maker = async_sessionmaker(engine, expire_on_commit=False)


async def get_async_session():
    async with async_session_maker() as session:
        yield session


async def get_user_db(session: AsyncSession = Depends(get_async_session)):
    yield SQLAlchemyUserDatabase(session, User, OAuthAccount)


# ------------------------------------------------------------------ lifecycle
async def create_db_and_tables(retries: int = 30, delay: float = 1.0) -> None:
    """Create all tables. Retries the initial connect so the app can start
    before Postgres is ready (k8s / compose ordering)."""
    last_err: Exception | None = None
    for _ in range(retries):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            return
        except (OSError, OperationalError, asyncpg.PostgresError) as err:  # DB not up yet
            last_err = err
            await asyncio.sleep(delay)
    raise RuntimeError(f"Datenbank nicht erreichbar: {last_err}")


async def seed_defaults() -> None:
    """Ensure the GLOBAL default exercises and clubs exist.

    Clubs/exercises are global; users come from Google login, so no default
    user is created here.
    """
    async with async_session_maker() as session:
        have_ex = await session.scalar(
            select(func.count()).select_from(Exercise).where(Exercise.is_default.is_(True))
        )
        if not have_ex:
            session.add_all(
                Exercise(
                    name=name,
                    category=category,
                    distance_cm=distance_cm,
                    num_balls=num_balls,
                    is_default=True,
                )
                for name, category, distance_cm, num_balls in DEFAULT_EXERCISES
            )

        have_clubs = await session.scalar(
            select(func.count()).select_from(Club).where(Club.is_default.is_(True))
        )
        if not have_clubs:
            session.add_all(
                Club(name=name, abbr=abbr, sort_order=sort_order, is_default=True)
                for name, abbr, sort_order in DEFAULT_CLUBS
            )

        await session.commit()
