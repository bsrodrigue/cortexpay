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
  created_at: z.string(),
});
export type VirtualCard = z.infer<typeof VirtualCardSchema>;

export const CardIssueRequestSchema = z.object({
  user_id: z.string(),
  cardholder_name: z.string().min(2),
  initial_funding_usd: z.string().default('0.0000'),
});
export type CardIssueRequest = z.infer<typeof CardIssueRequestSchema>;

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
