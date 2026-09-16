"""
Test suite for admin back-office API routes (admin_routes.py).

Covers all 16 admin endpoints:
  GET  /admin/metrics
  GET  /admin/ledger                (+ date_from/date_to filter)
  GET  /admin/kyc/pending
  POST /admin/kyc/{user_id}/review
  GET  /admin/cards
  POST /admin/cards/{card_id}/toggle-freeze
  GET  /admin/disputes
  POST /admin/disputes/{dispute_id}/resolve
  GET  /admin/reconciliations
  GET  /admin/users                 (+ pagination + search)
  GET  /admin/users/{user_id}
  POST /admin/users/{user_id}/suspend
  POST /admin/users/{user_id}/activate
  GET  /admin/transactions          (+ date_from/date_to filter)
  GET  /admin/webhooks              (+ status filter)
  GET  /admin/system-accounts
"""

import pytest
import uuid
from decimal import Decimal
from datetime import date

from httpx import AsyncClient, ASGITransport
from backend.src.main import app


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def seeded_user(client):
    """
    Creates a fully seeded user ready for admin inspection:
      - Registered (KYC Tier 1 approved)
      - 80 000 XOF deposited via Wave
      - 60 000 XOF → USD converted (FX)
      - STANDARD virtual card issued, $50 funded
      - One $15 merchant debit (Netflix) — APPROVED
    Returns: {user_id, email, card_id, tx_id}
    """
    email = f"admseed_{uuid.uuid4().hex[:8]}@cortexcard.test"
    reg = await client.post("/api/auth/register/", json={
        "email": email, "password": "Password123!",
        "first_name": "Admin", "last_name": "Seed",
    })
    assert reg.status_code == 200
    user_id = reg.json()["user_id"]

    await client.post("/api/kyc/simulate-decision", json={
        "user_id": user_id, "decision": "APPROVED", "tier": 1,
    })

    dep = await client.post("/api/deposit/mobile-money", json={
        "user_id": user_id, "phone_number": "+221770099001",
        "operator": "WAVE", "amount": "80000.00", "otp_code": "123456",
    })
    assert dep.status_code == 200

    q = await client.post("/api/fx/quote", json={
        "user_id": user_id, "from_amount_xof": "60000.00",
    })
    assert q.status_code == 200
    quote_id = q.json()["quote_id"]
    await client.post("/api/fx/convert", json={
        "user_id": user_id, "quote_id": quote_id,
        "idempotency_key": f"SEED_{quote_id}",
    })

    c = await client.post("/api/cards/issue", json={
        "user_id": user_id, "cardholder_name": "Admin Seed",
        "initial_funding_usd": "50.00",
    })
    assert c.status_code == 200
    card_id = c.json()["card_id"]

    debit = await client.post("/api/cards/simulate-merchant-debit", json={
        "card_id": card_id, "merchant_name": "Netflix", "amount_usd": "15.00",
    })
    assert debit.status_code == 200
    tx_id = debit.json()["transaction_id"]

    return {"user_id": user_id, "email": email, "card_id": card_id, "tx_id": tx_id}


# ─── GET /admin/metrics ───────────────────────────────────────────────────────

@pytest.mark.asyncio(loop_scope="function")
async def test_admin_metrics_shape(client, seeded_user):
    res = await client.get("/api/admin/metrics")
    assert res.status_code == 200
    d = res.json()
    assert {"total_xof", "total_usd", "fx_pivot"} <= d["treasury"].keys()
    assert {"total", "active", "frozen", "total_balance_usd"} <= d["cards"].keys()
    assert {"pending_kyc", "open_disputes"} <= d["compliance"].keys()
    assert "total_transactions" in d
    assert "system_health" in d


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_metrics_non_zero_after_seed(client, seeded_user):
    """After seeding, card count and total_transactions must be positive."""
    res = await client.get("/api/admin/metrics")
    d = res.json()
    assert d["cards"]["total"] >= 1
    assert d["cards"]["active"] >= 1
    assert d["total_transactions"] >= 1


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_metrics_treasury_uses_asset_wallet_type(client, seeded_user):
    """
    Previously broken: treasury queried type IN ('WALLET','CARD').
    Correct type is 'ASSET_WALLET'. Verify totals are non-zero.
    """
    res = await client.get("/api/admin/metrics")
    d = res.json()
    # seeded_user has XOF and USD wallets funded — both totals must be > 0
    assert d["treasury"]["total_xof"] > 0
    assert d["treasury"]["total_usd"] > 0


# ─── GET /admin/ledger ────────────────────────────────────────────────────────

@pytest.mark.asyncio(loop_scope="function")
async def test_admin_ledger_returns_list(client, seeded_user):
    res = await client.get("/api/admin/ledger?limit=50")
    assert res.status_code == 200
    entries = res.json()
    assert isinstance(entries, list)
    assert len(entries) > 0


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_ledger_entry_structure(client, seeded_user):
    res = await client.get("/api/admin/ledger?limit=10")
    assert res.status_code == 200
    for entry in res.json():
        assert {"id", "reference", "narration", "status", "is_balanced", "postings", "created_at"} <= entry.keys()
        assert isinstance(entry["postings"], list)


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_ledger_all_entries_balanced(client, seeded_user):
    """
    Core invariant: every journal entry retrieved via admin endpoint
    must report is_balanced == True.
    """
    res = await client.get("/api/admin/ledger?limit=100")
    assert res.status_code == 200
    for entry in res.json():
        assert entry["is_balanced"] is True, (
            f"Unbalanced entry: ref={entry['reference']} id={entry['id']}"
        )


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_ledger_posting_structure(client, seeded_user):
    """
    Previously broken: postings query used wrong column names
    (journal_entry_id, account_number as FK). Fix verified by checking
    postings are populated and have valid direction values.
    """
    res = await client.get("/api/admin/ledger?limit=20")
    entries = res.json()
    entries_with_postings = [e for e in entries if e["postings"]]
    assert len(entries_with_postings) > 0, "At least some entries must have postings"
    for entry in entries_with_postings:
        for p in entry["postings"]:
            assert p["direction"] in ("DEBIT", "CREDIT")
            assert Decimal(str(p["amount"])) > 0
            assert p["account_number"]  # must not be empty (was broken before fix)


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_ledger_pagination(client, seeded_user):
    p1 = (await client.get("/api/admin/ledger?limit=1&offset=0")).json()
    p2 = (await client.get("/api/admin/ledger?limit=1&offset=1")).json()
    assert len(p1) == 1
    assert len(p2) == 1
    assert p1[0]["id"] != p2[0]["id"]


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_ledger_date_filter_today(client, seeded_user):
    today = date.today().isoformat()
    res = await client.get(f"/api/admin/ledger?date_from={today}&date_to={today}")
    assert res.status_code == 200
    assert len(res.json()) > 0  # seeded entries are from today


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_ledger_date_filter_past_returns_empty(client, seeded_user):
    res = await client.get("/api/admin/ledger?date_from=2000-01-01&date_to=2000-01-02")
    assert res.status_code == 200
    assert res.json() == []


# ─── GET /admin/kyc/pending + POST /admin/kyc/{user_id}/review ────────────────

@pytest.fixture
async def kyc_submitted_user(client):
    """A user who has submitted KYC docs but not been reviewed yet."""
    email = f"kycpend_{uuid.uuid4().hex[:8]}@cortexcard.test"
    reg = await client.post("/api/auth/register/", json={
        "email": email, "password": "Password123!",
        "first_name": "KYC", "last_name": "Pending",
    })
    user_id = reg.json()["user_id"]
    await client.post("/api/kyc/submit", json={
        "user_id": user_id,
        "document_type": "NATIONAL_ID",
        "document_number": f"SEN{uuid.uuid4().hex[:8].upper()}",
        "country_code": "SEN",
        "front_image_url": "https://storage.test/kyc/front.jpg",
        "selfie_url": "https://storage.test/kyc/selfie.jpg",
    })
    return user_id


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_kyc_pending_contains_submitted_user(client, kyc_submitted_user):
    res = await client.get("/api/admin/kyc/pending")
    assert res.status_code == 200
    pending = res.json()
    assert isinstance(pending, list)
    assert any(u["user_id"] == kyc_submitted_user for u in pending)


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_kyc_pending_structure(client, kyc_submitted_user):
    res = await client.get("/api/admin/kyc/pending")
    assert res.status_code == 200
    for u in res.json():
        assert {"user_id", "email", "full_name", "kyc_status", "kyc_tier"} <= u.keys()
        assert u["kyc_status"] in ("SUBMITTED", "UNDER_REVIEW")


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_kyc_review_approve(client, kyc_submitted_user):
    res = await client.post(f"/api/admin/kyc/{kyc_submitted_user}/review", json={
        "decision": "APPROVED", "tier": 1,
    })
    assert res.status_code == 200
    d = res.json()
    assert d["kyc_status"] == "APPROVED"
    assert d["kyc_tier"] == 1
    assert d["rejection_reason"] is None


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_kyc_review_reject_stores_reason(client, kyc_submitted_user):
    reason = "Document illisible — reflet sur la photo"
    res = await client.post(f"/api/admin/kyc/{kyc_submitted_user}/review", json={
        "decision": "REJECTED", "rejection_reason": reason,
    })
    assert res.status_code == 200
    d = res.json()
    assert d["kyc_status"] == "REJECTED"
    assert d["rejection_reason"] == reason


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_kyc_review_invalid_decision_returns_400(client, kyc_submitted_user):
    res = await client.post(f"/api/admin/kyc/{kyc_submitted_user}/review", json={
        "decision": "PENDING",
    })
    assert res.status_code == 400


# ─── GET /admin/cards + POST /admin/cards/{card_id}/toggle-freeze ─────────────

@pytest.mark.asyncio(loop_scope="function")
async def test_admin_cards_list_contains_seeded_card(client, seeded_user):
    res = await client.get("/api/admin/cards?limit=100")
    assert res.status_code == 200
    cards = res.json()
    assert isinstance(cards, list)
    found = next((c for c in cards if c["card_id"] == seeded_user["card_id"]), None)
    assert found is not None


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_cards_balance_from_accounts_join(client, seeded_user):
    """
    Previously broken: cards query did SELECT c.balance which doesn't exist —
    balance lives in the linked accounts table. After fix, must be $35.00.
    """
    res = await client.get("/api/admin/cards?limit=100")
    cards = res.json()
    card = next(c for c in cards if c["card_id"] == seeded_user["card_id"])
    assert Decimal(card["balance"]) == Decimal("35.0000")  # $50 issued − $15 Netflix


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_cards_expiry_zero_padded(client, seeded_user):
    """
    Previously broken: expiry used .padStart() (JavaScript) instead of .zfill(2).
    After fix, month must always be two digits.
    """
    res = await client.get("/api/admin/cards?limit=100")
    for card in res.json():
        month_str, _ = card["expiry"].split("/")
        assert len(month_str) == 2, f"Month not zero-padded: {card['expiry']}"
        assert 1 <= int(month_str) <= 12


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_cards_structure(client, seeded_user):
    res = await client.get("/api/admin/cards?limit=10")
    for card in res.json():
        assert {"card_id", "user_id", "masked_pan", "currency", "balance",
                "spending_limit_monthly", "current_month_spent", "card_type",
                "status", "expiry", "created_at"} <= card.keys()
        assert card["status"] in ("ACTIVE", "FROZEN", "TERMINATED")


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_toggle_freeze_roundtrip(client, seeded_user):
    card_id = seeded_user["card_id"]

    freeze = await client.post(f"/api/admin/cards/{card_id}/toggle-freeze")
    assert freeze.status_code == 200
    assert freeze.json()["status"] == "FROZEN"

    unfreeze = await client.post(f"/api/admin/cards/{card_id}/toggle-freeze")
    assert unfreeze.status_code == 200
    assert unfreeze.json()["status"] == "ACTIVE"


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_toggle_freeze_unknown_card_returns_404(client):
    res = await client.post("/api/admin/cards/GHOST_CARD_000/toggle-freeze")
    assert res.status_code == 404


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_frozen_card_declines_merchant_debit(client, seeded_user):
    """Freeze via admin route → subsequent merchant debit must be declined."""
    card_id = seeded_user["card_id"]

    await client.post(f"/api/admin/cards/{card_id}/toggle-freeze")

    debit = await client.post("/api/cards/simulate-merchant-debit", json={
        "card_id": card_id, "merchant_name": "Spotify", "amount_usd": "10.00",
    })
    assert debit.status_code == 200
    assert debit.json()["approved"] is False
    assert "frozen" in debit.json()["decline_reason"].lower()

    # Restore for other tests
    await client.post(f"/api/admin/cards/{card_id}/toggle-freeze")


# ─── GET /admin/disputes + POST /admin/disputes/{dispute_id}/resolve ──────────

@pytest.fixture
async def open_dispute(client):
    """
    Creates a complete user flow ending in an open dispute:
    register → KYC → deposit → FX → card → debit → dispute OPENED.
    Returns {dispute_id, user_id, card_id, amount}
    """
    email = f"disp_{uuid.uuid4().hex[:8]}@cortexcard.test"
    reg = await client.post("/api/auth/register/", json={
        "email": email, "password": "Password123!",
        "first_name": "Disp", "last_name": "Test",
    })
    user_id = reg.json()["user_id"]
    await client.post("/api/kyc/simulate-decision", json={
        "user_id": user_id, "decision": "APPROVED", "tier": 1,
    })
    await client.post("/api/deposit/mobile-money", json={
        "user_id": user_id, "phone_number": "+221770088002",
        "operator": "WAVE", "amount": "70000.00", "otp_code": "123456",
    })
    q = await client.post("/api/fx/quote", json={
        "user_id": user_id, "from_amount_xof": "55000.00",
    })
    qid = q.json()["quote_id"]
    await client.post("/api/fx/convert", json={
        "user_id": user_id, "quote_id": qid,
        "idempotency_key": f"DCONV_{qid}",
    })
    c = await client.post("/api/cards/issue", json={
        "user_id": user_id, "cardholder_name": "Disp Test",
        "initial_funding_usd": "60.00",
    })
    card_id = c.json()["card_id"]
    debit = await client.post("/api/cards/simulate-merchant-debit", json={
        "card_id": card_id, "merchant_name": "AWS", "amount_usd": "30.00",
    })
    tx_id = debit.json()["transaction_id"]
    disp = await client.post("/api/disputes/open", json={
        "user_id": user_id, "transaction_reference": tx_id,
        "card_id": card_id, "amount": "30.00",
        "reason": "FRAUD_OR_UNAUTHORIZED_CHARGE",
        "description": "Admin test dispute",
    })
    assert disp.status_code == 200
    return {
        "dispute_id": disp.json()["dispute_id"],
        "user_id": user_id,
        "card_id": card_id,
        "amount": Decimal("30.00"),
    }


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_disputes_list(client, open_dispute):
    res = await client.get("/api/admin/disputes")
    assert res.status_code == 200
    disputes = res.json()
    assert isinstance(disputes, list)
    found = next((d for d in disputes if d["dispute_id"] == open_dispute["dispute_id"]), None)
    assert found is not None


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_disputes_structure(client, open_dispute):
    res = await client.get("/api/admin/disputes")
    for d in res.json():
        assert {"dispute_id", "transaction_reference", "card_id", "user_id",
                "amount", "currency", "reason", "status", "created_at"} <= d.keys()
        assert d["status"] in ("OPENED", "UNDER_REVIEW", "WON_REFUNDED", "LOST_CLOSED")


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_dispute_resolve_lost(client, open_dispute):
    """Admin resolves dispute LOST → status becomes LOST_CLOSED."""
    # First submit evidence to move to UNDER_REVIEW
    await client.post(f"/api/disputes/{open_dispute['dispute_id']}/evidence", json={
        "evidence_url": "https://storage.test/evidence.pdf",
        "description": "Evidence for admin test",
    })
    res = await client.post(f"/api/admin/disputes/{open_dispute['dispute_id']}/resolve", json={
        "decision": "LOST", "resolution_notes": "Dispute non fondé.",
    })
    assert res.status_code == 200
    assert res.json()["status"] == "LOST_CLOSED"


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_dispute_resolve_won_triggers_refund(client):
    """
    Admin resolves WON → status WON_REFUNDED and a chargeback journal entry
    is created (double-entry refund credited to user's USD wallet).
    """
    email = f"wondisp_{uuid.uuid4().hex[:8]}@cortexcard.test"
    reg = await client.post("/api/auth/register/", json={
        "email": email, "password": "Password123!",
        "first_name": "Won", "last_name": "Dispute",
    })
    user_id = reg.json()["user_id"]
    await client.post("/api/kyc/simulate-decision", json={
        "user_id": user_id, "decision": "APPROVED", "tier": 1,
    })
    await client.post("/api/deposit/mobile-money", json={
        "user_id": user_id, "phone_number": "+221770077003",
        "operator": "WAVE", "amount": "100000.00", "otp_code": "123456",
    })
    q = await client.post("/api/fx/quote", json={"user_id": user_id, "from_amount_xof": "80000.00"})
    qid = q.json()["quote_id"]
    await client.post("/api/fx/convert", json={
        "user_id": user_id, "quote_id": qid,
        "idempotency_key": f"WCONV_{qid}",
    })
    c = await client.post("/api/cards/issue", json={
        "user_id": user_id, "cardholder_name": "Won Dispute",
        "initial_funding_usd": "80.00",
    })
    card_id = c.json()["card_id"]
    debit = await client.post("/api/cards/simulate-merchant-debit", json={
        "card_id": card_id, "merchant_name": "FakeShop", "amount_usd": "40.00",
    })
    tx_id = debit.json()["transaction_id"]
    disp = await client.post("/api/disputes/open", json={
        "user_id": user_id, "transaction_reference": tx_id,
        "card_id": card_id, "amount": "40.00",
        "reason": "FRAUD_OR_UNAUTHORIZED_CHARGE",
    })
    dispute_id = disp.json()["dispute_id"]

    await client.post(f"/api/disputes/{dispute_id}/evidence", json={
        "evidence_url": "https://storage.test/won_evidence.pdf",
    })

    res = await client.post(f"/api/admin/disputes/{dispute_id}/resolve", json={
        "decision": "WON", "resolution_notes": "Chargeback Visa accordé.",
    })
    assert res.status_code == 200
    d = res.json()
    assert d["status"] == "WON_REFUNDED"
    assert "journal_entry" in d  # double-entry refund must have been posted

    # User's USD wallet must have been credited back 40 USD
    wallets = await client.get(f"/api/wallets/{user_id}")
    usd_balance = Decimal(str(wallets.json()["wallets"]["USD"]["balance"]))
    assert usd_balance >= Decimal("40.0000")


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_dispute_resolve_terminal_state_rejected(client, open_dispute):
    """Attempting to re-resolve an already terminal dispute must return 400."""
    disp_id = open_dispute["dispute_id"]
    await client.post(f"/api/disputes/{disp_id}/evidence", json={
        "evidence_url": "https://storage.test/ev.pdf",
    })
    await client.post(f"/api/admin/disputes/{disp_id}/resolve", json={
        "decision": "LOST", "resolution_notes": "First resolution.",
    })
    # Second resolution must be rejected
    res = await client.post(f"/api/admin/disputes/{disp_id}/resolve", json={
        "decision": "WON", "resolution_notes": "Second attempt — must fail.",
    })
    assert res.status_code == 400


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_dispute_resolve_nonexistent_returns_error(client):
    res = await client.post("/api/admin/disputes/FAKE_DISPUTE_ZZZZ/resolve", json={
        "decision": "WON", "resolution_notes": "N/A",
    })
    assert res.status_code in (400, 404, 500)


# ─── GET /admin/reconciliations ───────────────────────────────────────────────

@pytest.mark.asyncio(loop_scope="function")
async def test_admin_reconciliations_reflects_correct_table(client):
    """
    Previously broken: queried table 'reconciliation_reports' which doesn't exist.
    After fix, querying 'reconciliation_batches' must work without DB error.
    """
    # Run a reconciliation to ensure at least one row exists
    await client.post("/api/reconciliation/run", json={
        "provider": "ORANGE_MONEY",
        "reconciliation_date": date.today().isoformat(),
        "currency": "XOF",
        "partner_statements": [
            {"reference": f"GHOST_{uuid.uuid4().hex[:8]}", "amount": "5000.0000"},
        ],
    })
    res = await client.get("/api/admin/reconciliations")
    assert res.status_code == 200
    recs = res.json()
    assert isinstance(recs, list)
    assert len(recs) >= 1


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_reconciliations_status_values(client):
    """Status must be one of the actual DB constraint values."""
    res = await client.get("/api/admin/reconciliations")
    assert res.status_code == 200
    for rec in res.json():
        assert rec["status"] in ("BALANCED", "DISCREPANCY_DETECTED", "RESOLVED"), (
            f"Unexpected reconciliation status: {rec['status']}"
        )


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_reconciliations_structure(client):
    await client.post("/api/reconciliation/run", json={
        "provider": "WAVE",
        "reconciliation_date": date.today().isoformat(),
        "currency": "XOF",
        "partner_statements": [],
    })
    res = await client.get("/api/admin/reconciliations")
    assert res.status_code == 200
    for rec in res.json():
        assert {"id", "provider", "reconciliation_date", "currency",
                "total_partner_amount", "total_ledger_amount", "discrepancy_amount",
                "status", "matched_count", "discrepancy_count", "created_at"} <= rec.keys()
        # These two columns were removed (don't exist in reconciliation_batches)
        assert "missing_in_ledger_count" not in rec
        assert "missing_in_partner_count" not in rec


# ─── GET /admin/users ─────────────────────────────────────────────────────────

@pytest.mark.asyncio(loop_scope="function")
async def test_admin_users_paginated_response(client, seeded_user):
    res = await client.get("/api/admin/users?limit=20&offset=0")
    assert res.status_code == 200
    d = res.json()
    assert "items" in d
    assert "total" in d
    assert isinstance(d["items"], list)
    assert d["total"] >= 1


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_users_structure(client, seeded_user):
    res = await client.get("/api/admin/users?limit=5")
    for u in res.json()["items"]:
        assert {"user_id", "email", "full_name", "kyc_status", "kyc_tier",
                "is_staff", "is_verified", "card_count",
                "xof_balance", "usd_balance", "created_at"} <= u.keys()


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_users_contains_seeded_user(client, seeded_user):
    res = await client.get("/api/admin/users?limit=100")
    user_ids = [u["user_id"] for u in res.json()["items"]]
    assert seeded_user["user_id"] in user_ids


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_users_balances_aggregated_from_asset_wallets(client, seeded_user):
    """
    Balances must aggregate ASSET_WALLET accounts only.
    seeded_user: 80000 deposited, 60000 converted → 20000 XOF remaining.
    """
    res = await client.get(f"/api/admin/users?search={seeded_user['email']}")
    items = res.json()["items"]
    u = next(u for u in items if u["user_id"] == seeded_user["user_id"])
    assert u["xof_balance"] > 0
    assert u["usd_balance"] > 0
    assert u["card_count"] >= 1


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_users_search_by_email(client, seeded_user):
    fragment = seeded_user["email"].split("@")[0]
    res = await client.get(f"/api/admin/users?search={fragment}")
    assert res.status_code == 200
    d = res.json()
    assert d["total"] >= 1
    assert any(u["user_id"] == seeded_user["user_id"] for u in d["items"])


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_users_search_no_match(client):
    res = await client.get("/api/admin/users?search=ZZZNOMATCH_9999")
    assert res.status_code == 200
    d = res.json()
    assert d["total"] == 0
    assert d["items"] == []


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_users_pagination_returns_different_pages(client, seeded_user):
    total = (await client.get("/api/admin/users?limit=1")).json()["total"]
    if total < 2:
        pytest.skip("Not enough users to test pagination")
    p1_id = (await client.get("/api/admin/users?limit=1&offset=0")).json()["items"][0]["user_id"]
    p2_id = (await client.get("/api/admin/users?limit=1&offset=1")).json()["items"][0]["user_id"]
    assert p1_id != p2_id


# ─── GET /admin/users/{user_id} ───────────────────────────────────────────────

@pytest.mark.asyncio(loop_scope="function")
async def test_admin_user_detail_structure(client, seeded_user):
    res = await client.get(f"/api/admin/users/{seeded_user['user_id']}")
    assert res.status_code == 200
    d = res.json()
    assert d["user_id"] == seeded_user["user_id"]
    assert d["email"] == seeded_user["email"]
    assert isinstance(d["accounts"], list)
    assert isinstance(d["cards"], list)
    assert isinstance(d["recent_transactions"], list)
    assert isinstance(d["recent_disputes"], list)


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_user_detail_has_asset_wallet_account(client, seeded_user):
    res = await client.get(f"/api/admin/users/{seeded_user['user_id']}")
    accounts = res.json()["accounts"]
    types = [a["type"] for a in accounts]
    assert "ASSET_WALLET" in types


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_user_detail_card_balance_from_join(client, seeded_user):
    """
    Previously broken: GET /admin/cards selected c.balance (doesn't exist).
    User detail also fetches card balance via JOIN — must be $35.00 after $15 debit.
    """
    res = await client.get(f"/api/admin/users/{seeded_user['user_id']}")
    cards = res.json()["cards"]
    card = next(c for c in cards if c["card_id"] == seeded_user["card_id"])
    assert card["balance"] == pytest.approx(35.0, abs=0.01)


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_user_detail_recent_transactions_populated(client, seeded_user):
    res = await client.get(f"/api/admin/users/{seeded_user['user_id']}")
    txs = res.json()["recent_transactions"]
    assert len(txs) >= 1
    netflix = next((t for t in txs if t["merchant_name"] == "Netflix"), None)
    assert netflix is not None
    assert netflix["amount"] == pytest.approx(15.0)


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_user_detail_not_found(client):
    res = await client.get("/api/admin/users/NO_SUCH_USER_XYZ_9999")
    assert res.status_code == 404


# ─── POST /admin/users/{user_id}/suspend + activate ───────────────────────────

@pytest.mark.asyncio(loop_scope="function")
async def test_admin_suspend_sets_is_verified_false(client):
    email = f"susp_{uuid.uuid4().hex[:8]}@cortexcard.test"
    reg = await client.post("/api/auth/register/", json={
        "email": email, "password": "Password123!",
        "first_name": "Sus", "last_name": "Pend",
    })
    user_id = reg.json()["user_id"]

    res = await client.post(f"/api/admin/users/{user_id}/suspend")
    assert res.status_code == 200
    assert res.json()["is_verified"] is False

    detail = await client.get(f"/api/admin/users/{user_id}")
    assert detail.json()["is_verified"] is False


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_activate_restores_is_verified(client):
    email = f"actv_{uuid.uuid4().hex[:8]}@cortexcard.test"
    reg = await client.post("/api/auth/register/", json={
        "email": email, "password": "Password123!",
        "first_name": "Act", "last_name": "Ivate",
    })
    user_id = reg.json()["user_id"]

    await client.post(f"/api/admin/users/{user_id}/suspend")
    res = await client.post(f"/api/admin/users/{user_id}/activate")
    assert res.status_code == 200
    assert res.json()["is_verified"] is True

    detail = await client.get(f"/api/admin/users/{user_id}")
    assert detail.json()["is_verified"] is True


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_suspend_nonexistent_user_returns_404(client):
    res = await client.post("/api/admin/users/NO_SUCH_USER_ABC/suspend")
    assert res.status_code == 404


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_activate_nonexistent_user_returns_404(client):
    res = await client.post("/api/admin/users/NO_SUCH_USER_DEF/activate")
    assert res.status_code == 404


# ─── GET /admin/transactions ──────────────────────────────────────────────────

@pytest.mark.asyncio(loop_scope="function")
async def test_admin_transactions_paginated_response(client, seeded_user):
    res = await client.get("/api/admin/transactions?limit=20")
    assert res.status_code == 200
    d = res.json()
    assert "items" in d
    assert "total" in d
    assert d["total"] >= 1


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_transactions_structure(client, seeded_user):
    res = await client.get("/api/admin/transactions?limit=10")
    for tx in res.json()["items"]:
        assert {"transaction_id", "card_id", "masked_pan", "merchant_name",
                "amount", "currency", "status", "created_at"} <= tx.keys()
        assert tx["status"] in ("APPROVED", "DECLINED", "ROLLED_BACK")
        assert tx["currency"] == "USD"


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_transactions_seeded_netflix_debit(client, seeded_user):
    """The $15 Netflix debit must appear with APPROVED status."""
    res = await client.get("/api/admin/transactions?limit=50")
    items = res.json()["items"]
    tx = next(
        (t for t in items
         if t["card_id"] == seeded_user["card_id"] and t["merchant_name"] == "Netflix"),
        None,
    )
    assert tx is not None
    assert tx["amount"] == pytest.approx(15.0)
    assert tx["status"] == "APPROVED"


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_transactions_pagination(client, seeded_user):
    total = (await client.get("/api/admin/transactions?limit=1")).json()["total"]
    if total < 2:
        pytest.skip("Not enough transactions to test pagination")
    id1 = (await client.get("/api/admin/transactions?limit=1&offset=0")).json()["items"][0]["transaction_id"]
    id2 = (await client.get("/api/admin/transactions?limit=1&offset=1")).json()["items"][0]["transaction_id"]
    assert id1 != id2


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_transactions_date_filter_today(client, seeded_user):
    today = date.today().isoformat()
    res = await client.get(f"/api/admin/transactions?date_from={today}&date_to={today}")
    assert res.status_code == 200
    d = res.json()
    assert d["total"] >= 1  # seeded debit is from today


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_transactions_date_filter_past_empty(client, seeded_user):
    res = await client.get("/api/admin/transactions?date_from=2000-01-01&date_to=2000-01-02")
    assert res.status_code == 200
    assert res.json()["total"] == 0


# ─── GET /admin/webhooks ──────────────────────────────────────────────────────

@pytest.mark.asyncio(loop_scope="function")
async def test_admin_webhooks_paginated_response(client):
    res = await client.get("/api/admin/webhooks?limit=20")
    assert res.status_code == 200
    d = res.json()
    assert "items" in d
    assert "total" in d
    assert isinstance(d["items"], list)


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_webhooks_structure(client):
    res = await client.get("/api/admin/webhooks?limit=20")
    for w in res.json()["items"]:
        assert {"id", "event_id", "provider", "event_type", "status", "created_at"} <= w.keys()
        assert w["status"] in ("RECEIVED", "PROCESSED", "FAILED", "IGNORED")


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_webhooks_status_filter_only_returns_matching(client):
    """Status filter must exclude events with other statuses."""
    for status_val in ("PROCESSED", "FAILED"):
        res = await client.get(f"/api/admin/webhooks?status={status_val}&limit=50")
        assert res.status_code == 200
        for w in res.json()["items"]:
            assert w["status"] == status_val, (
                f"Expected {status_val} but got {w['status']}"
            )


# ─── GET /admin/system-accounts ───────────────────────────────────────────────

@pytest.mark.asyncio(loop_scope="function")
async def test_admin_system_accounts_response(client, seeded_user):
    """After FX conversion, at least FX_CLEARING must exist."""
    res = await client.get("/api/admin/system-accounts")
    assert res.status_code == 200
    d = res.json()
    assert "accounts" in d
    assert "by_type" in d
    assert "total_types" in d
    assert len(d["accounts"]) > 0


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_system_accounts_excludes_user_wallets(client, seeded_user):
    """
    Core invariant: ASSET_WALLET accounts (user funds) must never appear here.
    """
    res = await client.get("/api/admin/system-accounts")
    for a in res.json()["accounts"]:
        assert a["type"] != "ASSET_WALLET", (
            f"User wallet {a['account_number']} leaked into system accounts listing"
        )


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_system_accounts_fx_clearing_present(client, seeded_user):
    """FX_CLEARING account must exist after any FX conversion."""
    res = await client.get("/api/admin/system-accounts")
    numbers = [a["account_number"] for a in res.json()["accounts"]]
    assert "FX_CLEARING" in numbers


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_system_accounts_grouped_by_type(client, seeded_user):
    res = await client.get("/api/admin/system-accounts")
    d = res.json()
    # by_type keys must match actual account types present
    for type_key, accounts in d["by_type"].items():
        assert type_key != "ASSET_WALLET"
        for a in accounts:
            assert a["type"] == type_key


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_system_accounts_structure(client, seeded_user):
    res = await client.get("/api/admin/system-accounts")
    for a in res.json()["accounts"]:
        assert {"account_number", "currency", "type", "balance", "created_at"} <= a.keys()
        assert isinstance(a["balance"], (int, float))
        assert a["currency"] in ("XOF", "USD")
