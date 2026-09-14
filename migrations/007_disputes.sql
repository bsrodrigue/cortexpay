-- Migration 007: Disputes & Chargebacks Table with CHECK constraints

CREATE TABLE IF NOT EXISTS disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id VARCHAR(64) UNIQUE NOT NULL,
    transaction_reference VARCHAR(64) NOT NULL,
    card_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    amount NUMERIC(18, 4) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    reason VARCHAR(64) NOT NULL,
    description TEXT,
    evidence_url TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'OPENED'
        CHECK (status IN ('OPENED', 'UNDER_REVIEW', 'WON_REFUNDED', 'LOST_CLOSED')),
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disputes_user_id ON disputes(user_id);
CREATE INDEX IF NOT EXISTS idx_disputes_transaction_ref ON disputes(transaction_reference);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
