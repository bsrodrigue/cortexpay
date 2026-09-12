from decimal import Decimal
from uuid import UUID
import uuid
import asyncpg
import redis.asyncio as aioredis
from typing import Dict, Any, List

from backend.src.domain.models import (
    PostingDirection,
    PostingCreate,
    JournalEntryCreate,
    AccountType
)
from backend.src.services.ledger import LedgerService, InsufficientFundsError, LedgerError
from backend.src.services.fx_engine import FXEngineService, FXQuoteExpiredError
from backend.src.adapters.payment_gateway import (
    MockPaymentGateway,
    MobileMoneyDepositRequest,
    MobileMoneyPayoutRequest
)
from backend.src.adapters.card_issuer import MockCardIssuer, CardAuthorizationRequest

class OrchestratorError(Exception):
    pass

class CortexOrchestrator:
    """
    Central FinTech Orchestrator tying:
    - User Wallets (XOF, USD)
    - Mobile Money Deposits (Wave / Orange Money)
    - Currency Conversion (XOF -> USD) via FX Quote Locking & FX_CLEARING Pivot
    - Virtual Card Issuance and Merchant Debits
    - Compensating Transactions (Rollbacks)
    """

    @staticmethod
    async def get_or_create_user_wallet(
        conn: asyncpg.Connection,
        user_id: str,
        currency: str = "XOF"
    ) -> Dict[str, Any]:
        acc_num = f"WALLET_{user_id}_{currency}"
        row = await conn.fetchrow(
            "SELECT * FROM accounts WHERE account_number = $1",
            acc_num
        )
        if row:
            return dict(row)
        return await LedgerService.create_account(
            conn=conn,
            account_number=acc_num,
            user_id=user_id,
            currency=currency,
            account_type=AccountType.ASSET_WALLET.value,
            initial_balance=Decimal("0.0000")
        )

    @staticmethod
    async def get_or_create_partner_account(
        conn: asyncpg.Connection,
        partner_name: str,
        currency: str = "XOF"
    ) -> Dict[str, Any]:
        acc_num = f"PARTNER_{partner_name}_{currency}"
        return await LedgerService.get_or_create_system_account(
            conn=conn,
            account_number=acc_num,
            currency=currency,
            account_type=AccountType.PAYMENT_PARTNER.value
        )

    @staticmethod
    async def get_or_create_fx_clearing_account(
        conn: asyncpg.Connection,
        currency: str
    ) -> Dict[str, Any]:
        acc_num = f"FX_CLEARING_{currency}"
        return await LedgerService.get_or_create_system_account(
            conn=conn,
            account_number=acc_num,
            currency=currency,
            account_type=AccountType.FX_CLEARING.value
        )

    @staticmethod
    async def deposit_via_mobile_money(
        conn: asyncpg.Connection,
        deposit_req: MobileMoneyDepositRequest
    ) -> Dict[str, Any]:
        """
        1. Call MockPaymentGateway (USSD Push + OTP validation)
        2. If success: Record Double-entry:
           DEBIT  PARTNER_WAVE_XOF (or ORANGE_MONEY) (Partner owes Cortex Pay)
           CREDIT USER_WALLET_XOF (User wallet balance increases)
        """
        gateway_res = await MockPaymentGateway.process_deposit(deposit_req)
        if not gateway_res.success:
            raise OrchestratorError(f"Deposit rejected: {gateway_res.message}")

        user_wallet = await CortexOrchestrator.get_or_create_user_wallet(conn, deposit_req.user_id, "XOF")
        partner_acc = await CortexOrchestrator.get_or_create_partner_account(conn, deposit_req.operator, "XOF")

        entry_idempotency = f"DEP_{deposit_req.operator}_{gateway_res.provider_tx_id}"
        entry = JournalEntryCreate(
            idempotency_key=entry_idempotency,
            reference=gateway_res.provider_tx_id,
            narration=f"Mobile Money deposit via {deposit_req.operator}",
            postings=[
                PostingCreate(
                    account_id=partner_acc["id"],
                    amount=deposit_req.amount,
                    direction=PostingDirection.DEBIT,
                    currency="XOF",
                    sequence_no=1
                ),
                PostingCreate(
                    account_id=user_wallet["id"],
                    amount=deposit_req.amount,
                    direction=PostingDirection.CREDIT,
                    currency="XOF",
                    sequence_no=2
                )
            ]
        )
        journal = await LedgerService.record_journal_entry(conn, entry)

        # Refresh wallet
        updated_wallet = await conn.fetchrow("SELECT * FROM accounts WHERE id = $1", user_wallet["id"])
        return {
            "journal_entry": journal,
            "wallet": dict(updated_wallet),
            "gateway_result": gateway_res.model_dump()
        }

    @staticmethod
    async def execute_fx_conversion(
        conn: asyncpg.Connection,
        redis_client: aioredis.Redis,
        quote_id: str,
        user_id: str,
        idempotency_key: str
    ) -> Dict[str, Any]:
        """
        Executes locked FX conversion (XOF -> USD).
        Uses FX_CLEARING accounts as Pivot:
        1. XOF side:
           DEBIT USER_WALLET_XOF (XOF amount)
           CREDIT FX_CLEARING_XOF (XOF amount)
        2. USD side:
           DEBIT FX_CLEARING_USD (USD amount)
           CREDIT USER_WALLET_USD (USD amount)
        Guaranteed: Débit=Crédit per currency leg!
        """
        quote = await FXEngineService.get_and_validate_quote(conn, redis_client, quote_id)
        if quote["user_id"] != user_id:
            raise OrchestratorError("Quote user mismatch.")

        from_amount = Decimal(str(quote["from_amount"]))
        to_amount = Decimal(str(quote["to_amount"]))

        user_xof = await CortexOrchestrator.get_or_create_user_wallet(conn, user_id, "XOF")
        user_usd = await CortexOrchestrator.get_or_create_user_wallet(conn, user_id, "USD")
        clearing_xof = await CortexOrchestrator.get_or_create_fx_clearing_account(conn, "XOF")
        clearing_usd = await CortexOrchestrator.get_or_create_fx_clearing_account(conn, "USD")

        # Atomic transaction
        entry = JournalEntryCreate(
            idempotency_key=idempotency_key,
            reference=quote_id,
            narration=f"FX Conversion {from_amount} XOF -> {to_amount} USD @ {quote['effective_rate']}",
            postings=[
                # Leg 1: XOF (User gives XOF to FX_CLEARING)
                PostingCreate(
                    account_id=user_xof["id"],
                    amount=from_amount,
                    direction=PostingDirection.DEBIT,
                    currency="XOF",
                    sequence_no=1
                ),
                PostingCreate(
                    account_id=clearing_xof["id"],
                    amount=from_amount,
                    direction=PostingDirection.CREDIT,
                    currency="XOF",
                    sequence_no=2
                ),
                # Leg 2: USD (FX_CLEARING gives USD to User)
                PostingCreate(
                    account_id=clearing_usd["id"],
                    amount=to_amount,
                    direction=PostingDirection.DEBIT,
                    currency="USD",
                    sequence_no=3
                ),
                PostingCreate(
                    account_id=user_usd["id"],
                    amount=to_amount,
                    direction=PostingDirection.CREDIT,
                    currency="USD",
                    sequence_no=4
                ),
            ]
        )

        journal = await LedgerService.record_journal_entry(conn, entry)
        await FXEngineService.mark_quote_executed(conn, redis_client, quote_id)

        user_xof_updated = await conn.fetchrow("SELECT * FROM accounts WHERE id = $1", user_xof["id"])
        user_usd_updated = await conn.fetchrow("SELECT * FROM accounts WHERE id = $1", user_usd["id"])

        return {
            "journal_entry": journal,
            "wallet_xof": dict(user_xof_updated),
            "wallet_usd": dict(user_usd_updated),
            "quote": quote
        }

    @staticmethod
    async def create_virtual_card(
        conn: asyncpg.Connection,
        user_id: str,
        cardholder_name: str,
        initial_funding_usd: Decimal = Decimal("0.0000")
    ) -> Dict[str, Any]:
        """
        Creates a virtual card tied to a dedicated card asset account or user USD wallet.
        To ensure strict isolated balance per card as in modern virtual cards:
        Each card has its own ASSET_WALLET account in USD.
        If initial_funding_usd > 0, transfer from USER_WALLET_USD to CARD_ACCOUNT_USD.
        """
        card_meta = MockCardIssuer.issue_virtual_card(user_id, cardholder_name)
        card_id = card_meta["card_id"]

        # Dedicated card account in USD
        card_account = await LedgerService.create_account(
            conn=conn,
            account_number=f"CARD_ACC_{card_id}",
            user_id=user_id,
            currency="USD",
            account_type=AccountType.ASSET_WALLET.value,
            initial_balance=Decimal("0.0000")
        )

        # Store in virtual_cards
        row = await conn.fetchrow(
            """
            INSERT INTO virtual_cards (
                card_id, user_id, account_id, currency, masked_pan, encrypted_pan,
                expiry_month, expiry_year, cvv, cardholder_name, status,
                spending_limit_monthly, current_month_spent
            )
            VALUES ($1, $2, $3, 'USD', $4, $5, $6, $7, $8, $9, 'ACTIVE', $10, 0.0000)
            RETURNING created_at, id;
            """,
            card_id,
            user_id,
            card_account["id"],
            card_meta["masked_pan"],
            card_meta["pan"], # In real system encrypted, mock deterministic
            card_meta["expiry_month"],
            card_meta["expiry_year"],
            card_meta["cvv"],
            card_meta["cardholder_name"],
            card_meta["spending_limit_monthly"]
        )

        # Funding if requested
        if initial_funding_usd > Decimal("0.0000"):
            user_usd = await CortexOrchestrator.get_or_create_user_wallet(conn, user_id, "USD")
            fund_entry = JournalEntryCreate(
                idempotency_key=f"FUND_{card_id}_{uuid.uuid4().hex[:8]}",
                reference=card_id,
                narration=f"Funding virtual card {card_id} with {initial_funding_usd} USD",
                postings=[
                    PostingCreate(
                        account_id=user_usd["id"],
                        amount=initial_funding_usd,
                        direction=PostingDirection.DEBIT,
                        currency="USD",
                        sequence_no=1
                    ),
                    PostingCreate(
                        account_id=card_account["id"],
                        amount=initial_funding_usd,
                        direction=PostingDirection.CREDIT,
                        currency="USD",
                        sequence_no=2
                    )
                ]
            )
            await LedgerService.record_journal_entry(conn, fund_entry)

        card_account_updated = await conn.fetchrow("SELECT * FROM accounts WHERE id = $1", card_account["id"])

        return {
            **card_meta,
            "id": str(row["id"]),
            "account_id": card_account["id"],
            "status": "ACTIVE",
            "balance": card_account_updated["balance"],
            "current_month_spent": Decimal("0.0000"),
            "created_at": row["created_at"].isoformat() if row and row["created_at"] else None,
        }

    @staticmethod
    async def simulate_merchant_debit(
        conn: asyncpg.Connection,
        card_id: str,
        merchant_name: str,
        amount_usd: Decimal,
        simulate_network_failure_after_debit: bool = False
    ) -> Dict[str, Any]:
        """
        Simulates merchant debit (e.g. OpenAI 20$, AWS, etc.)
        Includes Chaos / Failure Scenario handling:
        - If network failure occurs during card call -> automatic rollback of funds!
        - Idempotence protection.
        """
        card_row = await conn.fetchrow("SELECT * FROM virtual_cards WHERE card_id = $1", card_id)
        if not card_row:
            raise OrchestratorError(f"Card {card_id} not found.")

        card_account = await conn.fetchrow("SELECT * FROM accounts WHERE id = $1", card_row["account_id"])

        auth_req = CardAuthorizationRequest(
            card_id=card_id,
            merchant_name=merchant_name,
            amount=amount_usd,
            currency="USD"
        )

        auth_res = MockCardIssuer.authorize_transaction(
            request=auth_req,
            card_status=card_row["status"],
            current_balance=card_account["balance"],
            monthly_spent=card_row["current_month_spent"],
            spending_limit=card_row["spending_limit_monthly"]
        )

        if not auth_res.approved:
            # Record declined transaction
            await conn.execute(
                """
                INSERT INTO card_transactions (transaction_id, card_id, merchant_name, amount, currency, status, decline_reason)
                VALUES ($1, $2, $3, $4, 'USD', 'DECLINED', $5);
                """,
                auth_res.transaction_id,
                card_id,
                merchant_name,
                amount_usd,
                auth_res.decline_reason
            )
            return {
                "approved": False,
                "transaction_id": auth_res.transaction_id,
                "decline_reason": auth_res.decline_reason,
                "card_balance": card_account["balance"]
            }

        # Debit the card account into Merchant settlement
        merchant_settlement = await LedgerService.get_or_create_system_account(
            conn=conn,
            account_number=f"MERCHANT_SETTLEMENT_{merchant_name.upper()}_USD",
            currency="USD",
            account_type=AccountType.PAYMENT_PARTNER.value
        )

        debit_entry = JournalEntryCreate(
            idempotency_key=f"TX_{auth_res.transaction_id}",
            reference=auth_res.transaction_id,
            narration=f"Card debit at {merchant_name} for {amount_usd} USD",
            postings=[
                PostingCreate(
                    account_id=card_account["id"],
                    amount=amount_usd,
                    direction=PostingDirection.DEBIT,
                    currency="USD",
                    sequence_no=1
                ),
                PostingCreate(
                    account_id=merchant_settlement["id"],
                    amount=amount_usd,
                    direction=PostingDirection.CREDIT,
                    currency="USD",
                    sequence_no=2
                )
            ]
        )

        await LedgerService.record_journal_entry(conn, debit_entry)

        # Update monthly spent
        await conn.execute(
            "UPDATE virtual_cards SET current_month_spent = current_month_spent + $1 WHERE card_id = $2",
            amount_usd,
            card_id
        )

        # CHAOS TEST SIMULATION: S4 J16-J18 Coupure réseau simulée -> Rollback automatique de compensation
        if simulate_network_failure_after_debit:
            # Compensating reversal entry
            rollback_entry = JournalEntryCreate(
                idempotency_key=f"ROLLBACK_{auth_res.transaction_id}",
                reference=auth_res.transaction_id,
                narration=f"COMPENSATION ROLLBACK: Network failure after debit at {merchant_name}",
                postings=[
                    PostingCreate(
                        account_id=merchant_settlement["id"],
                        amount=amount_usd,
                        direction=PostingDirection.DEBIT,
                        currency="USD",
                        sequence_no=1
                    ),
                    PostingCreate(
                        account_id=card_account["id"],
                        amount=amount_usd,
                        direction=PostingDirection.CREDIT,
                        currency="USD",
                        sequence_no=2
                    )
                ]
            )
            await LedgerService.record_journal_entry(conn, rollback_entry)
            await conn.execute(
                "UPDATE virtual_cards SET current_month_spent = current_month_spent - $1 WHERE card_id = $2",
                amount_usd,
                card_id
            )

            await conn.execute(
                """
                INSERT INTO card_transactions (transaction_id, card_id, merchant_name, amount, currency, status, decline_reason)
                VALUES ($1, $2, $3, $4, 'USD', 'ROLLED_BACK', 'Simulated Network Failure - Automated Compensation Rollback');
                """,
                auth_res.transaction_id,
                card_id,
                merchant_name,
                amount_usd
            )

            card_account_refreshed = await conn.fetchrow("SELECT * FROM accounts WHERE id = $1", card_account["id"])
            return {
                "approved": False,
                "rolled_back": True,
                "transaction_id": auth_res.transaction_id,
                "decline_reason": "Network failure during issuer confirmation. Funds compensated & restored.",
                "card_balance": card_account_refreshed["balance"]
            }

        # Success path
        await conn.execute(
            """
            INSERT INTO card_transactions (transaction_id, card_id, merchant_name, amount, currency, status, decline_reason)
            VALUES ($1, $2, $3, $4, 'USD', 'APPROVED', NULL);
            """,
            auth_res.transaction_id,
            card_id,
            merchant_name,
            amount_usd
        )

        card_account_refreshed = await conn.fetchrow("SELECT * FROM accounts WHERE id = $1", card_account["id"])
        return {
            "approved": True,
            "transaction_id": auth_res.transaction_id,
            "card_balance": card_account_refreshed["balance"]
        }

    @staticmethod
    async def topup_virtual_card(
        conn: asyncpg.Connection,
        user_id: str,
        card_id: str,
        amount_usd: Decimal
    ) -> Dict[str, Any]:
        """
        Transfers funds from USER_WALLET_USD to CARD_ACC_{card_id}.
        Guaranteed by double-entry ledger entry.
        """
        if amount_usd <= Decimal("0.0000"):
            raise OrchestratorError("Amount must be greater than 0.")

        card_row = await conn.fetchrow("SELECT * FROM virtual_cards WHERE card_id = $1 AND user_id = $2", card_id, user_id)
        if not card_row:
            raise OrchestratorError(f"Card {card_id} not found for user {user_id}.")

        if card_row["status"] == "TERMINATED":
            raise OrchestratorError("Cannot top up a terminated card.")

        card_account = await conn.fetchrow("SELECT * FROM accounts WHERE id = $1", card_row["account_id"])
        user_usd = await CortexOrchestrator.get_or_create_user_wallet(conn, user_id, "USD")

        if user_usd["balance"] < amount_usd:
            raise InsufficientFundsError(f"Insufficient USD wallet balance ({user_usd['balance']} USD).")

        fund_entry = JournalEntryCreate(
            idempotency_key=f"TOPUP_{card_id}_{uuid.uuid4().hex[:10]}",
            reference=card_id,
            narration=f"Top-up virtual card {card_id} with {amount_usd} USD",
            postings=[
                PostingCreate(
                    account_id=user_usd["id"],
                    amount=amount_usd,
                    direction=PostingDirection.DEBIT,
                    currency="USD",
                    sequence_no=1
                ),
                PostingCreate(
                    account_id=card_account["id"],
                    amount=amount_usd,
                    direction=PostingDirection.CREDIT,
                    currency="USD",
                    sequence_no=2
                )
            ]
        )
        journal = await LedgerService.record_journal_entry(conn, fund_entry)
        card_account_updated = await conn.fetchrow("SELECT * FROM accounts WHERE id = $1", card_account["id"])
        user_usd_updated = await conn.fetchrow("SELECT * FROM accounts WHERE id = $1", user_usd["id"])

        return {
            "journal_entry": journal,
            "card_id": card_id,
            "amount_usd": amount_usd,
            "card_balance": card_account_updated["balance"],
            "wallet_usd_balance": user_usd_updated["balance"]
        }

    @staticmethod
    async def update_card_spending_limit(
        conn: asyncpg.Connection,
        user_id: str,
        card_id: str,
        new_limit_usd: Decimal
    ) -> Dict[str, Any]:
        """
        Updates the monthly spending limit on a virtual card.
        """
        if new_limit_usd <= Decimal("0.0000"):
            raise OrchestratorError("Spending limit must be greater than 0.")

        card_row = await conn.fetchrow("SELECT * FROM virtual_cards WHERE card_id = $1 AND user_id = $2", card_id, user_id)
        if not card_row:
            raise OrchestratorError(f"Card {card_id} not found for user {user_id}.")

        await conn.execute(
            "UPDATE virtual_cards SET spending_limit_monthly = $1 WHERE card_id = $2",
            new_limit_usd,
            card_id
        )

        updated_card = await conn.fetchrow("SELECT * FROM virtual_cards WHERE card_id = $1", card_id)
        return dict(updated_card)

    @staticmethod
    async def process_mobile_money_withdrawal(
        conn: asyncpg.Connection,
        user_id: str,
        phone_number: str,
        operator: str,
        amount_xof: Decimal
    ) -> Dict[str, Any]:
        """
        Cash-Out: Withdraws money from user XOF wallet to Mobile Money (Wave / Orange Money).
        Disburses via MockPaymentGateway and records double-entry ledger entry:
        DEBIT: USER_WALLET_XOF
        CREDIT: PAYMENT_PARTNER_{operator}_XOF
        """
        if amount_xof <= Decimal("0.0000"):
            raise OrchestratorError("Withdrawal amount must be greater than 0.")

        if operator not in ["WAVE", "ORANGE_MONEY"]:
            raise OrchestratorError(f"Unsupported operator: {operator}")

        user_xof = await CortexOrchestrator.get_or_create_user_wallet(conn, user_id, "XOF")
        if user_xof["balance"] < amount_xof:
            raise InsufficientFundsError(f"Solde XOF insuffisant ({user_xof['balance']} XOF).")

        partner_account = await CortexOrchestrator.get_or_create_partner_account(conn, operator, "XOF")

        payout_res = await MockPaymentGateway.process_payout(
            MobileMoneyPayoutRequest(
                user_id=user_id,
                phone_number=phone_number,
                operator=operator,
                amount=amount_xof
            )
        )

        if not payout_res.success:
            raise OrchestratorError(f"Payout failed: {payout_res.message}")

        withdraw_entry = JournalEntryCreate(
            idempotency_key=f"WITHDRAW_{payout_res.provider_tx_id}",
            reference=payout_res.provider_tx_id,
            narration=f"Mobile Money withdrawal via {operator} to {phone_number}",
            postings=[
                PostingCreate(
                    account_id=user_xof["id"],
                    amount=amount_xof,
                    direction=PostingDirection.DEBIT,
                    currency="XOF",
                    sequence_no=1
                ),
                PostingCreate(
                    account_id=partner_account["id"],
                    amount=amount_xof,
                    direction=PostingDirection.CREDIT,
                    currency="XOF",
                    sequence_no=2
                )
            ]
        )
        journal = await LedgerService.record_journal_entry(conn, withdraw_entry)
        user_xof_updated = await conn.fetchrow("SELECT * FROM accounts WHERE id = $1", user_xof["id"])

        return {
            "journal_entry": journal,
            "provider_tx_id": payout_res.provider_tx_id,
            "message": payout_res.message,
            "amount_xof": amount_xof,
            "wallet_xof_balance": user_xof_updated["balance"]
        }

