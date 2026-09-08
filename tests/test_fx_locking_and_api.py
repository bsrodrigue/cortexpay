import pytest
from decimal import Decimal
import uuid
import asyncio
from httpx import AsyncClient, ASGITransport
from backend.src.main import app
from backend.src.core.config import settings
from backend.src.core.redis_client import init_redis, close_redis

@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

@pytest.mark.asyncio(loop_scope="function")
async def test_api_health(client):
    res = await client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

@pytest.mark.asyncio(loop_scope="function")
async def test_fx_quote_locking_and_expiry(client):
    """
    S2 J6-J7: Rejet immédiat du devis de change après 90 secondes.
    """
    user_id = f"usr_fx_{uuid.uuid4().hex[:6]}"

    # 1. Deposit funds first
    dep = await client.post("/api/deposit/mobile-money", json={
        "user_id": user_id,
        "phone_number": "+221770003344",
        "operator": "WAVE",
        "amount": "100000.0000",
        "otp_code": "123456"
    })
    assert dep.status_code == 200

    # 2. Get locked quote
    quote_res = await client.post("/api/fx/quote", json={
        "user_id": user_id,
        "from_amount_xof": "50000.0000"
    })
    assert quote_res.status_code == 200
    q_data = quote_res.json()
    quote_id = q_data["quote_id"]
    assert q_data["ttl_remaining_seconds"] == 90

    # 3. Simulate quote expiration by setting Redis TTL to 0
    redis = await init_redis()
    await redis.delete(f"fx:quote:{quote_id}")

    # 4. Attempt to convert with expired quote -> Must return 410 GONE
    conv_res = await client.post("/api/fx/convert", json={
        "user_id": user_id,
        "quote_id": quote_id,
        "idempotency_key": f"IDEM_{quote_id}"
    })
    assert conv_res.status_code == 410
    assert "expired" in conv_res.json()["detail"].lower()

@pytest.mark.asyncio(loop_scope="function")
async def test_card_freeze_and_refusal(client):
    """
    S2 J8-J10: Refus marchand si carte gelée ou fonds insuffisants
    """
    user_id = f"usr_card_{uuid.uuid4().hex[:6]}"

    # Deposit + FX convert to have USD
    await client.post("/api/deposit/mobile-money", json={
        "user_id": user_id,
        "phone_number": "+221770005566",
        "operator": "ORANGE_MONEY",
        "amount": "150000.0000",
        "otp_code": "123456"
    })
    q = await client.post("/api/fx/quote", json={"user_id": user_id, "from_amount_xof": "120000.0000"})
    quote_id = q.json()["quote_id"]

    await client.post("/api/fx/convert", json={
        "user_id": user_id,
        "quote_id": quote_id,
        "idempotency_key": f"CONV_CARD_{quote_id}"
    })

    # Issue card with 100 USD
    c_res = await client.post("/api/cards/issue", json={
        "user_id": user_id,
        "cardholder_name": "Testing Agent",
        "initial_funding_usd": "100.0000"
    })
    card = c_res.json()
    card_id = card["card_id"]

    # Toggle freeze
    freeze_res = await client.post(f"/api/cards/{card_id}/toggle-freeze")
    assert freeze_res.json()["status"] == "FROZEN"

    # Attempt merchant debit while frozen -> Declined
    debit_frozen = await client.post("/api/cards/simulate-merchant-debit", json={
        "card_id": card_id,
        "merchant_name": "OpenAI",
        "amount_usd": "20.0000"
    })
    assert debit_frozen.status_code == 200
    assert debit_frozen.json()["approved"] is False
    assert "frozen" in debit_frozen.json()["decline_reason"].lower()

    # Unfreeze
    await client.post(f"/api/cards/{card_id}/toggle-freeze")

    # Attempt merchant debit exceeding balance (e.g. 500 USD on 100 USD card)
    debit_over = await client.post("/api/cards/simulate-merchant-debit", json={
        "card_id": card_id,
        "merchant_name": "AWS",
        "amount_usd": "500.0000"
    })
    assert debit_over.status_code == 200
    assert debit_over.json()["approved"] is False
    assert "insufficient" in debit_over.json()["decline_reason"].lower()
