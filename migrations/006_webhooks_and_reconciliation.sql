-- Migration 006: Asynchronous Webhooks, Deduplication & Automated Reconciliation
-- Strict idempotency, HMAC validation logs, and Settlement Reconciliation

-- 1. Webhook Events Table (Auditing, Idempotency & Deduplication)
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(128) UNIQUE NOT NULL, -- Provider event ID (e.g., evt_wave_12345)
    provider VARCHAR(32) NOT NULL,         -- 'WAVE', 'ORANGE_MONEY', 'FLUTTERWAVE', 'VISA'
    event_type VARCHAR(64) NOT NULL,       -- 'deposit.success', 'payout.success', 'card.debit'
    payload JSONB NOT NULL,
    signature_header VARCHAR(256),
    status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED', -- 'RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED'
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON webhook_events(provider);

-- 2. Partner Settlement Batches (Reconciliation Runs)
CREATE TABLE IF NOT EXISTS reconciliation_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id VARCHAR(64) UNIQUE NOT NULL,
    provider VARCHAR(32) NOT NULL,          -- 'WAVE', 'ORANGE_MONEY', 'VISA'
    reconciliation_date DATE NOT NULL,
    total_ledger_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    total_partner_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    discrepancy_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    currency VARCHAR(8) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'BALANCED', -- 'BALANCED', 'DISCREPANCY_DETECTED', 'RESOLVED'
    matched_count INT NOT NULL DEFAULT 0,
    discrepancy_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_batch_date ON reconciliation_batches(reconciliation_date);
CREATE INDEX IF NOT EXISTS idx_rec_batch_status ON reconciliation_batches(status);

-- 3. Discrepancy Items Table (Detailed Audit)
CREATE TABLE IF NOT EXISTS reconciliation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id VARCHAR(64) NOT NULL REFERENCES reconciliation_batches(batch_id),
    reference VARCHAR(128) NOT NULL,
    ledger_amount NUMERIC(18, 4),
    partner_amount NUMERIC(18, 4),
    discrepancy NUMERIC(18, 4) NOT NULL,
    currency VARCHAR(8) NOT NULL,
    reason VARCHAR(128) NOT NULL, -- 'MISSING_IN_LEDGER', 'MISSING_IN_PARTNER', 'AMOUNT_MISMATCH'
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'INVESTIGATING', 'RESOLVED'
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_items_batch ON reconciliation_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_rec_items_status ON reconciliation_items(status);
