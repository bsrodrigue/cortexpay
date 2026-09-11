import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cortexPayApi } from './api';
import {
  CardIssueRequest,
  ConvertRequest,
  DepositRequest,
  MerchantDebitRequest,
  QuoteRequest,
} from './types';
import { useCortexPayStore } from './store';
import { useAuthStore } from '@/modules/auth/store';
import { createLogger } from '@/libs/log';

const logger = createLogger('CortexPayHooks');

export const CORTEX_QUERY_KEYS = {
  wallets: (userId: string) => ['cortexpay', 'wallets', userId] as const,
  cards: (userId: string) => ['cortexpay', 'cards', userId] as const,
};

function useEffectiveUserId(): string {
  const authUser = useAuthStore((state) => state.user);
  if (authUser?.user_id) return authUser.user_id;
  if (authUser?.id) return `usr_${authUser.id}`;
  const currentUserId = useCortexPayStore((state) => state.currentUserId);
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
      queryClient.invalidateQueries({ queryKey: CORTEX_QUERY_KEYS.wallets(userId) });
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
      queryClient.invalidateQueries({ queryKey: CORTEX_QUERY_KEYS.wallets(userId) });
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
      queryClient.invalidateQueries({ queryKey: CORTEX_QUERY_KEYS.cards(userId) });
      queryClient.invalidateQueries({ queryKey: CORTEX_QUERY_KEYS.wallets(userId) });
    },
  });
}

export function useToggleFreezeCard() {
  const queryClient = useQueryClient();
  const userId = useEffectiveUserId();

  return useMutation({
    mutationFn: (cardId: string) => cortexPayApi.toggleFreezeCard(cardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CORTEX_QUERY_KEYS.cards(userId) });
    },
  });
}

export function useSimulateMerchantDebit() {
  const queryClient = useQueryClient();
  const userId = useEffectiveUserId();

  return useMutation({
    mutationFn: (params: MerchantDebitRequest) => cortexPayApi.simulateMerchantDebit(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CORTEX_QUERY_KEYS.cards(userId) });
      queryClient.invalidateQueries({ queryKey: CORTEX_QUERY_KEYS.wallets(userId) });
    },
  });
}
