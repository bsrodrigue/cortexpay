import pytest
from decimal import Decimal
import uuid
import asyncpg
from backend.src.core.config import settings
from backend.src.domain.models import PostingDirection, PostingCreate, JournalEntryCreate, AccountType
from backend.src.services.ledger import LedgerService
from backend.src.services.cortex_orchestrator import CortexOrchestrator
from backend.src.services.fx_engine import FXEngineService
from backend.src.adapters.payment_gateway import MobileMoneyDepositRequest
from backend.src.core.redis_client import init_redis, close_redis

@pytest.fixture
async def db_conn():
    conn = await asyncpg.connect(settings.DATABASE_URL)
    yield conn
    await conn.close()

@pytest.fixture
async def redis_conn():
    r = await init_redis()
    yield r
    await close_redis()

@pytest.mark.asyncio(loop_scope="function")
async def test_immutability_triggers(db_conn):
    """
    Validation non-négociable S1:
    Triggers PostgreSQL interdisant UPDATE et DELETE sur journal_entries et postings.
    """
    user_id = f"test_immut_{uuid.uuid4().hex[:6]}"
    acc = await LedgerService.create_account(
        db_conn, f"ACC_IMMUT_{user_id}", user_id, "XOF", AccountType.ASSET_WALLET.value, Decimal("100.0000")
    )
    partner = await LedgerService.get_or_create_system_account(
        db_conn, f"SYS_IMMUT_{user_id}", "XOF", AccountType.PAYMENT_PARTNER.value
    )

    entry = JournalEntryCreate(
        idempotency_key=f"IMMUT_{uuid.uuid4().hex}",
        reference="REF_TEST",
        narration="Immutability test entry",
        postings=[
            PostingCreate(account_id=partner["id"], amount=Decimal("100.0000"), direction=PostingDirection.DEBIT, currency="XOF", sequence_no=1),
            PostingCreate(account_id=acc["id"], amount=Decimal("100.0000"), direction=PostingDirection.CREDIT, currency="XOF", sequence_no=2)
        ]
    )
    created = await LedgerService.record_journal_entry(db_conn, entry)
    entry_id = created["id"]

    # 1. Attempt to UPDATE journal_entries -> Must fail with trigger exception
    with pytest.raises(asyncpg.RaiseError, match="COMPLIANCE VIOLATION"):
        await db_conn.execute("UPDATE journal_entries SET narration = 'HACK' WHERE id = $1", entry_id)

    # 2. Attempt to DELETE journal_entries -> Must fail
    with pytest.raises(asyncpg.RaiseError, match="COMPLIANCE VIOLATION"):
        await db_conn.execute("DELETE FROM journal_entries WHERE id = $1", entry_id)

    # 3. Attempt to UPDATE postings -> Must fail
    with pytest.raises(asyncpg.RaiseError, match="COMPLIANCE VIOLATION"):
        await db_conn.execute("UPDATE postings SET amount = 99999 WHERE entry_id = $1", entry_id)

    # 4. Attempt to DELETE postings -> Must fail
    with pytest.raises(asyncpg.RaiseError, match="COMPLIANCE VIOLATION"):
        await db_conn.execute("DELETE FROM postings WHERE entry_id = $1", entry_id)

@pytest.mark.asyncio(loop_scope="function")
async def test_full_fintech_flow(db_conn, redis_conn):
    """
    JALON 1:
    1. Recharge Mobile Money (Wave / OM) -> 65 000 XOF
    2. Devis FX Quote Locking 90s avec spread (+3.5% à +4.5%)
    3. Conversion XOF -> USD via FX_CLEARING
    4. Émission Carte Virtuelle USD + Provisionnement
    5. Débit Marchand SaaS (OpenAI 20$)
    6. Débit Marchand avec coupure réseau -> Rollback de compensation automatique
    """
    user_id = f"usr_{uuid.uuid4().hex[:8]}"

    # Step 1: Deposit 65,000 XOF via Wave USSD
    deposit_req = MobileMoneyDepositRequest(
        user_id=user_id,
        phone_number="+221770001122",
        operator="WAVE",
        amount=Decimal("65000.0000"),
        otp_code="123456"
    )
    async with db_conn.transaction():
        dep_res = await CortexOrchestrator.deposit_via_mobile_money(db_conn, deposit_req)
    assert dep_res["wallet"]["balance"] == Decimal("65000.0000")

    # Step 2: Request FX Quote for 60,000 XOF
    quote = await FXEngineService.create_locked_quote(
        conn=db_conn,
        redis_client=redis_conn,
        user_id=user_id,
        from_amount_xof=Decimal("60000.0000")
    )
    assert quote["ttl_remaining_seconds"] == 90
    assert quote["to_amount"] > Decimal("0.0000")

    # Step 3: Execute Conversion before TTL
    async with db_conn.transaction():
        conv_res = await CortexOrchestrator.execute_fx_conversion(
            conn=db_conn,
            redis_client=redis_conn,
            quote_id=quote["quote_id"],
            user_id=user_id,
            idempotency_key=f"CONV_{quote['quote_id']}"
        )
    assert conv_res["wallet_xof"]["balance"] == Decimal("5000.0000") # 65000 - 60000
    assert conv_res["wallet_usd"]["balance"] == quote["to_amount"]

    usd_available = conv_res["wallet_usd"]["balance"]

    # Step 4: Issue Virtual Card and fund with 50 USD
    funding_usd = min(Decimal("50.0000"), usd_available)
    async with db_conn.transaction():
        card = await CortexOrchestrator.create_virtual_card(
            conn=db_conn,
            user_id=user_id,
            cardholder_name="Solo Dev Lead",
            initial_funding_usd=funding_usd
        )
    assert card["status"] == "ACTIVE"
    assert card["balance"] == funding_usd
    assert card["pan"].startswith("4532")

    # Step 5: Simulate Merchant Debit (OpenAI API Subscription 20$)
    async with db_conn.transaction():
        debit_res = await CortexOrchestrator.simulate_merchant_debit(
            conn=db_conn,
            card_id=card["card_id"],
            merchant_name="OpenAI",
            amount_usd=Decimal("20.0000")
        )
    assert debit_res["approved"] is True
    assert debit_res["card_balance"] == (funding_usd - Decimal("20.0000"))

    # Step 6: Simulate Chaos Network Failure & Automated Rollback
    async with db_conn.transaction():
        chaos_res = await CortexOrchestrator.simulate_merchant_debit(
            conn=db_conn,
            card_id=card["card_id"],
            merchant_name="AWS Cloud",
            amount_usd=Decimal("15.0000"),
            simulate_network_failure_after_debit=True
        )
    assert chaos_res["approved"] is False
    assert chaos_res["rolled_back"] is True
    # Balance must be unchanged because compensation restored the 15 USD
    assert chaos_res["card_balance"] == (funding_usd - Decimal("20.0000"))
