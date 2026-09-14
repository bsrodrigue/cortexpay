-- Migration 008: Performance Indexes for Audit, Ledger Postings, and Disputes
-- Optimizes high-throughput audit queries, ledger exports, and reconciliation checks

-- 1. Index accounts by user_id for instant account resolution
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts (user_id);

-- 2. Index postings by account_id and entry_id for fast journal lookups
CREATE INDEX IF NOT EXISTS idx_postings_account_entry ON postings (account_id, entry_id);

-- 3. Composite index on journal_entries for temporal and status filtering
CREATE INDEX IF NOT EXISTS idx_journal_entries_created_status ON journal_entries (created_at DESC, status);

-- 4. Index on disputes for user querying and fast status lookup
CREATE INDEX IF NOT EXISTS idx_disputes_user_status ON disputes (user_id, status);
CREATE INDEX IF NOT EXISTS idx_disputes_card_id ON disputes (card_id);

-- 5. Index on virtual cards by user_id and status
CREATE INDEX IF NOT EXISTS idx_virtual_cards_user_status ON virtual_cards (user_id, status);
