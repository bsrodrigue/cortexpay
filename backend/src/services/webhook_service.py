import hmac
import hashlib
import json
import uuid
from datetime import datetime, timezone, date
from decimal import Decimal
from typing import Dict, Any, List, Optional
import asyncpg

from backend.src.core.config import settings
from backend.src.domain.models import (
    PostingDirection,
    PostingCreate,
    JournalEntryCreate,
    AccountType
)
from backend.src.services.ledger import LedgerService
from backend.src.services.cortex_orchestrator import CortexOrchestrator, OrchestratorError

class WebhookVerificationError(Exception):
    pass

class WebhookService:
    """
    Handles Inbound Webhooks with:
    - HMAC-SHA256 signature verification
    - Event deduplication and idempotency
    - Atomic processing onto the Double-Entry Ledger
    """

    @staticmethod
    def verify_signature(payload_bytes: bytes, signature_header: Optional[str], secret: Optional[str] = None) -> bool:
        if not signature_header:
            return False
        key = (secret or settings.WEBHOOK_SECRET_KEY.get_secret_value()).encode("utf-8")
        expected_sig = hmac.new(key, payload_bytes, hashlib.sha256).hexdigest()
        # Header may be in the format 't=...,v1=hash' or simply 'hash'
        clean_header = signature_header
        if "v1=" in signature_header:
            parts = signature_header.split(",")
            for p in parts:
                if p.startswith("v1="):
                    clean_header = p.split("v1=")[1]
                    break
        return hmac.compare_digest(expected_sig, clean_header)

    @staticmethod
    def compute_signature(payload_bytes: bytes, secret: Optional[str] = None) -> str:
        key = (secret or settings.WEBHOOK_SECRET_KEY.get_secret_value()).encode("utf-8")
        return hmac.new(key, payload_bytes, hashlib.sha256).hexdigest()

    @staticmethod
    async def process_inbound_webhook(
        conn: asyncpg.Connection,
        event_id: str,
        provider: str,
        event_type: str,
        payload: Dict[str, Any],
        signature_header: Optional[str] = None,
        verify_sig: bool = True
    ) -> Dict[str, Any]:
        """
        Idempotent Webhook processing.
        If event_id was already processed, return existing status without duplicate postings.
        """
        payload_raw = json.dumps(payload, sort_keys=True).encode("utf-8")
        if verify_sig:
            if not WebhookService.verify_signature(payload_raw, signature_header):
                raise WebhookVerificationError("Invalid HMAC-SHA256 signature.")

        # Check existing event
        existing = await conn.fetchrow(
            "SELECT * FROM webhook_events WHERE event_id = $1 FOR UPDATE",
            event_id
        )
        if existing:
            return {
                "event_id": event_id,
                "status": existing["status"],
                "already_processed": True,
                "message": "Event already recorded."
            }

        # Insert as RECEIVED
        await conn.execute(
            """
            INSERT INTO webhook_events (event_id, provider, event_type, payload, signature_header, status)
            VALUES ($1, $2, $3, $4, $5, 'RECEIVED');
            """,
            event_id,
            provider.upper(),
            event_type,
            json.dumps(payload),
            signature_header
        )

        try:
            journal_entry = None
            # Dispatch event
            if event_type in ["deposit.success", "payment.succeeded"]:
                user_id = payload["user_id"]
                amount_xof = Decimal(str(payload["amount"]))
                operator = payload.get("operator", provider).upper()

                # Idempotent double entry ledger settlement
                user_wallet = await CortexOrchestrator.get_or_create_user_wallet(conn, user_id, "XOF")
                partner_acc = await CortexOrchestrator.get_or_create_partner_account(conn, operator, "XOF")

                entry = JournalEntryCreate(
                    idempotency_key=f"WH_{event_id}",
                    reference=event_id,
                    narration=f"Async Webhook Deposit: {operator} {amount_xof} XOF for {user_id}",
                    postings=[
                        PostingCreate(
                            account_id=partner_acc["id"],
                            amount=amount_xof,
                            direction=PostingDirection.DEBIT,
                            currency="XOF",
                            sequence_no=1
                        ),
                        PostingCreate(
                            account_id=user_wallet["id"],
                            amount=amount_xof,
                            direction=PostingDirection.CREDIT,
                            currency="XOF",
                            sequence_no=2
                        )
                    ]
                )
                journal_entry = await LedgerService.record_journal_entry(conn, entry)

            elif event_type in ["card.authorization.settled"]:
                card_id = payload["card_id"]
                amount_usd = Decimal(str(payload["amount"]))
                merchant = payload.get("merchant_name", "Marchand")

                card = await conn.fetchrow("SELECT * FROM virtual_cards WHERE card_id = $1", card_id)
                if not card:
                    raise OrchestratorError(f"Card {card_id} not found for webhook.")

                card_acc = await conn.fetchrow("SELECT * FROM accounts WHERE id = $1", card["account_id"])
                merchant_acc = await LedgerService.get_or_create_system_account(
                    conn=conn,
                    account_number=f"MERCHANT_SETTLEMENT_{merchant.upper()}_USD",
                    currency="USD",
                    account_type=AccountType.PAYMENT_PARTNER.value
                )

                entry = JournalEntryCreate(
                    idempotency_key=f"WH_{event_id}",
                    reference=event_id,
                    narration=f"Async Webhook Card Debit at {merchant} for {amount_usd} USD",
                    postings=[
                        PostingCreate(
                            account_id=card_acc["id"],
                            amount=amount_usd,
                            direction=PostingDirection.DEBIT,
                            currency="USD",
                            sequence_no=1
                        ),
                        PostingCreate(
                            account_id=merchant_acc["id"],
                            amount=amount_usd,
                            direction=PostingDirection.CREDIT,
                            currency="USD",
                            sequence_no=2
                        )
                    ]
                )
                journal_entry = await LedgerService.record_journal_entry(conn, entry)
                await conn.execute(
                    "UPDATE virtual_cards SET current_month_spent = current_month_spent + $1 WHERE card_id = $2",
                    amount_usd,
                    card_id
                )

            # Mark event PROCESSED
            await conn.execute(
                """
                UPDATE webhook_events
                SET status = 'PROCESSED', processed_at = NOW()
                WHERE event_id = $1;
                """,
                event_id
            )

            return {
                "event_id": event_id,
                "status": "PROCESSED",
                "already_processed": False,
                "journal_entry": journal_entry
            }

        except Exception as e:
            await conn.execute(
                """
                UPDATE webhook_events
                SET status = 'FAILED', error_message = $1
                WHERE event_id = $2;
                """,
                str(e),
                event_id
            )
            raise


class ReconciliationService:
    """
    Automated Settlement Reconciliation Job (End of Day Batch).
    Compares Partner Statement items against internal Ledger Postings.
    Calculates discrepancies and logs items for financial audit.
    """

    @staticmethod
    async def run_partner_reconciliation(
        conn: asyncpg.Connection,
        provider: str,
        reconciliation_date: date,
        partner_statements: List[Dict[str, Any]],
        currency: str = "XOF"
    ) -> Dict[str, Any]:
        """
        partner_statements schema:
        [
            {"reference": "REF123", "amount": Decimal("50000.0000")},
            ...
        ]
        """
        batch_id = f"REC_{provider.upper()}_{reconciliation_date.strftime('%Y%m%d')}_{uuid.uuid4().hex[:6]}"

        # 1. Fetch all ledger postings for this partner account on that date
        partner_acc = await CortexOrchestrator.get_or_create_partner_account(conn, provider.upper(), currency)
        
        # Get all entries referencing this partner
        ledger_postings = await conn.fetch(
            """
            SELECT je.reference, p.amount, p.direction
            FROM postings p
            JOIN journal_entries je ON p.entry_id = je.id
            WHERE p.account_id = $1
              AND DATE(je.created_at) = $2;
            """,
            partner_acc["id"],
            reconciliation_date
        )

        ledger_map: Dict[str, Decimal] = {}
        total_ledger = Decimal("0.0000")
        for row in ledger_postings:
            ref = row["reference"]
            amt = Decimal(str(row["amount"]))
            # Net amount on partner account
            if row["direction"] == "DEBIT":
                ledger_map[ref] = ledger_map.get(ref, Decimal("0.0000")) + amt
                total_ledger += amt
            else:
                ledger_map[ref] = ledger_map.get(ref, Decimal("0.0000")) - amt
                total_ledger -= amt

        partner_map: Dict[str, Decimal] = {}
        total_partner = Decimal("0.0000")
        for item in partner_statements:
            ref = str(item["reference"])
            amt = Decimal(str(item["amount"]))
            partner_map[ref] = amt
            total_partner += amt

        # Comparison logic
        all_refs = set(ledger_map.keys()).union(set(partner_map.keys()))
        matched_count = 0
        discrepancy_count = 0
        discrepancies: List[Dict[str, Any]] = []

        for ref in all_refs:
            l_amt = ledger_map.get(ref)
            p_amt = partner_map.get(ref)

            if l_amt is not None and p_amt is not None:
                if l_amt == p_amt:
                    matched_count += 1
                else:
                    diff = abs(l_amt - p_amt)
                    discrepancy_count += 1
                    discrepancies.append({
                        "reference": ref,
                        "ledger_amount": l_amt,
                        "partner_amount": p_amt,
                        "discrepancy": diff,
                        "currency": currency,
                        "reason": "AMOUNT_MISMATCH"
                    })
            elif l_amt is not None and p_amt is None:
                discrepancy_count += 1
                discrepancies.append({
                    "reference": ref,
                    "ledger_amount": l_amt,
                    "partner_amount": None,
                    "discrepancy": l_amt,
                    "currency": currency,
                    "reason": "MISSING_IN_PARTNER"
                })
            elif l_amt is None and p_amt is not None:
                discrepancy_count += 1
                discrepancies.append({
                    "reference": ref,
                    "ledger_amount": None,
                    "partner_amount": p_amt,
                    "discrepancy": p_amt,
                    "currency": currency,
                    "reason": "MISSING_IN_LEDGER"
                })

        batch_status = "BALANCED" if discrepancy_count == 0 else "DISCREPANCY_DETECTED"
        discrepancy_total = abs(total_ledger - total_partner)

        # Store Batch Header
        await conn.execute(
            """
            INSERT INTO reconciliation_batches (
                batch_id, provider, reconciliation_date, total_ledger_amount,
                total_partner_amount, discrepancy_amount, currency, status,
                matched_count, discrepancy_count
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);
            """,
            batch_id,
            provider.upper(),
            reconciliation_date,
            total_ledger,
            total_partner,
            discrepancy_total,
            currency,
            batch_status,
            matched_count,
            discrepancy_count
        )

        # Store Discrepancy Items
        for disc in discrepancies:
            await conn.execute(
                """
                INSERT INTO reconciliation_items (
                    batch_id, reference, ledger_amount, partner_amount,
                    discrepancy, currency, reason, status
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN');
                """,
                batch_id,
                disc["reference"],
                disc["ledger_amount"],
                disc["partner_amount"],
                disc["discrepancy"],
                disc["currency"],
                disc["reason"]
            )

        return {
            "batch_id": batch_id,
            "provider": provider.upper(),
            "reconciliation_date": reconciliation_date.isoformat(),
            "status": batch_status,
            "total_ledger": total_ledger,
            "total_partner": total_partner,
            "discrepancy_total": discrepancy_total,
            "matched_count": matched_count,
            "discrepancy_count": discrepancy_count,
            "discrepancies": discrepancies
        }
