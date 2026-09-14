-- Migration 005: 3D Secure Simulation & Card Categorization (Standard vs Business)

-- 1. Card Categorization & Custom Label
ALTER TABLE virtual_cards
ADD COLUMN IF NOT EXISTS card_type VARCHAR(32) NOT NULL DEFAULT 'STANDARD', -- 'STANDARD' or 'BUSINESS'
ADD COLUMN IF NOT EXISTS label VARCHAR(128) NOT NULL DEFAULT 'Ma Carte Cortex';

-- 2. 3D Secure Challenges Table
CREATE TABLE IF NOT EXISTS three_d_secure_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id VARCHAR(64) UNIQUE NOT NULL,
    card_id VARCHAR(64) NOT NULL REFERENCES virtual_cards(card_id),
    merchant_name VARCHAR(128) NOT NULL,
    amount NUMERIC(18, 4) NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'USD',
    otp_code VARCHAR(8) NOT NULL, -- e.g. 6 digits OTP '123456'
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_3ds_challenge_card ON three_d_secure_challenges(card_id);
CREATE INDEX IF NOT EXISTS idx_3ds_challenge_status ON three_d_secure_challenges(status);
