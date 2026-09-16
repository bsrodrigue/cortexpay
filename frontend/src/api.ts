import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

export interface AdminMetrics {
  treasury: {
    total_xof: number;
    total_usd: number;
    fx_pivot: { balance: number; currency: string };
  };
  cards: { total: number; active: number; frozen: number; total_balance_usd: number };
  compliance: { pending_kyc: number; open_disputes: number };
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
  status: 'OPENED' | 'UNDER_REVIEW' | 'WON_REFUNDED' | 'LOST_CLOSED';
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
  status: 'BALANCED' | 'DISCREPANCY_DETECTED' | 'RESOLVED';
  matched_count: number;
  discrepancy_count: number;
  created_at: string;
}

export interface AdminUser {
  user_id: string;
  email: string;
  full_name: string;
  first_name: string;
  last_name: string;
  kyc_status: string;
  kyc_tier: number;
  is_staff: boolean;
  is_verified: boolean;
  card_count: number;
  xof_balance: number;
  usd_balance: number;
  created_at: string;
}

export interface AdminUserDetail extends AdminUser {
  accounts: Array<{ id: string; account_number: string; currency: string; type: string; balance: number }>;
  cards: Array<{
    card_id: string; masked_pan: string; currency: string; status: string;
    card_type: string; label: string; balance: number;
    spending_limit_monthly: number; current_month_spent: number;
    expiry: string; created_at: string;
  }>;
  recent_disputes: Array<{
    dispute_id: string; transaction_reference: string; amount: number;
    currency: string; reason: string; status: string; created_at: string;
  }>;
  recent_transactions: Array<{
    transaction_id: string; card_id: string; merchant_name: string;
    amount: number; currency: string; status: string; created_at: string;
  }>;
}

export interface AdminTransaction {
  transaction_id: string;
  card_id: string;
  masked_pan: string;
  merchant_name: string;
  amount: number;
  currency: string;
  status: 'APPROVED' | 'DECLINED' | 'ROLLED_BACK';
  decline_reason: string | null;
  user_id: string;
  user_email: string;
  cardholder_name: string;
  created_at: string;
}

export interface PaginatedResponse<T> { items: T[]; total: number }

export interface WebhookEvent {
  id: string;
  event_id: string;
  provider: string;
  event_type: string;
  status: 'RECEIVED' | 'PROCESSED' | 'FAILED' | 'IGNORED';
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface SystemAccount {
  id: string;
  account_number: string;
  currency: string;
  type: string;
  balance: number;
  created_at: string;
}

export const adminApi = {
  getMetrics: () => api.get<AdminMetrics>('/admin/metrics').then(r => r.data),
  getLedger: (limit = 20, offset = 0, dateFrom?: string, dateTo?: string) => {
    const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (dateFrom) p.set('date_from', dateFrom);
    if (dateTo) p.set('date_to', dateTo);
    return api.get<PaginatedResponse<LedgerEntry>>(`/admin/ledger?${p}`).then(r => r.data);
  },
  getPendingKYC: (limit = 20, offset = 0) =>
    api.get<PaginatedResponse<PendingKYCUser>>(`/admin/kyc/pending?limit=${limit}&offset=${offset}`).then(r => r.data),
  reviewKYC: (userId: string, decision: 'APPROVED' | 'REJECTED', tier = 1, rejectionReason?: string) =>
    api.post(`/admin/kyc/${userId}/review`, { decision, tier, rejection_reason: rejectionReason }).then(r => r.data),
  getCards: (limit = 20, offset = 0, status?: string) => {
    const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (status && status !== 'ALL') p.set('status', status);
    return api.get<PaginatedResponse<AdminCard>>(`/admin/cards?${p}`).then(r => r.data);
  },
  toggleFreezeCard: (cardId: string) =>
    api.post<{ card_id: string; status: string; message: string }>(`/admin/cards/${cardId}/toggle-freeze`).then(r => r.data),
  getDisputes: (limit = 20, offset = 0, status?: string) => {
    const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (status && status !== 'ALL') p.set('status', status);
    return api.get<PaginatedResponse<AdminDispute>>(`/admin/disputes?${p}`).then(r => r.data);
  },
  resolveDispute: (disputeId: string, decision: 'WON' | 'LOST', resolutionNotes: string) =>
    api.post(`/admin/disputes/${disputeId}/resolve`, { decision, resolution_notes: resolutionNotes }).then(r => r.data),
  getReconciliations: (limit = 20, offset = 0) =>
    api.get<PaginatedResponse<AdminReconciliation>>(`/admin/reconciliations?limit=${limit}&offset=${offset}`).then(r => r.data),
  getUsers: (limit = 20, offset = 0, search = '') =>
    api.get<PaginatedResponse<AdminUser>>(`/admin/users?limit=${limit}&offset=${offset}&search=${encodeURIComponent(search)}`).then(r => r.data),
  getUserDetail: (userId: string) =>
    api.get<AdminUserDetail>(`/admin/users/${userId}`).then(r => r.data),
  getTransactions: (limit = 20, offset = 0, dateFrom?: string, dateTo?: string) => {
    const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (dateFrom) p.set('date_from', dateFrom);
    if (dateTo) p.set('date_to', dateTo);
    return api.get<PaginatedResponse<AdminTransaction>>(`/admin/transactions?${p}`).then(r => r.data);
  },
  getWebhooks: (limit = 50, offset = 0, status?: string, provider?: string) => {
    const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (status && status !== 'ALL') p.set('status', status);
    if (provider && provider !== 'ALL') p.set('provider', provider);
    return api.get<PaginatedResponse<WebhookEvent>>(`/admin/webhooks?${p}`).then(r => r.data);
  },
  getSystemAccounts: () => api.get<SystemAccount[]>('/admin/system-accounts').then(r => r.data),
  suspendUser: (userId: string) => api.post(`/admin/users/${userId}/suspend`).then(r => r.data),
  activateUser: (userId: string) => api.post(`/admin/users/${userId}/activate`).then(r => r.data),
};
