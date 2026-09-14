from decimal import Decimal
import uuid
from typing import Dict, Any, List, Optional
import asyncpg

from backend.src.core.state_machine import (
    DisputeStateMachine,
    DisputeStatus,
    DisputeEvent,
    InvalidStateTransitionError,
)
from backend.src.domain.models import PostingDirection, PostingCreate, JournalEntryCreate, AccountType
from backend.src.services.ledger import LedgerService
from backend.src.services.cortex_orchestrator import CortexOrchestrator, OrchestratorError

class DisputeService:
    """
    Visa Card Dispute & Chargeback Management Service.
    Enforces strict FSM transitions:
    - OPENED: User flags unauthorized transaction or failure to deliver.
    - UNDER_REVIEW: Evidence provided; dispute under investigation.
    - WON_REFUNDED: Chargeback approved; double-entry refund posted directly to user's USD wallet.
    - LOST_CLOSED: Dispute dismissed; no ledger impact.
    """

    @staticmethod
    async def open_dispute(
        conn: asyncpg.Connection,
        user_id: str,
        transaction_reference: str,
        card_id: str,
        amount: Decimal,
        reason: str,
        description: Optional[str] = None,
        evidence_url: Optional[str] = None,
        currency: str = "USD"
    ) -> Dict[str, Any]:
        dispute_id = f"DISP_{uuid.uuid4().hex[:10].upper()}"

        # Ensure transaction exists and belongs to user
        tx = await conn.fetchrow(
            "SELECT * FROM journal_entries WHERE reference = $1;",
            transaction_reference
        )
        if not tx:
            raise OrchestratorError(f"Transaction reference '{transaction_reference}' not found in ledger.")

        # Ensure no open dispute already exists for this transaction
        existing = await conn.fetchrow(
            "SELECT * FROM disputes WHERE transaction_reference = $1 AND status NOT IN ('LOST_CLOSED');",
            transaction_reference
        )
        if existing:
            raise OrchestratorError(f"An active dispute already exists for transaction '{transaction_reference}'.")

        row = await conn.fetchrow(
            """
            INSERT INTO disputes (
                dispute_id, transaction_reference, card_id, user_id, amount,
                currency, reason, description, evidence_url, status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *;
            """,
            dispute_id,
            transaction_reference,
            card_id,
            user_id,
            amount,
            currency,
            reason,
            description,
            evidence_url,
            DisputeStatus.OPENED.value
        )
        return dict(row)

    @staticmethod
    async def submit_evidence(
        conn: asyncpg.Connection,
        dispute_id: str,
        evidence_url: str,
        description: Optional[str] = None
    ) -> Dict[str, Any]:
        dispute = await conn.fetchrow("SELECT * FROM disputes WHERE dispute_id = $1 FOR UPDATE;", dispute_id)
        if not dispute:
            raise OrchestratorError(f"Dispute '{dispute_id}' not found.")

        current_status = dispute["status"]
        next_status = DisputeStateMachine.get_next_state(current_status, DisputeEvent.SUBMIT_EVIDENCE)

        updated_row = await conn.fetchrow(
            """
            UPDATE disputes
            SET status = $1, evidence_url = $2, description = COALESCE($3, description), updated_at = NOW()
            WHERE dispute_id = $4
            RETURNING *;
            """,
            next_status.value,
            evidence_url,
            description,
            dispute_id
        )
        return dict(updated_row)

    @staticmethod
    async def resolve_dispute(
        conn: asyncpg.Connection,
        dispute_id: str,
        decision: str,  # 'WON' or 'LOST'
        resolution_notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Resolves dispute via State Machine:
        - If WON: transitions to WON_REFUNDED and executes double-entry chargeback refund
          from DISPUTE_ESCROW_USD to User's USD wallet.
        - If LOST: transitions to LOST_CLOSED.
        """
        dispute = await conn.fetchrow("SELECT * FROM disputes WHERE dispute_id = $1 FOR UPDATE;", dispute_id)
        if not dispute:
            raise OrchestratorError(f"Dispute '{dispute_id}' not found.")

        current_status = dispute["status"]
        event = DisputeEvent.RESOLVE_WIN if decision == "WON" else DisputeEvent.RESOLVE_LOSE
        next_status = DisputeStateMachine.get_next_state(current_status, event)

        journal_entry = None
        if next_status == DisputeStatus.WON_REFUNDED:
            # Atomic double-entry chargeback execution
            user_id = dispute["user_id"]
            amount_usd = Decimal(str(dispute["amount"]))
            currency = dispute["currency"]

            # User's USD wallet
            user_wallet = await CortexOrchestrator.get_or_create_user_wallet(conn, user_id, currency)
            
            # Settlement / Dispute Escrow clearing account
            escrow_acc = await LedgerService.get_or_create_system_account(
                conn=conn,
                account_number=f"CHARGEBACK_SETTLEMENT_{currency}",
                currency=currency,
                account_type=AccountType.PAYMENT_PARTNER.value
            )

            idempotency_key = f"CHARGEBACK_{dispute_id}"
            entry = JournalEntryCreate(
                idempotency_key=idempotency_key,
                reference=dispute_id,
                narration=f"Visa Chargeback Refund for Dispute {dispute_id} (Tx: {dispute['transaction_reference']})",
                postings=[
                    PostingCreate(
                        account_id=escrow_acc["id"],
                        amount=amount_usd,
                        direction=PostingDirection.DEBIT,
                        currency=currency,
                        sequence_no=1
                    ),
                    PostingCreate(
                        account_id=user_wallet["id"],
                        amount=amount_usd,
                        direction=PostingDirection.CREDIT,
                        currency=currency,
                        sequence_no=2
                    )
                ]
            )
            journal_entry = await LedgerService.record_journal_entry(conn, entry)

        updated_row = await conn.fetchrow(
            """
            UPDATE disputes
            SET status = $1, resolution_notes = $2, updated_at = NOW()
            WHERE dispute_id = $3
            RETURNING *;
            """,
            next_status.value,
            resolution_notes,
            dispute_id
        )
        res = dict(updated_row)
        if journal_entry:
            res["journal_entry"] = journal_entry
        return res

    @staticmethod
    async def list_user_disputes(
        conn: asyncpg.Connection,
        user_id: str
    ) -> List[Dict[str, Any]]:
        rows = await conn.fetch(
            "SELECT * FROM disputes WHERE user_id = $1 ORDER BY created_at DESC;",
            user_id
        )
        return [dict(r) for r in rows]
