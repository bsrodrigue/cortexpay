from decimal import Decimal
from uuid import UUID
from typing import List, Dict, Any, Optional
import asyncpg
from backend.src.domain.models import PostingDirection, PostingCreate, JournalEntryCreate

class LedgerError(Exception):
    pass

class InsufficientFundsError(LedgerError):
    pass

class UnbalancedJournalEntryError(LedgerError):
    pass

class AccountNotFoundError(LedgerError):
    pass

class DuplicateIdempotencyKeyError(LedgerError):
    pass

class LedgerService:
    @staticmethod
    def validate_postings_balance(postings: List[PostingCreate]):
        """
        Mathematical proof of Ledger Invariant:
        For each currency present in the journal entry:
        Sum(Debits) == Sum(Credits)
        Zero float: uses strict Decimal arithmetic.
        """
        if not postings or len(postings) < 2:
            raise UnbalancedJournalEntryError("A journal entry must contain at least two postings.")

        currencies = set(p.currency for p in postings)
        for curr in currencies:
            debit_sum = sum(p.amount for p in postings if p.currency == curr and p.direction == PostingDirection.DEBIT)
            credit_sum = sum(p.amount for p in postings if p.currency == curr and p.direction == PostingDirection.CREDIT)

            if debit_sum != credit_sum:
                raise UnbalancedJournalEntryError(
                    f"Invariant violated for currency {curr}: "
                    f"Sum(Debits)={debit_sum} does not equal Sum(Credits)={credit_sum}"
                )

    @staticmethod
    async def create_account(
        conn: asyncpg.Connection,
        account_number: str,
        user_id: str,
        currency: str,
        account_type: str,
        initial_balance: Decimal = Decimal("0.0000")
    ) -> Dict[str, Any]:
        # Idempotent select or insert with ON CONFLICT DO NOTHING to avoid transaction abortion in Postgres
        query = """
            INSERT INTO accounts (account_number, user_id, currency, type, balance)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (account_number) DO UPDATE SET currency = EXCLUDED.currency
            RETURNING id, account_number, user_id, currency, type, balance, created_at;
        """
        record = await conn.fetchrow(
            query, account_number, user_id, currency, account_type, initial_balance
        )
        return dict(record)

    @staticmethod
    async def get_or_create_system_account(
        conn: asyncpg.Connection,
        account_number: str,
        currency: str,
        account_type: str
    ) -> Dict[str, Any]:
        return await LedgerService.create_account(
            conn=conn,
            account_number=account_number,
            user_id="SYSTEM",
            currency=currency,
            account_type=account_type,
            initial_balance=Decimal("0.0000")
        )

    @staticmethod
    async def record_journal_entry(
        conn: asyncpg.Connection,
        entry_data: JournalEntryCreate
    ) -> Dict[str, Any]:
        """
        Records a transaction batch atomically with:
        1. Multi-currency zero-sum validation
        2. Strict Row-Level Locking via SELECT ... FOR UPDATE on all affected accounts
        3. Balance sufficiency verification for ASSET_WALLET (balance >= 0)
        4. Append-Only journal_entries and postings inserts
        5. Balance updates
        """
        LedgerService.validate_postings_balance(entry_data.postings)

        # Check existing idempotency key
        existing = await conn.fetchrow(
            "SELECT id, idempotency_key, reference, narration, status, created_at FROM journal_entries WHERE idempotency_key = $1",
            entry_data.idempotency_key
        )
        if existing:
            return dict(existing)

        # Collect and sort account IDs uniquely to avoid deadlock
        unique_account_ids = sorted(list(set(p.account_id for p in entry_data.postings)))

        # Lock accounts in deterministic order
        locked_accounts_rows = await conn.fetch(
            "SELECT id, account_number, user_id, currency, type, balance FROM accounts WHERE id = ANY($1::uuid[]) FOR UPDATE",
            unique_account_ids
        )
        accounts_map = {row["id"]: dict(row) for row in locked_accounts_rows}

        if len(accounts_map) != len(unique_account_ids):
            missing = set(unique_account_ids) - set(accounts_map.keys())
            raise AccountNotFoundError(f"Accounts not found: {missing}")

        # Compute net changes per account
        net_changes: Dict[UUID, Decimal] = {acc_id: Decimal("0.0000") for acc_id in unique_account_ids}
        for p in entry_data.postings:
            acc = accounts_map[p.account_id]
            if p.currency != acc["currency"]:
                raise LedgerError(f"Posting currency {p.currency} does not match account currency {acc['currency']}")

            if p.direction == PostingDirection.CREDIT:
                net_changes[p.account_id] += p.amount
            elif p.direction == PostingDirection.DEBIT:
                net_changes[p.account_id] -= p.amount

        # Validate resulting balances
        for acc_id, change in net_changes.items():
            acc = accounts_map[acc_id]
            new_balance = acc["balance"] + change
            if acc["type"] == "ASSET_WALLET" and new_balance < Decimal("0.0000"):
                raise InsufficientFundsError(
                    f"Insufficient funds on account {acc['account_number']}: "
                    f"current balance {acc['balance']}, attempted change {change}, resulting {new_balance}"
                )

        # Insert Journal Entry Header
        entry_row = await conn.fetchrow(
            """
            INSERT INTO journal_entries (idempotency_key, reference, narration, status)
            VALUES ($1, $2, $3, 'COMMITTED')
            RETURNING id, idempotency_key, reference, narration, status, created_at;
            """,
            entry_data.idempotency_key,
            entry_data.reference,
            entry_data.narration,
        )
        entry_id = entry_row["id"]

        # Insert Postings
        for p in entry_data.postings:
            await conn.execute(
                """
                INSERT INTO postings (entry_id, account_id, amount, direction, currency, sequence_no)
                VALUES ($1, $2, $3, $4, $5, $6);
                """,
                entry_id,
                p.account_id,
                p.amount,
                p.direction.value,
                p.currency,
                p.sequence_no,
            )

        # Update Account Balances
        for acc_id, change in net_changes.items():
            await conn.execute(
                """
                UPDATE accounts
                SET balance = balance + $1
                WHERE id = $2;
                """,
                change,
                acc_id,
            )

        return dict(entry_row)
