import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createLogger } from '@/libs/log';
import { useAuthStore } from '@/modules/auth/store';

import { cortexPayApi } from './api';
import { useCortexPayStore } from './store';
import {
  DepositRequest,
  MerchantDebitRequest,
  QuoteRequest,
} from './types';

const logger = createLogger('CortexPayHooks');

export const CORTEX_QUERY_KEYS = {
  wallets: (userId: string) => ['cortexpay', 'wallets', userId] as const,
  cards: (userId: string) => ['cortexpay', 'cards', userId] as const,
  transactions: (userId: string) => ['cortexpay', 'transactions', userId] as const,
};

function useEffectiveUserId(): string {
  const authUser = useAuthStore((state) => state.user);
  const currentUserId = useCortexPayStore((state) => state.currentUserId);
  if (authUser?.user_id) return authUser.user_id;
  if (authUser?.id) return `usr_${authUser.id}`;
  return currentUserId || 'usr_cortex_demo';
}

export function useWallets() {
  const userId = useEffectiveUserId();
  return useQuery({
    queryKey: CORTEX_QUERY_KEYS.wallets(userId),
    queryFn: () => cortexPayApi.getWallets(userId),
    enabled: !!userId,
    refetchInterval: 5000,
  });
}

export function useUserCards() {
  const userId = useEffectiveUserId();
  return useQuery({
    queryKey: CORTEX_QUERY_KEYS.cards(userId),
    queryFn: () => cortexPayApi.getUserCards(userId),
    enabled: !!userId,
  });
}

export function useDepositMobileMoney() {
  const queryClient = useQueryClient();
  const userId = useEffectiveUserId();

  return useMutation({
    mutationFn: (params: Omit<DepositRequest, 'user_id'>) =>
      cortexPayApi.depositMobileMoney({ ...params, user_id: userId }),
    onSuccess: () => {
      logger.info('Mobile Money Deposit successful. Invalidating wallets cache.');
      void queryClient.invalidateQueries({ queryKey: CORTEX_QUERY_KEYS.wallets(userId) });
      void queryClient.invalidateQueries({ queryKey: CORTEX_QUERY_KEYS.transactions(userId) });
    },
    onError: (err) => {
      logger.error('Deposit error:', err);
    },
  });
}

export function useFXQuote() {
  const userId = useEffectiveUserId();

  return useMutation({
    mutationFn: (params: Omit<QuoteRequest, 'user_id'>) =>
      cortexPayApi.getFXQuote({ ...params, user_id: userId }),
  });
}

export function useConvertCurrency() {
  const queryClient = useQueryClient();
  const userId = useEffectiveUserId();

  return useMutation({
    mutationFn: (params: { quoteId: string }) =>
      cortexPayApi.convertCurrency({
        user_id: userId,
        quote_id: params.quoteId,
        idempotency_key: `IDEM_CONV_${params.quoteId}_${Date.now()}`,
      }),
    onSuccess: () => {
      logger.info('FX Conversion successful. Updating wallets.');
      void queryClient.invalidateQueries({ queryKey: CORTEX_QUERY_KEYS.wallets(userId) });
      void queryClient.invalidateQueries({ queryKey: CORTEX_QUERY_KEYS.transactions(userId) });
    },
  });
}

export function useIssueCard() {
  const queryClient = useQueryClient();
  const userId = useEffectiveUserId();

  return useMutation({
    mutationFn: (params: { cardholderName: string; initialFundingUsd: string }) =>
      cortexPayApi.issueCard({
        user_id: userId,
        cardholder_name: params.cardholderName,
        initial_funding_usd: params.initialFundingUsd,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CORTEX_QUERY_KEYS.cards(userId) });
      void queryClient.invalidateQueries({ queryKey: CORTEX_QUERY_KEYS.wallets(userId) });
      void queryClient.invalidateQueries({ queryKey: CORTEX_QUERY_KEYS.transactions(userId) });
    },
  });
}

export function useToggleFreezeCard() {
  const queryClient = useQueryClient();
  const userId = useEffectiveUserId();

  return useMutation({
    mutationFn: (cardId: string) => cortexPayApi.toggleFreezeCard(cardId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CORTEX_QUERY_KEYS.cards(userId) });
    },
  });
}

export function useSimulateMerchantDebit() {
  const queryClient = useQueryClient();
  const userId = useEffectiveUserId();

  return useMutation({
    mutationFn: (params: MerchantDebitRequest) => cortexPayApi.simulateMerchantDebit(params),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CORTEX_QUERY_KEYS.cards(userId) });
      void queryClient.invalidateQueries({ queryKey: CORTEX_QUERY_KEYS.wallets(userId) });
      void queryClient.invalidateQueries({ queryKey: CORTEX_QUERY_KEYS.transactions(userId) });
    },
  });
}

export function useTransactions(limit: number = 30) {
  const userId = useEffectiveUserId();
  return useQuery({
    queryKey: CORTEX_QUERY_KEYS.transactions(userId),
    queryFn: () => cortexPayApi.getLedgerAuditEntries(userId, limit),
    enabled: !!userId,
    refetchInterval: 5000,
  });
}

export const KYC_QUERY_KEYS = {
  status: (userId: string) => ['cortexpay', 'kyc', userId] as const,
};

export function useKYCStatus() {
  const userId = useEffectiveUserId();
  const query = useQuery({
    queryKey: KYC_QUERY_KEYS.status(userId),
    queryFn: () => cortexPayApi.getKYCStatus(userId),
    enabled: !!userId,
    refetchInterval: 5000,
  });

  const kyc = query.data;
  const status = kyc?.kyc_status || 'NOT_STARTED';
  const tier = kyc?.kyc_tier ?? 0;

  return {
    ...query,
    kycData: kyc,
    status,
    tier,
    isApproved: status === 'APPROVED' || tier >= 1,
    isPending: status === 'SUBMITTED' || status === 'UNDER_REVIEW',
    isRejected: status === 'REJECTED',
    isNotStarted: status === 'NOT_STARTED',
    canIssueCard: status === 'APPROVED' && tier >= 1,
  };
}

export function useSubmitKYC() {
  const queryClient = useQueryClient();
  const userId = useEffectiveUserId();

  return useMutation({
    mutationFn: (params: {
      documentType: 'NATIONAL_ID' | 'PASSPORT' | 'DRIVING_LICENSE';
      documentNumber: string;
      frontImageUrl: string;
      backImageUrl?: string;
      selfieUrl: string;
    }) =>
      cortexPayApi.submitKYC({
        user_id: userId,
        document_type: params.documentType,
        document_number: params.documentNumber,
        country_code: 'SEN',
        front_image_url: params.frontImageUrl,
        back_image_url: params.backImageUrl,
        selfie_url: params.selfieUrl,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KYC_QUERY_KEYS.status(userId) });
    },
  });
}

export function useSimulateKYCDecision() {
  const queryClient = useQueryClient();
  const userId = useEffectiveUserId();

  return useMutation({
    mutationFn: (params: { decision: 'APPROVED' | 'REJECTED'; tier?: number; rejection_reason?: string }) =>
      cortexPayApi.simulateKYCDecision({
        user_id: userId,
        decision: params.decision,
        tier: params.tier ?? 1,
        rejection_reason: params.rejection_reason,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KYC_QUERY_KEYS.status(userId) });
      void queryClient.invalidateQueries({ queryKey: CORTEX_QUERY_KEYS.cards(userId) });
    },
  });
}
