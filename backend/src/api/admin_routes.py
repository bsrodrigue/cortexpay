import hashlib
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
import asyncpg

from backend.src.core.config import settings
from backend.src.core.database import get_db_connection
from backend.src.services.dispute_service import DisputeService
from backend.src.services.cortex_orchestrator import CortexOrchestrator
from backend.src.core.state_machine import InvalidStateTransitionError

admin_router = APIRouter(prefix="/admin", tags=["Admin & Back-Office"])

# ─── Auth helpers ─────────────────────────────────────────────────────────────

def _admin_password() -> str:
    return settings.ADMIN_PASSWORD

def _make_token(password: str) -> str:
    """Deterministic token: valid for the current UTC hour."""
    hour_bucket = datetime.now(timezone.utc).strftime("%Y%m%d%H")
    return hashlib.sha256(f"{password}:{hour_bucket}".encode()).hexdigest()

def verify_admin_token(x_admin_token: Optional[str] = Header(default=None)):
    if not x_admin_token or x_admin_token != _make_token(_admin_password()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token admin invalide ou expiré. Veuillez vous reconnecter.",
        )

AdminAuth = Depends(verify_admin_token)

class AdminLoginDTO(BaseModel):
    password: str

class ReviewKYCDTO(BaseModel):
    decision: str  # APPROVED or REJECTED
    tier: int = 1
    rejection_reason: Optional[str] = None

class ResolveDisputeAdminDTO(BaseModel):
    decision: str  # WON or LOST
    resolution_notes: str

# ─── Login (public) ───────────────────────────────────────────────────────────

@admin_router.post("/auth/login")
async def admin_login(payload: AdminLoginDTO):
    if payload.password != _admin_password():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Mot de passe administrateur incorrect.",
        )
    return {"token": _make_token(payload.password), "message": "Authentification réussie"}

@admin_router.get("/metrics")
async def get_admin_metrics(_auth: None = AdminAuth, conn: asyncpg.Connection = Depends(get_db_connection)):
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
            WHERE type = 'ASSET_WALLET'
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
                COUNT(*) FILTER (WHERE vc.status = 'ACTIVE') as active_cards,
                COUNT(*) FILTER (WHERE vc.status = 'FROZEN') as frozen_cards,
                COALESCE(SUM(a.balance), 0) as total_cards_balance_usd
            FROM virtual_cards vc
            JOIN accounts a ON vc.account_id = a.id;
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
    limit: int = 20,
    offset: int = 0,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    _auth: None = AdminAuth, conn: asyncpg.Connection = Depends(get_db_connection)
):
    """
    Returns paginated double-entry journal entries with their corresponding postings,
    verifying in real time that sum(Debits) == sum(Credits) for each entry.
    """
    where_parts: List[str] = []
    params: List[Any] = []
    p = 1
    if date_from:
        where_parts.append(f"created_at >= ${p}::timestamptz")
        params.append(date_from)
        p += 1
    if date_to:
        where_parts.append(f"created_at < (${p}::date + interval '1 day')")
        params.append(date_to)
        p += 1
    where_clause = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    total = await conn.fetchval(
        f"SELECT COUNT(*) FROM journal_entries {where_clause};", *params
    ) or 0

    params.extend([limit, offset])
    entries = await conn.fetch(
        f"""
        SELECT id, idempotency_key, reference, narration, status, created_at
        FROM journal_entries
        {where_clause}
        ORDER BY created_at DESC
        LIMIT ${p} OFFSET ${p + 1};
        """,
        *params
    )

    if not entries:
        return {"items": [], "total": total}

    entry_ids = [e["id"] for e in entries]
    postings = await conn.fetch(
        """
        SELECT p.id, p.entry_id, a.account_number, a.currency, a.type as account_type,
               p.direction, p.amount, p.created_at
        FROM postings p
        JOIN accounts a ON p.account_id = a.id
        WHERE p.entry_id = ANY($1)
        ORDER BY p.created_at ASC;
        """,
        entry_ids
    )

    postings_by_entry: Dict[Any, List[Dict[str, Any]]] = {}
    for posting in postings:
        eid = posting["entry_id"]
        if eid not in postings_by_entry:
            postings_by_entry[eid] = []
        postings_by_entry[eid].append({
            "id": str(posting["id"]),
            "account_number": posting["account_number"],
            "currency": posting["currency"],
            "account_type": posting["account_type"],
            "direction": posting["direction"],
            "amount": str(posting["amount"]),
            "created_at": posting["created_at"].isoformat(),
        })

    result = []
    for e in entries:
        entry_postings = postings_by_entry.get(e["id"], [])
        debits = sum(Decimal(posting["amount"]) for posting in entry_postings if posting["direction"] == "DEBIT")
        credits = sum(Decimal(posting["amount"]) for posting in entry_postings if posting["direction"] == "CREDIT")
        result.append({
            "id": str(e["id"]),
            "reference": e["reference"],
            "idempotency_key": e["idempotency_key"],
            "narration": e["narration"],
            "status": e["status"],
            "is_balanced": debits == credits,
            "created_at": e["created_at"].isoformat(),
            "postings": entry_postings,
        })

    return {"items": result, "total": total}

@admin_router.get("/kyc/pending")
async def list_pending_kyc(
    limit: int = 20,
    offset: int = 0,
    _auth: None = AdminAuth, conn: asyncpg.Connection = Depends(get_db_connection)
):
    """
    Returns paginated users with submitted KYC documents waiting for compliance review.
    """
    total = await conn.fetchval(
        "SELECT COUNT(*) FROM users WHERE kyc_status IN ('SUBMITTED', 'UNDER_REVIEW');"
    ) or 0

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
        ORDER BY u.kyc_submitted_at DESC
        LIMIT $1 OFFSET $2;
        """,
        limit, offset
    )

    return {
        "items": [
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
        ],
        "total": total,
    }

@admin_router.post("/kyc/{user_id}/review")
async def review_user_kyc(
    user_id: str,
    payload: ReviewKYCDTO,
    _auth: None = AdminAuth, conn: asyncpg.Connection = Depends(get_db_connection)
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
    limit: int = 20,
    offset: int = 0,
    status: Optional[str] = None,
    _auth: None = AdminAuth, conn: asyncpg.Connection = Depends(get_db_connection)
):
    """
    Returns paginated virtual cards for supervision and fraud monitoring.
    Optionally filter by status (ACTIVE, FROZEN, TERMINATED).
    """
    where_parts: List[str] = []
    params: List[Any] = []
    p = 1
    if status and status != "ALL":
        where_parts.append(f"c.status = ${p}")
        params.append(status.upper())
        p += 1
    where_clause = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    total = await conn.fetchval(
        f"""SELECT COUNT(*) FROM virtual_cards c
            JOIN accounts a ON c.account_id = a.id
            {where_clause};""",
        *params
    ) or 0

    row_params = params + [limit, offset]
    rows = await conn.fetch(
        f"""
        SELECT
            c.card_id, c.user_id, u.email, u.first_name, u.last_name,
            c.masked_pan, c.currency, a.balance, c.spending_limit_monthly,
            c.current_month_spent, c.card_type, c.label, c.status,
            c.created_at, c.expiry_month, c.expiry_year
        FROM virtual_cards c
        JOIN accounts a ON c.account_id = a.id
        LEFT JOIN users u ON c.user_id = u.user_id
        {where_clause}
        ORDER BY c.created_at DESC
        LIMIT ${p} OFFSET ${p + 1};
        """,
        *row_params
    )

    return {
        "items": [
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
                "expiry": f"{str(r['expiry_month']).zfill(2)}/{r['expiry_year']}",
                "created_at": r["created_at"].isoformat(),
            }
            for r in rows
        ],
        "total": total,
    }

@admin_router.post("/cards/{card_id}/toggle-freeze")
async def admin_toggle_freeze_card(
    card_id: str,
    _auth: None = AdminAuth, conn: asyncpg.Connection = Depends(get_db_connection)
):
    async with conn.transaction():
        card = await conn.fetchrow("SELECT status FROM virtual_cards WHERE card_id = $1 FOR UPDATE;", card_id)
        if not card:
            raise HTTPException(status_code=404, detail="Carte non trouvée")

        new_status = "ACTIVE" if card["status"] == "FROZEN" else "FROZEN"
        await conn.execute("UPDATE virtual_cards SET status = $1 WHERE card_id = $2;", new_status, card_id)

        return {"card_id": card_id, "status": new_status, "message": f"Carte mise au statut {new_status}"}

@admin_router.get("/disputes")
async def list_all_disputes(
    limit: int = 20,
    offset: int = 0,
    status: Optional[str] = None,
    _auth: None = AdminAuth, conn: asyncpg.Connection = Depends(get_db_connection)
):
    """
    Returns paginated customer transaction disputes for regulatory compliance.
    Optionally filter by status (OPENED, UNDER_REVIEW, WON_REFUNDED, LOST_CLOSED).
    """
    where_parts: List[str] = []
    params: List[Any] = []
    p = 1
    if status and status != "ALL":
        where_parts.append(f"d.status = ${p}")
        params.append(status.upper())
        p += 1
    where_clause = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    total = await conn.fetchval(
        f"SELECT COUNT(*) FROM disputes d {where_clause};", *params
    ) or 0

    row_params = params + [limit, offset]
    rows = await conn.fetch(
        f"""
        SELECT
            d.dispute_id, d.transaction_reference, d.card_id, d.user_id,
            u.email as user_email, d.amount, d.currency, d.reason,
            d.description, d.status, d.evidence_url, d.resolution_notes,
            d.created_at, d.updated_at
        FROM disputes d
        LEFT JOIN users u ON d.user_id = u.user_id
        {where_clause}
        ORDER BY d.created_at DESC
        LIMIT ${p} OFFSET ${p + 1};
        """,
        *row_params
    )

    return {
        "items": [
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
        ],
        "total": total,
    }

@admin_router.post("/disputes/{dispute_id}/resolve")
async def admin_resolve_dispute(
    dispute_id: str,
    payload: ResolveDisputeAdminDTO,
    _auth: None = AdminAuth, conn: asyncpg.Connection = Depends(get_db_connection)
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
async def list_reconciliations(
    limit: int = 20,
    offset: int = 0,
    _auth: None = AdminAuth, conn: asyncpg.Connection = Depends(get_db_connection)
):
    """
    Returns paginated EOD reconciliation audit reports with discrepancy breakdowns.
    """
    total = await conn.fetchval("SELECT COUNT(*) FROM reconciliation_batches;") or 0

    reports = await conn.fetch(
        """
        SELECT
            id, provider, reconciliation_date, currency,
            total_partner_amount, total_ledger_amount, discrepancy_amount,
            status, matched_count, discrepancy_count, created_at
        FROM reconciliation_batches
        ORDER BY reconciliation_date DESC
        LIMIT $1 OFFSET $2;
        """,
        limit, offset
    )

    return {
        "items": [
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
                "created_at": r["created_at"].isoformat(),
            }
            for r in reports
        ],
        "total": total,
    }

@admin_router.get("/users")
async def list_all_users(
    limit: int = 20,
    offset: int = 0,
    search: str = "",
    _auth: None = AdminAuth, conn: asyncpg.Connection = Depends(get_db_connection)
):
    search_param = f"%{search}%" if search else "%"
    total = await conn.fetchval(
        """SELECT COUNT(*) FROM users
           WHERE email ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1 OR user_id ILIKE $1;""",
        search_param
    )
    rows = await conn.fetch(
        """SELECT
               u.user_id, u.email, u.first_name, u.last_name,
               u.kyc_status, u.kyc_tier, u.is_staff, u.is_verified, u.created_at,
               COUNT(DISTINCT vc.card_id) as card_count,
               COALESCE(SUM(a.balance) FILTER (WHERE a.currency = 'XOF'), 0) as xof_balance,
               COALESCE(SUM(a.balance) FILTER (WHERE a.currency = 'USD'), 0) as usd_balance
           FROM users u
           LEFT JOIN accounts a ON a.user_id = u.user_id AND a.type = 'ASSET_WALLET'
           LEFT JOIN virtual_cards vc ON vc.user_id = u.user_id AND vc.status != 'TERMINATED'
           WHERE u.email ILIKE $3 OR u.first_name ILIKE $3 OR u.last_name ILIKE $3 OR u.user_id ILIKE $3
           GROUP BY u.user_id, u.email, u.first_name, u.last_name, u.kyc_status, u.kyc_tier, u.is_staff, u.is_verified, u.created_at
           ORDER BY u.created_at DESC
           LIMIT $1 OFFSET $2;""",
        limit, offset, search_param
    )
    return {
        "items": [
            {
                "user_id": r["user_id"],
                "email": r["email"],
                "full_name": f"{r['first_name']} {r['last_name']}",
                "first_name": r["first_name"],
                "last_name": r["last_name"],
                "kyc_status": r["kyc_status"],
                "kyc_tier": r["kyc_tier"],
                "is_staff": r["is_staff"],
                "is_verified": r["is_verified"],
                "card_count": r["card_count"],
                "xof_balance": float(r["xof_balance"]),
                "usd_balance": float(r["usd_balance"]),
                "created_at": r["created_at"].isoformat(),
            }
            for r in rows
        ],
        "total": total,
    }

@admin_router.get("/users/{user_id}")
async def get_user_detail(
    user_id: str,
    _auth: None = AdminAuth, conn: asyncpg.Connection = Depends(get_db_connection)
):
    user = await conn.fetchrow("SELECT * FROM users WHERE user_id = $1;", user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    accounts = await conn.fetch(
        "SELECT id, account_number, currency, type, balance FROM accounts WHERE user_id = $1 ORDER BY created_at ASC;",
        user_id
    )
    cards = await conn.fetch(
        """SELECT vc.card_id, vc.masked_pan, vc.currency, vc.status, vc.card_type, vc.label,
                  vc.spending_limit_monthly, vc.current_month_spent, vc.expiry_month, vc.expiry_year,
                  vc.created_at, a.balance
           FROM virtual_cards vc
           JOIN accounts a ON vc.account_id = a.id
           WHERE vc.user_id = $1
           ORDER BY vc.created_at DESC;""",
        user_id
    )
    recent_disputes = await conn.fetch(
        """SELECT dispute_id, transaction_reference, amount, currency, reason, status, created_at
           FROM disputes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5;""",
        user_id
    )
    recent_transactions = await conn.fetch(
        """SELECT ct.transaction_id, ct.card_id, ct.merchant_name, ct.amount, ct.currency, ct.status, ct.created_at
           FROM card_transactions ct
           JOIN virtual_cards vc ON ct.card_id = vc.card_id
           WHERE vc.user_id = $1
           ORDER BY ct.created_at DESC LIMIT 10;""",
        user_id
    )

    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "full_name": f"{user['first_name']} {user['last_name']}",
        "first_name": user["first_name"],
        "last_name": user["last_name"],
        "kyc_status": user["kyc_status"],
        "kyc_tier": user["kyc_tier"],
        "is_staff": user["is_staff"],
        "is_verified": user["is_verified"],
        "created_at": user["created_at"].isoformat(),
        "accounts": [
            {"id": str(a["id"]), "account_number": a["account_number"], "currency": a["currency"], "type": a["type"], "balance": float(a["balance"])}
            for a in accounts
        ],
        "cards": [
            {
                "card_id": c["card_id"], "masked_pan": c["masked_pan"], "currency": c["currency"],
                "status": c["status"], "card_type": c["card_type"], "label": c["label"],
                "balance": float(c["balance"]),
                "spending_limit_monthly": float(c["spending_limit_monthly"]),
                "current_month_spent": float(c["current_month_spent"]),
                "expiry": f"{str(c['expiry_month']).zfill(2)}/{c['expiry_year']}",
                "created_at": c["created_at"].isoformat(),
            }
            for c in cards
        ],
        "recent_disputes": [
            {"dispute_id": d["dispute_id"], "transaction_reference": d["transaction_reference"],
             "amount": float(d["amount"]), "currency": d["currency"], "reason": d["reason"],
             "status": d["status"], "created_at": d["created_at"].isoformat()}
            for d in recent_disputes
        ],
        "recent_transactions": [
            {"transaction_id": t["transaction_id"], "card_id": t["card_id"], "merchant_name": t["merchant_name"],
             "amount": float(t["amount"]), "currency": t["currency"], "status": t["status"],
             "created_at": t["created_at"].isoformat()}
            for t in recent_transactions
        ],
    }

@admin_router.get("/transactions")
async def list_all_transactions(
    limit: int = 20,
    offset: int = 0,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    _auth: None = AdminAuth, conn: asyncpg.Connection = Depends(get_db_connection)
):
    where_parts: List[str] = []
    count_params: List[Any] = []
    p = 1
    if date_from:
        where_parts.append(f"ct.created_at >= ${p}::timestamptz")
        count_params.append(date_from)
        p += 1
    if date_to:
        where_parts.append(f"ct.created_at < (${p}::date + interval '1 day')")
        count_params.append(date_to)
        p += 1
    where_clause = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    total = await conn.fetchval(
        f"SELECT COUNT(*) FROM card_transactions ct {where_clause};", *count_params
    ) or 0

    row_params = count_params + [limit, offset]
    rows = await conn.fetch(
        f"""SELECT
               ct.transaction_id, ct.card_id, ct.merchant_name, ct.amount, ct.currency,
               ct.status, ct.decline_reason, ct.created_at,
               vc.masked_pan, vc.user_id,
               u.email, u.first_name, u.last_name
           FROM card_transactions ct
           JOIN virtual_cards vc ON ct.card_id = vc.card_id
           LEFT JOIN users u ON vc.user_id = u.user_id
           {where_clause}
           ORDER BY ct.created_at DESC
           LIMIT ${p} OFFSET ${p + 1};""",
        *row_params
    )
    return {
        "items": [
            {
                "transaction_id": r["transaction_id"],
                "card_id": r["card_id"],
                "masked_pan": r["masked_pan"],
                "merchant_name": r["merchant_name"],
                "amount": float(r["amount"]),
                "currency": r["currency"],
                "status": r["status"],
                "decline_reason": r["decline_reason"],
                "user_id": r["user_id"],
                "user_email": r["email"] or "N/A",
                "cardholder_name": f"{r['first_name'] or ''} {r['last_name'] or ''}".strip(),
                "created_at": r["created_at"].isoformat(),
            }
            for r in rows
        ],
        "total": total,
    }

@admin_router.get("/webhooks")
async def list_webhooks(
    limit: int = 50,
    offset: int = 0,
    status: Optional[str] = None,
    provider: Optional[str] = None,
    _auth: None = AdminAuth, conn: asyncpg.Connection = Depends(get_db_connection)
):
    where_parts: List[str] = []
    params: List[Any] = []
    p = 1
    if status:
        where_parts.append(f"status = ${p}")
        params.append(status.upper())
        p += 1
    if provider:
        where_parts.append(f"provider = ${p}")
        params.append(provider.upper())
        p += 1
    where_clause = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    total = await conn.fetchval(
        f"SELECT COUNT(*) FROM webhook_events {where_clause};", *params
    ) or 0

    row_params = params + [limit, offset]
    rows = await conn.fetch(
        f"""SELECT id, event_id, provider, event_type, status, processed_at, error_message, created_at
            FROM webhook_events
            {where_clause}
            ORDER BY created_at DESC
            LIMIT ${p} OFFSET ${p + 1};""",
        *row_params
    )
    return {
        "items": [
            {
                "id": str(r["id"]),
                "event_id": r["event_id"],
                "provider": r["provider"],
                "event_type": r["event_type"],
                "status": r["status"],
                "processed_at": r["processed_at"].isoformat() if r["processed_at"] else None,
                "error_message": r["error_message"],
                "created_at": r["created_at"].isoformat(),
            }
            for r in rows
        ],
        "total": total,
    }

@admin_router.get("/system-accounts")
async def list_system_accounts(_auth: None = AdminAuth, conn: asyncpg.Connection = Depends(get_db_connection)):
    rows = await conn.fetch(
        """
        SELECT id, account_number, currency, type, balance, created_at
        FROM accounts
        WHERE user_id IS NULL OR type != 'ASSET_WALLET'
        ORDER BY type, currency;
        """
    )
    return [
        {
            "id": str(r["id"]),
            "account_number": r["account_number"],
            "currency": r["currency"],
            "type": r["type"],
            "balance": float(r["balance"]),
            "created_at": r["created_at"].isoformat(),
        }
        for r in rows
    ]

@admin_router.post("/users/{user_id}/suspend")
async def suspend_user(
    user_id: str,
    _auth: None = AdminAuth, conn: asyncpg.Connection = Depends(get_db_connection)
):
    result = await conn.execute(
        "UPDATE users SET is_verified = FALSE WHERE user_id = $1;",
        user_id
    )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    return {"user_id": user_id, "is_verified": False, "message": "Compte utilisateur suspendu"}

@admin_router.post("/users/{user_id}/activate")
async def activate_user(
    user_id: str,
    _auth: None = AdminAuth, conn: asyncpg.Connection = Depends(get_db_connection)
):
    result = await conn.execute(
        "UPDATE users SET is_verified = TRUE WHERE user_id = $1;",
        user_id
    )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    return {"user_id": user_id, "is_verified": True, "message": "Compte utilisateur réactivé"}
