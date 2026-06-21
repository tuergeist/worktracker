"""Alembic environment (async, asyncpg).

Reads DATABASE_URL from the environment and uses the SQLAlchemy models'
metadata as the autogenerate target. A Postgres advisory lock serialises
concurrent `upgrade` runs (e.g. multiple k8s pods) so they never race.
"""
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

# Import models so Base.metadata is fully populated.
from backend.db import DATABASE_URL, Base  # noqa: E402

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Arbitrary, stable lock id shared by all instances running migrations.
_MIGRATION_LOCK_ID = 728432


def run_migrations_offline() -> None:
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        # Serialise concurrent upgrades; lock is released at transaction end.
        connection.exec_driver_sql(f"SELECT pg_advisory_xact_lock({_MIGRATION_LOCK_ID})")
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
