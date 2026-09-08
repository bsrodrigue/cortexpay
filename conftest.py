import pytest
import asyncio
from backend.src.core.database import close_db_pool
from backend.src.core.redis_client import close_redis

@pytest.fixture(autouse=True)
async def cleanup_connections():
    yield
    await close_db_pool()
    await close_redis()
