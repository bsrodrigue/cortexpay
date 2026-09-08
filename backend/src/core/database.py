import asyncpg
from typing import AsyncGenerator
from backend.src.core.config import settings

_pool: asyncpg.Pool | None = None

async def init_db_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None or _pool._closed:
        _pool = await asyncpg.create_pool(
            dsn=settings.DATABASE_URL,
            min_size=2,
            max_size=10,
            command_timeout=10,
        )
    return _pool

async def close_db_pool():
    global _pool
    if _pool is not None and not _pool._closed:
        await _pool.close()
        _pool = None

async def get_db_connection() -> AsyncGenerator[asyncpg.Connection, None]:
    pool = await init_db_pool()
    async with pool.acquire() as conn:
        yield conn

def get_pool() -> asyncpg.Pool:
    if _pool is None or _pool._closed:
        raise RuntimeError("Database connection pool not initialized.")
    return _pool
