"""Request bodies for the domain API.

User identity comes from the authenticated session (fastapi-users), so these
bodies no longer carry a ``user_id`` — it is derived from the current user.
"""
from typing import List, Optional

from pydantic import BaseModel, Field


class ExerciseCreate(BaseModel):
    name: str = Field(..., min_length=1)
    category: str = "putting"
    distance_cm: int = Field(..., gt=0)
    num_balls: int = Field(10, gt=0)


class ExerciseUpdate(BaseModel):
    """Partial update — only provided fields are changed."""
    name: Optional[str] = Field(None, min_length=1)
    category: Optional[str] = None
    distance_cm: Optional[int] = Field(None, gt=0)
    num_balls: Optional[int] = Field(None, gt=0)


class SessionCreate(BaseModel):
    exercise_id: int
    # putts needed per ball, e.g. [1, 2, 1, 3, 1, 1, 2, 1, 1, 1]
    results: List[int] = Field(..., min_length=1)
    note: Optional[str] = None


# --- Range / clubs ---
class ClubCreate(BaseModel):
    name: str = Field(..., min_length=1)
    abbr: str = Field(..., min_length=1)
    sort_order: int = 100


class ClubUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1)
    abbr: Optional[str] = Field(None, min_length=1)
    sort_order: Optional[int] = None


class ShotCreate(BaseModel):
    club_id: int
    carry_m: float = Field(..., ge=0)
    drift_m: float = 0.0  # signed: negative = left, positive = right
    tags: List[str] = []
    note: Optional[str] = None
