import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Card, GlassCard, EmptyState } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { PoundSterling, TrendingUp, TrendingDown, Home } from 'lucide-react';

interface RentPayment {
  id: number;
  tenant_name?: string;
  property_address?: string;
  amount: number;
  date: string;
  status?: string;
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [pay, prop, ten] = await Promise.all([
          api.get('/api/rent-payments').catch(() => []),
          api.get('/api/properties').catch(() => []),
          api.get('/api/tenancies').catch(() => []),
        ]);
        setPayments(Array.isArray(pay) ? pay : pay?.payments || []);
        setProperties(Array.isArray(prop) ? prop : prop?.properties || []);
        setTenancies(Array.isArray(ten) ? ten : ten?.tenancies || []);
      } catch {
        // Errors already handled by individual .catch() calls above
      }
      setLoading(false);
    };
    load();
  }, []);

  // Calculate summaries
  const totalMonthlyRent = tenancies.reduce((sum, t) => sum + (t.monthly_rent || t.rent_amount || 0), 0) ||
    properties.reduce((sum, p) => sum + (p.monthly_rent || p.rent || 0), 0);

  const collected = payments.filter(p => p.status === 'paid' || !p.status).reduce((sum, p) => sum + (p.amount || 0), 0);
  const outstanding = totalMonthlyRent - collected;
  const occupiedCount = properties.filter(p => p.status === 'occupied' || p.status === 'let').length;
  const totalCount = properties.length || 1;
  const vacancyRate = ((totalCount - occupiedCount) / totalCount) * 100;
  const vacancyLoss = totalMonthlyRent > 0 ? (totalMonthlyRent / totalCount) * (totalCount - occupiedCount) : 0;

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
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
              {[
                { label: 'Total Monthly Rent', value: fmt(totalMonthlyRent), icon: <PoundSterling size={20} />, color: 'from-blue-500 to-blue-600' },
                { label: 'Collected', value: fmt(collected), icon: <TrendingUp size={20} />, color: 'from-emerald-500 to-emerald-600' },
                { label: 'Outstanding', value: fmt(outstanding > 0 ? outstanding : 0), icon: <TrendingDown size={20} />, color: 'from-amber-500 to-orange-500' },
                { label: 'Vacancy Loss', value: fmt(vacancyLoss), icon: <Home size={20} />, color: 'from-red-500 to-pink-500' },
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
