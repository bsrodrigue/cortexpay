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
async def test_api_ping(client):
    res = await client.get("/api/ping")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["message"] == "pong"
    assert data["service"] == "cortex-pay"

@pytest.mark.asyncio(loop_scope="function")
async def test_auth_flow(client):
    """
    Validation du parcours complet d'authentification mobile:
    1. POST /api/auth/register/
    2. POST /api/auth/login/
    3. GET /api/auth/me/
    4. POST /api/auth/verify-otp/
    """
    unique_email = f"user_{uuid.uuid4().hex[:8]}@cortexcard.test"
    password = "SecurePassword123!"

    # 1. Register
    reg_res = await client.post("/api/auth/register/", json={
        "email": unique_email,
        "password": password,
        "first_name": "Badini",
        "last_name": "Rodrigue"
    })
    assert reg_res.status_code == 200
    user = reg_res.json()
    assert user["email"] == unique_email
    assert user["first_name"] == "Badini"
    assert "user_id" in user

    # 2. Login
    login_res = await client.post("/api/auth/login/", json={
        "email": unique_email,
        "password": password
    })
    assert login_res.status_code == 200
    tokens = login_res.json()
    assert "access" in tokens
    assert "refresh" in tokens

    # 3. Me
    me_res = await client.get("/api/auth/me/", headers={
        "Authorization": f"Bearer {tokens['access']}"
    })
    assert me_res.status_code == 200
    me = me_res.json()
    assert me["email"] == unique_email

    # 4. Verify OTP
    otp_res = await client.post("/api/auth/verify-otp/", json={
        "email": unique_email,
        "code": "123456"
    })
    assert otp_res.status_code == 200

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

@pytest.mark.asyncio(loop_scope="function")
async def test_kyc_verification_and_card_blocking(client):
    """
    Validation du cycle complet de conformité KYC:
    1. Création d'un nouvel utilisateur (Tier 0 / NOT_STARTED).
    2. Tentative d'émission d'une carte Visa -> Bloqué 403 Forbidden.
    3. Soumission des documents KYC (CNI / Passeport + Selfie).
    4. Décision de validation (APPROVED / Tier 1).
    5. Émission de la carte Visa -> Débloqué avec succès 200 OK.
    """
    user_email = f"kyc_user_{uuid.uuid4().hex[:8]}@cortexcard.test"
    reg_res = await client.post("/api/auth/register/", json={
        "email": user_email,
        "password": "Password123!",
        "first_name": "Cheikh",
        "last_name": "Diop"
    })
    assert reg_res.status_code == 200
    user = reg_res.json()
    user_id = user["user_id"]
    assert user["kyc_status"] == "NOT_STARTED"
    assert user["kyc_tier"] == 0

    # 2. Card issuance must be blocked for unverified user (Tier 0)
    blocked_res = await client.post("/api/cards/issue", json={
        "user_id": user_id,
        "cardholder_name": "Cheikh Diop",
        "initial_funding_usd": "0.0000"
    })
    assert blocked_res.status_code == 403
    assert "kyc" in blocked_res.json()["detail"].lower()

    # 3. Submit KYC documents
    submit_res = await client.post("/api/kyc/submit", json={
        "user_id": user_id,
        "document_type": "NATIONAL_ID",
        "document_number": "1002200192931",
        "country_code": "SEN",
        "front_image_url": "https://storage.cortexcard.test/kyc/front.jpg",
        "back_image_url": "https://storage.cortexcard.test/kyc/back.jpg",
        "selfie_url": "https://storage.cortexcard.test/kyc/selfie.jpg"
    })
    assert submit_res.status_code == 200
    assert submit_res.json()["status"] == "SUBMITTED"

    # Verify status changed to SUBMITTED
    status_res = await client.get(f"/api/kyc/status/{user_id}")
    assert status_res.status_code == 200
    assert status_res.json()["kyc_status"] == "SUBMITTED"
    assert len(status_res.json()["documents"]) == 1

    # 4. Admin / OCR Approval (simulate approved Tier 1)
    approve_res = await client.post("/api/kyc/simulate-decision", json={
        "user_id": user_id,
        "decision": "APPROVED",
        "tier": 1
    })
    assert approve_res.status_code == 200
    assert approve_res.json()["kyc_status"] == "APPROVED"
    assert approve_res.json()["kyc_tier"] == 1

    # 5. Issue card now succeeds!
    card_res = await client.post("/api/cards/issue", json={
        "user_id": user_id,
        "cardholder_name": "Cheikh Diop",
        "initial_funding_usd": "0.0000"
    })
    assert card_res.status_code == 200
    assert "card_id" in card_res.json()
    assert card_res.json()["status"] == "ACTIVE"

