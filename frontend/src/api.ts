import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface AdminMetrics {
  treasury: {
    total_xof: number;
    total_usd: number;
    fx_pivot: {
      balance: number;
      currency: string;
    };
  };
  cards: {
    total: number;
    active: number;
    frozen: number;
    total_balance_usd: number;
  };
  compliance: {
    pending_kyc: number;
    open_disputes: number;
  };
  total_transactions: number;
  system_health: string;
  timestamp: string;
}

export interface Posting {
  id: string;
  account_number: string;
  currency: string;
  account_type: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: string;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  reference: string;
  idempotency_key: string;
  narration: string;
  status: string;
  is_balanced: boolean;
  created_at: string;
  postings: Posting[];
}

export interface PendingKYCUser {
  user_id: string;
  email: string;
  full_name: string;
  kyc_status: string;
  kyc_tier: number;
  kyc_submitted_at: string | null;
  rejection_reason: string | null;
  document: {
    id: string | null;
    document_type: string;
    document_number: string;
    front_image_url: string;
    back_image_url?: string;
    selfie_url: string;
  } | null;
}

export interface AdminCard {
  card_id: string;
  user_id: string;
  user_email: string;
  cardholder_name: string;
  masked_pan: string;
  currency: string;
  balance: string;
  spending_limit_monthly: string;
  current_month_spent: string;
  card_type: string;
  label: string;
  status: 'ACTIVE' | 'FROZEN' | 'TERMINATED';
  expiry: string;
  created_at: string;
}

export interface AdminDispute {
  dispute_id: string;
  transaction_reference: string;
  card_id: string;
  user_id: string;
  user_email: string;
  amount: string;
  currency: string;
  reason: string;
  description: string;
  status: 'OPENED' | 'UNDER_REVIEW' | 'WON' | 'LOST';
  evidence_url?: string;
  resolution_notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface AdminReconciliation {
  id: string;
  provider: string;
  reconciliation_date: string;
  currency: string;
  total_partner_amount: string;
  total_ledger_amount: string;
  discrepancy_amount: string;
  status: string;
  matched_count: number;
  discrepancy_count: number;
  missing_in_ledger_count: number;
  missing_in_partner_count: number;
  created_at: string;
}

export const adminApi = {
  getMetrics: () => api.get<AdminMetrics>('/admin/metrics').then((r) => r.data),
  getLedger: (limit = 50, offset = 0) =>
    api.get<LedgerEntry[]>(`/admin/ledger?limit=${limit}&offset=${offset}`).then((r) => r.data),
  getPendingKYC: () => api.get<PendingKYCUser[]>('/admin/kyc/pending').then((r) => r.data),
  reviewKYC: (userId: string, decision: 'APPROVED' | 'REJECTED', tier = 1, rejectionReason?: string) =>
    api.post(`/admin/kyc/${userId}/review`, {
      decision,
      tier,
      rejection_reason: rejectionReason,
    }).then((r) => r.data),
  getCards: (limit = 50, offset = 0) =>
    api.get<AdminCard[]>(`/admin/cards?limit=${limit}&offset=${offset}`).then((r) => r.data),
  toggleFreezeCard: (cardId: string) =>
    api.post<{ card_id: string; status: string; message: string }>(`/admin/cards/${cardId}/toggle-freeze`).then((r) => r.data),
  getDisputes: () => api.get<AdminDispute[]>('/admin/disputes').then((r) => r.data),
  resolveDispute: (disputeId: string, decision: 'WON' | 'LOST', resolutionNotes: string) =>
    api.post(`/admin/disputes/${disputeId}/resolve`, {
      decision,
      resolution_notes: resolutionNotes,
    }).then((r) => r.data),
  getReconciliations: () => api.get<AdminReconciliation[]>('/admin/reconciliations').then((r) => r.data),
};
