import csv
import io
from typing import List, Dict, Any, Optional
from datetime import datetime
import asyncpg

class FinancialExportService:
    """
    Financial Export & Audit Trail Service.
    Generates standardized CSV streams directly from the immutable double-entry ledger
    and reconciliation batches for regulatory reporting, audits, and business accounting.
    """

    @staticmethod
    async def export_ledger_csv(
        conn: asyncpg.Connection,
        user_id: Optional[str] = None,
        limit: int = 1000
    ) -> str:
        """
        Exports granular double-entry journal entries and postings to CSV format.
        Columns:
        entry_id, reference, idempotency_key, narration, status, created_at,
        posting_id, account_id, account_number, account_type, direction, amount, currency
        """
        if user_id:
            query = """
                SELECT 
                    je.id AS entry_id,
                    je.reference,
                    je.idempotency_key,
                    je.narration,
                    je.status,
                    je.created_at,
                    p.id AS posting_id,
                    p.account_id,
                    a.account_number,
                    a.type AS account_type,
                    a.user_id AS account_user_id,
                    p.direction,
                    p.amount,
                    p.currency,
                    p.sequence_no
                FROM journal_entries je
                JOIN postings p ON je.id = p.entry_id
                JOIN accounts a ON p.account_id = a.id
                WHERE je.id IN (
                    SELECT p2.entry_id
                    FROM postings p2
                    JOIN accounts a2 ON p2.account_id = a2.id
                    WHERE a2.user_id = $1
                )
                ORDER BY je.created_at DESC, p.sequence_no ASC
                LIMIT $2;
            """
            rows = await conn.fetch(query, user_id, limit)
        else:
            query = """
                SELECT 
                    je.id AS entry_id,
                    je.reference,
                    je.idempotency_key,
                    je.narration,
                    je.status,
                    je.created_at,
                    p.id AS posting_id,
                    p.account_id,
                    a.account_number,
                    a.type AS account_type,
                    a.user_id AS account_user_id,
                    p.direction,
                    p.amount,
                    p.currency,
                    p.sequence_no
                FROM journal_entries je
                JOIN postings p ON je.id = p.entry_id
                JOIN accounts a ON p.account_id = a.id
                ORDER BY je.created_at DESC, p.sequence_no ASC
                LIMIT $1;
            """
            rows = await conn.fetch(query, limit)

        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

        writer.writerow([
            "Entry ID",
            "Reference",
            "Idempotency Key",
            "Narration",
            "Status",
            "Date UTC",
            "Posting ID",
            "Account Number",
            "Account Type",
            "Direction",
            "Amount",
            "Currency",
            "Sequence"
        ])

        for r in rows:
            created_str = r["created_at"].isoformat() if isinstance(r["created_at"], datetime) else str(r["created_at"])
            writer.writerow([
                str(r["entry_id"]),
                r["reference"],
                r["idempotency_key"],
                r["narration"],
                r["status"],
                created_str,
                str(r["posting_id"]),
                r["account_number"],
                r["account_type"],
                r["direction"],
                f"{r['amount']:.4f}",
                r["currency"],
                r["sequence_no"]
            ])

        return output.getvalue()

    @staticmethod
    async def export_reconciliation_csv(
        conn: asyncpg.Connection,
        batch_id: str
    ) -> str:
        """
        Exports reconciliation batch summary and individual discrepancy items to CSV format.
        """
        batch = await conn.fetchrow(
            "SELECT * FROM reconciliation_batches WHERE batch_id = $1;",
            batch_id
        )
        if not batch:
            raise ValueError(f"Reconciliation batch '{batch_id}' not found.")

        items = await conn.fetch(
            "SELECT * FROM reconciliation_items WHERE batch_id = $1 ORDER BY created_at ASC;",
            batch_id
        )

        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

        # Header metadata
        writer.writerow(["RECONCILIATION AUDIT REPORT"])
        writer.writerow(["Batch ID", batch["batch_id"]])
        writer.writerow(["Provider", batch["provider"]])
        writer.writerow(["Reconciliation Date", str(batch["reconciliation_date"])])
        writer.writerow(["Status", batch["status"]])
        writer.writerow(["Total Ledger Amount", f"{batch['total_ledger_amount']:.4f}", batch["currency"]])
        writer.writerow(["Total Partner Amount", f"{batch['total_partner_amount']:.4f}", batch["currency"]])
        writer.writerow(["Discrepancy Amount", f"{batch['discrepancy_amount']:.4f}", batch["currency"]])
        writer.writerow(["Matched Count", batch["matched_count"]])
        writer.writerow(["Discrepancy Count", batch["discrepancy_count"]])
        writer.writerow([])  # blank separator

        writer.writerow([
            "Item ID",
            "Statement Reference",
            "Ledger Amount",
            "Partner Amount",
            "Discrepancy",
            "Currency",
            "Reason",
            "Status",
            "Resolution Notes"
        ])

        for item in items:
            l_amt_str = f"{item['ledger_amount']:.4f}" if item['ledger_amount'] is not None else "N/A"
            p_amt_str = f"{item['partner_amount']:.4f}" if item['partner_amount'] is not None else "N/A"
            disc_str = f"{item['discrepancy']:.4f}"

            writer.writerow([
                str(item["id"]),
                item["reference"],
                l_amt_str,
                p_amt_str,
                disc_str,
                item["currency"],
                item["reason"],
                item["status"],
                item["resolution_notes"] or ""
            ])

        return output.getvalue()
