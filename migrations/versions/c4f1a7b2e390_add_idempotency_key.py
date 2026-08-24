"""add idempotency_key to sessions, shots and plan_runs

Revision ID: c4f1a7b2e390
Revises: 0d2322e915a3
Create Date: 2026-08-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4f1a7b2e390"
down_revision: Union[str, None] = "0d2322e915a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("sessions", "shots", "plan_runs")


def upgrade() -> None:
    for t in TABLES:
        op.add_column(t, sa.Column("idempotency_key", sa.Text(), nullable=True))
        # Partial index: every existing row has NULL here, and a plain unique
        # index would treat those as distinct in Postgres but still cost space.
        # Scoped to the user so two people cannot collide on the same key.
        op.create_index(
            f"uq_{t}_user_idempotency_key",
            t,
            ["user_id", "idempotency_key"],
            unique=True,
            postgresql_where=sa.text("idempotency_key IS NOT NULL"),
            sqlite_where=sa.text("idempotency_key IS NOT NULL"),
        )


def downgrade() -> None:
    for t in TABLES:
        op.drop_index(f"uq_{t}_user_idempotency_key", table_name=t)
        op.drop_column(t, "idempotency_key")
