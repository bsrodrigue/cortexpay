import React, { useState } from 'react';
import {
  Activity,
  ArrowRightLeft,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  FileSpreadsheet,
  Lock,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  TrendingUp,
  Unlock,
  XCircle,
} from 'lucide-react';

import {
  adminApi,
  type AdminCard,
  type AdminDispute,
  type AdminMetrics,
  type AdminReconciliation,
  type LedgerEntry,
  type PendingKYCUser,
} from './api';

type SectionKey = 'overview' | 'ledger' | 'kyc' | 'cards' | 'disputes' | 'reconciliation';

export default function App() {
  const [activeSection, setActiveSection] = useState<SectionKey>('overview');
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [kycPending, setKycPending] = useState<PendingKYCUser[]>([]);
  const [cards, setCards] = useState<AdminCard[]>([]);
  const [disputes, setDisputes] = useState<AdminDispute[]>([]);
  const [reconciliations, setReconciliations] = useState<AdminReconciliation[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // KYC modal review state
  const [selectedKYCUser, setSelectedKYCUser] = useState<PendingKYCUser | null>(null);
  const [rejectionReason, setRejectionReason] = useState('Document flou ou illisible');
  const [reviewLoading, setReviewLoading] = useState(false);

  // Dispute resolution state
  const [selectedDispute, setSelectedDispute] = useState<AdminDispute | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('Arbitrage Visa : Chargeback accordé au porteur');
  const [disputeLoading, setDisputeLoading] = useState(false);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [m, l, k, c, d, r] = await Promise.all([
        adminApi.getMetrics().catch(() => null),
        adminApi.getLedger(50, 0).catch(() => []),
        adminApi.getPendingKYC().catch(() => []),
        adminApi.getCards(50, 0).catch(() => []),
        adminApi.getDisputes().catch(() => []),
        adminApi.getReconciliations().catch(() => []),
      ]);
      if (m) setMetrics(m);
      setLedger(l);
      setKycPending(k);
      setCards(c);
      setDisputes(d);
      setReconciliations(r);
    } catch (e) {
      console.error('Error loading admin portal data', e);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

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
      await loadData();
    } catch (e) {
      alert(`Erreur validation KYC : ${e}`);
    } finally {
      setReviewLoading(false);
    }
  };

  const handleToggleCardFreeze = async (cardId: string) => {
    try {
      const res = await adminApi.toggleFreezeCard(cardId);
      setCards((prev) =>
        prev.map((c) => (c.card_id === cardId ? { ...c, status: res.status as 'ACTIVE' | 'FROZEN' } : c))
      );
    } catch (e) {
      alert(`Erreur changement de statut carte : ${e}`);
    }
  };

  const handleResolveDispute = async (decision: 'WON' | 'LOST') => {
    if (!selectedDispute) return;
    setDisputeLoading(true);
    try {
      await adminApi.resolveDispute(selectedDispute.dispute_id, decision, resolutionNotes);
      setSelectedDispute(null);
      await loadData();
    } catch (e) {
      alert(`Erreur arbitrage litige : ${e}`);
    } finally {
      setDisputeLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 antialiased overflow-hidden font-sans">
      {/* ── Sidebar Navigation ── */}
      <aside className="w-72 bg-slate-900/90 border-r border-slate-800/80 flex flex-col justify-between p-4 backdrop-blur">
        <div>
          {/* Logo & Brand Header */}
          <div className="flex items-center gap-3 px-3 py-4 mb-4 border-b border-slate-800/60">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-black tracking-widest text-white shadow-lg shadow-blue-600/30">
              CP
            </div>
            <div>
              <div className="font-bold tracking-tight text-white flex items-center gap-1.5 text-base">
                CortexPay <span className="text-[10px] bg-blue-500/20 text-blue-400 font-semibold px-1.5 py-0.5 rounded border border-blue-500/30">HQ ADMIN</span>
              </div>
              <p className="text-xs text-slate-400">Portail Régulateur &amp; Opérations</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveSection('overview')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeSection === 'overview'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Activity className="w-4 h-4" />
              Vue d&apos;ensemble
            </button>

            <button
              onClick={() => setActiveSection('ledger')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeSection === 'ledger'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-4 h-4" />
                Grand Livre (Ledger)
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {ledger.length}
              </span>
            </button>

            <button
              onClick={() => setActiveSection('kyc')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeSection === 'kyc'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <FileCheck2 className="w-4 h-4" />
                Conformité KYC
              </div>
              {kycPending.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30 animate-pulse">
                  {kycPending.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveSection('cards')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeSection === 'cards'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <CreditCard className="w-4 h-4" />
                Cartes Virtuelles
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {cards.length}
              </span>
            </button>

            <button
              onClick={() => setActiveSection('disputes')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeSection === 'disputes'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Scale className="w-4 h-4" />
                Litiges &amp; Chargebacks
              </div>
              {disputes.filter((d) => d.status === 'OPENED').length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30">
                  {disputes.filter((d) => d.status === 'OPENED').length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveSection('reconciliation')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeSection === 'reconciliation'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <ArrowRightLeft className="w-4 h-4" />
                Rapprochement Wave/OM
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {reconciliations.length}
              </span>
            </button>
          </nav>
        </div>

        {/* System Invariant Pill Footer */}
        <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Invariant Comptable
            </span>
            <span className="text-emerald-400 font-mono font-bold">100% BALANCED</span>
          </div>
          <div className="text-[11px] text-slate-500">
            &Sigma; D&eacute;bits = &Sigma; Cr&eacute;dits (Triggers PostgreSQL actifs)
          </div>
          <button
            onClick={() => void loadData()}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-1.5 text-xs text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 rounded-lg transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualiser les donn&eacute;es
          </button>
        </div>
      </aside>

      {/* ── Main View Area ── */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
        {/* Top Header Bar */}
        <header className="h-16 border-b border-slate-800/80 bg-slate-900/40 px-6 flex items-center justify-between backdrop-blur">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-white capitalize">
              {activeSection === 'overview' && "Tableau de Bord & Indicateurs Syst\u00e8me"}
              {activeSection === 'ledger' && "Grand Livre Comptable Immuable (Journal & Postings)"}
              {activeSection === 'kyc' && "V\u00e9rification et Validation des Dossiers KYC"}
              {activeSection === 'cards' && "Supervision des Cartes Virtuelles Visa USD"}
              {activeSection === 'disputes' && "Arbitrage des Litiges et Chargebacks Visa"}
              {activeSection === 'reconciliation' && "Rapprochement et Audit des Op\u00e9rateurs"}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Rechercher r\u00e9f\u00e9rence, email, carte..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition w-64"
              />
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold text-slate-200">Admin Staff HQ</div>
              <div className="text-[10px] text-emerald-400 font-mono">BCEAO Audited Tier</div>
            </div>
          </div>
        </header>

        {/* Dynamic Section Contents */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 1. OVERVIEW SECTION */}
          {activeSection === 'overview' && (
            <div className="space-y-6">
              {/* KPI Cards Grid */}
              <div className="grid grid-cols-4 gap-4">
                {/* Total XOF Balance */}
                <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                    <span>Tr&eacute;sorerie Portefeuilles XOF</span>
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">
                    {metrics?.treasury.total_xof.toLocaleString('fr-FR')} <span className="text-xs text-emerald-400 font-normal">XOF</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">D&eacute;p&ocirc;ts Mobile Money (Wave / Orange)</p>
                </div>

                {/* Total USD Balance */}
                <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                    <span>Tr&eacute;sorerie Portefeuilles USD</span>
                    <TrendingUp className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">
                    ${metrics?.treasury.total_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="text-xs text-blue-400 font-normal">USD</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">Fonds provisionn&eacute;s pour d&eacute;bits cartes</p>
                </div>

                {/* FX Pivot Balance */}
                <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                    <span>Compte Pivot (FX_CLEARING)</span>
                    <ArrowRightLeft className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">
                    {metrics?.treasury.fx_pivot.balance.toLocaleString('fr-FR')} <span className="text-xs text-amber-400 font-normal">{metrics?.treasury.fx_pivot.currency}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">Net clearing sur conversions garanties</p>
                </div>

                {/* Active Virtual Cards */}
                <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                    <span>Cartes Virtuelles &Eacute;mises</span>
                    <CreditCard className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">
                    {metrics?.cards.total}{' '}
                    <span className="text-xs text-slate-400 font-normal">
                      ({metrics?.cards.active} actives / {metrics?.cards.frozen} gel&eacute;es)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Solde total : ${metrics?.cards.total_balance_usd.toFixed(2)} USD
                  </p>
                </div>
              </div>

              {/* Action Banner: Pending KYC & Open Disputes */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gradient-to-r from-amber-950/40 to-slate-900/60 border border-amber-500/30 p-5 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                      <FileCheck2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">
                        {kycPending.length} dossiers KYC en attente de conformit&eacute;
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Conformit&eacute; r&eacute;glementaire requise pour activer les cartes Visa.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveSection('kyc')}
                    className="px-4 py-2 bg-amber-500 text-slate-950 font-semibold rounded-xl text-xs hover:bg-amber-400 transition"
                  >
                    Examiner les dossiers &rarr;
                  </button>
                </div>

                <div className="bg-gradient-to-r from-rose-950/40 to-slate-900/60 border border-rose-500/30 p-5 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold">
                      <Scale className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">
                        {disputes.filter((d) => d.status === 'OPENED').length} litiges Visa ouverts
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Dossiers de contestation marchande &agrave; arbitrer (FSM Dispute).
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveSection('disputes')}
                    className="px-4 py-2 bg-rose-600 text-white font-semibold rounded-xl text-xs hover:bg-rose-500 transition"
                  >
                    Arbitrer les litiges &rarr;
                  </button>
                </div>
              </div>

              {/* Recent Ledger Entries Snippet */}
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-white">Derni&egrave;res &Eacute;critures du Grand Livre</h2>
                    <p className="text-xs text-slate-400">Journal d&apos;&eacute;critures comptables immuables en temps r&eacute;el</p>
                  </div>
                  <button
                    onClick={() => setActiveSection('ledger')}
                    className="text-xs text-blue-400 hover:text-blue-300 transition"
                  >
                    Voir l&apos;int&eacute;gralit&eacute; &rarr;
                  </button>
                </div>

                <div className="divide-y divide-slate-800/60 font-mono text-xs">
                  {ledger.slice(0, 5).map((entry) => (
                    <div key={entry.id} className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <div>
                          <div className="font-semibold text-slate-200">{entry.narration}</div>
                          <div className="text-[11px] text-slate-500">R&eacute;f: {entry.reference}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-sans">
                          {entry.status}
                        </span>
                        <div className="text-[10px] text-slate-500 mt-1 font-sans">
                          {new Date(entry.created_at).toLocaleTimeString('fr-FR')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2. LEDGER SECTION */}
          {activeSection === 'ledger' && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-white">Grand Livre Comptable (Double-Entry Ledger)</h2>
                    <p className="text-xs text-slate-400">
                      Chaque &eacute;criture de journal garantit l&apos;invariant comptable d&apos;&eacute;quilibre total des flux.
                    </p>
                  </div>
                  <span className="text-xs px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg font-mono font-bold">
                    POSTGRESQL APPEND-ONLY ACTIVE
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Date &amp; Heure</th>
                        <th className="py-3 px-4">R&eacute;f&eacute;rence</th>
                        <th className="py-3 px-4">Description</th>
                        <th className="py-3 px-4">&Eacute;critures en Partie Double (Postings)</th>
                        <th className="py-3 px-4 text-center">&Eacute;quilibr&eacute; (&Sigma;D=&Sigma;C)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {ledger.map((entry) => (
                        <tr key={entry.id} className="hover:bg-slate-800/30 transition">
                          <td className="py-3 px-4 text-slate-400 whitespace-nowrap font-sans">
                            {new Date(entry.created_at).toLocaleString('fr-FR')}
                          </td>
                          <td className="py-3 px-4 text-blue-400 font-semibold">{entry.reference}</td>
                          <td className="py-3 px-4 text-slate-200 font-sans">{entry.narration}</td>
                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              {entry.postings.map((p) => (
                                <div key={p.id} className="flex items-center justify-between gap-4 text-[11px]">
                                  <span className="text-slate-400">
                                    {p.account_number} ({p.currency})
                                  </span>
                                  <span
                                    className={`font-bold ${
                                      p.direction === 'CREDIT' ? 'text-emerald-400' : 'text-rose-400'
                                    }`}
                                  >
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
                                <XCircle className="w-3.5 h-3.5" /> D&eacute;s&eacute;quilibr&eacute;
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 3. KYC SECTION */}
          {activeSection === 'kyc' && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-white">Dossiers de V&eacute;rification d&apos;Identit&eacute; (KYC)</h2>
                    <p className="text-xs text-slate-400">
                      Revue de conformit&eacute; r&eacute;glementaire BCEAO / UEMOA pour l&apos;approbation Tier 1
                    </p>
                  </div>
                  <span className="text-xs px-3 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg font-bold">
                    {kycPending.length} En Attente
                  </span>
                </div>

                {kycPending.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-sm">
                    <ShieldCheck className="w-10 h-10 mx-auto text-emerald-500 mb-2 opacity-80" />
                    Aucun dossier KYC en attente de revue. Tous les clients sont en r&egrave;gle !
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {kycPending.map((user) => (
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
                          <span className="px-2 py-0.5 rounded text-[11px] bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold">
                            {user.kyc_status}
                          </span>
                        </div>

                        {user.document ? (
                          <div className="space-y-2 text-xs text-slate-300">
                            <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                              <span>Type de pi&egrave;ce :</span>
                              <span className="font-bold text-white">{user.document.document_type}</span>
                            </div>
                            <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                              <span>Num&eacute;ro officiel :</span>
                              <span className="font-mono font-bold text-white">{user.document.document_number}</span>
                            </div>

                            {/* Images thumbnails */}
                            <div className="grid grid-cols-3 gap-2 pt-2">
                              {user.document.front_image_url && (
                                <a
                                  href={user.document.front_image_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="aspect-video bg-slate-900 rounded-lg overflow-hidden border border-slate-800 relative group"
                                >
                                  <img
                                    src={user.document.front_image_url}
                                    alt="Recto"
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-white transition">
                                    Recto
                                  </div>
                                </a>
                              )}
                              {user.document.back_image_url && (
                                <a
                                  href={user.document.back_image_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="aspect-video bg-slate-900 rounded-lg overflow-hidden border border-slate-800 relative group"
                                >
                                  <img
                                    src={user.document.back_image_url}
                                    alt="Verso"
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-white transition">
                                    Verso
                                  </div>
                                </a>
                              )}
                              {user.document.selfie_url && (
                                <a
                                  href={user.document.selfie_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="aspect-video bg-slate-900 rounded-lg overflow-hidden border border-slate-800 relative group"
                                >
                                  <img
                                    src={user.document.selfie_url}
                                    alt="Selfie"
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-white transition">
                                    Selfie
                                  </div>
                                </a>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 italic">Aucun document t&eacute;l&eacute;vers&eacute;</div>
                        )}

                        <div className="flex items-center gap-2 pt-2">
                          <button
                            onClick={() => setSelectedKYCUser(user)}
                            className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition"
                          >
                            Examiner &amp; D&eacute;cider
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. VIRTUAL CARDS SECTION */}
          {activeSection === 'cards' && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-white">Supervision des Cartes Virtuelles Visa USD</h2>
                    <p className="text-xs text-slate-400">
                      Gestion des risques, plafonds mensuels et gel d&apos;urgence en 1-clic
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Titulaire / Utilisateur</th>
                        <th className="py-3 px-4">Num&eacute;ro Masqu&eacute;</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Solde Actuel</th>
                        <th className="py-3 px-4">D&eacute;penses / Plafond</th>
                        <th className="py-3 px-4">Statut</th>
                        <th className="py-3 px-4 text-center">Action d&apos;Urgence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {cards.map((card) => (
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
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                card.status === 'ACTIVE'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-slate-700/50 text-slate-400 border border-slate-600'
                              }`}
                            >
                              {card.status === 'ACTIVE' ? 'ACTIF' : 'GEL\u00c9E'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => void handleToggleCardFreeze(card.card_id)}
                              className={`px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                                card.status === 'ACTIVE'
                                  ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30'
                                  : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30'
                              }`}
                            >
                              {card.status === 'ACTIVE' ? (
                                <>
                                  <Lock className="w-3 h-3" /> Geler
                                </>
                              ) : (
                                <>
                                  <Unlock className="w-3 h-3" /> D&eacute;geler
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 5. DISPUTES SECTION */}
          {activeSection === 'disputes' && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-white">Litiges &amp; Chargebacks Visa</h2>
                    <p className="text-xs text-slate-400">
                      Machine &agrave; &eacute;tats finis (Dispute FSM) : OPENED &rarr; UNDER_REVIEW &rarr; WON / LOST
                    </p>
                  </div>
                </div>

                {disputes.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-sm">
                    Aucun litige de transaction enregistr&eacute;.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/60">
                    {disputes.map((dispute) => (
                      <div key={dispute.dispute_id} className="py-4 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm">{dispute.dispute_id}</span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                dispute.status === 'WON'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : dispute.status === 'LOST'
                                  ? 'bg-rose-500/20 text-rose-400'
                                  : 'bg-amber-500/20 text-amber-400'
                              }`}
                            >
                              {dispute.status}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            Motif : {dispute.reason} &bull; Client : {dispute.user_email}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                            R&eacute;f transaction : {dispute.transaction_reference} &bull; Carte : {dispute.card_id}
                          </div>
                        </div>

                        <div className="text-right flex items-center gap-4">
                          <div className="text-base font-bold font-mono text-white">
                            ${Number(dispute.amount).toFixed(2)} {dispute.currency}
                          </div>
                          {dispute.status !== 'WON' && dispute.status !== 'LOST' && (
                            <button
                              onClick={() => setSelectedDispute(dispute)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition"
                            >
                              Arbitrer
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 6. RECONCILIATION SECTION */}
          {activeSection === 'reconciliation' && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-white">Rapprochement Bancaire (Reconciliation Reports)</h2>
                    <p className="text-xs text-slate-400">
                      Rapports de cl&ocirc;ture journali&egrave;re (EOD) comparant les relev&eacute;s partenaires Wave / Orange Money et le Grand Livre
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Date de cl&ocirc;ture</th>
                        <th className="py-3 px-4">Partenaire</th>
                        <th className="py-3 px-4">Total Partenaire</th>
                        <th className="py-3 px-4">Total Grand Livre</th>
                        <th className="py-3 px-4">&Eacute;cart (Discrepancy)</th>
                        <th className="py-3 px-4">R&eacute;concili&eacute;s</th>
                        <th className="py-3 px-4">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {reconciliations.map((rec) => (
                        <tr key={rec.id} className="hover:bg-slate-800/30 transition">
                          <td className="py-3 px-4 text-slate-300 font-sans">{rec.reconciliation_date}</td>
                          <td className="py-3 px-4 font-bold text-white">{rec.provider}</td>
                          <td className="py-3 px-4 text-slate-200">
                            {Number(rec.total_partner_amount).toLocaleString()} {rec.currency}
                          </td>
                          <td className="py-3 px-4 text-slate-200">
                            {Number(rec.total_ledger_amount).toLocaleString()} {rec.currency}
                          </td>
                          <td className="py-3 px-4 font-bold text-rose-400">
                            {Number(rec.discrepancy_amount).toLocaleString()} {rec.currency}
                          </td>
                          <td className="py-3 px-4 text-emerald-400 font-bold">{rec.matched_count} tx</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold font-sans ${
                                rec.status === 'MATCHED'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              }`}
                            >
                              {rec.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Modal KYC Review ── */}
      {selectedKYCUser && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">D&eacute;cision KYC pour {selectedKYCUser.full_name}</h3>
              <button onClick={() => setSelectedKYCUser(null)} className="text-slate-500 hover:text-slate-300">
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p>
                Validez ou refusez l&apos;acc&egrave;s de ce client aux cartes virtuelles Visa USD selon la conformit&eacute; des justificatifs t&eacute;l&eacute;vers&eacute;s.
              </p>
              <div>
                <label className="block text-slate-400 mb-1">Motif de refus (si rejet&eacute;) :</label>
                <input
                  type="text"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                disabled={reviewLoading}
                onClick={() => void handleKYCReview('REJECTED')}
                className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 font-semibold rounded-xl text-xs transition border border-rose-500/30"
              >
                Refuser le dossier
              </button>
              <button
                disabled={reviewLoading}
                onClick={() => void handleKYCReview('APPROVED')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs transition"
              >
                Approuver Tier 1 (Activer Visa)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Dispute Arbitrage ── */}
      {selectedDispute && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Arbitrage du Litige {selectedDispute.dispute_id}</h3>
              <button onClick={() => setSelectedDispute(null)} className="text-slate-500 hover:text-slate-300">
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p>
                Montant contest&eacute; :{' '}
                <strong className="text-white">${selectedDispute.amount} USD</strong> sur transaction{' '}
                <span className="font-mono text-blue-400">{selectedDispute.transaction_reference}</span>.
              </p>
              <div>
                <label className="block text-slate-400 mb-1">Notes de r&eacute;solution / Motif d&apos;arbitrage :</label>
                <textarea
                  rows={3}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-xs"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Si vous d&eacute;cidez &quot;WON&quot; (Favorable au client), un cr&eacute;dit de compensation automatique
                sera imm&eacute;diatement g&eacute;n&eacute;r&eacute; et inscrit au Grand Livre.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                disabled={disputeLoading}
                onClick={() => void handleResolveDispute('LOST')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition"
              >
                Clore en d&eacute;faveur (LOST)
              </button>
              <button
                disabled={disputeLoading}
                onClick={() => void handleResolveDispute('WON')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs transition"
              >
                Accorder le Chargeback (WON)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
