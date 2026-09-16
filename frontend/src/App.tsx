import React, { useState, useEffect, useCallback, useRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Ban,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  FileCheck2,
  FileSpreadsheet,
  Lock,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  TrendingUp,
  Unlock,
  UserCheck,
  Users,
  Webhook,
  XCircle,
  ReceiptText,
  X,
} from 'lucide-react';

import {
  adminApi,
  type AdminCard,
  type AdminDispute,
  type AdminMetrics,
  type AdminReconciliation,
  type AdminTransaction,
  type AdminUser,
  type AdminUserDetail,
  type LedgerEntry,
  type PendingKYCUser,
  type SystemAccount,
  type WebhookEvent,
} from './api';

const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(inputs));

const ITEMS_PER_PAGE = 10;
const SERVER_PAGE_SIZE = 20;

type SectionKey =
  | 'overview'
  | 'users'
  | 'ledger'
  | 'kyc'
  | 'cards'
  | 'transactions'
  | 'disputes'
  | 'reconciliation'
  | 'webhooks'
  | 'system-accounts';

// ─── CSV Export Utility ───────────────────────────────────────────────────────
function exportToCSV(filename: string, data: Record<string, unknown>[]) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  const csv = [
    keys.join(','),
    ...data.map(row => keys.map(k => JSON.stringify(row[k] ?? '')).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Status Badge Components ──────────────────────────────────────────────────
function KycBadge({ status }: { status: string }) {
  const base = 'px-2 py-0.5 rounded text-[10px] font-bold border';
  if (status === 'APPROVED') return <span className={cn(base, 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20')}>APPROVED</span>;
  if (status === 'SUBMITTED' || status === 'UNDER_REVIEW') return <span className={cn(base, 'bg-amber-500/10 text-amber-400 border-amber-500/20')}>{status}</span>;
  if (status === 'REJECTED') return <span className={cn(base, 'bg-rose-500/10 text-rose-400 border-rose-500/20')}>REJECTED</span>;
  return <span className={cn(base, 'bg-slate-700/50 text-slate-400 border-slate-600')}>{status}</span>;
}

function CardStatusBadge({ status }: { status: string }) {
  const base = 'px-2 py-0.5 rounded text-[10px] font-bold border';
  if (status === 'ACTIVE') return <span className={cn(base, 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20')}>ACTIF</span>;
  if (status === 'FROZEN') return <span className={cn(base, 'bg-blue-500/10 text-blue-400 border-blue-500/20')}>GELÉE</span>;
  return <span className={cn(base, 'bg-rose-500/10 text-rose-400 border-rose-500/20')}>TERMINÉE</span>;
}

function DisputeBadge({ status }: { status: string }) {
  const base = 'px-2 py-0.5 rounded text-[10px] font-bold border';
  if (status === 'OPENED') return <span className={cn(base, 'bg-amber-500/10 text-amber-400 border-amber-500/20')}>OPENED</span>;
  if (status === 'UNDER_REVIEW') return <span className={cn(base, 'bg-blue-500/10 text-blue-400 border-blue-500/20')}>UNDER_REVIEW</span>;
  if (status === 'WON_REFUNDED') return <span className={cn(base, 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20')}>WON_REFUNDED</span>;
  if (status === 'LOST_CLOSED') return <span className={cn(base, 'bg-rose-500/10 text-rose-400 border-rose-500/20')}>LOST_CLOSED</span>;
  return <span className={cn(base, 'bg-slate-700/50 text-slate-400 border-slate-600')}>{status}</span>;
}

function TxStatusBadge({ status }: { status: string }) {
  const base = 'px-2 py-0.5 rounded text-[10px] font-bold border';
  if (status === 'APPROVED') return <span className={cn(base, 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20')}>APPROVED</span>;
  if (status === 'DECLINED') return <span className={cn(base, 'bg-rose-500/10 text-rose-400 border-rose-500/20')}>DECLINED</span>;
  if (status === 'ROLLED_BACK') return <span className={cn(base, 'bg-amber-500/10 text-amber-400 border-amber-500/20')}>ROLLED_BACK</span>;
  return <span className={cn(base, 'bg-slate-700/50 text-slate-400 border-slate-600')}>{status}</span>;
}

function ReconciliationBadge({ status }: { status: string }) {
  const base = 'px-2 py-0.5 rounded text-[10px] font-bold border font-sans';
  if (status === 'BALANCED') return <span className={cn(base, 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20')}>BALANCED</span>;
  if (status === 'DISCREPANCY_DETECTED') return <span className={cn(base, 'bg-amber-500/10 text-amber-400 border-amber-500/20')}>DISCREPANCY</span>;
  if (status === 'RESOLVED') return <span className={cn(base, 'bg-blue-500/10 text-blue-400 border-blue-500/20')}>RESOLVED</span>;
  return <span className={cn(base, 'bg-slate-700/50 text-slate-400 border-slate-600')}>{status}</span>;
}

function WebhookBadge({ status }: { status: string }) {
  const base = 'px-2 py-0.5 rounded text-[10px] font-bold border';
  if (status === 'PROCESSED') return <span className={cn(base, 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20')}>PROCESSED</span>;
  if (status === 'RECEIVED') return <span className={cn(base, 'bg-blue-500/10 text-blue-400 border-blue-500/20')}>RECEIVED</span>;
  if (status === 'FAILED') return <span className={cn(base, 'bg-rose-500/10 text-rose-400 border-rose-500/20')}>FAILED</span>;
  if (status === 'IGNORED') return <span className={cn(base, 'bg-slate-700/50 text-slate-400 border-slate-600')}>IGNORED</span>;
  return <span className={cn(base, 'bg-slate-700/50 text-slate-400 border-slate-600')}>{status}</span>;
}

// ─── Pagination Component ─────────────────────────────────────────────────────
function Pagination({
  page,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between pt-3 border-t border-slate-800/60 mt-3">
      <span className="text-xs text-slate-500">
        Page <span className="text-slate-300 font-semibold">{page}</span> / {totalPages}
        {' '}— {total} résultat{total !== 1 ? 's' : ''}
      </span>
      <div className="flex items-center gap-2">
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Skeleton Rows ────────────────────────────────────────────────────────────
function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className="py-3 px-4">
              <div className="h-3.5 bg-slate-800 rounded animate-pulse w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Filter Tabs ──────────────────────────────────────────────────────────────
function FilterTabs({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            'px-3 py-1 rounded-lg text-xs font-semibold transition',
            value === opt
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// ─── Export Button ────────────────────────────────────────────────────────────
function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition border border-slate-700"
    >
      <Download className="w-3.5 h-3.5" />
      Exporter CSV
    </button>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [activeSection, setActiveSection] = useState<SectionKey>('overview');

  // Data
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [kycPending, setKycPending] = useState<PendingKYCUser[]>([]);
  const [kycTotal, setKycTotal] = useState(0);
  const [cards, setCards] = useState<AdminCard[]>([]);
  const [cardsTotal, setCardsTotal] = useState(0);
  const [disputes, setDisputes] = useState<AdminDispute[]>([]);
  const [disputesTotal, setDisputesTotal] = useState(0);
  const [reconciliations, setReconciliations] = useState<AdminReconciliation[]>([]);
  const [reconciliationsTotal, setReconciliationsTotal] = useState(0);
  const [reconciliationsPage, setReconciliationsPage] = useState(1);

  // Server-side paginated
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersSearch, setUsersSearch] = useState('');
  const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
  const [transactionsTotal, setTransactionsTotal] = useState(0);
  const [transactionsPage, setTransactionsPage] = useState(1);

  // Loading
  const [loading, setLoading] = useState(false);
  const [sectionLoading, setSectionLoading] = useState(false);

  // Server-side pagination pages
  const [ledgerPage, setLedgerPage] = useState(1);
  const [cardsPage, setCardsPage] = useState(1);
  const [kycPage, setKycPage] = useState(1);
  const [disputesPage, setDisputesPage] = useState(1);

  // Filters
  const [cardsFilter, setCardsFilter] = useState<'ALL' | 'ACTIVE' | 'FROZEN'>('ALL');
  const [disputesFilter, setDisputesFilter] = useState('ALL');
  const [txFilter, setTxFilter] = useState('ALL');

  // Search
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [selectedKYCUser, setSelectedKYCUser] = useState<PendingKYCUser | null>(null);
  const [rejectionReason, setRejectionReason] = useState('Document flou ou illisible');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState<AdminDispute | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('Arbitrage Visa : Chargeback accordé au porteur');
  const [disputeLoading, setDisputeLoading] = useState(false);
  const [selectedUserDetail, setSelectedUserDetail] = useState<AdminUserDetail | null>(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);

  // Webhooks & System Accounts
  const [webhooks, setWebhooks] = useState<WebhookEvent[]>([]);
  const [webhooksTotal, setWebhooksTotal] = useState(0);
  const [webhooksPage, setWebhooksPage] = useState(1);
  const [webhooksFilter, setWebhooksFilter] = useState('ALL');
  const [systemAccounts, setSystemAccounts] = useState<SystemAccount[]>([]);

  // Date filters
  const [ledgerDateFrom, setLedgerDateFrom] = useState('');
  const [ledgerDateTo, setLedgerDateTo] = useState('');
  const [txDateFrom, setTxDateFrom] = useState('');
  const [txDateTo, setTxDateTo] = useState('');

  // Confirm dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; message: string;
    onConfirm: (() => void) | null; variant: 'danger' | 'warning';
  }>({ open: false, title: '', message: '', onConfirm: null, variant: 'danger' });

  // Ledger entry detail
  const [selectedLedgerEntry, setSelectedLedgerEntry] = useState<LedgerEntry | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<Array<{ id: string; type: 'success' | 'error' | 'info'; message: string }>>([]);

  const showToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  // ── Data loading ────────────────────────────────────────────────────────────
  const loadUsers = useCallback(async (page: number, search: string) => {
    setSectionLoading(true);
    try {
      const res = await adminApi.getUsers(SERVER_PAGE_SIZE, (page - 1) * SERVER_PAGE_SIZE, search);
      setUsers(res.items);
      setUsersTotal(res.total);
    } catch {
      showToast('error', 'Erreur lors du chargement des utilisateurs');
    } finally {
      setSectionLoading(false);
    }
  }, [showToast]);

  const loadTransactions = useCallback(async (page: number, dateFrom?: string, dateTo?: string) => {
    setSectionLoading(true);
    try {
      const res = await adminApi.getTransactions(SERVER_PAGE_SIZE, (page - 1) * SERVER_PAGE_SIZE, dateFrom, dateTo);
      setTransactions(res.items);
      setTransactionsTotal(res.total);
    } catch {
      showToast('error', 'Erreur lors du chargement des transactions');
    } finally {
      setSectionLoading(false);
    }
  }, [showToast]);

  const loadWebhooks = useCallback(async (page: number, statusFilter?: string) => {
    setSectionLoading(true);
    try {
      const res = await adminApi.getWebhooks(SERVER_PAGE_SIZE, (page - 1) * SERVER_PAGE_SIZE, statusFilter);
      setWebhooks(res.items);
      setWebhooksTotal(res.total);
    } catch {
      showToast('error', 'Erreur lors du chargement des webhooks');
    } finally {
      setSectionLoading(false);
    }
  }, [showToast]);

  const loadLedger = useCallback(async (page: number, dateFrom?: string, dateTo?: string) => {
    setSectionLoading(true);
    try {
      const res = await adminApi.getLedger(SERVER_PAGE_SIZE, (page - 1) * SERVER_PAGE_SIZE, dateFrom, dateTo);
      setLedger(res.items);
      setLedgerTotal(res.total);
    } catch {
      showToast('error', 'Erreur lors du chargement du grand livre');
    } finally {
      setSectionLoading(false);
    }
  }, [showToast]);

  const loadCards = useCallback(async (page: number, statusFilter?: string) => {
    setSectionLoading(true);
    try {
      const res = await adminApi.getCards(SERVER_PAGE_SIZE, (page - 1) * SERVER_PAGE_SIZE, statusFilter);
      setCards(res.items);
      setCardsTotal(res.total);
    } catch {
      showToast('error', 'Erreur lors du chargement des cartes');
    } finally {
      setSectionLoading(false);
    }
  }, [showToast]);

  const loadKyc = useCallback(async (page: number) => {
    setSectionLoading(true);
    try {
      const res = await adminApi.getPendingKYC(SERVER_PAGE_SIZE, (page - 1) * SERVER_PAGE_SIZE);
      setKycPending(res.items);
      setKycTotal(res.total);
    } catch {
      showToast('error', 'Erreur lors du chargement des dossiers KYC');
    } finally {
      setSectionLoading(false);
    }
  }, [showToast]);

  const loadDisputes = useCallback(async (page: number, statusFilter?: string) => {
    setSectionLoading(true);
    try {
      const res = await adminApi.getDisputes(SERVER_PAGE_SIZE, (page - 1) * SERVER_PAGE_SIZE, statusFilter);
      setDisputes(res.items);
      setDisputesTotal(res.total);
    } catch {
      showToast('error', 'Erreur lors du chargement des litiges');
    } finally {
      setSectionLoading(false);
    }
  }, [showToast]);

  const loadReconciliations = useCallback(async (page: number) => {
    setSectionLoading(true);
    try {
      const res = await adminApi.getReconciliations(SERVER_PAGE_SIZE, (page - 1) * SERVER_PAGE_SIZE);
      setReconciliations(res.items);
      setReconciliationsTotal(res.total);
    } catch {
      showToast('error', 'Erreur lors du chargement des réconciliations');
    } finally {
      setSectionLoading(false);
    }
  }, [showToast]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [m, l, k, c, d, r, u, tx, wh, sa] = await Promise.all([
        adminApi.getMetrics().catch(() => null),
        adminApi.getLedger(SERVER_PAGE_SIZE, 0).catch(() => ({ items: [], total: 0 })),
        adminApi.getPendingKYC(SERVER_PAGE_SIZE, 0).catch(() => ({ items: [], total: 0 })),
        adminApi.getCards(SERVER_PAGE_SIZE, 0).catch(() => ({ items: [], total: 0 })),
        adminApi.getDisputes(SERVER_PAGE_SIZE, 0).catch(() => ({ items: [], total: 0 })),
        adminApi.getReconciliations(SERVER_PAGE_SIZE, 0).catch(() => ({ items: [], total: 0 })),
        adminApi.getUsers(SERVER_PAGE_SIZE, 0, '').catch(() => ({ items: [], total: 0 })),
        adminApi.getTransactions(SERVER_PAGE_SIZE, 0).catch(() => ({ items: [], total: 0 })),
        adminApi.getWebhooks(SERVER_PAGE_SIZE, 0).catch(() => ({ items: [], total: 0 })),
        adminApi.getSystemAccounts().catch(() => []),
      ]);
      if (m) setMetrics(m);
      setLedger(l.items); setLedgerTotal(l.total);
      setKycPending(k.items); setKycTotal(k.total);
      setCards(c.items); setCardsTotal(c.total);
      setDisputes(d.items); setDisputesTotal(d.total);
      setReconciliations(r.items); setReconciliationsTotal(r.total);
      setUsers(u.items); setUsersTotal(u.total);
      setTransactions(tx.items); setTransactionsTotal(tx.total);
      setWebhooks(wh.items); setWebhooksTotal(wh.total);
      setSystemAccounts(sa);
    } catch (e) {
      console.error('Error loading admin portal data', e);
      showToast('error', 'Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Debounced user search
  const usersSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (usersSearchTimeout.current) clearTimeout(usersSearchTimeout.current);
    usersSearchTimeout.current = setTimeout(() => {
      setUsersPage(1);
      void loadUsers(1, usersSearch);
    }, 500);
    return () => {
      if (usersSearchTimeout.current) clearTimeout(usersSearchTimeout.current);
    };
  }, [usersSearch, loadUsers]);

  useEffect(() => {
    void loadUsers(usersPage, usersSearch);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usersPage]);

  useEffect(() => {
    void loadTransactions(transactionsPage, txDateFrom || undefined, txDateTo || undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionsPage]);

  useEffect(() => {
    setTransactionsPage(1);
    void loadTransactions(1, txDateFrom || undefined, txDateTo || undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txDateFrom, txDateTo]);

  useEffect(() => {
    void loadWebhooks(webhooksPage, webhooksFilter !== 'ALL' ? webhooksFilter : undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhooksPage, webhooksFilter]);

  useEffect(() => {
    void loadLedger(ledgerPage, ledgerDateFrom || undefined, ledgerDateTo || undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerPage]);

  useEffect(() => {
    setLedgerPage(1);
    void loadLedger(1, ledgerDateFrom || undefined, ledgerDateTo || undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerDateFrom, ledgerDateTo]);

  useEffect(() => {
    void loadCards(cardsPage, cardsFilter !== 'ALL' ? cardsFilter : undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardsPage]);

  useEffect(() => {
    setCardsPage(1);
    void loadCards(1, cardsFilter !== 'ALL' ? cardsFilter : undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardsFilter]);

  useEffect(() => {
    void loadKyc(kycPage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kycPage]);

  useEffect(() => {
    void loadDisputes(disputesPage, disputesFilter !== 'ALL' ? disputesFilter : undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disputesPage]);

  useEffect(() => {
    setDisputesPage(1);
    void loadDisputes(1, disputesFilter !== 'ALL' ? disputesFilter : undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disputesFilter]);

  useEffect(() => {
    void loadReconciliations(reconciliationsPage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconciliationsPage]);

  // ── Action Handlers ─────────────────────────────────────────────────────────
  const handleKYCReview = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!selectedKYCUser) return;
    setReviewLoading(true);
    try {
      await adminApi.reviewKYC(
        selectedKYCUser.user_id,
        decision,
        1,
        decision === 'REJECTED' ? rejectionReason : undefined
      );
      setSelectedKYCUser(null);
      showToast('success', `Dossier KYC ${decision === 'APPROVED' ? 'approuvé' : 'refusé'} avec succès`);
      await loadData();
    } catch (e) {
      showToast('error', `Erreur validation KYC : ${String(e)}`);
    } finally {
      setReviewLoading(false);
    }
  };

  const doToggleCardFreeze = async (cardId: string) => {
    try {
      const res = await adminApi.toggleFreezeCard(cardId);
      setCards(prev =>
        prev.map(c => (c.card_id === cardId ? { ...c, status: res.status as 'ACTIVE' | 'FROZEN' } : c))
      );
      setConfirmDialog(prev => ({ ...prev, open: false }));
      showToast('success', res.message);
    } catch (e) {
      showToast('error', `Erreur changement de statut carte : ${String(e)}`);
    }
  };

  const handleToggleCardFreeze = (cardId: string, currentStatus: string) => {
    const isActive = currentStatus === 'ACTIVE';
    openConfirm(
      isActive ? 'Geler la carte ?' : 'Dégeler la carte ?',
      isActive
        ? 'La carte sera immédiatement désactivée. Toute transaction en cours sera refusée.'
        : 'La carte sera réactivée et pourra être utilisée pour des transactions.',
      () => void doToggleCardFreeze(cardId),
      isActive ? 'danger' : 'warning'
    );
  };

  const handleResolveDispute = async (decision: 'WON' | 'LOST') => {
    if (!selectedDispute) return;
    setDisputeLoading(true);
    try {
      await adminApi.resolveDispute(selectedDispute.dispute_id, decision, resolutionNotes);
      setSelectedDispute(null);
      showToast('success', `Litige ${decision === 'WON' ? 'accordé (WON_REFUNDED)' : 'clos (LOST_CLOSED)'}`);
      await loadData();
    } catch (e) {
      showToast('error', `Erreur arbitrage litige : ${String(e)}`);
    } finally {
      setDisputeLoading(false);
    }
  };

  const handleOpenUserDetail = async (userId: string) => {
    setUserDetailLoading(true);
    setSelectedUserDetail(null);
    try {
      const detail = await adminApi.getUserDetail(userId);
      setSelectedUserDetail(detail);
    } catch (e) {
      showToast('error', `Erreur chargement utilisateur : ${String(e)}`);
    } finally {
      setUserDetailLoading(false);
    }
  };

  const openConfirm = (title: string, message: string, onConfirm: () => void, variant: 'danger' | 'warning' = 'danger') => {
    setConfirmDialog({ open: true, title, message, onConfirm, variant });
  };

  const handleSuspendUser = async (userId: string) => {
    try {
      await adminApi.suspendUser(userId);
      setSelectedUserDetail(prev => prev ? { ...prev, is_verified: false } : null);
      setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, is_verified: false } : u));
      setConfirmDialog(prev => ({ ...prev, open: false }));
      showToast('success', 'Compte utilisateur suspendu avec succès');
    } catch (e) {
      showToast('error', `Erreur suspension compte : ${String(e)}`);
    }
  };

  const handleActivateUser = async (userId: string) => {
    try {
      await adminApi.activateUser(userId);
      setSelectedUserDetail(prev => prev ? { ...prev, is_verified: true } : null);
      setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, is_verified: true } : u));
      setConfirmDialog(prev => ({ ...prev, open: false }));
      showToast('success', 'Compte utilisateur réactivé avec succès');
    } catch (e) {
      showToast('error', `Erreur réactivation compte : ${String(e)}`);
    }
  };

  // ── Derived filtered data (text search only — date/status filters are server-side) ────
  const filteredLedger = ledger.filter(e =>
    !searchTerm ||
    e.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.narration.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredCards = cards.filter(c =>
    !searchTerm ||
    c.masked_pan.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.cardholder_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredKYC = kycPending.filter(u =>
    !searchTerm ||
    u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDisputes = disputes.filter(d =>
    !searchTerm ||
    d.dispute_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.user_email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredTx = transactions.filter(t => {
    const matchFilter = txFilter === 'ALL' || t.status === txFilter;
    const matchSearch =
      !searchTerm ||
      t.merchant_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.masked_pan.toLowerCase().includes(searchTerm.toLowerCase());
    return matchFilter && matchSearch;
  });

  const openDisputesCount = metrics?.compliance.open_disputes ?? disputesTotal;

  // ── Sidebar nav helper ──────────────────────────────────────────────────────
  const navItem = (
    key: SectionKey,
    label: React.ReactNode,
    icon: React.ReactNode,
    badge?: React.ReactNode
  ) => (
    <button
      onClick={() => setActiveSection(key)}
      className={cn(
        'w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition',
        activeSection === key
          ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
      )}
    >
      <div className="flex items-center gap-3">
        {icon}
        {label}
      </div>
      {badge}
    </button>
  );

  const countBadge = (n: number) => (
    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">{n}</span>
  );

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 antialiased overflow-hidden font-sans">
      {/* ── Sidebar ── */}
      <aside className="w-72 bg-slate-900/90 border-r border-slate-800/80 flex flex-col justify-between p-4 backdrop-blur">
        <div>
          {/* Logo */}
          <div className="flex items-center gap-3 px-3 py-4 mb-4 border-b border-slate-800/60">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-black tracking-widest text-white shadow-lg shadow-blue-600/30">
              CP
            </div>
            <div>
              <div className="font-bold tracking-tight text-white flex items-center gap-1.5 text-base">
                CortexPay{' '}
                <span className="text-[10px] bg-blue-500/20 text-blue-400 font-semibold px-1.5 py-0.5 rounded border border-blue-500/30">
                  HQ ADMIN
                </span>
              </div>
              <p className="text-xs text-slate-400">Portail Régulateur &amp; Opérations</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="space-y-1.5">
            {navItem('overview', "Vue d'ensemble", <Activity className="w-4 h-4" />)}
            {navItem(
              'users',
              'Utilisateurs',
              <Users className="w-4 h-4" />,
              countBadge(usersTotal)
            )}
            {navItem(
              'ledger',
              'Grand Livre',
              <FileSpreadsheet className="w-4 h-4" />,
              countBadge(ledger.length)
            )}
            {navItem(
              'kyc',
              'Conformité KYC',
              <FileCheck2 className="w-4 h-4" />,
              kycPending.length > 0 ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30 animate-pulse">
                  {kycPending.length}
                </span>
              ) : undefined
            )}
            {navItem(
              'cards',
              'Cartes Virtuelles',
              <CreditCard className="w-4 h-4" />,
              countBadge(cards.length)
            )}
            {navItem(
              'transactions',
              'Transactions',
              <ReceiptText className="w-4 h-4" />,
              countBadge(transactionsTotal)
            )}
            {navItem(
              'disputes',
              'Litiges',
              <Scale className="w-4 h-4" />,
              openDisputesCount > 0 ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30">
                  {openDisputesCount}
                </span>
              ) : countBadge(disputes.length)
            )}
            {navItem(
              'reconciliation',
              'Rapprochement',
              <ArrowRightLeft className="w-4 h-4" />,
              countBadge(reconciliations.length)
            )}
            {navItem(
              'webhooks',
              'Webhooks',
              <Webhook className="w-4 h-4" />,
              webhooksTotal > 0 ? countBadge(webhooksTotal) : undefined
            )}
            {navItem(
              'system-accounts',
              'Comptes Système',
              <Building2 className="w-4 h-4" />,
              systemAccounts.length > 0 ? countBadge(systemAccounts.length) : undefined
            )}
          </nav>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Invariant Comptable
            </span>
            <span className="text-emerald-400 font-mono font-bold">100% BALANCED</span>
          </div>
          <div className="text-[11px] text-slate-500">
            &Sigma; Débits = &Sigma; Crédits (Triggers PostgreSQL actifs)
          </div>
          <button
            onClick={() => void loadData()}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-1.5 text-xs text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 rounded-lg transition"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Actualiser les données
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
        {/* Header */}
        <header className="h-16 border-b border-slate-800/80 bg-slate-900/40 px-6 flex items-center justify-between backdrop-blur shrink-0">
          <h1 className="text-lg font-bold text-white">
            {activeSection === 'overview' && "Tableau de Bord & Indicateurs Système"}
            {activeSection === 'users' && "Gestion des Utilisateurs"}
            {activeSection === 'ledger' && "Grand Livre Comptable Immuable"}
            {activeSection === 'kyc' && "Vérification et Validation des Dossiers KYC"}
            {activeSection === 'cards' && "Supervision des Cartes Virtuelles Visa USD"}
            {activeSection === 'transactions' && "Transactions par Carte"}
            {activeSection === 'disputes' && "Arbitrage des Litiges et Chargebacks Visa"}
            {activeSection === 'reconciliation' && "Rapprochement et Audit des Opérateurs"}
            {activeSection === 'webhooks' && "Moniteur d'Événements Webhook"}
            {activeSection === 'system-accounts' && "Bilan des Comptes Système"}
          </h1>

          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Rechercher référence, email, carte..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition w-64"
              />
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold text-slate-200">Admin Staff HQ</div>
              <div className="text-[10px] text-emerald-400 font-mono">BCEAO Audited Tier</div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ── 1. OVERVIEW ── */}
          {activeSection === 'overview' && (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                    <span>Trésorerie XOF</span>
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">
                    {metrics?.treasury.total_xof.toLocaleString('fr-FR')}{' '}
                    <span className="text-xs text-emerald-400 font-normal">XOF</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">Dépôts Mobile Money (Wave / Orange)</p>
                </div>

                <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                    <span>Trésorerie USD</span>
                    <TrendingUp className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">
                    ${metrics?.treasury.total_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
                    <span className="text-xs text-blue-400 font-normal">USD</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">Fonds provisionnés pour débits cartes</p>
                </div>

                <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                    <span>Pivot FX_CLEARING</span>
                    <ArrowRightLeft className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">
                    {metrics?.treasury.fx_pivot.balance.toLocaleString('fr-FR')}{' '}
                    <span className="text-xs text-amber-400 font-normal">{metrics?.treasury.fx_pivot.currency}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">Net clearing sur conversions garanties</p>
                </div>

                <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                    <span>Cartes Virtuelles</span>
                    <CreditCard className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">
                    {metrics?.cards.total}{' '}
                    <span className="text-xs text-slate-400 font-normal">
                      ({metrics?.cards.active} actives / {metrics?.cards.frozen} gelées)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Solde total : ${metrics?.cards.total_balance_usd.toFixed(2)} USD
                  </p>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-2xl flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xl font-bold font-mono text-white">{usersTotal.toLocaleString()}</div>
                    <div className="text-xs text-slate-400">Utilisateurs inscrits</div>
                  </div>
                </div>
                <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-2xl flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <ReceiptText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xl font-bold font-mono text-white">{metrics?.total_transactions?.toLocaleString() ?? transactionsTotal.toLocaleString()}</div>
                    <div className="text-xs text-slate-400">Transactions totales</div>
                  </div>
                </div>
              </div>

              {/* Action banners */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gradient-to-r from-amber-950/40 to-slate-900/60 border border-amber-500/30 p-5 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                      <FileCheck2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">
                        {kycPending.length} dossiers KYC en attente
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Conformité réglementaire requise pour activer les cartes Visa.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveSection('kyc')}
                    className="px-4 py-2 bg-amber-500 text-slate-950 font-semibold rounded-xl text-xs hover:bg-amber-400 transition"
                  >
                    Examiner →
                  </button>
                </div>

                <div className="bg-gradient-to-r from-rose-950/40 to-slate-900/60 border border-rose-500/30 p-5 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                      <Scale className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">
                        {openDisputesCount} litiges Visa ouverts
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Dossiers de contestation à arbitrer (Dispute FSM).
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveSection('disputes')}
                    className="px-4 py-2 bg-rose-600 text-white font-semibold rounded-xl text-xs hover:bg-rose-500 transition"
                  >
                    Arbitrer →
                  </button>
                </div>
              </div>

              {/* Recent ledger */}
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-white">Dernières Écritures du Grand Livre</h2>
                    <p className="text-xs text-slate-400">Journal d'écritures comptables immuables</p>
                  </div>
                  <button onClick={() => setActiveSection('ledger')} className="text-xs text-blue-400 hover:text-blue-300 transition">
                    Voir l'intégralité →
                  </button>
                </div>
                <div className="divide-y divide-slate-800/60 font-mono text-xs">
                  {ledger.slice(0, 5).map(entry => (
                    <div key={entry.id} className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <div>
                          <div className="font-semibold text-slate-200">{entry.narration}</div>
                          <div className="text-[11px] text-slate-500">Réf: {entry.reference}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-sans">
                          {entry.status}
                        </span>
                        <div className="text-[10px] text-slate-500 mt-1 font-sans">
                          {new Date(entry.created_at).toLocaleString('fr-FR')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent transactions */}
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-white">Transactions Récentes</h2>
                    <p className="text-xs text-slate-400">5 dernières transactions par carte</p>
                  </div>
                  <button onClick={() => setActiveSection('transactions')} className="text-xs text-blue-400 hover:text-blue-300 transition">
                    Voir tout →
                  </button>
                </div>
                <div className="divide-y divide-slate-800/60 text-xs">
                  {transactions.slice(0, 5).map(tx => (
                    <div key={tx.transaction_id} className="py-3 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-slate-200">{tx.merchant_name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{tx.masked_pan} · {tx.cardholder_name || tx.user_email}</div>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <div>
                          <div className="font-bold font-mono text-white">${tx.amount.toFixed(2)} {tx.currency}</div>
                          <div className="text-[10px] text-slate-500">{new Date(tx.created_at).toLocaleString('fr-FR')}</div>
                        </div>
                        <TxStatusBadge status={tx.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── 2. USERS ── */}
          {activeSection === 'users' && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-white">Gestion des Utilisateurs</h2>
                    <p className="text-xs text-slate-400">Liste complète des comptes enregistrés sur la plateforme</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Rechercher un utilisateur..."
                        value={usersSearch}
                        onChange={e => setUsersSearch(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition w-52"
                      />
                    </div>
                    <ExportButton
                      onClick={() =>
                        exportToCSV(
                          'utilisateurs.csv',
                          users.map(u => ({
                            user_id: u.user_id,
                            email: u.email,
                            full_name: u.full_name,
                            kyc_status: u.kyc_status,
                            kyc_tier: u.kyc_tier,
                            xof_balance: u.xof_balance,
                            usd_balance: u.usd_balance,
                            card_count: u.card_count,
                            created_at: u.created_at,
                          }))
                        )
                      }
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Nom complet</th>
                        <th className="py-3 px-4">Email</th>
                        <th className="py-3 px-4">Statut KYC</th>
                        <th className="py-3 px-4">Tier</th>
                        <th className="py-3 px-4">Solde XOF</th>
                        <th className="py-3 px-4">Solde USD</th>
                        <th className="py-3 px-4">Cartes</th>
                        <th className="py-3 px-4">Inscrit le</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {sectionLoading ? (
                        <SkeletonRows cols={8} />
                      ) : users.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-slate-500 text-sm">
                            Aucun utilisateur trouvé.
                          </td>
                        </tr>
                      ) : (
                        users.map(user => (
                          <tr
                            key={user.user_id}
                            className="hover:bg-slate-800/30 transition cursor-pointer"
                            onClick={() => void handleOpenUserDetail(user.user_id)}
                          >
                            <td className="py-3 px-4">
                              <div className="font-bold text-white">{user.full_name}</div>
                              <div className="text-[10px] text-slate-500 font-mono">{user.user_id.slice(0, 8)}…</div>
                            </td>
                            <td className="py-3 px-4 text-slate-300">{user.email}</td>
                            <td className="py-3 px-4"><KycBadge status={user.kyc_status} /></td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">
                                T{user.kyc_tier}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-200">
                              {user.xof_balance.toLocaleString('fr-FR')}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-200">
                              ${user.usd_balance.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-center text-slate-300">{user.card_count}</td>
                            <td className="py-3 px-4 text-slate-400">
                              {new Date(user.created_at).toLocaleDateString('fr-FR')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  page={usersPage}
                  total={usersTotal}
                  pageSize={SERVER_PAGE_SIZE}
                  onPageChange={p => setUsersPage(p)}
                />
              </div>
            </div>
          )}

          {/* ── 3. LEDGER ── */}
          {activeSection === 'ledger' && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-white">Grand Livre Comptable (Double-Entry Ledger)</h2>
                    <p className="text-xs text-slate-400">
                      Chaque écriture garantit l'invariant d'équilibre total des flux.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ExportButton
                      onClick={() =>
                        exportToCSV(
                          'ledger.csv',
                          filteredLedger.map(e => ({
                            id: e.id,
                            reference: e.reference,
                            narration: e.narration,
                            status: e.status,
                            is_balanced: e.is_balanced,
                            created_at: e.created_at,
                          }))
                        )
                      }
                    />
                    <span className="text-xs px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg font-mono font-bold">
                      POSTGRESQL APPEND-ONLY ACTIVE
                    </span>
                  </div>
                </div>

                {/* Date filters */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-400 whitespace-nowrap">Du :</label>
                    <input
                      type="date"
                      value={ledgerDateFrom}
                      onChange={e => { setLedgerDateFrom(e.target.value); setLedgerPage(1); }}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-400 whitespace-nowrap">Au :</label>
                    <input
                      type="date"
                      value={ledgerDateTo}
                      onChange={e => { setLedgerDateTo(e.target.value); setLedgerPage(1); }}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition"
                    />
                  </div>
                  {(ledgerDateFrom || ledgerDateTo) && (
                    <button
                      onClick={() => { setLedgerDateFrom(''); setLedgerDateTo(''); setLedgerPage(1); }}
                      className="text-xs text-slate-400 hover:text-slate-200 transition px-2 py-1 bg-slate-800 rounded-lg"
                    >
                      × Effacer
                    </button>
                  )}
                  <span className="text-xs text-slate-500 ml-auto">{ledgerTotal} écritures</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Date &amp; Heure</th>
                        <th className="py-3 px-4">Référence</th>
                        <th className="py-3 px-4">Description</th>
                        <th className="py-3 px-4">Postings (Partie Double)</th>
                        <th className="py-3 px-4 text-center">Équilibré</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {loading ? (
                        <SkeletonRows cols={5} />
                      ) : (
                        filteredLedger.map(entry => (
                          <tr key={entry.id} className="hover:bg-slate-800/30 transition cursor-pointer" onClick={() => setSelectedLedgerEntry(entry)}>
                            <td className="py-3 px-4 text-slate-400 whitespace-nowrap font-sans">
                              {new Date(entry.created_at).toLocaleString('fr-FR')}
                            </td>
                            <td className="py-3 px-4 text-blue-400 font-semibold">{entry.reference}</td>
                            <td className="py-3 px-4 text-slate-200 font-sans">{entry.narration}</td>
                            <td className="py-3 px-4">
                              <div className="space-y-1">
                                {entry.postings.map(p => (
                                  <div key={p.id} className="flex items-center justify-between gap-4 text-[11px]">
                                    <span className="text-slate-400">
                                      {p.account_number} ({p.currency})
                                    </span>
                                    <span className={cn('font-bold', p.direction === 'CREDIT' ? 'text-emerald-400' : 'text-rose-400')}>
                                      {p.direction === 'CREDIT' ? '+ ' : '- '}
                                      {Number(p.amount).toLocaleString()} {p.currency}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center">
                              {entry.is_balanced ? (
                                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-sans">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Conforme
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 font-sans">
                                  <XCircle className="w-3.5 h-3.5" /> Déséquilibré
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  page={ledgerPage}
                  total={ledgerTotal}
                  pageSize={SERVER_PAGE_SIZE}
                  onPageChange={p => setLedgerPage(p)}
                />
              </div>
            </div>
          )}

          {/* ── 4. KYC ── */}
          {activeSection === 'kyc' && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-white">Dossiers de Vérification d'Identité (KYC)</h2>
                    <p className="text-xs text-slate-400">
                      Revue de conformité réglementaire BCEAO / UEMOA pour l'approbation Tier 1
                    </p>
                  </div>
                  <span className="text-xs px-3 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg font-bold">
                    {kycTotal} En Attente
                  </span>
                </div>

                {filteredKYC.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-sm">
                    <ShieldCheck className="w-10 h-10 mx-auto text-emerald-500 mb-2 opacity-80" />
                    Aucun dossier KYC en attente. Tous les clients sont en règle !
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      {filteredKYC.map(user => (
                        <div
                          key={user.user_id}
                          className="bg-slate-950/80 border border-slate-800 p-5 rounded-2xl space-y-4 hover:border-slate-700 transition"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-bold text-white text-sm">{user.full_name}</div>
                              <div className="text-xs text-slate-400">{user.email}</div>
                              <div className="text-[11px] text-slate-500 font-mono mt-1">ID: {user.user_id}</div>
                            </div>
                            <KycBadge status={user.kyc_status} />
                          </div>

                          {user.document ? (
                            <div className="space-y-2 text-xs text-slate-300">
                              <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                                <span>Type de pièce :</span>
                                <span className="font-bold text-white">{user.document.document_type}</span>
                              </div>
                              <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                                <span>Numéro officiel :</span>
                                <span className="font-mono font-bold text-white">{user.document.document_number}</span>
                              </div>
                              <div className="grid grid-cols-3 gap-2 pt-2">
                                {user.document.front_image_url && (
                                  <a href={user.document.front_image_url} target="_blank" rel="noreferrer"
                                    className="aspect-video bg-slate-900 rounded-lg overflow-hidden border border-slate-800 relative group">
                                    <img src={user.document.front_image_url} alt="Recto" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-white transition">Recto</div>
                                  </a>
                                )}
                                {user.document.back_image_url && (
                                  <a href={user.document.back_image_url} target="_blank" rel="noreferrer"
                                    className="aspect-video bg-slate-900 rounded-lg overflow-hidden border border-slate-800 relative group">
                                    <img src={user.document.back_image_url} alt="Verso" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-white transition">Verso</div>
                                  </a>
                                )}
                                {user.document.selfie_url && (
                                  <a href={user.document.selfie_url} target="_blank" rel="noreferrer"
                                    className="aspect-video bg-slate-900 rounded-lg overflow-hidden border border-slate-800 relative group">
                                    <img src={user.document.selfie_url} alt="Selfie" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-white transition">Selfie</div>
                                  </a>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-slate-500 italic">Aucun document téléversé</div>
                          )}

                          <div className="flex items-center gap-2 pt-2">
                            <button
                              onClick={() => setSelectedKYCUser(user)}
                              className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition"
                            >
                              Examiner &amp; Décider
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <Pagination
                      page={kycPage}
                      total={kycTotal}
                      pageSize={SERVER_PAGE_SIZE}
                      onPageChange={p => setKycPage(p)}
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── 5. CARDS ── */}
          {activeSection === 'cards' && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-white">Supervision des Cartes Virtuelles Visa USD</h2>
                    <p className="text-xs text-slate-400">
                      Gestion des risques, plafonds mensuels et gel d'urgence en 1-clic
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <FilterTabs
                      options={['ALL', 'ACTIVE', 'FROZEN']}
                      value={cardsFilter}
                      onChange={v => { setCardsFilter(v as 'ALL' | 'ACTIVE' | 'FROZEN'); setCardsPage(1); }}
                    />
                    <ExportButton
                      onClick={() =>
                        exportToCSV(
                          'cartes.csv',
                          filteredCards.map(c => ({
                            card_id: c.card_id,
                            cardholder: c.cardholder_name,
                            email: c.user_email,
                            masked_pan: c.masked_pan,
                            type: c.card_type,
                            balance: c.balance,
                            status: c.status,
                            expiry: c.expiry,
                            created_at: c.created_at,
                          }))
                        )
                      }
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Titulaire</th>
                        <th className="py-3 px-4">Numéro Masqué</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Solde</th>
                        <th className="py-3 px-4">Dépenses / Plafond</th>
                        <th className="py-3 px-4">Statut</th>
                        <th className="py-3 px-4">Expiry</th>
                        <th className="py-3 px-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {loading ? (
                        <SkeletonRows cols={8} />
                      ) : (
                        filteredCards.map(card => (
                          <tr key={card.card_id} className="hover:bg-slate-800/30 transition">
                            <td className="py-3 px-4">
                              <div className="font-bold text-white">{card.cardholder_name || card.label}</div>
                              <div className="text-[11px] text-slate-500">{card.user_email}</div>
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-300 font-semibold">{card.masked_pan}</td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold">
                                {card.card_type}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                              ${Number(card.balance).toFixed(2)} USD
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-300">
                              ${Number(card.current_month_spent).toFixed(0)} / ${Number(card.spending_limit_monthly).toFixed(0)}
                            </td>
                            <td className="py-3 px-4"><CardStatusBadge status={card.status} /></td>
                            <td className="py-3 px-4 font-mono text-slate-400">{card.expiry}</td>
                            <td className="py-3 px-4 text-center">
                              {card.status !== 'TERMINATED' && (
                                <button
                                  onClick={() => handleToggleCardFreeze(card.card_id, card.status)}
                                  className={cn(
                                    'px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition',
                                    card.status === 'ACTIVE'
                                      ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30'
                                      : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30'
                                  )}
                                >
                                  {card.status === 'ACTIVE' ? (
                                    <><Lock className="w-3 h-3" /> Geler</>
                                  ) : (
                                    <><Unlock className="w-3 h-3" /> Dégeler</>
                                  )}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  page={cardsPage}
                  total={cardsTotal}
                  pageSize={SERVER_PAGE_SIZE}
                  onPageChange={p => setCardsPage(p)}
                />
              </div>
            </div>
          )}

          {/* ── 6. TRANSACTIONS ── */}
          {activeSection === 'transactions' && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-white">Transactions par Carte</h2>
                    <p className="text-xs text-slate-400">
                      Historique complet des transactions Visa avec statuts APPROVED / DECLINED / ROLLED_BACK
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <FilterTabs
                      options={['ALL', 'APPROVED', 'DECLINED', 'ROLLED_BACK']}
                      value={txFilter}
                      onChange={v => setTxFilter(v)}
                    />
                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        value={txDateFrom}
                        onChange={e => setTxDateFrom(e.target.value)}
                        title="Date début"
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition"
                      />
                      <span className="text-slate-600 text-xs">–</span>
                      <input
                        type="date"
                        value={txDateTo}
                        onChange={e => setTxDateTo(e.target.value)}
                        title="Date fin"
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition"
                      />
                      {(txDateFrom || txDateTo) && (
                        <button
                          onClick={() => { setTxDateFrom(''); setTxDateTo(''); }}
                          className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 bg-slate-800 rounded-lg transition"
                        >×</button>
                      )}
                    </div>
                    <ExportButton
                      onClick={() =>
                        exportToCSV(
                          'transactions.csv',
                          filteredTx.map(t => ({
                            transaction_id: t.transaction_id,
                            date: t.created_at,
                            merchant: t.merchant_name,
                            amount: t.amount,
                            currency: t.currency,
                            masked_pan: t.masked_pan,
                            cardholder: t.cardholder_name,
                            email: t.user_email,
                            status: t.status,
                            decline_reason: t.decline_reason ?? '',
                          }))
                        )
                      }
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Marchand</th>
                        <th className="py-3 px-4">Montant</th>
                        <th className="py-3 px-4">Carte (PAN)</th>
                        <th className="py-3 px-4">Titulaire</th>
                        <th className="py-3 px-4">Statut</th>
                        <th className="py-3 px-4">Motif refus</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {sectionLoading ? (
                        <SkeletonRows cols={7} />
                      ) : filteredTx.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-500 text-sm">
                            Aucune transaction trouvée.
                          </td>
                        </tr>
                      ) : (
                        filteredTx.map(tx => (
                          <tr key={tx.transaction_id} className="hover:bg-slate-800/30 transition">
                            <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                              {new Date(tx.created_at).toLocaleString('fr-FR')}
                            </td>
                            <td className="py-3 px-4 font-semibold text-white">{tx.merchant_name}</td>
                            <td className="py-3 px-4 font-mono font-bold text-slate-100">
                              ${tx.amount.toFixed(2)} {tx.currency}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-300">{tx.masked_pan}</td>
                            <td className="py-3 px-4">
                              <div className="text-white">{tx.cardholder_name || '—'}</div>
                              <div className="text-[10px] text-slate-500">{tx.user_email}</div>
                            </td>
                            <td className="py-3 px-4"><TxStatusBadge status={tx.status} /></td>
                            <td className="py-3 px-4 text-slate-500 text-[11px]">{tx.decline_reason ?? '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  page={transactionsPage}
                  total={transactionsTotal}
                  pageSize={SERVER_PAGE_SIZE}
                  onPageChange={p => setTransactionsPage(p)}
                />
              </div>
            </div>
          )}

          {/* ── 7. DISPUTES ── */}
          {activeSection === 'disputes' && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-white">Litiges &amp; Chargebacks Visa</h2>
                    <p className="text-xs text-slate-400">
                      Machine à états finis (Dispute FSM) : OPENED → UNDER_REVIEW → WON_REFUNDED / LOST_CLOSED
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <FilterTabs
                      options={['ALL', 'OPENED', 'UNDER_REVIEW', 'WON_REFUNDED', 'LOST_CLOSED']}
                      value={disputesFilter}
                      onChange={v => { setDisputesFilter(v); setDisputesPage(1); }}
                    />
                    <ExportButton
                      onClick={() =>
                        exportToCSV(
                          'litiges.csv',
                          filteredDisputes.map(d => ({
                            dispute_id: d.dispute_id,
                            user_email: d.user_email,
                            amount: d.amount,
                            currency: d.currency,
                            reason: d.reason,
                            status: d.status,
                            transaction_reference: d.transaction_reference,
                            created_at: d.created_at,
                          }))
                        )
                      }
                    />
                  </div>
                </div>

                {disputes.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-sm">
                    Aucun litige de transaction enregistré.
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                          <tr>
                            <th className="py-3 px-4">ID Litige</th>
                            <th className="py-3 px-4">Utilisateur</th>
                            <th className="py-3 px-4">Montant</th>
                            <th className="py-3 px-4">Motif</th>
                            <th className="py-3 px-4">Statut</th>
                            <th className="py-3 px-4">Date</th>
                            <th className="py-3 px-4 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {loading ? (
                            <SkeletonRows cols={7} />
                          ) : (
                            filteredDisputes.map(dispute => (
                              <tr key={dispute.dispute_id} className="hover:bg-slate-800/30 transition">
                                <td className="py-3 px-4 font-mono text-slate-300 text-[11px]">
                                  {dispute.dispute_id.slice(0, 12)}…
                                </td>
                                <td className="py-3 px-4">
                                  <div className="text-white">{dispute.user_email}</div>
                                  <div className="text-[10px] text-slate-500 font-mono">{dispute.card_id?.slice(0, 8)}…</div>
                                </td>
                                <td className="py-3 px-4 font-mono font-bold text-white">
                                  ${Number(dispute.amount).toFixed(2)} {dispute.currency}
                                </td>
                                <td className="py-3 px-4 text-slate-300">{dispute.reason}</td>
                                <td className="py-3 px-4"><DisputeBadge status={dispute.status} /></td>
                                <td className="py-3 px-4 text-slate-400">
                                  {new Date(dispute.created_at).toLocaleDateString('fr-FR')}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  {(dispute.status === 'OPENED' || dispute.status === 'UNDER_REVIEW') && (
                                    <button
                                      onClick={() => setSelectedDispute(dispute)}
                                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition"
                                    >
                                      Arbitrer
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    <Pagination
                      page={disputesPage}
                      total={disputesTotal}
                      pageSize={SERVER_PAGE_SIZE}
                      onPageChange={p => setDisputesPage(p)}
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── 8. RECONCILIATION ── */}
          {/* (keep original section number to avoid renumbering) */}
          {activeSection === 'reconciliation' && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-white">Rapprochement Bancaire (Reconciliation Reports)</h2>
                    <p className="text-xs text-slate-400">
                      Rapports de clôture journalière (EOD) comparant les relevés partenaires et le Grand Livre
                    </p>
                  </div>
                  <ExportButton
                    onClick={() =>
                      exportToCSV(
                        'reconciliations.csv',
                        reconciliations.map(r => ({
                          id: r.id,
                          provider: r.provider,
                          date: r.reconciliation_date,
                          currency: r.currency,
                          partner_amount: r.total_partner_amount,
                          ledger_amount: r.total_ledger_amount,
                          discrepancy: r.discrepancy_amount,
                          status: r.status,
                          matched: r.matched_count,
                          discrepancies: r.discrepancy_count,
                        }))
                      )
                    }
                  />
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Date de clôture</th>
                        <th className="py-3 px-4">Partenaire</th>
                        <th className="py-3 px-4">Total Partenaire</th>
                        <th className="py-3 px-4">Total Grand Livre</th>
                        <th className="py-3 px-4">Écart</th>
                        <th className="py-3 px-4">Réconciliés</th>
                        <th className="py-3 px-4">Litiges</th>
                        <th className="py-3 px-4">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {loading ? (
                        <SkeletonRows cols={8} />
                      ) : (
                        reconciliations.map(rec => {
                          const discrepancy = Number(rec.discrepancy_amount);  // eslint-disable-line @typescript-eslint/no-unused-vars
                          return (
                            <tr key={rec.id} className="hover:bg-slate-800/30 transition">
                              <td className="py-3 px-4 text-slate-300 font-sans">{rec.reconciliation_date}</td>
                              <td className="py-3 px-4 font-bold text-white">{rec.provider}</td>
                              <td className="py-3 px-4 text-slate-200">
                                {Number(rec.total_partner_amount).toLocaleString()} {rec.currency}
                              </td>
                              <td className="py-3 px-4 text-slate-200">
                                {Number(rec.total_ledger_amount).toLocaleString()} {rec.currency}
                              </td>
                              <td className={cn('py-3 px-4 font-bold', discrepancy !== 0 ? 'text-rose-400' : 'text-emerald-400')}>
                                {discrepancy !== 0 && '⚠ '}{discrepancy.toLocaleString()} {rec.currency}
                              </td>
                              <td className="py-3 px-4 text-emerald-400 font-bold">{rec.matched_count} tx</td>
                              <td className="py-3 px-4 text-amber-400">{rec.discrepancy_count}</td>
                              <td className="py-3 px-4"><ReconciliationBadge status={rec.status} /></td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={reconciliationsPage}
                  total={reconciliationsTotal}
                  pageSize={SERVER_PAGE_SIZE}
                  onPageChange={p => setReconciliationsPage(p)}
                />
              </div>
            </div>
          )}
          {/* ── 9. WEBHOOKS ── */}
          {activeSection === 'webhooks' && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-white">Moniteur d'Événements Webhook</h2>
                    <p className="text-xs text-slate-400">
                      Audit des événements entrants depuis Wave, Orange Money, Flutterwave et Visa
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <FilterTabs
                      options={['ALL', 'RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED']}
                      value={webhooksFilter}
                      onChange={v => { setWebhooksFilter(v); setWebhooksPage(1); }}
                    />
                    <ExportButton
                      onClick={() =>
                        exportToCSV('webhooks.csv', webhooks.map(w => ({
                          id: w.id, event_id: w.event_id, provider: w.provider,
                          event_type: w.event_type, status: w.status,
                          processed_at: w.processed_at ?? '', error_message: w.error_message ?? '',
                          created_at: w.created_at,
                        })))
                      }
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Provider</th>
                        <th className="py-3 px-4">Type d'événement</th>
                        <th className="py-3 px-4">Event ID</th>
                        <th className="py-3 px-4">Statut</th>
                        <th className="py-3 px-4">Traité à</th>
                        <th className="py-3 px-4">Erreur</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {sectionLoading ? (
                        <SkeletonRows cols={7} />
                      ) : webhooks.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-500 text-sm">
                            Aucun événement webhook enregistré.
                          </td>
                        </tr>
                      ) : (
                        webhooks.map(w => (
                          <tr key={w.id} className="hover:bg-slate-800/30 transition">
                            <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                              {new Date(w.created_at).toLocaleString('fr-FR')}
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold">
                                {w.provider}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-200 text-[11px]">{w.event_type}</td>
                            <td className="py-3 px-4 font-mono text-slate-400 text-[11px] truncate max-w-[160px]">{w.event_id}</td>
                            <td className="py-3 px-4"><WebhookBadge status={w.status} /></td>
                            <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                              {w.processed_at ? new Date(w.processed_at).toLocaleString('fr-FR') : '—'}
                            </td>
                            <td className="py-3 px-4 text-rose-400 text-[11px] max-w-[200px] truncate">
                              {w.error_message ?? '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  page={webhooksPage}
                  total={webhooksTotal}
                  pageSize={SERVER_PAGE_SIZE}
                  onPageChange={p => setWebhooksPage(p)}
                />
              </div>
            </div>
          )}

          {/* ── 10. SYSTEM ACCOUNTS ── */}
          {activeSection === 'system-accounts' && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-white">Bilan des Comptes Système</h2>
                    <p className="text-xs text-slate-400">
                      Comptes internes de clearing, partenaire et capitaux propres. Invariant : Σ Débits = Σ Crédits.
                    </p>
                  </div>
                  <ExportButton
                    onClick={() =>
                      exportToCSV('comptes_systeme.csv', systemAccounts.map(a => ({
                        account_number: a.account_number,
                        type: a.type,
                        currency: a.currency,
                        balance: a.balance,
                        created_at: a.created_at,
                      })))
                    }
                  />
                </div>

                {systemAccounts.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-sm">
                    Aucun compte système configuré.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {systemAccounts.map(acc => {
                      const balance = acc.balance;
                      const isNearZero = Math.abs(balance) < 0.01;
                      return (
                        <div key={acc.id} className={cn(
                          'flex items-center justify-between p-4 rounded-xl border text-xs transition',
                          isNearZero
                            ? 'bg-emerald-500/5 border-emerald-500/20'
                            : balance < 0
                            ? 'bg-rose-500/5 border-rose-500/20'
                            : 'bg-slate-950 border-slate-800'
                        )}>
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center">
                              <Building2 className="w-5 h-5 text-slate-400" />
                            </div>
                            <div>
                              <div className="font-bold font-mono text-white text-sm">{acc.account_number}</div>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                {acc.type} · Créé le {new Date(acc.created_at).toLocaleDateString('fr-FR')}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={cn(
                              'text-lg font-bold font-mono',
                              isNearZero ? 'text-emerald-400' : balance < 0 ? 'text-rose-400' : 'text-white'
                            )}>
                              {balance.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              <span className="text-xs ml-1 text-slate-400">{acc.currency}</span>
                            </div>
                            {isNearZero && (
                              <div className="text-[10px] text-emerald-500 mt-0.5">✓ Pivot net à zéro</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Balance sheet summary */}
                {systemAccounts.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-3 gap-3 text-xs">
                    {(['XOF', 'USD'] as const).map(ccy => {
                      const ccyAccounts = systemAccounts.filter(a => a.currency === ccy);
                      const totalBalance = ccyAccounts.reduce((sum, a) => sum + a.balance, 0);
                      return (
                        <div key={ccy} className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                          <div className="text-slate-500 mb-1">Total système {ccy}</div>
                          <div className={cn('font-bold font-mono text-sm',
                            Math.abs(totalBalance) < 0.01 ? 'text-emerald-400' : 'text-amber-400'
                          )}>
                            {totalBalance.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} {ccy}
                          </div>
                        </div>
                      );
                    })}
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <div className="text-slate-500 mb-1">Comptes actifs</div>
                      <div className="font-bold text-white text-sm">{systemAccounts.length}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </main>

      {/* ── Modal: KYC Review ── */}
      {selectedKYCUser && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Décision KYC — {selectedKYCUser.full_name}</h3>
              <button onClick={() => setSelectedKYCUser(null)} className="text-slate-500 hover:text-slate-300 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p>
                Validez ou refusez l'accès de ce client aux cartes virtuelles Visa USD selon la conformité des justificatifs téléversés.
              </p>
              <div>
                <label className="block text-slate-400 mb-1">Motif de refus (si rejeté) :</label>
                <input
                  type="text"
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white focus:outline-none focus:border-blue-500 transition"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                disabled={reviewLoading}
                onClick={() => void handleKYCReview('REJECTED')}
                className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 font-semibold rounded-xl text-xs transition border border-rose-500/30 disabled:opacity-50"
              >
                Refuser le dossier
              </button>
              <button
                disabled={reviewLoading}
                onClick={() => void handleKYCReview('APPROVED')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs transition disabled:opacity-50"
              >
                {reviewLoading ? 'Traitement…' : 'Approuver Tier 1 (Activer Visa)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Dispute Arbitrage ── */}
      {selectedDispute && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Arbitrage — {selectedDispute.dispute_id.slice(0, 16)}…</h3>
              <button onClick={() => setSelectedDispute(null)} className="text-slate-500 hover:text-slate-300 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-slate-500 mb-1">Montant contesté</div>
                  <div className="font-bold text-white font-mono">${selectedDispute.amount} {selectedDispute.currency}</div>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-slate-500 mb-1">Client</div>
                  <div className="font-bold text-white">{selectedDispute.user_email}</div>
                </div>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="text-slate-500 mb-1">Référence transaction</div>
                <div className="font-mono text-blue-400">{selectedDispute.transaction_reference}</div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Notes de résolution / Motif d'arbitrage :</label>
                <textarea
                  rows={3}
                  value={resolutionNotes}
                  onChange={e => setResolutionNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-xs focus:outline-none focus:border-blue-500 transition"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Si vous décidez "WON" (Favorable au client), un crédit de compensation automatique sera immédiatement généré et inscrit au Grand Livre.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                disabled={disputeLoading}
                onClick={() => void handleResolveDispute('LOST')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition disabled:opacity-50"
              >
                Clore en défaveur (LOST)
              </button>
              <button
                disabled={disputeLoading}
                onClick={() => void handleResolveDispute('WON')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs transition disabled:opacity-50"
              >
                {disputeLoading ? 'Traitement…' : 'Accorder le Chargeback (WON)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: User Detail ── */}
      {(userDetailLoading || selectedUserDetail) && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 p-6 shrink-0">
              <h3 className="text-base font-bold text-white">
                {userDetailLoading ? 'Chargement du profil…' : `Profil — ${selectedUserDetail?.full_name}`}
              </h3>
              <button
                onClick={() => { setSelectedUserDetail(null); setUserDetailLoading(false); }}
                className="text-slate-500 hover:text-slate-300 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {userDetailLoading ? (
              <div className="flex-1 flex items-center justify-center py-16">
                <RefreshCw className="w-8 h-8 text-slate-500 animate-spin" />
              </div>
            ) : selectedUserDetail && (
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* User info */}
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div className="text-slate-500 mb-1">Email</div>
                    <div className="text-white font-semibold">{selectedUserDetail.email}</div>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div className="text-slate-500 mb-1">KYC</div>
                    <KycBadge status={selectedUserDetail.kyc_status} />
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div className="text-slate-500 mb-1">Inscrit le</div>
                    <div className="text-white">{new Date(selectedUserDetail.created_at).toLocaleDateString('fr-FR')}</div>
                  </div>
                </div>

                {/* Accounts / Wallets */}
                <div>
                  <h4 className="text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">Portefeuilles</h4>
                  <div className="space-y-2">
                    {selectedUserDetail.accounts.map(acc => (
                      <div key={acc.id} className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
                        <div>
                          <span className="font-mono text-slate-300">{acc.account_number}</span>
                          <span className="ml-2 text-[10px] text-slate-500">{acc.type}</span>
                        </div>
                        <div className="font-bold font-mono text-emerald-400">
                          {acc.balance.toLocaleString()} {acc.currency}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cards */}
                {selectedUserDetail.cards.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">Cartes ({selectedUserDetail.cards.length})</h4>
                    <div className="space-y-2">
                      {selectedUserDetail.cards.map(c => (
                        <div key={c.card_id} className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
                          <div>
                            <span className="font-mono text-slate-200 font-semibold">{c.masked_pan}</span>
                            <span className="ml-2 text-slate-500">{c.label}</span>
                            <span className="ml-2 text-slate-500">exp. {c.expiry}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-emerald-400 font-bold">${c.balance.toFixed(2)}</span>
                            <CardStatusBadge status={c.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent transactions */}
                {selectedUserDetail.recent_transactions.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">Transactions récentes</h4>
                    <div className="space-y-1.5">
                      {selectedUserDetail.recent_transactions.map(t => (
                        <div key={t.transaction_id} className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs">
                          <div>
                            <span className="text-white font-semibold">{t.merchant_name}</span>
                            <span className="ml-2 text-slate-500">{new Date(t.created_at).toLocaleDateString('fr-FR')}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-white">${t.amount.toFixed(2)} {t.currency}</span>
                            <TxStatusBadge status={t.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent disputes */}
                {selectedUserDetail.recent_disputes.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">Litiges récents</h4>
                    <div className="space-y-1.5">
                      {selectedUserDetail.recent_disputes.map(d => (
                        <div key={d.dispute_id} className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs">
                          <div>
                            <span className="text-slate-300 font-mono">{d.dispute_id.slice(0, 12)}…</span>
                            <span className="ml-2 text-slate-500">{d.reason}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-white">${d.amount.toFixed(2)} {d.currency}</span>
                            <DisputeBadge status={d.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Admin actions */}
                <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Statut du compte :</span>
                    <span className={cn('text-xs font-bold', selectedUserDetail.is_verified ? 'text-emerald-400' : 'text-rose-400')}>
                      {selectedUserDetail.is_verified ? 'ACTIF' : 'SUSPENDU'}
                    </span>
                  </div>
                  {selectedUserDetail.is_verified ? (
                    <button
                      onClick={() => openConfirm(
                        'Suspendre le compte ?',
                        `Le compte de ${selectedUserDetail.full_name} sera suspendu. L'utilisateur ne pourra plus se connecter.`,
                        () => void handleSuspendUser(selectedUserDetail.user_id),
                        'danger'
                      )}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 font-semibold rounded-xl text-xs transition"
                    >
                      <Ban className="w-3.5 h-3.5" /> Suspendre
                    </button>
                  ) : (
                    <button
                      onClick={() => openConfirm(
                        'Réactiver le compte ?',
                        `Le compte de ${selectedUserDetail.full_name} sera réactivé. L'utilisateur pourra se reconnecter.`,
                        () => void handleActivateUser(selectedUserDetail.user_id),
                        'warning'
                      )}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 font-semibold rounded-xl text-xs transition"
                    >
                      <UserCheck className="w-3.5 h-3.5" /> Réactiver
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Ledger Entry Detail ── */}
      {selectedLedgerEntry && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white font-mono">
                Écriture — {selectedLedgerEntry.reference}
              </h3>
              <button onClick={() => setSelectedLedgerEntry(null)} className="text-slate-500 hover:text-slate-300 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-slate-500 mb-1">Description</div>
                  <div className="text-white">{selectedLedgerEntry.narration}</div>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-slate-500 mb-1">Clé d'idempotence</div>
                  <div className="font-mono text-blue-400 text-[11px] break-all">{selectedLedgerEntry.idempotency_key}</div>
                </div>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="text-slate-500 mb-2 font-semibold">Postings — Partie Double</div>
                <div className="space-y-2">
                  {selectedLedgerEntry.postings.map(p => (
                    <div key={p.id} className="flex items-center justify-between text-[11px] font-mono">
                      <div className="flex items-center gap-2">
                        <span className={cn('w-1.5 h-1.5 rounded-full', p.direction === 'CREDIT' ? 'bg-emerald-400' : 'bg-rose-400')} />
                        <span className="text-slate-200">{p.account_number}</span>
                        <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded font-sans">{p.account_type}</span>
                        <span className="text-[10px] text-slate-500">{p.currency}</span>
                      </div>
                      <span className={cn('font-bold', p.direction === 'CREDIT' ? 'text-emerald-400' : 'text-rose-400')}>
                        {p.direction === 'CREDIT' ? '+ ' : '– '}
                        {Number(p.amount).toLocaleString()} {p.currency}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span>Statut : <span className="text-white font-semibold">{selectedLedgerEntry.status}</span></span>
                <span>{new Date(selectedLedgerEntry.created_at).toLocaleString('fr-FR')}</span>
                {selectedLedgerEntry.is_balanced ? (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> BALANCED
                  </span>
                ) : (
                  <span className="text-rose-400 font-semibold flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" /> UNBALANCED
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmation Dialog ── */}
      {confirmDialog.open && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[70] backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                confirmDialog.variant === 'danger' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'
              )}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">{confirmDialog.title}</h3>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{confirmDialog.message}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition"
              >
                Annuler
              </button>
              <button
                onClick={() => confirmDialog.onConfirm?.()}
                className={cn(
                  'px-4 py-2 font-semibold rounded-xl text-xs transition text-white',
                  confirmDialog.variant === 'danger' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-amber-600 hover:bg-amber-500'
                )}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast Notifications ── */}
      <div className="fixed bottom-5 right-5 z-[60] space-y-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium shadow-xl transition-opacity duration-300',
              toast.type === 'success' && 'bg-emerald-900/90 border-emerald-600/50 text-emerald-100',
              toast.type === 'error' && 'bg-rose-900/90 border-rose-600/50 text-rose-100',
              toast.type === 'info' && 'bg-blue-900/90 border-blue-600/50 text-blue-100'
            )}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {toast.type === 'error' && <XCircle className="w-4 h-4 shrink-0" />}
            {toast.type === 'info' && <Activity className="w-4 h-4 shrink-0" />}
            <span>{toast.message}</span>
            <button
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="ml-1 opacity-60 hover:opacity-100 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
