from decimal import Decimal, ROUND_HALF_UP
import random
import uuid
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
import asyncpg
import redis.asyncio as aioredis
from backend.src.core.config import settings

class FXQuoteExpiredError(Exception):
    pass

class FXQuoteNotFoundError(Exception):
    pass

class FXEngineService:
    @staticmethod
    def get_market_rate(pair: str = "USD/XOF") -> Decimal:
        base_rate = Decimal(str(settings.DEFAULT_FX_RATE_USD_XOF))
        return base_rate.quantize(Decimal("0.0001"))

    @staticmethod
    def calculate_spread(pair: str = "USD/XOF") -> Decimal:
        min_spread = int(settings.MIN_SPREAD_PCT * 10000)
        max_spread = int(settings.MAX_SPREAD_PCT * 10000)
        spread_val = Decimal(random.randint(min_spread, max_spread)) / Decimal("10000")
        return spread_val.quantize(Decimal("0.0001"))

    @staticmethod
    async def create_locked_quote(
        conn: asyncpg.Connection,
        redis_client: aioredis.Redis,
        user_id: str,
        from_amount_xof: Decimal,
        from_currency: str = "XOF",
        to_currency: str = "USD",
    ) -> Dict[str, Any]:
        market_rate = FXEngineService.get_market_rate()
        spread_pct = FXEngineService.calculate_spread()

        effective_rate = (market_rate * (Decimal("1") + spread_pct)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        to_amount_usd = (from_amount_xof / effective_rate).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

        quote_id = f"quote_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=settings.FX_QUOTE_TTL_SECONDS)

        quote_payload = {
            "quote_id": quote_id,
            "user_id": user_id,
            "from_currency": from_currency,
            "to_currency": to_currency,
            "from_amount": str(from_amount_xof),
            "to_amount": str(to_amount_usd),
            "market_rate": str(market_rate),
            "spread_pct": str(spread_pct),
            "effective_rate": str(effective_rate),
            "status": "ACTIVE",
            "created_at": now.isoformat(),
            "expires_at": expires_at.isoformat(),
        }

        # Redis set with ex (non-deprecated)
        redis_key = f"fx:quote:{quote_id}"
        await redis_client.set(
            redis_key,
            json.dumps(quote_payload),
            ex=settings.FX_QUOTE_TTL_SECONDS
        )

        await conn.execute(
            """
            INSERT INTO fx_quotes (quote_id, user_id, from_currency, to_currency, from_amount, to_amount, market_rate, spread_pct, effective_rate, status, expires_at, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', $10, $11);
            """,
            quote_id,
            user_id,
            from_currency,
            to_currency,
            from_amount_xof,
            to_amount_usd,
            market_rate,
            spread_pct,
            effective_rate,
            expires_at,
            now
        )

        return {
            "quote_id": quote_id,
            "user_id": user_id,
            "from_currency": from_currency,
            "to_currency": to_currency,
            "from_amount": from_amount_xof,
            "to_amount": to_amount_usd,
            "market_rate": market_rate,
            "spread_pct": spread_pct,
            "effective_rate": effective_rate,
            "expires_at": expires_at,
            "ttl_remaining_seconds": settings.FX_QUOTE_TTL_SECONDS,
        }

    @staticmethod
    async def get_and_validate_quote(
        conn: asyncpg.Connection,
        redis_client: aioredis.Redis,
        quote_id: str
    ) -> Dict[str, Any]:
        redis_key = f"fx:quote:{quote_id}"
        cached_data = await redis_client.get(redis_key)
        ttl = await redis_client.ttl(redis_key)

        if not cached_data or ttl <= 0:
            await conn.execute("UPDATE fx_quotes SET status = 'EXPIRED' WHERE quote_id = $1", quote_id)
            raise FXQuoteExpiredError("FX Quote has expired (Strict TTL 90s exceeded).")

        row = await conn.fetchrow("SELECT * FROM fx_quotes WHERE quote_id = $1", quote_id)
        if not row:
            raise FXQuoteNotFoundError(f"FX Quote {quote_id} not found.")

        if row["status"] != "ACTIVE":
            raise FXQuoteExpiredError(f"FX Quote is already {row['status']}.")

        data = dict(row)
        data["ttl_remaining_seconds"] = max(0, ttl)
        return data

    @staticmethod
    async def mark_quote_executed(
        conn: asyncpg.Connection,
        redis_client: aioredis.Redis,
        quote_id: str
    ):
        await conn.execute("UPDATE fx_quotes SET status = 'EXECUTED' WHERE quote_id = $1", quote_id)
        await redis_client.delete(f"fx:quote:{quote_id}")
