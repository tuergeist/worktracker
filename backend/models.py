"""Request/response schemas."""
from typing import List, Optional

from pydantic import BaseModel, Field


class ExerciseCreate(BaseModel):
    name: str = Field(..., min_length=1)
    category: str = "putting"
    distance_cm: int = Field(..., gt=0)
    num_balls: int = Field(10, gt=0)


class SessionCreate(BaseModel):
    exercise_id: int
    # putts needed per ball, e.g. [1, 2, 1, 3, 1, 1, 2, 1, 1, 1]
    results: List[int] = Field(..., min_length=1)
    note: Optional[str] = None
