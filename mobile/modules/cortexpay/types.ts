import * as z from 'zod';

// 1. Account & Wallet
export const AccountSchema = z.object({
  id: z.string(),
  account_number: z.string(),
  user_id: z.string(),
  currency: z.string(),
  type: z.string(),
  balance: z.union([z.string(), z.number()]).transform((val) => String(val)),
  created_at: z.string(),
});
export type Account = z.infer<typeof AccountSchema>;

export const WalletsResponseSchema = z.object({
  user_id: z.string(),
  wallets: z.object({
    XOF: AccountSchema,
    USD: AccountSchema,
  }),
});
export type WalletsResponse = z.infer<typeof WalletsResponseSchema>;

// 2. Mobile Money Deposit
export const DepositRequestSchema = z.object({
  user_id: z.string(),
  phone_number: z.string().min(8),
  operator: z.enum(['WAVE', 'ORANGE_MONEY']),
  amount: z.string(),
  otp_code: z.string().default('123456'),
});
export type DepositRequest = z.infer<typeof DepositRequestSchema>;

export const DepositResponseSchema = z.object({
  journal_entry: z.object({
    id: z.string(),
    idempotency_key: z.string(),
    reference: z.string(),
    narration: z.string(),
    status: z.string(),
    created_at: z.string(),
  }),
  wallet: AccountSchema,
  gateway_result: z.object({
    success: z.boolean(),
    provider_tx_id: z.string(),
    message: z.string(),
  }),
});
export type DepositResponse = z.infer<typeof DepositResponseSchema>;

// 3. FX Quote Engine (TTL 90s)
export const QuoteRequestSchema = z.object({
  user_id: z.string(),
  from_amount_xof: z.string(),
});
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

export const FXQuoteResponseSchema = z.object({
  quote_id: z.string(),
  user_id: z.string(),
  from_currency: z.string(),
  to_currency: z.string(),
  from_amount: z.union([z.string(), z.number()]).transform((val) => String(val)),
  to_amount: z.union([z.string(), z.number()]).transform((val) => String(val)),
  market_rate: z.union([z.string(), z.number()]).transform((val) => String(val)),
  spread_pct: z.union([z.string(), z.number()]).transform((val) => String(val)),
  effective_rate: z.union([z.string(), z.number()]).transform((val) => String(val)),
  expires_at: z.string(),
  ttl_remaining_seconds: z.number(),
});
export type FXQuoteResponse = z.infer<typeof FXQuoteResponseSchema>;

export const ConvertRequestSchema = z.object({
  user_id: z.string(),
  quote_id: z.string(),
  idempotency_key: z.string(),
});
export type ConvertRequest = z.infer<typeof ConvertRequestSchema>;

export const ConvertResponseSchema = z.object({
  journal_entry: z.any(),
  wallet_xof: AccountSchema,
  wallet_usd: AccountSchema,
  quote: z.any(),
});
export type ConvertResponse = z.infer<typeof ConvertResponseSchema>;

// 4. Virtual Cards
export const VirtualCardSchema = z.object({
  card_id: z.string(),
  user_id: z.string(),
  currency: z.string(),
  masked_pan: z.string(),
  encrypted_pan: z.string().optional(),
  pan: z.string().optional(),
  expiry_month: z.number(),
  expiry_year: z.number(),
  cvv: z.string().optional(),
  cardholder_name: z.string(),
  status: z.enum(['ACTIVE', 'FROZEN', 'TERMINATED']),
  balance: z.union([z.string(), z.number()]).transform((val) => String(val)),
  spending_limit_monthly: z.union([z.string(), z.number()]).transform((val) => String(val)),
  current_month_spent: z.union([z.string(), z.number()]).transform((val) => String(val)),
  card_type: z.enum(['STANDARD', 'BUSINESS']).default('STANDARD'),
  label: z.string().default('Ma Carte Cortex'),
  created_at: z.string().optional().default(() => new Date().toISOString()),
});
export type VirtualCard = z.infer<typeof VirtualCardSchema>;

export const CardIssueRequestSchema = z.object({
  user_id: z.string(),
  cardholder_name: z.string().min(2),
  initial_funding_usd: z.string().default('0.0000'),
  card_type: z.enum(['STANDARD', 'BUSINESS']).default('STANDARD'),
  label: z.string().default('Ma Carte Cortex'),
});
export type CardIssueRequest = z.infer<typeof CardIssueRequestSchema>;

export const CardTopupRequestSchema = z.object({
  user_id: z.string(),
  card_id: z.string(),
  amount_usd: z.string(),
});
export type CardTopupRequest = z.infer<typeof CardTopupRequestSchema>;

export const CardLimitUpdateRequestSchema = z.object({
  user_id: z.string(),
  card_id: z.string(),
  spending_limit_monthly: z.string(),
});
export type CardLimitUpdateRequest = z.infer<typeof CardLimitUpdateRequestSchema>;

export const WithdrawalRequestSchema = z.object({
  user_id: z.string(),
  phone_number: z.string(),
  operator: z.enum(['WAVE', 'ORANGE_MONEY']),
  amount: z.string(),
});
export type WithdrawalRequest = z.infer<typeof WithdrawalRequestSchema>;


// 5. Merchant Debit Simulation & Chaos
export const MerchantDebitRequestSchema = z.object({
  card_id: z.string(),
  merchant_name: z.string(),
  amount_usd: z.string(),
  simulate_network_failure: z.boolean().default(false),
});
export type MerchantDebitRequest = z.infer<typeof MerchantDebitRequestSchema>;

export const MerchantDebitResponseSchema = z.object({
  approved: z.boolean(),
  transaction_id: z.string(),
  rolled_back: z.boolean().optional(),
  decline_reason: z.string().nullable().optional(),
  card_balance: z.union([z.string(), z.number()]).transform((val) => String(val)),
});
export type MerchantDebitResponse = z.infer<typeof MerchantDebitResponseSchema>;

// 5.b 3D Secure (3DS / Push OTP) Challenge
export const ThreeDSChallengeSchema = z.object({
  id: z.string().optional(),
  challenge_id: z.string(),
  card_id: z.string(),
  merchant_name: z.string(),
  amount: z.union([z.string(), z.number()]).transform((val) => String(val)),
  currency: z.string().default('USD'),
  otp_code: z.string(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']),
  expires_at: z.string(),
  created_at: z.string().optional(),
});
export type ThreeDSChallenge = z.infer<typeof ThreeDSChallengeSchema>;

export const ThreeDSInitiateRequestSchema = z.object({
  card_id: z.string(),
  merchant_name: z.string(),
  amount_usd: z.string(),
});
export type ThreeDSInitiateRequest = z.infer<typeof ThreeDSInitiateRequestSchema>;

export const ThreeDSVerifyRequestSchema = z.object({
  challenge_id: z.string(),
  otp_code: z.string(),
});
export type ThreeDSVerifyRequest = z.infer<typeof ThreeDSVerifyRequestSchema>;

export const ThreeDSVerifyResponseSchema = z.object({
  challenge_id: z.string(),
  status: z.enum(['APPROVED', 'REJECTED', 'EXPIRED']),
  debit_result: MerchantDebitResponseSchema,
});
export type ThreeDSVerifyResponse = z.infer<typeof ThreeDSVerifyResponseSchema>;


// 6. KYC Verification Models
export const KYCDocumentSchema = z.object({
  id: z.string(),
  document_type: z.string(),
  document_number: z.string(),
  country_code: z.string(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  submitted_at: z.string(),
  reviewed_at: z.string().nullable().optional(),
  rejection_reason: z.string().nullable().optional(),
});
export type KYCDocument = z.infer<typeof KYCDocumentSchema>;

export const KYCStatusResponseSchema = z.object({
  user_id: z.string(),
  kyc_status: z.enum(['NOT_STARTED', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED']),
  kyc_tier: z.number(),
  kyc_submitted_at: z.string().nullable().optional(),
  kyc_reviewed_at: z.string().nullable().optional(),
  kyc_rejection_reason: z.string().nullable().optional(),
  documents: z.array(KYCDocumentSchema).default([]),
});
export type KYCStatusResponse = z.infer<typeof KYCStatusResponseSchema>;

export const KYCSubmitRequestSchema = z.object({
  user_id: z.string(),
  document_type: z.enum(['NATIONAL_ID', 'PASSPORT', 'DRIVING_LICENSE']),
  document_number: z.string().min(5),
  country_code: z.string().default('SEN'),
  front_image_url: z.string(),
  back_image_url: z.string().optional(),
  selfie_url: z.string(),
});
export type KYCSubmitRequest = z.infer<typeof KYCSubmitRequestSchema>;

// 7. Ledger Audit Entries Models
export const LedgerPostingSchema = z.object({
  id: z.string(),
  account_id: z.string(),
  account_number: z.string(),
  direction: z.enum(['DEBIT', 'CREDIT']),
  amount: z.union([z.string(), z.number()]).transform((val) => String(val)),
  currency: z.string(),
  user_id: z.string().optional(),
  account_type: z.string().optional(),
});
export type LedgerPosting = z.infer<typeof LedgerPostingSchema>;

export const LedgerEntrySchema = z.object({
  id: z.string(),
  idempotency_key: z.string(),
  reference: z.string(),
  narration: z.string(),
  status: z.string(),
  created_at: z.string(),
  postings: z.array(LedgerPostingSchema),
});
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

// 8. Reconciliation Batches Models
export const ReconciliationBatchSchema = z.object({
  id: z.string().optional(),
  batch_id: z.string(),
  provider: z.string(),
  reconciliation_date: z.string(),
  total_ledger_amount: z.union([z.string(), z.number()]).transform((val) => String(val)),
  total_partner_amount: z.union([z.string(), z.number()]).transform((val) => String(val)),
  discrepancy_amount: z.union([z.string(), z.number()]).transform((val) => String(val)),
  currency: z.string(),
  status: z.enum(['BALANCED', 'DISCREPANCY_DETECTED', 'RESOLVED']),
  matched_count: z.number(),
  discrepancy_count: z.number(),
  created_at: z.string().optional(),
});
export type ReconciliationBatch = z.infer<typeof ReconciliationBatchSchema>;

export const ReconciliationDiscrepancySchema = z.object({
  id: z.string().optional(),
  batch_id: z.string(),
  reference: z.string(),
  ledger_amount: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => (val === null || val === undefined ? null : String(val))),
  partner_amount: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => (val === null || val === undefined ? null : String(val))),
  discrepancy: z.union([z.string(), z.number()]).transform((val) => String(val)),
  currency: z.string(),
  reason: z.string(),
  status: z.string(),
  resolution_notes: z.string().nullable().optional(),
});
export type ReconciliationDiscrepancy = z.infer<typeof ReconciliationDiscrepancySchema>;

export interface ReconciliationStatementItem {
  reference: string;
  amount: string;
}

export interface ReconciliationRunResult {
  batch_id: string;
  provider: string;
  reconciliation_date: string;
  status: 'BALANCED' | 'DISCREPANCY_DETECTED';
  total_ledger: string | number;
  total_partner: string | number;
  discrepancy_total: string | number;
  matched_count: number;
  discrepancy_count: number;
  discrepancies: ReconciliationDiscrepancy[];
}

// 9. Dispute Models (FSM)
export const DisputeSchema = z.object({
  id: z.string().optional(),
  dispute_id: z.string(),
  transaction_reference: z.string(),
  card_id: z.string(),
  user_id: z.string(),
  amount: z.union([z.string(), z.number()]).transform((val) => String(val)),
  currency: z.string(),
  reason: z.string(),
  description: z.string().nullable().optional(),
  evidence_url: z.string().nullable().optional(),
  status: z.enum(['OPENED', 'UNDER_REVIEW', 'WON_REFUNDED', 'LOST_CLOSED']),
  resolution_notes: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string().optional(),
});
export type Dispute = z.infer<typeof DisputeSchema>;

export interface DisputeOpenRequest {
  user_id: string;
  transaction_reference: string;
  card_id: string;
  amount: string;
  reason: string;
  description?: string;
  evidence_url?: string;
  currency?: string;
}


