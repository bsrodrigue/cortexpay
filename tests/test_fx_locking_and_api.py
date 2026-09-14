import pytest
from decimal import Decimal
import uuid
import asyncio
import asyncpg
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

    # 2.b Upload KYC Image via base64
    fake_png_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    upload_res = await client.post("/api/kyc/upload-image", json={
        "image_base64": fake_png_base64,
        "field_name": "front"
    })
    assert upload_res.status_code == 200
    upload_data = upload_res.json()
    assert "filename" in upload_data
    assert upload_data["image_url"].startswith("/uploads/kyc/")

    # 3. Submit KYC documents
    submit_res = await client.post("/api/kyc/submit", json={
        "user_id": user_id,
        "document_type": "NATIONAL_ID",
        "document_number": "1002200192931",
        "country_code": "SEN",
        "front_image_url": upload_data["image_url"],
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
    card_data = card_res.json()
    assert "card_id" in card_data
    assert card_data["status"] == "ACTIVE"
    card_id = card_data["card_id"]

    # 5.b Fund user wallet (Deposit XOF + Convert to USD)
    dep_res = await client.post("/api/deposit/mobile-money", json={
        "user_id": user_id,
        "phone_number": "+221771234567",
        "operator": "WAVE",
        "amount": "100000.00",
        "otp_code": "123456"
    })
    assert dep_res.status_code == 200

    quote_res = await client.post("/api/fx/quote", json={
        "user_id": user_id,
        "from_amount_xof": "60000.00"
    })
    assert quote_res.status_code == 200
    quote_id = quote_res.json()["quote_id"]

    conv_res = await client.post("/api/fx/convert", json={
        "user_id": user_id,
        "quote_id": quote_id,
        "idempotency_key": f"IDEM_TEST_{quote_id}"
    })
    assert conv_res.status_code == 200

    # 6. Top-up card from USD wallet
    topup_res = await client.post("/api/cards/topup", json={
        "user_id": user_id,
        "card_id": card_id,
        "amount_usd": "50.00"
    })
    assert topup_res.status_code == 200
    assert Decimal(str(topup_res.json()["card_balance"])) == Decimal("50.0000")

    # 7. Update spending limit
    limit_res = await client.post("/api/cards/spending-limit", json={
        "user_id": user_id,
        "card_id": card_id,
        "spending_limit_monthly": "2500.00"
    })
    assert limit_res.status_code == 200
    assert Decimal(str(limit_res.json()["spending_limit_monthly"])) == Decimal("2500.0000")

    # 8. Cash-Out / Mobile Money Withdrawal
    withdraw_res = await client.post("/api/withdraw/mobile-money", json={
        "user_id": user_id,
        "phone_number": "+221771234567",
        "operator": "WAVE",
        "amount": "10000.00"
    })
    assert withdraw_res.status_code == 200
    assert "provider_tx_id" in withdraw_res.json()
    assert Decimal(str(withdraw_res.json()["amount_xof"])) == Decimal("10000.00")

@pytest.mark.asyncio(loop_scope="function")
async def test_card_categorization_and_3ds_flow(client):
    """
    Test Card Categorization (Business vs Standard limits & labels)
    and 3DS Challenge Flow (Initiate -> OTP Verification -> Merchant Settlement).
    """
    unique_email = f"corp_{uuid.uuid4().hex[:8]}@agency.test"
    reg_res = await client.post("/api/auth/register/", json={
        "email": unique_email,
        "password": "SecurePassword123!",
        "first_name": "Fatou",
        "last_name": "Sow"
    })
    user_id = reg_res.json()["user_id"]

    # Approve KYC Tier 1
    await client.post("/api/kyc/simulate-decision", json={
        "user_id": user_id,
        "decision": "APPROVED",
        "tier": 1
    })

    # Issue BUSINESS card
    card_res = await client.post("/api/cards/issue", json={
        "user_id": user_id,
        "cardholder_name": "Fatou Sow Corp",
        "initial_funding_usd": "0.0000",
        "card_type": "BUSINESS",
        "label": "Carte Publicités Meta & Google"
    })
    assert card_res.status_code == 200
    card = card_res.json()
    assert card["card_type"] == "BUSINESS"
    assert card["label"] == "Carte Publicités Meta & Google"
    assert Decimal(str(card["spending_limit_monthly"])) == Decimal("10000.0000")
    card_id = card["card_id"]

    # Fund card directly via user wallet flow
    await client.post("/api/deposit/mobile-money", json={
        "user_id": user_id,
        "phone_number": "+221778889900",
        "operator": "WAVE",
        "amount": "200000.00",
        "otp_code": "123456"
    })
    q_res = await client.post("/api/fx/quote", json={
        "user_id": user_id,
        "from_amount_xof": "150000.00"
    })
    quote_id = q_res.json()["quote_id"]
    await client.post("/api/fx/convert", json={
        "user_id": user_id,
        "quote_id": quote_id,
        "idempotency_key": f"IDEM_{quote_id}"
    })
    await client.post("/api/cards/topup", json={
        "user_id": user_id,
        "card_id": card_id,
        "amount_usd": "200.00"
    })

    # 1. Initiate 3DS Challenge (e.g. for Google Ads $150)
    init_res = await client.post("/api/cards/3ds/initiate", json={
        "card_id": card_id,
        "merchant_name": "Google Ads",
        "amount_usd": "150.00"
    })
    assert init_res.status_code == 200
    challenge = init_res.json()
    assert challenge["status"] == "PENDING"
    assert challenge["otp_code"] == "123456"
    challenge_id = challenge["challenge_id"]

    # 2. Check pending 3ds endpoint
    pending_res = await client.get(f"/api/cards/3ds/pending/{card_id}")
    assert pending_res.status_code == 200
    pending_list = pending_res.json()
    assert any(c["challenge_id"] == challenge_id for c in pending_list)

    # 3. Verify 3DS with wrong code -> Fails
    bad_res = await client.post("/api/cards/3ds/verify", json={
        "challenge_id": challenge_id,
        "otp_code": "000000"
    })
    assert bad_res.status_code == 400

    # 4. Re-initiate and verify with valid OTP '123456' -> Settles debit
    init2_res = await client.post("/api/cards/3ds/initiate", json={
        "card_id": card_id,
        "merchant_name": "Google Ads",
        "amount_usd": "150.00"
    })
    assert init2_res.status_code == 200
    challenge2_id = init2_res.json()["challenge_id"]

    verify_res = await client.post("/api/cards/3ds/verify", json={
        "challenge_id": challenge2_id,
        "otp_code": "123456"
    })
    assert verify_res.status_code == 200
    verify_data = verify_res.json()
    assert verify_data["status"] == "APPROVED"
    assert verify_data["debit_result"]["approved"] is True

@pytest.mark.asyncio(loop_scope="function")
async def test_3ds_challenge_expiry_and_security_policy(client):
    """
    Scénarios de sécurité 3DS et contrôle des politiques de risque :
    1. Expiration temporelle d'un challenge 3DS (TTL expiré -> 400 Bad Request).
    2. Blocage des catégories marchandes à risque (CASINO, BETTING, DARKNET).
    3. Dépassement du plafond mensuel de la carte lors d'un débit 3DS.
    4. Audit trail et validation de l'écriture en partie double (double-entry receipt).
    """
    user_email = f"sec_user_{uuid.uuid4().hex[:8]}@cortexcard.test"
    reg = await client.post("/api/auth/register/", json={
        "email": user_email,
        "password": "SecurePassword123!",
        "first_name": "Awa",
        "last_name": "Ndiaye"
    })
    user_id = reg.json()["user_id"]

    await client.post("/api/kyc/simulate-decision", json={"user_id": user_id, "decision": "APPROVED", "tier": 1})

    # Issue Standard Card with initial limit $5,000
    card_res = await client.post("/api/cards/issue", json={
        "user_id": user_id,
        "cardholder_name": "Awa Ndiaye",
        "initial_funding_usd": "0.0000",
        "card_type": "STANDARD",
        "label": "Carte Principale"
    })
    card = card_res.json()
    card_id = card["card_id"]

    # Provision $300 USD
    await client.post("/api/deposit/mobile-money", json={
        "user_id": user_id,
        "phone_number": "+221773334455",
        "operator": "WAVE",
        "amount": "250000.00",
        "otp_code": "123456"
    })
    q = await client.post("/api/fx/quote", json={"user_id": user_id, "from_amount_xof": "200000.00"})
    quote_id = q.json()["quote_id"]
    await client.post("/api/fx/convert", json={"user_id": user_id, "quote_id": quote_id, "idempotency_key": f"IDEM_{quote_id}"})
    await client.post("/api/cards/topup", json={"user_id": user_id, "card_id": card_id, "amount_usd": "300.00"})

    # 1. 3DS Expiry Scenario: initiate challenge, then artificially expire it in DB
    init_res = await client.post("/api/cards/3ds/initiate", json={
        "card_id": card_id,
        "merchant_name": "Spotify Premium",
        "amount_usd": "10.00"
    })
    assert init_res.status_code == 200
    challenge_id = init_res.json()["challenge_id"]

    # Manually expire the challenge timestamp
    conn = await asyncpg.connect(settings.DATABASE_URL)
    await conn.execute(
        "UPDATE three_d_secure_challenges SET expires_at = NOW() - INTERVAL '10 seconds' WHERE challenge_id = $1",
        challenge_id
    )
    await conn.close()

    # Attempt verify expired challenge -> Must return 400 Bad Request
    expired_res = await client.post("/api/cards/3ds/verify", json={
        "challenge_id": challenge_id,
        "otp_code": "123456"
    })
    assert expired_res.status_code == 400
    assert "expiré" in expired_res.json()["detail"].lower()

    # 2. Blocked Category (Policy Enforcement): CASINO / BETTING
    blocked_init = await client.post("/api/cards/3ds/initiate", json={
        "card_id": card_id,
        "merchant_name": "CASINO ONLINE",
        "amount_usd": "50.00"
    })
    assert blocked_init.status_code == 200
    blocked_cid = blocked_init.json()["challenge_id"]

    blocked_verify = await client.post("/api/cards/3ds/verify", json={
        "challenge_id": blocked_cid,
        "otp_code": "123456"
    })
    assert blocked_verify.status_code == 400
    assert "security policy" in blocked_verify.json()["detail"].lower()

    # 3. Monthly Spending Limit Exceeded via 3DS
    # Set limit very low ($20)
    await client.post("/api/cards/spending-limit", json={
        "user_id": user_id,
        "card_id": card_id,
        "spending_limit_monthly": "20.00"
    })

    limit_init = await client.post("/api/cards/3ds/initiate", json={
        "card_id": card_id,
        "merchant_name": "Figma",
        "amount_usd": "25.00"
    })
    assert limit_init.status_code == 200
    limit_cid = limit_init.json()["challenge_id"]

    limit_verify = await client.post("/api/cards/3ds/verify", json={
        "challenge_id": limit_cid,
        "otp_code": "123456"
    })
    assert limit_verify.status_code == 400
    assert "spending limit" in limit_verify.json()["detail"].lower()

    # 4. Audit History Verification (double-entry postings inspection)
    ledger_res = await client.get(f"/api/ledger/audit-entries?user_id={user_id}&limit=10")
    assert ledger_res.status_code == 200
    entries = ledger_res.json()
    assert len(entries) > 0
    # Every journal entry must have balanced postings (Sum of credits == sum of debits)
    for entry in entries:
        assert len(entry["postings"]) >= 2
        currencies = set(p["currency"] for p in entry["postings"])
        for cur in currencies:
            cur_postings = [p for p in entry["postings"] if p["currency"] == cur]
            debits = sum(Decimal(str(p["amount"])) for p in cur_postings if p["direction"] == "DEBIT")
            credits = sum(Decimal(str(p["amount"])) for p in cur_postings if p["direction"] == "CREDIT")
            assert debits == credits, f"Unbalanced entry {entry['id']} in currency {cur}: debits={debits}, credits={credits}"



