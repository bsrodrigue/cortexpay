import redis.asyncio as aioredis
from backend.src.core.config import settings

_redis: aioredis.Redis | None = None

async def init_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis

async def get_redis() -> aioredis.Redis:
    if _redis is None:
        return await init_redis()
    return _redis

async def close_redis():
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None
