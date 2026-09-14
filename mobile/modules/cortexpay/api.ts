import * as z from 'zod';

import { http } from '@/libs/api/client';
import { validateModel } from '@/libs/api/validation';

import {
  CardIssueRequest,
  CardIssueRequestSchema,
  CardLimitUpdateRequest,
  CardTopupRequest,
  ConvertRequest,
  ConvertRequestSchema,
  ConvertResponse,
  ConvertResponseSchema,
  DepositRequest,
  DepositRequestSchema,
  DepositResponse,
  DepositResponseSchema,
  FXQuoteResponse,
  FXQuoteResponseSchema,
  KYCStatusResponse,
  KYCStatusResponseSchema,
  KYCSubmitRequest,
  KYCSubmitRequestSchema,
  LedgerEntry,
  LedgerEntrySchema,
  MerchantDebitRequest,
  MerchantDebitRequestSchema,
  MerchantDebitResponse,
  MerchantDebitResponseSchema,
  QuoteRequest,
  QuoteRequestSchema,
  ReconciliationBatch,
  ReconciliationBatchSchema,
  ReconciliationRunResult,
  ReconciliationStatementItem,
  ThreeDSChallenge,
  ThreeDSChallengeSchema,
  ThreeDSInitiateRequest,
  ThreeDSInitiateRequestSchema,
  ThreeDSVerifyRequest,
  ThreeDSVerifyRequestSchema,
  ThreeDSVerifyResponse,
  ThreeDSVerifyResponseSchema,
  VirtualCard,
  VirtualCardSchema,
  WalletsResponse,
  WalletsResponseSchema,
  WithdrawalRequest,
  WithdrawalRequestSchema,
} from './types';

export const cortexPayApi = {
  /**
   * Fetch wallets balances (XOF and USD)
   */
  async getWallets(userId: string): Promise<WalletsResponse> {
    const response = await http.get<WalletsResponse>(`/wallets/${userId}`);
    return validateModel(WalletsResponseSchema, response, 'Wallets');
  },

  /**
   * Deposit funds via Wave / Orange Money Push USSD
   */
  async depositMobileMoney(params: DepositRequest): Promise<DepositResponse> {
    const validatedInput = DepositRequestSchema.parse(params);
    const response = await http.post<DepositResponse>('/deposit/mobile-money', validatedInput);
    return validateModel(DepositResponseSchema, response, 'Mobile Money Deposit');
  },

  /**
   * Cash-Out: Withdraw funds to Wave / Orange Money
   */
  async withdrawMobileMoney(params: WithdrawalRequest): Promise<{ provider_tx_id: string; message: string; amount_xof: string; wallet_xof_balance: string }> {
    const validatedInput = WithdrawalRequestSchema.parse(params);
    const response = await http.post<{ provider_tx_id: string; message: string; amount_xof: string; wallet_xof_balance: string }>('/withdraw/mobile-money', validatedInput);
    return response;
  },

  /**
   * Request FX Quote with 90s locking TTL
   */
  async getFXQuote(params: QuoteRequest): Promise<FXQuoteResponse> {
    const validatedInput = QuoteRequestSchema.parse(params);
    const response = await http.post<FXQuoteResponse>('/fx/quote', validatedInput);
    return validateModel(FXQuoteResponseSchema, response, 'FX Quote');
  },

  /**
   * Execute locked FX conversion before TTL expires
   */
  async convertCurrency(params: ConvertRequest): Promise<ConvertResponse> {
    const validatedInput = ConvertRequestSchema.parse(params);
    const response = await http.post<ConvertResponse>('/fx/convert', validatedInput);
    return validateModel(ConvertResponseSchema, response, 'FX Conversion');
  },

  /**
   * Issue new USD Virtual Card
   */
  async issueCard(params: CardIssueRequest): Promise<VirtualCard> {
    const validatedInput = CardIssueRequestSchema.parse(params);
    const response = await http.post<VirtualCard>('/cards/issue', validatedInput);
    return validateModel(VirtualCardSchema, response, 'Virtual Card');
  },

  /**
   * List all virtual cards for a user
   */
  async getUserCards(userId: string): Promise<VirtualCard[]> {
    const response = await http.get<VirtualCard[]>(`/cards/${userId}`);
    return validateModel(z.array(VirtualCardSchema), response, 'User Cards');
  },

  /**
   * Toggle freeze / unfreeze card
   */
  async toggleFreezeCard(cardId: string): Promise<{ card_id: string; status: 'ACTIVE' | 'FROZEN' }> {
    const response = await http.post<{ card_id: string; status: 'ACTIVE' | 'FROZEN' }>(`/cards/${cardId}/toggle-freeze`);
    return validateModel(
      z.object({
        card_id: z.string(),
        status: z.enum(['ACTIVE', 'FROZEN']),
      }),
      response,
      'Toggle Freeze Card'
    );
  },

  /**
   * Top up virtual card from USD wallet
   */
  async topupCard(params: CardTopupRequest): Promise<{ card_id: string; amount_usd: string; card_balance: string; wallet_usd_balance: string }> {
    const response = await http.post<{ card_id: string; amount_usd: string; card_balance: string; wallet_usd_balance: string }>('/cards/topup', params);
    return response;
  },

  /**
   * Update monthly spending limit on virtual card
   */
  async updateCardSpendingLimit(params: CardLimitUpdateRequest): Promise<VirtualCard> {
    const response = await http.post<VirtualCard>('/cards/spending-limit', params);
    return validateModel(VirtualCardSchema, response, 'Update Spending Limit');
  },

  /**
   * Simulate merchant SaaS debit (OpenAI, AWS...) & Chaos rollback
   */
  async simulateMerchantDebit(params: MerchantDebitRequest): Promise<MerchantDebitResponse> {
    const validatedInput = MerchantDebitRequestSchema.parse(params);
    const response = await http.post<MerchantDebitResponse>('/cards/simulate-merchant-debit', validatedInput);
    return validateModel(MerchantDebitResponseSchema, response, 'Merchant Debit');
  },

  /**
   * Initiate 3D Secure / Push OTP challenge
   */
  async initiate3DSChallenge(params: ThreeDSInitiateRequest): Promise<ThreeDSChallenge> {
    const validatedInput = ThreeDSInitiateRequestSchema.parse(params);
    const response = await http.post<ThreeDSChallenge>('/cards/3ds/initiate', validatedInput);
    return validateModel(ThreeDSChallengeSchema, response, '3DS Challenge Initiation');
  },

  /**
   * Verify 3DS challenge OTP code and trigger merchant settlement
   */
  async verify3DSChallenge(params: ThreeDSVerifyRequest): Promise<ThreeDSVerifyResponse> {
    const validatedInput = ThreeDSVerifyRequestSchema.parse(params);
    const response = await http.post<ThreeDSVerifyResponse>('/cards/3ds/verify', validatedInput);
    return validateModel(ThreeDSVerifyResponseSchema, response, '3DS Challenge Verification');
  },

  /**
   * Fetch pending 3DS challenges for a virtual card
   */
  async getPending3DSChallenges(cardId: string): Promise<ThreeDSChallenge[]> {
    const response = await http.get<ThreeDSChallenge[]>(`/cards/3ds/pending/${cardId}`);
    return validateModel(z.array(ThreeDSChallengeSchema), response, 'Pending 3DS Challenges');
  },

  /**
   * Fetch KYC Verification Status
   */
  async getKYCStatus(userId: string): Promise<KYCStatusResponse> {
    const response = await http.get<KYCStatusResponse>(`/kyc/status/${userId}`);
    return validateModel(KYCStatusResponseSchema, response, 'KYC Status');
  },

  /**
   * Submit Identity Verification Documents (Tier 1)
   */
  async submitKYC(params: KYCSubmitRequest): Promise<{ document_id: string; status: string; message: string }> {
    const validatedInput = KYCSubmitRequestSchema.parse(params);
    const response = await http.post<{ document_id: string; status: string; message: string }>('/kyc/submit', validatedInput);
    return response;
  },

  /**
   * Upload captured KYC document photo (Recto, Verso, Selfie)
   */
  async uploadKYCImage(imageBase64: string, fieldName: 'front' | 'back' | 'selfie'): Promise<{ filename: string; image_url: string }> {
    const response = await http.post<{ filename: string; image_url: string }>('/kyc/upload-image', {
      image_base64: imageBase64,
      field_name: fieldName,
    });
    return response;
  },

  /**
   * Simulate KYC Approval / Rejection (Demo & MVP Test)
   */
  async simulateKYCDecision(params: { user_id: string; decision: 'APPROVED' | 'REJECTED'; tier?: number; rejection_reason?: string }) {
    const response = await http.post('/kyc/simulate-decision', params);
    return response;
  },

  /**
   * Fetch immutable double-entry ledger audit entries (Transactions history)
   */
  async getLedgerAuditEntries(userId?: string, limit: number = 30): Promise<LedgerEntry[]> {
    const params: Record<string, string | number> = { limit };
    if (userId) {
      params.user_id = userId;
    }
    const response = await http.get<LedgerEntry[]>('/ledger/audit-entries', { params });
    return validateModel(z.array(LedgerEntrySchema), response, 'Ledger Audit Entries');
  },

  /**
   * Fetch Partner Settlement Reconciliation Batches
   */
  async getReconciliationBatches(limit: number = 20): Promise<ReconciliationBatch[]> {
    const response = await http.get<ReconciliationBatch[]>('/reconciliation/batches', { params: { limit } });
    return validateModel(z.array(ReconciliationBatchSchema), response, 'Reconciliation Batches');
  },

  /**
   * Run automated Partner Settlement Reconciliation Batch
   */
  async runReconciliation(params: {
    provider: string;
    reconciliation_date: string;
    partner_statements: ReconciliationStatementItem[];
    currency?: string;
  }): Promise<ReconciliationRunResult> {
    const response = await http.post<ReconciliationRunResult>('/reconciliation/run', params);
    return response;
  },

  /**
   * Export immutable ledger audit trail in CSV format
   */
  async exportLedgerCsv(userId?: string): Promise<string> {
    const params: Record<string, string | number> = { limit: 1000 };
    if (userId) {
      params.user_id = userId;
    }
    const response = await http.get<string>('/export/ledger/csv', {
      params,
      responseType: 'text',
    });
    return response;
  },

  /**
   * Export partner reconciliation batch and discrepancies in CSV format
   */
  async exportReconciliationCsv(batchId: string): Promise<string> {
    const response = await http.get<string>(`/export/reconciliation/${batchId}/csv`, {
      responseType: 'text',
    });
    return response;
  },
};

