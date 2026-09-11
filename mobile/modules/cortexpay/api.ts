import { http } from '@/libs/api/client';
import { validateModel } from '@/libs/api/validation';

import {
  CardIssueRequest,
  CardIssueRequestSchema,
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
  MerchantDebitRequest,
  MerchantDebitRequestSchema,
  MerchantDebitResponse,
  MerchantDebitResponseSchema,
  QuoteRequest,
  QuoteRequestSchema,
  VirtualCard,
  VirtualCardSchema,
  WalletsResponse,
  WalletsResponseSchema,
  KYCStatusResponse,
  KYCStatusResponseSchema,
  KYCSubmitRequest,
  KYCSubmitRequestSchema,
} from './types';

import * as z from 'zod';

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
   * Simulate merchant SaaS debit (OpenAI, AWS...) & Chaos rollback
   */
  async simulateMerchantDebit(params: MerchantDebitRequest): Promise<MerchantDebitResponse> {
    const validatedInput = MerchantDebitRequestSchema.parse(params);
    const response = await http.post<MerchantDebitResponse>('/cards/simulate-merchant-debit', validatedInput);
    return validateModel(MerchantDebitResponseSchema, response, 'Merchant Debit');
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
   * Simulate KYC Approval / Rejection (Demo & MVP Test)
   */
  async simulateKYCDecision(params: { user_id: string; decision: 'APPROVED' | 'REJECTED'; tier?: number; rejection_reason?: string }) {
    const response = await http.post('/kyc/simulate-decision', params);
    return response;
  },
};
