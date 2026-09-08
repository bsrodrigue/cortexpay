-- Cards & FX Quotes Schema

-- 1. FX Quotes Table (for Quote Locking, TTL 90s)
CREATE TABLE IF NOT EXISTS fx_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id VARCHAR(64) UNIQUE NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    from_currency VARCHAR(8) NOT NULL, -- XOF
    to_currency VARCHAR(8) NOT NULL,   -- USD
    from_amount NUMERIC(18, 4) NOT NULL,
    to_amount NUMERIC(18, 4) NOT NULL,
    market_rate NUMERIC(18, 6) NOT NULL,
    spread_pct NUMERIC(6, 4) NOT NULL, -- e.g. 0.0350 (3.5%) to 0.0450 (4.5%)
    effective_rate NUMERIC(18, 6) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, EXECUTED, EXPIRED
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fx_quotes_user_id ON fx_quotes(user_id);
CREATE INDEX IF NOT EXISTS idx_fx_quotes_expires_at ON fx_quotes(expires_at);

-- 2. Virtual Cards Table
CREATE TABLE IF NOT EXISTS virtual_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id VARCHAR(64) UNIQUE NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    currency VARCHAR(8) NOT NULL DEFAULT 'USD',
    masked_pan VARCHAR(20) NOT NULL, -- e.g. '4532 •••• •••• 8821'
    encrypted_pan TEXT NOT NULL,      -- Full PAN stored securely (or mocked encrypted)
    expiry_month INT NOT NULL,
    expiry_year INT NOT NULL,
    cvv VARCHAR(4) NOT NULL,
    cardholder_name VARCHAR(128) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, FROZEN, TERMINATED
    spending_limit_monthly NUMERIC(18, 4) NOT NULL DEFAULT 5000.0000,
    current_month_spent NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_virtual_cards_user_id ON virtual_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_virtual_cards_card_id ON virtual_cards(card_id);

-- 3. Card Transactions Log (Simulated SaaS Debits)
CREATE TABLE IF NOT EXISTS card_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id VARCHAR(64) UNIQUE NOT NULL,
    card_id VARCHAR(64) NOT NULL REFERENCES virtual_cards(card_id),
    merchant_name VARCHAR(128) NOT NULL, -- e.g. 'OpenAI', 'AWS', 'Netflix'
    amount NUMERIC(18, 4) NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'USD',
    status VARCHAR(20) NOT NULL, -- APPROVED, DECLINED, ROLLED_BACK
    decline_reason VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_tx_card_id ON card_transactions(card_id);

