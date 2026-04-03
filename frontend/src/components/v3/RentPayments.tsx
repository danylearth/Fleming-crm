import { useState, useEffect } from 'react';
import { Card, Button, SectionHeader, EmptyState, Input, DatePicker } from './index';
import { useApi } from '../../hooks/useApi';
import { PoundSterling, CheckCircle2, Clock, AlertCircle, Plus } from 'lucide-react';

interface Payment {
  id: number;
  property_id: number;
  tenant_id: number;
  due_date: string;
  amount_due: number;
  amount_paid: number | null;
  payment_date: string | null;
  status: string;
  address?: string;
  tenant_name?: string;
}

interface Props {
  propertyId?: number;
  tenantId?: number;
  compact?: boolean;
}

export default function RentPayments({ propertyId, tenantId, compact }: Props) {
  const api = useApi();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ due_date: '', amount_due: '' });

  useEffect(() => {
    api.get('/api/rent-payments')
      .then(data => {
        let filtered = Array.isArray(data) ? data : [];
        if (propertyId) filtered = filtered.filter((p: Payment) => p.property_id === propertyId);
        if (tenantId) filtered = filtered.filter((p: Payment) => p.tenant_id === tenantId);
        setPayments(filtered);
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [propertyId, tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = async () => {
    if (!form.due_date || !form.amount_due) {
      alert('Please fill in both due date and amount');
      return;
    }
    if (!propertyId && !tenantId) {
      alert('Cannot add payment: No property or tenant associated');
      return;
    }
    try {
      const res = await api.post('/api/rent-payments', {
        property_id: propertyId,
        tenant_id: tenantId,
        due_date: form.due_date,
        amount_due: parseFloat(form.amount_due),
      });
      console.log('Payment created:', res);
      if (res && res.id) {
        setPayments(prev => [{
          id: res.id, property_id: propertyId || 0, tenant_id: tenantId || 0,
          due_date: form.due_date, amount_due: parseFloat(form.amount_due),
          amount_paid: null, payment_date: null, status: 'pending',
        }, ...prev]);
        setForm({ due_date: '', amount_due: '' });
        setShowAdd(false);
      } else {
        alert('Failed to create payment: Invalid response from server');
      }
    } catch (e: unknown) {
      console.error('Payment creation error:', e);
      const message = e instanceof Error ? e.message : 'Unknown error';
      alert(`Failed to create payment: ${message}`);
    }
  };

  const handlePay = async (payment: Payment) => {
    try {
      const response = await api.put(`/api/rent-payments/${payment.id}/pay`, {
        amount_paid: payment.amount_due,
        payment_date: new Date().toISOString().split('T')[0],
      });
      console.log('Payment marked as paid:', response);
      setPayments(prev => prev.map(p =>
        p.id === payment.id ? { ...p, status: 'paid', amount_paid: p.amount_due, payment_date: new Date().toISOString().split('T')[0] } : p
      ));
    } catch (e: unknown) {
      console.error('Failed to mark payment as paid:', e);
      const message = e instanceof Error ? e.message : 'Unknown error';
      alert(`Failed to mark as paid: ${message}`);
    }
  };

  const statusIcon = (status: string) => {
    if (status === 'paid') return <CheckCircle2 size={14} className="text-emerald-400" />;
    if (status === 'overdue') return <AlertCircle size={14} className="text-red-400" />;
    return <Clock size={14} className="text-amber-400" />;
  };

  const statusColor = (status: string) => {
    if (status === 'paid') return 'text-emerald-400';
    if (status === 'overdue') return 'text-red-400';
    return 'text-amber-400';
  };

  const displayPayments = compact ? payments.slice(0, 5) : payments;

  // Calculate summary
  const totalDue = payments.reduce((sum, p) => sum + (p.amount_due || 0), 0);
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount_paid || 0), 0);
  const pendingCount = payments.filter(p => p.status !== 'paid').length;

  // Average late payment (days between due_date and payment_date for paid payments)
  const paidPayments = payments.filter(p => p.status === 'paid' && p.payment_date && p.due_date);
  const avgLateDays = paidPayments.length > 0
    ? Math.round(paidPayments.reduce((sum, p) => {
      const due = new Date(p.due_date).getTime();
      const paid = new Date(p.payment_date!).getTime();
      const daysLate = Math.max(0, Math.ceil((paid - due) / (1000 * 60 * 60 * 24)));
      return sum + daysLate;
    }, 0) / paidPayments.length)
    : null;

  return (
    <Card className="p-6">
      <SectionHeader
        title="Rent Payments"
        action={() => setShowAdd(!showAdd)}
        actionLabel={showAdd ? 'Cancel' : 'Add Payment'}
      />

      {/* Summary */}
      {!loading && payments.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="p-3 rounded-xl bg-[var(--bg-subtle)]">
            <p className="text-xs text-[var(--text-muted)]">Total Due</p>
            <p className="text-lg font-bold">£{totalDue.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded-xl bg-[var(--bg-subtle)]">
            <p className="text-xs text-[var(--text-muted)]">Collected</p>
            <p className="text-lg font-bold text-emerald-400">£{totalPaid.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded-xl bg-[var(--bg-subtle)]">
            <p className="text-xs text-[var(--text-muted)]">Pending</p>
            <p className="text-lg font-bold text-amber-400">{pendingCount}</p>
          </div>
          <div className="p-3 rounded-xl bg-[var(--bg-subtle)]">
            <p className="text-xs text-[var(--text-muted)]">Avg Late</p>
            <p className={`text-lg font-bold ${avgLateDays === null ? 'text-[var(--text-muted)]' : avgLateDays === 0 ? 'text-emerald-400' : avgLateDays <= 5 ? 'text-amber-400' : 'text-red-400'}`}>
              {avgLateDays === null ? '—' : avgLateDays === 0 ? 'On time' : `${avgLateDays}d`}
            </p>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="mb-4 p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-color)] space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <DatePicker label="Due Date" value={form.due_date} onChange={v => setForm({ ...form, due_date: v })} />
            <Input label="Amount (£)" value={form.amount_due} onChange={v => setForm({ ...form, amount_due: v })} placeholder="1200" />
          </div>
          <Button variant="gradient" size="sm" onClick={handleAdd}>
            <Plus size={14} className="mr-2" /> Add
          </Button>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-[var(--text-muted)] text-sm">Loading...</div>
      ) : displayPayments.length === 0 ? (
        <EmptyState message="No rent payments recorded" icon={<PoundSterling size={32} />} />
      ) : (
        <div className="space-y-2">
          {displayPayments.map(payment => (
            <div key={payment.id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-subtle)]">
              {statusIcon(payment.status)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  £{payment.amount_due?.toLocaleString()}
                  {!compact && payment.address && <span className="text-[var(--text-muted)] ml-2">· {payment.address}</span>}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Due {(() => { const d = new Date(payment.due_date); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; })()}
                  {payment.payment_date && ` · Paid ${(() => { const d = new Date(payment.payment_date); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; })()}`}
                </p>
              </div>
              <span className={`text-xs font-medium capitalize ${statusColor(payment.status)}`}>
                {payment.status}
              </span>
              {payment.status !== 'paid' && (
                <Button variant="ghost" size="sm" onClick={() => handlePay(payment)}>
                  Mark Paid
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
