-- Migration 004: KYC & Regulatory Compliance Schema

-- 1. Alter users table to add KYC tracking columns
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(32) NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN IF NOT EXISTS kyc_tier INT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS kyc_submitted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS kyc_reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT;

-- Index for querying users pending review
CREATE INDEX IF NOT EXISTS idx_users_kyc_status ON users(kyc_status);

-- 2. KYC Documents Table
CREATE TABLE IF NOT EXISTS kyc_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(64) NOT NULL,
    document_type VARCHAR(32) NOT NULL, -- 'NATIONAL_ID', 'PASSPORT', 'DRIVING_LICENSE', 'PROOF_OF_ADDRESS'
    document_number VARCHAR(128) NOT NULL,
    country_code VARCHAR(8) NOT NULL DEFAULT 'SEN',
    front_image_url TEXT NOT NULL,
    back_image_url TEXT,
    selfie_url TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
    rejection_reason TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_kyc_documents_user_id ON kyc_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_documents_status ON kyc_documents(status);
