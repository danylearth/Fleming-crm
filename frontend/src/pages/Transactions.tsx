import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Button, Card, GlassCard, EmptyState } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { PoundSterling, TrendingUp, TrendingDown, Home, Landmark, RefreshCw, Clock3 } from 'lucide-react';

interface RentPayment {
  id: number;
  tenant_name?: string;
  property_address?: string;
  amount: number;
  amount_paid?: number;
  date: string;
  due_date?: string;
  payment_date?: string;
  status?: string;
}

interface BankFeedStatus {
  configured: boolean;
  connection?: { status: string; provider_name?: string; last_synced_at?: string; last_error?: string } | null;
  totals?: { total: number; rent_matches: number; deposit_matches: number; expense_matches: number; unmatched: number };
}

interface BankFeedTransaction {
  id: number;
  booked_at: string;
  description?: string;
  merchant_name?: string;
  amount: number;
  currency: string;
  match_status: 'unmatched' | 'matched_rent' | 'matched_deposit' | 'matched_expense' | 'ignored';
  property_address?: string;
  tenant_name?: string;
}

interface Property {
  id: number;
  address: string;
  monthly_rent?: number;
  rent?: number;
  status?: string;
}

interface Tenancy {
  id: number;
  property_id: number;
  property_address?: string;
  monthly_rent?: number;
  rent_amount?: number;
  status?: string;
}

export default function Transactions() {
  const api = useApi();
  const [payments, setPayments] = useState<RentPayment[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenancies, setTenancies] = useState<Tenancy[]>([]);
  const [bankStatus, setBankStatus] = useState<BankFeedStatus | null>(null);
  const [bankTransactions, setBankTransactions] = useState<BankFeedTransaction[]>([]);
  const [bankBusy, setBankBusy] = useState(false);
  const [bankMessage, setBankMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [pay, prop, ten, feedStatus, feedTransactions] = await Promise.all([
          api.get('/api/rent-payments').catch(() => []),
          api.get('/api/properties').catch(() => []),
          api.get('/api/tenancies').catch(() => []),
          api.get('/api/bank-feed/status').catch(() => null),
          api.get('/api/bank-feed/transactions?limit=25').catch(() => []),
        ]);
        setPayments(Array.isArray(pay) ? pay : pay?.payments || []);
        setProperties(Array.isArray(prop) ? prop : prop?.properties || []);
        setTenancies(Array.isArray(ten) ? ten : ten?.tenancies || []);
        setBankStatus(feedStatus);
        setBankTransactions(Array.isArray(feedTransactions) ? feedTransactions : []);
      } catch {
        // Errors already handled by individual .catch() calls above
      }
      setLoading(false);
    };
    load();
  }, [api]);

  const refreshBankData = async () => {
    const [status, transactions] = await Promise.all([
      api.get(`/api/bank-feed/status?at=${Date.now()}`),
      api.get(`/api/bank-feed/transactions?limit=25&at=${Date.now()}`),
    ]);
    setBankStatus(status);
    setBankTransactions(Array.isArray(transactions) ? transactions : []);
  };

  const connectBank = async () => {
    setBankBusy(true);
    setBankMessage('');
    try {
      const result = await api.post('/api/bank-feed/connect', {});
      window.location.assign(result.url);
    } catch (error) {
      setBankMessage(error instanceof Error ? error.message : 'Could not start the bank connection');
      setBankBusy(false);
    }
  };

  const syncBank = async () => {
    setBankBusy(true);
    setBankMessage('');
    try {
      const result = await api.post('/api/bank-feed/sync', {});
      setBankMessage(`${result.imported} new transaction${result.imported === 1 ? '' : 's'} imported; ${result.matched} matched.`);
      await refreshBankData();
    } catch (error) {
      setBankMessage(error instanceof Error ? error.message : 'Bank sync failed');
    } finally {
      setBankBusy(false);
    }
  };

  // Calculate summaries
  const totalMonthlyRent = tenancies.reduce((sum, t) => sum + (t.monthly_rent || t.rent_amount || 0), 0) ||
    properties.reduce((sum, p) => sum + (p.monthly_rent || p.rent || 0), 0);

  const collected = payments.filter(p => p.status === 'paid' || !p.status).reduce((sum, p) => sum + (p.amount_paid || p.amount || 0), 0);
  const outstanding = totalMonthlyRent - collected;
  const occupiedCount = properties.filter(p => p.status === 'occupied' || p.status === 'let').length;
  const totalCount = properties.length || 1;
  const vacancyRate = ((totalCount - occupiedCount) / totalCount) * 100;
  const vacancyLoss = totalMonthlyRent > 0 ? (totalMonthlyRent / totalCount) * (totalCount - occupiedCount) : 0;
  const paymentDelays = payments
    .filter(payment => payment.due_date && payment.payment_date)
    .map(payment => Math.max(0, Math.round((new Date(payment.payment_date!).getTime() - new Date(payment.due_date!).getTime()) / 86400000)));
  const averageDaysLate = paymentDelays.length ? paymentDelays.reduce((sum, days) => sum + days, 0) / paymentDelays.length : 0;

  const fmt = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  // Group properties by status
  const statusGroups = properties.reduce<Record<string, { count: number; rent: number }>>((acc, p) => {
    const s = p.status || 'unknown';
    if (!acc[s]) acc[s] = { count: 0, rent: 0 };
    acc[s].count++;
    acc[s].rent += p.monthly_rent || p.rent || 0;
    return acc;
  }, {});

  return (
    <Layout title="Financials" breadcrumb={[{ label: 'Financials' }]}>
      <div className="p-4 md:p-8">
        {loading ? (
          <div className="text-center text-[var(--text-muted)] py-16">Loading...</div>
        ) : (
          <>
            <Card className="p-5 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0"><Landmark size={20} /></div>
                  <div>
                    <h3 className="font-semibold">Barclays bank feed</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {!bankStatus?.configured
                        ? 'Waiting for Open Banking provider credentials.'
                        : bankStatus.connection?.status === 'connected'
                          ? `Connected${bankStatus.connection.provider_name ? ` via ${bankStatus.connection.provider_name}` : ''}${bankStatus.connection.last_synced_at ? ` · last synced ${new Date(bankStatus.connection.last_synced_at).toLocaleString('en-GB')}` : ''}`
                          : 'Ready to connect and approve access in Barclays.'}
                    </p>
                    {bankMessage && <p className="text-xs text-orange-400 mt-2">{bankMessage}</p>}
                    {bankStatus?.connection?.last_error && <p className="text-xs text-red-400 mt-2">{bankStatus.connection.last_error}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  {bankStatus?.connection?.status === 'connected' ? (
                    <Button variant="outline" size="sm" onClick={syncBank} disabled={bankBusy} className="gap-2"><RefreshCw size={14} className={bankBusy ? 'animate-spin' : ''} /> Sync now</Button>
                  ) : (
                    <Button variant="gradient" size="sm" onClick={connectBank} disabled={bankBusy || !bankStatus?.configured}>Connect Barclays</Button>
                  )}
                </div>
              </div>
              {bankStatus?.totals && bankStatus.totals.total > 0 && (
                <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-[var(--border-subtle)] text-center">
                  <div><p className="font-semibold">{bankStatus.totals.rent_matches}</p><p className="text-[11px] text-[var(--text-muted)]">Rent matched</p></div>
                  <div><p className="font-semibold">{bankStatus.totals.deposit_matches}</p><p className="text-[11px] text-[var(--text-muted)]">Deposits matched</p></div>
                  <div><p className="font-semibold">{bankStatus.totals.expense_matches}</p><p className="text-[11px] text-[var(--text-muted)]">Expenses matched</p></div>
                  <div><p className="font-semibold">{bankStatus.totals.unmatched}</p><p className="text-[11px] text-[var(--text-muted)]">Needs review</p></div>
                </div>
              )}
            </Card>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4 mb-8">
              {[
                { label: 'Total Monthly Rent', value: fmt(totalMonthlyRent), icon: <PoundSterling size={20} />, color: 'from-blue-500 to-blue-600' },
                { label: 'Collected', value: fmt(collected), icon: <TrendingUp size={20} />, color: 'from-emerald-500 to-emerald-600' },
                { label: 'Outstanding', value: fmt(outstanding > 0 ? outstanding : 0), icon: <TrendingDown size={20} />, color: 'from-amber-500 to-orange-500' },
                { label: 'Vacancy Loss', value: fmt(vacancyLoss), icon: <Home size={20} />, color: 'from-red-500 to-pink-500' },
                { label: 'Average Lateness', value: `${averageDaysLate.toFixed(1)} days`, icon: <Clock3 size={20} />, color: 'from-violet-500 to-purple-600' },
              ].map(card => (
                <GlassCard key={card.label} className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider">{card.label}</span>
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center`}>
                      {card.icon}
                    </div>
                  </div>
                  <p className="text-2xl font-bold">{card.value}</p>
                </GlassCard>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Rent Payments Table */}
              <Card className="p-5">
                <h3 className="text-lg font-semibold mb-4">Recent Payments</h3>
                {payments.length === 0 ? (
                  <EmptyState message="No payment records yet" icon={<PoundSterling size={24} />} />
                ) : (
                  <div className="overflow-x-auto">
                    <div className="min-w-[400px] space-y-1">
                    <div className="grid grid-cols-4 gap-2 text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wider pb-2 border-b border-[var(--border-subtle)]">
                      <span>Tenant</span><span>Property</span><span className="text-right">Amount</span><span className="text-right">Date</span>
                    </div>
                    {payments.slice(0, 15).map(p => (
                      <div key={p.id} className="grid grid-cols-4 gap-2 py-2.5 border-b border-[var(--border-subtle)] text-sm">
                        <span className="truncate">{p.tenant_name || '—'}</span>
                        <span className="truncate text-[var(--text-secondary)]">{p.property_address || '—'}</span>
                        <span className="text-right font-medium text-emerald-400">{fmt(p.amount)}</span>
                        <span className="text-right text-[var(--text-muted)]">{new Date(p.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                      </div>
                    ))}
                    </div>
                  </div>
                )}
              </Card>

              {/* Property Rent Breakdown */}
              <Card className="p-5">
                <h3 className="text-lg font-semibold mb-4">Rent by Status</h3>
                {Object.keys(statusGroups).length === 0 ? (
                  <EmptyState message="No property data available" icon={<Home size={24} />} />
                ) : (
                  <div className="space-y-3">
                    {Object.entries(statusGroups).map(([status, data]) => (
                      <div key={status} className="flex items-center justify-between p-3 bg-[var(--bg-subtle)] rounded-xl">
                        <div>
                          <p className="text-sm font-medium capitalize">{status.replace(/_/g, ' ')}</p>
                          <p className="text-xs text-[var(--text-muted)]">{data.count} propert{data.count !== 1 ? 'ies' : 'y'}</p>
                        </div>
                        <p className="text-sm font-semibold">{fmt(data.rent)}<span className="text-[var(--text-muted)] text-xs">/mo</span></p>
                      </div>
                    ))}
                    {/* Total */}
                    <div className="flex items-center justify-between p-3 bg-gradient-to-r from-orange-500/10 to-pink-500/10 rounded-xl border border-orange-500/20">
                      <p className="text-sm font-semibold">Total Portfolio</p>
                      <p className="text-sm font-bold">{fmt(totalMonthlyRent)}<span className="text-[var(--text-muted)] text-xs">/mo</span></p>
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {bankTransactions.length > 0 && (
              <Card className="p-5 mt-6">
                <h3 className="text-lg font-semibold mb-4">Latest bank transactions</h3>
                <div className="overflow-x-auto">
                  <div className="min-w-[620px]">
                    <div className="grid grid-cols-[100px_1fr_120px_150px] gap-3 text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wider pb-2 border-b border-[var(--border-subtle)]">
                      <span>Date</span><span>Description</span><span className="text-right">Amount</span><span>CRM match</span>
                    </div>
                    {bankTransactions.map(transaction => (
                      <div key={transaction.id} className="grid grid-cols-[100px_1fr_120px_150px] gap-3 py-2.5 border-b border-[var(--border-subtle)] text-sm items-center">
                        <span className="text-[var(--text-muted)]">{new Date(transaction.booked_at).toLocaleDateString('en-GB')}</span>
                        <span className="truncate">{transaction.description || transaction.merchant_name || 'Bank transaction'}</span>
                        <span className={`text-right font-medium ${Number(transaction.amount) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{Number(transaction.amount) >= 0 ? '+' : '-'}{fmt(Math.abs(Number(transaction.amount)))}</span>
                        <span className="text-xs text-[var(--text-secondary)]">{transaction.match_status === 'matched_rent' ? `Rent · ${transaction.tenant_name || 'tenant'}` : transaction.match_status === 'matched_deposit' ? `Deposit · ${transaction.tenant_name || 'applicant'}` : transaction.match_status === 'matched_expense' ? `Expense · ${transaction.property_address || 'property'}` : 'Needs review'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {/* Vacancy info */}
            <GlassCard className="mt-6 p-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-sm font-semibold mb-1">Vacancy Rate</h3>
                  <p className="text-xs text-[var(--text-muted)]">{totalCount - occupiedCount} of {totalCount} properties vacant</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-32 sm:w-48 h-2 bg-[var(--bg-hover)] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-orange-500 to-pink-500 rounded-full transition-all" style={{ width: `${100 - vacancyRate}%` }} />
                  </div>
                  <span className="text-sm font-bold">{(100 - vacancyRate).toFixed(0)}%</span>
                  <span className="text-xs text-[var(--text-muted)]">occupied</span>
                </div>
              </div>
            </GlassCard>
          </>
        )}
      </div>
    </Layout>
  );
}
