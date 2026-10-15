import {useNotifications} from '../../context/NotificationContext';
import {rentStatus} from '../../utils/rentStatus';
import {RentInvoiceButton} from '../FinancialDocuments';
import RentBankTransactions from '../RentBankTransactions';
import TenantMessageTemplates from '../TenantMessageTemplates';
import { useState, useEffect } from 'react';
import { Card, Button, SectionHeader, EmptyState, Input, DatePicker, Select } from './index';
import { useApi } from '../../hooks/useApi';
import { PoundSterling, BadgePoundSterling, CheckCircle2, Clock, AlertCircle, Plus } from 'lucide-react';

const money=(value:unknown)=>Number(value||0).toLocaleString('en-GB',{minimumFractionDigits:Number.isInteger(Number(value))?0:2,maximumFractionDigits:2});

interface Payment {
  id: number;
  property_id: number;
  tenant_id: number; linked_tenant_id?:number; opening_balance_amount?:number;
  due_date: string;
  amount_due: number;
  amount_paid: number | null;
  payment_date: string | null;
  status: string;
  notes?: string;
  address?: string;
  tenant_name?: string;
  bank_received?: number;
  bank_transaction_count?: number;
}

interface Props {
  propertyId?: number;
  tenantId?: number;
  compact?: boolean;
}

export default function RentPayments({ propertyId, tenantId, compact }: Props) {
  const api = useApi();
  const {confirmAction}=useNotifications();
  const [paying,setPaying]=useState<number|null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [year,setYear]=useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ due_date: '', amount_due: '' });
  const reloadPayments=async()=>{
    const data=await api.get('/api/rent-payments');
    setPayments((Array.isArray(data)?data:[]).filter((p:Payment)=>(!propertyId||p.property_id===propertyId)&&(!tenantId||p.tenant_id===tenantId||p.linked_tenant_id===tenantId)).map((p:Payment)=>({...p,status:rentStatus(p)})));
  };

  useEffect(() => {
    api.get('/api/rent-payments')
      .then(data => {
        let filtered = Array.isArray(data) ? data : [];
        if (propertyId) filtered = filtered.filter((p: Payment) => p.property_id === propertyId);
        if (tenantId) filtered = filtered.filter((p: Payment) => p.tenant_id === tenantId || p.linked_tenant_id === tenantId);
        setPayments(filtered.map((p:Payment)=>({...p,status:rentStatus(p)})));
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
    if(paying!==null||!await confirmAction(`Manually mark £${money(payment.amount_due)} as paid for the rent due ${payment.due_date.slice(0,10)}? This overrides the rent record without linking a bank transaction. Use Link Bank Payment if the receipt is in the bank feed.`,'Confirm Manual Payment Override'))return;
    setPaying(payment.id);
    try {
      const response = await api.put(`/api/rent-payments/${payment.id}/pay`, {
        manual_override_confirmed:true,
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
    if (status === 'not due') return <CheckCircle2 size={14} className="text-[var(--text-muted)]" />;
    if (status === 'paid') return <CheckCircle2 size={14} className="text-emerald-400" />;
    if (status === 'overdue') return <AlertCircle size={14} className="text-red-400" />;
    return <Clock size={14} className="text-amber-400" />;
  };

  const statusColor = (status: string) => {
    if (status === 'not due') return 'text-[var(--text-muted)]';
    if (status === 'paid') return 'text-emerald-400';
    if (status === 'overdue') return 'text-red-400';
    return 'text-amber-400';
  };

  const filteredPayments=payments.filter(p=>year==='all'||p.due_date?.slice(0,4)===year).sort((a,b)=>Number(a.status==='paid')-Number(b.status==='paid')||b.due_date.localeCompare(a.due_date));
  const displayPayments = compact ? filteredPayments.slice(0, 5) : filteredPayments;

  // Calculate summary
  const totalDue = filteredPayments.reduce((sum, p) => sum + Number(p.amount_due || 0), 0);
  const totalPaid = filteredPayments.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);
  const pendingCount = filteredPayments.filter(p => !['paid','not due'].includes(p.status)).length;

  // Average late payment (days between due_date and payment_date for paid payments)
  const paidPayments = filteredPayments.filter(p => p.status === 'paid' && p.payment_date && p.due_date);
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
        title="Rent Payments & Invoices" icon={<BadgePoundSterling size={16} />}
        action={() => setShowAdd(!showAdd)}
        actionLabel={showAdd ? 'Cancel' : 'Add Payment'}
      />

      <Select className="max-w-xs mb-4" label="Year" value={year} onChange={setYear} options={[{value:'all',label:'All Years'},...[...new Set(payments.map(p=>p.due_date?.slice(0,4)).filter(Boolean))].sort().reverse().map(y=>({value:y,label:y}))]}/>
      {/* Summary */}
      {!loading && payments.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="p-3 rounded-xl bg-[var(--bg-subtle)]">
            <p className="text-xs text-[var(--text-muted)]">Total Due</p>
            <p className="text-lg font-bold">£{money(totalDue)}</p>
          </div>
          <div className="p-3 rounded-xl bg-[var(--bg-subtle)]">
            <p className="text-xs text-[var(--text-muted)]">Collected</p>
            <p className="text-lg font-bold text-emerald-400">£{money(totalPaid)}</p>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <div key={payment.id} className={`grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 p-3 rounded-xl border lg:grid-cols-[auto_minmax(0,1fr)_72px_120px_232px] ${payment.status==='not due'?'bg-[var(--bg-subtle)] border-[var(--border-color)]':payment.status==='paid'?'bg-emerald-500/10 border-emerald-500/30':payment.status==='overdue'?'bg-red-500/5 border-red-500/30':'bg-amber-500/10 border-amber-500/30'}`}>
              {statusIcon(payment.status)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  £{money(payment.amount_due)}
                  {payment.notes?.includes('Final scheduled monthly rent charge')&&<span className="ml-2 text-xs font-normal">Final invoice</span>}
                  {!compact && payment.address && <span className="text-[var(--text-muted)] ml-2">· {payment.address}</span>}
                </p>
                {propertyId && payment.tenant_name && <p className="text-xs text-[var(--text-secondary)]">{payment.tenant_name}</p>}
                {payment.notes?.startsWith('Office opening balance:') && !Number(payment.bank_received) && !Number(payment.bank_transaction_count) && <p className="text-xs text-[var(--text-muted)]">Historic opening balance · no linked bank receipt</p>}
                <p className="text-xs text-[var(--text-muted)]">
                  Due {(() => { const d = new Date(payment.due_date); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; })()}
                  {payment.payment_date && ` · Paid ${(() => { const d = new Date(payment.payment_date); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; })()}`}
                </p>
                {Number(payment.amount_paid)>0&&Number(payment.amount_paid)<Number(payment.amount_due)&&<p className="text-xs text-red-600">Paid £{money(payment.amount_paid)} · Outstanding £{money(Number(payment.amount_due)-Number(payment.amount_paid))}</p>}
              </div>
              <span className={`text-xs font-medium capitalize lg:col-start-3 ${statusColor(payment.status)}`}>
                {Number(payment.amount_paid)>Number(payment.amount_due)?`Credit £${money(Number(payment.amount_paid)-Number(payment.amount_due))}`:payment.status==='pending'?'Unpaid · Not yet due':payment.status}
              </span>
              <div className="lg:col-start-4"><RentInvoiceButton paymentId={payment.id} className="w-full justify-center"/></div>
              {payment.status!=='not due'&&<div className="lg:col-start-5"><RentBankTransactions paymentId={payment.id} onChanged={reloadPayments} hasLinked={Number(payment.bank_transaction_count)>0||Number(payment.bank_received)>0} className="w-full justify-center"/></div>}
              {payment.status !== 'paid' && ['overdue','due today'].includes(payment.status) && <TenantMessageTemplates tenantId={payment.tenant_id} rentPaymentId={payment.id} onSent={()=>{}}/>}
              {!['paid','not due'].includes(payment.status) && (
                <Button variant="outline" className="!bg-emerald-600 !text-white !border-emerald-600" size="sm" disabled={paying!==null} onClick={() => handlePay(payment)}>
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
