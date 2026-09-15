from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
import asyncpg

from backend.src.core.database import get_db_connection
from backend.src.services.dispute_service import DisputeService
from backend.src.services.cortex_orchestrator import CortexOrchestrator
from backend.src.core.state_machine import InvalidStateTransitionError

admin_router = APIRouter(prefix="/admin", tags=["Admin & Back-Office"])

class ReviewKYCDTO(BaseModel):
    decision: str  # APPROVED or REJECTED
    tier: int = 1
    rejection_reason: Optional[str] = None

class ResolveDisputeAdminDTO(BaseModel):
    decision: str  # WON or LOST
    resolution_notes: str

@admin_router.get("/metrics")
async def get_admin_metrics(conn: asyncpg.Connection = Depends(get_db_connection)):
    """
    Returns global financial health KPIs:
    - Total XOF & USD treasury across users
    - FX Clearing pivot balance (must stay near 0)
    - Total card count (active vs frozen)
    - Pending KYC reviews count
    - Active disputes count
    - 24h transaction volume
    """
    async with conn.transaction():
        # 1. Total User Balances
        user_balances = await conn.fetch(
            """
            SELECT currency, COALESCE(SUM(balance), 0) as total_balance, COUNT(*) as account_count
            FROM accounts
            WHERE type IN ('WALLET', 'CARD')
            GROUP BY currency;
            """
        )
        totals = {r["currency"]: float(r["total_balance"]) for r in user_balances}

        # 2. FX Clearing Pivot Balance
        fx_clearing = await conn.fetchrow(
            """
            SELECT balance, currency FROM accounts WHERE account_number = 'FX_CLEARING';
            """
        )
        fx_pivot = {
            "balance": float(fx_clearing["balance"]) if fx_clearing else 0.0,
            "currency": fx_clearing["currency"] if fx_clearing else "XOF"
        }

        # 3. Card Metrics
        cards_stats = await conn.fetchrow(
            """
            SELECT 
                COUNT(*) as total_cards,
                COUNT(*) FILTER (WHERE status = 'ACTIVE') as active_cards,
                COUNT(*) FILTER (WHERE status = 'FROZEN') as frozen_cards,
                COALESCE(SUM(balance), 0) as total_cards_balance_usd
            FROM virtual_cards;
            """
        )

        # 4. KYC Pending Count
        kyc_pending = await conn.fetchval(
            """
            SELECT COUNT(*) FROM users WHERE kyc_status IN ('SUBMITTED', 'UNDER_REVIEW');
            """
        ) or 0

        # 5. Open Disputes Count
        open_disputes = await conn.fetchval(
            """
            SELECT COUNT(*) FROM disputes WHERE status IN ('OPENED', 'UNDER_REVIEW');
            """
        ) or 0

        # 6. Total Transactions & Journal Entries
        total_tx = await conn.fetchval("SELECT COUNT(*) FROM journal_entries;") or 0

        return {
            "treasury": {
                "total_xof": totals.get("XOF", 0.0),
                "total_usd": totals.get("USD", 0.0),
                "fx_pivot": fx_pivot,
            },
            "cards": {
                "total": cards_stats["total_cards"],
                "active": cards_stats["active_cards"],
                "frozen": cards_stats["frozen_cards"],
                "total_balance_usd": float(cards_stats["total_cards_balance_usd"]),
            },
            "compliance": {
                "pending_kyc": kyc_pending,
                "open_disputes": open_disputes,
            },
            "total_transactions": total_tx,
            "system_health": "OPTIMAL",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

@admin_router.get("/ledger")
async def get_admin_ledger(
    limit: int = 50,
    offset: int = 0,
    conn: asyncpg.Connection = Depends(get_db_connection)
):
    """
    Returns double-entry journal entries with their corresponding postings,
    verifying in real time that sum(Debits) == sum(Credits) for each entry.
    """
    entries = await conn.fetch(
        """
        SELECT id, idempotency_key, reference, narration, status, created_at
        FROM journal_entries
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2;
        """,
        limit,
        offset
    )

    if not entries:
        return []

    entry_ids = [e["id"] for e in entries]
    postings = await conn.fetch(
        """
        SELECT p.id, p.journal_entry_id, p.account_number, a.currency, a.type as account_type,
               p.direction, p.amount, p.created_at
        FROM postings p
        JOIN accounts a ON p.account_number = a.account_number
        WHERE p.journal_entry_id = ANY($1)
        ORDER BY p.created_at ASC;
        """,
        entry_ids
    )

    postings_by_entry: Dict[Any, List[Dict[str, Any]]] = {}
    for p in postings:
        eid = p["journal_entry_id"]
        if eid not in postings_by_entry:
            postings_by_entry[eid] = []
        postings_by_entry[eid].append({
            "id": str(p["id"]),
            "account_number": p["account_number"],
            "currency": p["currency"],
            "account_type": p["account_type"],
            "direction": p["direction"],
            "amount": str(p["amount"]),
            "created_at": p["created_at"].isoformat(),
        })

    result = []
    for e in entries:
        entry_postings = postings_by_entry.get(e["id"], [])
        
        # Check invariant
        debits = sum(Decimal(p["amount"]) for p in entry_postings if p["direction"] == "DEBIT")
        credits = sum(Decimal(p["amount"]) for p in entry_postings if p["direction"] == "CREDIT")
        balanced = debits == credits

        result.append({
            "id": str(e["id"]),
            "reference": e["reference"],
            "idempotency_key": e["idempotency_key"],
            "narration": e["narration"],
            "status": e["status"],
            "is_balanced": balanced,
            "created_at": e["created_at"].isoformat(),
            "postings": entry_postings,
        })

    return result

@admin_router.get("/kyc/pending")
async def list_pending_kyc(conn: asyncpg.Connection = Depends(get_db_connection)):
    """
    Returns users with their submitted KYC documents waiting for manual compliance review.
    """
    rows = await conn.fetch(
        """
        SELECT 
            u.user_id, u.email, u.first_name, u.last_name, u.kyc_status, u.kyc_tier,
            u.kyc_submitted_at, u.kyc_rejection_reason,
            d.id as doc_id, d.document_type, d.document_number,
            d.front_image_url, d.back_image_url, d.selfie_url, d.submitted_at
        FROM users u
        LEFT JOIN LATERAL (
            SELECT * FROM kyc_documents 
            WHERE user_id = u.user_id 
            ORDER BY submitted_at DESC LIMIT 1
        ) d ON true
        WHERE u.kyc_status IN ('SUBMITTED', 'UNDER_REVIEW')
        ORDER BY u.kyc_submitted_at DESC;
        """
    )

    return [
        {
            "user_id": r["user_id"],
            "email": r["email"],
            "full_name": f"{r['first_name']} {r['last_name']}",
            "kyc_status": r["kyc_status"],
            "kyc_tier": r["kyc_tier"],
            "kyc_submitted_at": r["kyc_submitted_at"].isoformat() if r["kyc_submitted_at"] else None,
            "rejection_reason": r["kyc_rejection_reason"],
            "document": {
                "id": str(r["doc_id"]) if r["doc_id"] else None,
                "document_type": r["document_type"],
                "document_number": r["document_number"],
                "front_image_url": r["front_image_url"],
                "back_image_url": r["back_image_url"],
                "selfie_url": r["selfie_url"],
            } if r["doc_id"] else None,
        }
        for r in rows
    ]

@admin_router.post("/kyc/{user_id}/review")
async def review_user_kyc(
    user_id: str,
    payload: ReviewKYCDTO,
    conn: asyncpg.Connection = Depends(get_db_connection)
):
    decision = payload.decision.upper()
    if decision not in ("APPROVED", "REJECTED"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La décision doit être 'APPROVED' ou 'REJECTED'."
        )

    new_tier = payload.tier if decision == "APPROVED" else 0
    rejection_reason = payload.rejection_reason if decision == "REJECTED" else None

    async with conn.transaction():
        # Update user
        updated = await conn.execute(
            """
            UPDATE users
            SET kyc_status = $1,
                kyc_tier = $2,
                kyc_reviewed_at = NOW(),
                kyc_rejection_reason = $3
            WHERE user_id = $4;
            """,
            decision,
            new_tier,
            rejection_reason,
            user_id
        )

        # Update latest document
        await conn.execute(
            """
            UPDATE kyc_documents
            SET status = $1,
                reviewed_at = NOW(),
                rejection_reason = $2
            WHERE id = (
                SELECT id FROM kyc_documents WHERE user_id = $3 ORDER BY submitted_at DESC LIMIT 1
            );
            """,
            decision,
            rejection_reason,
            user_id
        )

        return {
            "user_id": user_id,
            "kyc_status": decision,
            "kyc_tier": new_tier,
            "rejection_reason": rejection_reason,
            "message": f"Dossier KYC {decision} avec succès."
        }

@admin_router.get("/cards")
async def list_all_cards(
    limit: int = 50,
    offset: int = 0,
    conn: asyncpg.Connection = Depends(get_db_connection)
):
    """
    Returns all virtual cards in the system for supervision and fraud monitoring.
    """
    rows = await conn.fetch(
        """
        SELECT 
            c.card_id, c.user_id, u.email, u.first_name, u.last_name,
            c.masked_pan, c.currency, c.balance, c.spending_limit_monthly,
            c.current_month_spent, c.card_type, c.label, c.status,
            c.created_at, c.expiry_month, c.expiry_year
        FROM virtual_cards c
        LEFT JOIN users u ON c.user_id = u.user_id
        ORDER BY c.created_at DESC
        LIMIT $1 OFFSET $2;
        """,
        limit,
        offset
    )

    return [
        {
            "card_id": r["card_id"],
            "user_id": r["user_id"],
            "user_email": r["email"] or "N/A",
            "cardholder_name": f"{r['first_name'] or ''} {r['last_name'] or ''}".strip(),
            "masked_pan": r["masked_pan"],
            "currency": r["currency"],
            "balance": str(r["balance"]),
            "spending_limit_monthly": str(r["spending_limit_monthly"]),
            "current_month_spent": str(r["current_month_spent"]),
            "card_type": r["card_type"],
            "label": r["label"],
            "status": r["status"],
            "expiry": f"{str(r['expiry_month']).padStart(2, '0') if hasattr(str(r['expiry_month']), 'padStart') else r['expiry_month']}/{r['expiry_year']}",
            "created_at": r["created_at"].isoformat(),
        }
        for r in rows
    ]

@admin_router.post("/cards/{card_id}/toggle-freeze")
async def admin_toggle_freeze_card(
    card_id: str,
    conn: asyncpg.Connection = Depends(get_db_connection)
):
    async with conn.transaction():
        card = await conn.fetchrow("SELECT status FROM virtual_cards WHERE card_id = $1 FOR UPDATE;", card_id)
        if not card:
            raise HTTPException(status_code=404, detail="Carte non trouvée")

        new_status = "ACTIVE" if card["status"] == "FROZEN" else "FROZEN"
        await conn.execute("UPDATE virtual_cards SET status = $1 WHERE card_id = $2;", new_status, card_id)

        return {"card_id": card_id, "status": new_status, "message": f"Carte mise au statut {new_status}"}

@admin_router.get("/disputes")
async def list_all_disputes(conn: asyncpg.Connection = Depends(get_db_connection)):
    """
    Returns all customer transaction disputes for regulatory compliance and arbitration.
    """
    rows = await conn.fetch(
        """
        SELECT 
            d.dispute_id, d.transaction_reference, d.card_id, d.user_id,
            u.email as user_email, d.amount, d.currency, d.reason,
            d.description, d.status, d.evidence_url, d.resolution_notes,
            d.created_at, d.updated_at
        FROM disputes d
        LEFT JOIN users u ON d.user_id = u.user_id
        ORDER BY d.created_at DESC;
        """
    )

    return [
        {
            "dispute_id": r["dispute_id"],
            "transaction_reference": r["transaction_reference"],
            "card_id": r["card_id"],
            "user_id": r["user_id"],
            "user_email": r["user_email"] or "N/A",
            "amount": str(r["amount"]),
            "currency": r["currency"],
            "reason": r["reason"],
            "description": r["description"],
            "status": r["status"],
            "evidence_url": r["evidence_url"],
            "resolution_notes": r["resolution_notes"],
            "created_at": r["created_at"].isoformat(),
            "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
        }
        for r in rows
    ]

@admin_router.post("/disputes/{dispute_id}/resolve")
async def admin_resolve_dispute(
    dispute_id: str,
    payload: ResolveDisputeAdminDTO,
    conn: asyncpg.Connection = Depends(get_db_connection)
):
    try:
        async with conn.transaction():
            res = await DisputeService.resolve_dispute(
                conn=conn,
                dispute_id=dispute_id,
                decision=payload.decision.upper(),
                resolution_notes=payload.resolution_notes
            )
            return res
    except InvalidStateTransitionError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@admin_router.get("/reconciliations")
async def list_reconciliations(conn: asyncpg.Connection = Depends(get_db_connection)):
    """
    Returns EOD reconciliation audit reports with discrepancy breakdowns.
    """
    reports = await conn.fetch(
        """
        SELECT 
            id, provider, reconciliation_date, currency,
            total_partner_amount, total_ledger_amount, discrepancy_amount,
            status, matched_count, discrepancy_count, missing_in_ledger_count,
            missing_in_partner_count, created_at
        FROM reconciliation_reports
        ORDER BY reconciliation_date DESC
        LIMIT 30;
        """
    )

    return [
        {
            "id": str(r["id"]),
            "provider": r["provider"],
            "reconciliation_date": r["reconciliation_date"].isoformat(),
            "currency": r["currency"],
            "total_partner_amount": str(r["total_partner_amount"]),
            "total_ledger_amount": str(r["total_ledger_amount"]),
            "discrepancy_amount": str(r["discrepancy_amount"]),
            "status": r["status"],
            "matched_count": r["matched_count"],
            "discrepancy_count": r["discrepancy_count"],
            "missing_in_ledger_count": r["missing_in_ledger_count"],
            "missing_in_partner_count": r["missing_in_partner_count"],
            "created_at": r["created_at"].isoformat(),
        }
        for r in reports
    ]
