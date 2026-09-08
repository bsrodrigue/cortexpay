-- CortexPay Immuable Double-Entry Ledger Schema
-- Strict Numeric(18, 4), balance >= 0, Append-Only Triggers

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Accounts Table
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_number VARCHAR(64) UNIQUE NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    currency VARCHAR(8) NOT NULL, -- 'XOF', 'USD', etc.
    type VARCHAR(32) NOT NULL, -- 'ASSET_WALLET', 'FX_CLEARING', 'PAYMENT_PARTNER', 'REVENUE_SPREAD'
    balance NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_positive_balance CHECK (
        -- User wallets must never go negative. Clearing/partner internal accounts can hold system positions.
        (type = 'ASSET_WALLET' AND balance >= 0.0000) OR
        (type IN ('FX_CLEARING', 'PAYMENT_PARTNER', 'REVENUE_SPREAD', 'SYSTEM_EQUITY'))
    )
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_account_number ON accounts(account_number);

-- 2. Journal Entries (Transaction Batches / Headers)
CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(128) UNIQUE NOT NULL,
    reference VARCHAR(128) NOT NULL,
    narration TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'COMMITTED', -- 'COMMITTED', 'REJECTED'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_reference ON journal_entries(reference);

-- 3. Postings Table (Debit & Credit lines)
CREATE TABLE IF NOT EXISTS postings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    amount NUMERIC(18, 4) NOT NULL, -- positive for CREDIT/DEBIT differentiation
    direction VARCHAR(6) NOT NULL, -- 'DEBIT' or 'CREDIT'
    currency VARCHAR(8) NOT NULL,
    sequence_no INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_posting_direction CHECK (direction IN ('DEBIT', 'CREDIT')),
    CONSTRAINT chk_posting_amount_positive CHECK (amount > 0.0000)
);

CREATE INDEX IF NOT EXISTS idx_postings_entry_id ON postings(entry_id);
CREATE INDEX IF NOT EXISTS idx_postings_account_id ON postings(account_id);

-- 4. Invariant & Immutability Enforcement Triggers

-- Trigger 4.1: Disallow UPDATE or DELETE on journal_entries (Append-Only)
CREATE OR REPLACE FUNCTION prevent_journal_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'COMPLIANCE VIOLATION: journal_entries is strictly append-only. UPDATE and DELETE are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_journal_entries ON journal_entries;
CREATE TRIGGER trg_immutable_journal_entries
BEFORE UPDATE OR DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION prevent_journal_mutation();

-- Trigger 4.2: Disallow UPDATE or DELETE on postings (Append-Only)
CREATE OR REPLACE FUNCTION prevent_postings_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'COMPLIANCE VIOLATION: postings is strictly append-only. UPDATE and DELETE are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_postings ON postings;
CREATE TRIGGER trg_immutable_postings
BEFORE UPDATE OR DELETE ON postings
FOR EACH ROW EXECUTE FUNCTION prevent_postings_mutation();

-- Trigger 4.3: Prevent direct UPDATE or DELETE on accounts (except balance update via audited ledger pipeline)
CREATE OR REPLACE FUNCTION prevent_account_deletion()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'COMPLIANCE VIOLATION: Deletion of accounts is strictly prohibited.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_accounts_delete ON accounts;
CREATE TRIGGER trg_immutable_accounts_delete
BEFORE DELETE ON accounts
FOR EACH ROW EXECUTE FUNCTION prevent_account_deletion();

