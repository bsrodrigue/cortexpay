from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import asyncpg
import redis.asyncio as aioredis

from backend.src.core.database import get_db_connection
from backend.src.core.redis_client import get_redis
from backend.src.services.cortex_orchestrator import CortexOrchestrator, OrchestratorError
from backend.src.services.ledger import InsufficientFundsError, LedgerError
from backend.src.services.fx_engine import FXEngineService, FXQuoteExpiredError, FXQuoteNotFoundError
from backend.src.adapters.payment_gateway import MobileMoneyDepositRequest
from backend.src.adapters.card_issuer import MockCardIssuer

router = APIRouter()

# Schema inputs
class DepositRequestDTO(BaseModel):
    user_id: str
    phone_number: str
    operator: str # WAVE or ORANGE_MONEY
    amount: Decimal
    otp_code: str # default '123456'

class QuoteRequestDTO(BaseModel):
    user_id: str
    from_amount_xof: Decimal

class ConvertRequestDTO(BaseModel):
    user_id: str
    quote_id: str
    idempotency_key: str

class CardIssueRequestDTO(BaseModel):
    user_id: str
    cardholder_name: str
    initial_funding_usd: Decimal = Decimal("0.0000")

class MerchantDebitRequestDTO(BaseModel):
    card_id: str
    merchant_name: str
    amount_usd: Decimal
    simulate_network_failure: bool = False

# 0. Connectivity Ping
@router.get("/ping")
async def ping():
    return {
        "status": "ok",
        "message": "pong",
        "service": "cortex-pay",
        "version": "1.0.0"
    }

# 1. Accounts & Wallets
@router.get("/wallets/{user_id}")
async def get_wallets(user_id: str, conn: asyncpg.Connection = Depends(get_db_connection)):
    xof_wallet = await CortexOrchestrator.get_or_create_user_wallet(conn, user_id, "XOF")
    usd_wallet = await CortexOrchestrator.get_or_create_user_wallet(conn, user_id, "USD")
    return {
        "user_id": user_id,
        "wallets": {
            "XOF": xof_wallet,
            "USD": usd_wallet
        }
    }

# 2. Deposit Mobile Money (Wave / Orange Money)
@router.post("/deposit/mobile-money")
async def deposit_mobile_money(
    payload: DepositRequestDTO,
    conn: asyncpg.Connection = Depends(get_db_connection)
):
    try:
        req = MobileMoneyDepositRequest(
            user_id=payload.user_id,
            phone_number=payload.phone_number,
            operator=payload.operator,
            amount=payload.amount,
            otp_code=payload.otp_code
        )
        async with conn.transaction():
            res = await CortexOrchestrator.deposit_via_mobile_money(conn, req)
            return res
    except OrchestratorError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

# 3. FX Quote Engine (Quote Locking with 90s TTL)
@router.post("/fx/quote")
async def get_fx_quote(
    payload: QuoteRequestDTO,
    conn: asyncpg.Connection = Depends(get_db_connection),
    redis_client: aioredis.Redis = Depends(get_redis)
):
    try:
        quote = await FXEngineService.create_locked_quote(
            conn=conn,
            redis_client=redis_client,
            user_id=payload.user_id,
            from_amount_xof=payload.amount_xof if hasattr(payload, 'amount_xof') else payload.from_amount_xof
        )
        return quote
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

# 4. FX Execution
@router.post("/fx/convert")
async def execute_fx_conversion(
    payload: ConvertRequestDTO,
    conn: asyncpg.Connection = Depends(get_db_connection),
    redis_client: aioredis.Redis = Depends(get_redis)
):
    try:
        async with conn.transaction():
            res = await CortexOrchestrator.execute_fx_conversion(
                conn=conn,
                redis_client=redis_client,
                quote_id=payload.quote_id,
                user_id=payload.user_id,
                idempotency_key=payload.idempotency_key
            )
            return res
    except FXQuoteExpiredError as e:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail=str(e))
    except InsufficientFundsError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

# 5. Virtual Cards
@router.post("/cards/issue")
async def issue_virtual_card(
    payload: CardIssueRequestDTO,
    conn: asyncpg.Connection = Depends(get_db_connection)
):
    try:
        async with conn.transaction():
            # Regulatory KYC Invariant: User must have verified identity (Tier >= 1)
            user = await conn.fetchrow("SELECT kyc_status, kyc_tier FROM users WHERE user_id = $1", payload.user_id)
            if user and (user["kyc_tier"] < 1 or user["kyc_status"] != "APPROVED"):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Conformité réglementaire requise : Vous devez valider votre identité (KYC Tier 1) pour émettre une carte Visa."
                )

            card = await CortexOrchestrator.create_virtual_card(
                conn=conn,
                user_id=payload.user_id,
                cardholder_name=payload.cardholder_name,
                initial_funding_usd=payload.initial_funding_usd
            )
            return card
    except HTTPException:
        raise
    except InsufficientFundsError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.get("/cards/{user_id}")
async def get_user_cards(user_id: str, conn: asyncpg.Connection = Depends(get_db_connection)):
    query = """
        SELECT vc.*, a.balance
        FROM virtual_cards vc
        JOIN accounts a ON vc.account_id = a.id
        WHERE vc.user_id = $1
        ORDER BY vc.created_at DESC;
    """
    rows = await conn.fetch(query, user_id)
    return [dict(r) for r in rows]

@router.post("/cards/{card_id}/toggle-freeze")
async def toggle_freeze_card(card_id: str, conn: asyncpg.Connection = Depends(get_db_connection)):
    card = await conn.fetchrow("SELECT status FROM virtual_cards WHERE card_id = $1", card_id)
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")
    new_status = "FROZEN" if card["status"] == "ACTIVE" else "ACTIVE"
    await conn.execute("UPDATE virtual_cards SET status = $1 WHERE card_id = $2", new_status, card_id)
    return {"card_id": card_id, "status": new_status}

# 6. Merchant Debit Simulation & Chaos Rollback
@router.post("/cards/simulate-merchant-debit")
async def simulate_merchant_debit(
    payload: MerchantDebitRequestDTO,
    conn: asyncpg.Connection = Depends(get_db_connection)
):
    try:
        async with conn.transaction():
            res = await CortexOrchestrator.simulate_merchant_debit(
                conn=conn,
                card_id=payload.card_id,
                merchant_name=payload.merchant_name,
                amount_usd=payload.amount_usd,
                simulate_network_failure_after_debit=payload.simulate_network_failure
            )
            return res
    except OrchestratorError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

# 7. Audit Ledger History
@router.get("/ledger/audit-entries")
async def get_ledger_entries(limit: int = 50, conn: asyncpg.Connection = Depends(get_db_connection)):
    entries_query = """
        SELECT je.id, je.idempotency_key, je.reference, je.narration, je.status, je.created_at,
               json_agg(json_build_object(
                   'id', p.id,
                   'account_id', p.account_id,
                   'account_number', a.account_number,
                   'direction', p.direction,
                   'amount', p.amount,
                   'currency', p.currency
               ) ORDER BY p.sequence_no) as postings
        FROM journal_entries je
        JOIN postings p ON je.id = p.entry_id
        JOIN accounts a ON p.account_id = a.id
        GROUP BY je.id
        ORDER BY je.created_at DESC
        LIMIT $1;
    """
    rows = await conn.fetch(entries_query, limit)
    return [dict(r) for r in rows]
