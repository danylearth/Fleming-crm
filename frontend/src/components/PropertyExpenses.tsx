import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgePoundSterling, Download, Pencil, Plus, ReceiptText, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { invalidateCache, useApi } from '../hooks/useApi';
import { Button, Card, DatePicker, EmptyState, Input, Select, Tag } from './ui';
import { isUkFinancialYearToDate, ukFinancialYear } from '../utils/propertyExpenses';

interface Expense {
  id: number;
  description: string;
  amount: number | string;
  category: string;
  expense_date: string | null;
  expense_year?: number | null;
  is_recurring: number;
  recurrence_frequency: string | null;
  receipt_document_id: number | null;
  receipt_name: string | null;
}

interface ExpenseForm {
  description: string;
  amount: string;
  category: string;
  expense_date: string;
  is_recurring: boolean;
  recurrence_frequency: string;
}

const EMPTY_FORM: ExpenseForm = {
  description: '', amount: '', category: 'maintenance', expense_date: '',
  is_recurring: false, recurrence_frequency: 'monthly',
};

const CATEGORIES = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'refurbishment', label: 'Refurbishment' },
  { value: 'property_purchase', label: 'Property Purchase' },
  { value: 'purchase_costs', label: 'Purchase Costs & Fees' },
  { value: 'ground_rent', label: 'Ground Rent' },
  { value: 'service_charge', label: 'Service Charge' },
  { value: 'communal_charge', label: 'Communal Charge' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'legal', label: 'Legal' },
  { value: 'other', label: 'Other' },
];

const RUNNING_COSTS = new Set(['ground_rent', 'service_charge', 'communal_charge']);

function financialYearLabel(value: string) {
  if (value.startsWith('calendar:')) return value.slice(9) + ' (year only)';
  if (value === 'all') return 'All time';
  if (value === 'undated') return 'Date not recorded';
  const [start, end] = value.split('-');
  return `${start}–${end}`;
}

function formatCategory(value: string) {
  return CATEGORIES.find(category => category.value === value)?.label
    || value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

export default function PropertyExpenses({ propertyId }: { propertyId: number }) {
  const api = useApi();
  const { token } = useAuth();
  const { confirmAction } = useNotifications();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ExpenseForm>(EMPTY_FORM);
  const currentFinancialYear = ukFinancialYear(new Date().toISOString());
  const [year, setYear] = useState(currentFinancialYear);

  const load = useCallback(async () => {
    const data = await api.get(`/api/property-expenses/${propertyId}`).catch(() => []);
    setExpenses(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [api, propertyId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const yearOptions = useMemo(() => {
    const values = new Set(expenses.map(expense => expense.expense_date ? ukFinancialYear(expense.expense_date) : expense.expense_year ? `calendar:${expense.expense_year}` : 'undated'));
    values.add(currentFinancialYear);
    return ['all', ...[...values].sort().reverse()];
  }, [currentFinancialYear, expenses]);

  const visibleExpenses = year === 'all' ? expenses : expenses.filter(expense => (expense.expense_date ? ukFinancialYear(expense.expense_date) : expense.expense_year ? `calendar:${expense.expense_year}` : 'undated') === year);
  const runningCosts = visibleExpenses.filter(expense => RUNNING_COSTS.has(expense.category));
  const historicCosts = visibleExpenses.filter(expense => !RUNNING_COSTS.has(expense.category));
  const total = (items: Expense[]) => items.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const allTimeTotal = total(expenses);
  const yearToDateTotal = total(expenses.filter(expense => isUkFinancialYearToDate(expense.expense_date)));
  const monthlyTotals = Array.from({ length: 12 }, (_, index) => {
    const calendarMonth = (index + 3) % 12;
    const value = total(visibleExpenses.filter(expense => {
      if (!expense.expense_date) return false;
      return new Date(`${expense.expense_date.slice(0, 10)}T12:00:00`).getMonth() === calendarMonth;
    }));
    return { label: new Date(2026, calendarMonth, 1).toLocaleDateString('en-GB', { month: 'short' }), value };
  });
  const maxMonth = Math.max(1, ...monthlyTotals.map(month => month.value));

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const save = async () => {
    const body = {
      ...form,
      property_id: propertyId,
      amount: Number(form.amount),
      recurrence_frequency: form.is_recurring ? form.recurrence_frequency : null,
    };
    if (editingId) await api.put(`/api/property-expenses/${editingId}`, body);
    else await api.post('/api/property-expenses', body);
    resetForm();
    await load();
  };

  const edit = (expense: Expense) => {
    setForm({
      description: expense.description,
      amount: String(expense.amount),
      category: expense.category,
      expense_date: expense.expense_date?.slice(0, 10) || '',
      is_recurring: Boolean(expense.is_recurring),
      recurrence_frequency: expense.recurrence_frequency || 'monthly',
    });
    setEditingId(expense.id);
    setShowForm(true);
  };

  const attachReceipt = async (expenseId: number, file: File) => {
    const body = new FormData();
    body.append('file', file);
    const response = await fetch(`/api/property-expenses/${expenseId}/receipt`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });
    if (!response.ok) throw new Error((await response.json()).error || 'Receipt upload failed');
    invalidateCache('/api/property-expenses');
    await load();
  };

  const downloadReceipt = async (expense: Expense) => {
    if (!expense.receipt_document_id) return;
    const response = await fetch(`/api/documents/download/${expense.receipt_document_id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) return alert('Receipt could not be downloaded');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = expense.receipt_name || 'receipt';
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderExpenses = (title: string, items: Expense[]) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{title}</h4>
        <span className="text-xs font-semibold">£{total(items).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
      </div>
      {items.length === 0 ? <p className="text-xs text-[var(--text-muted)]">No costs in this financial year.</p> : items.map(expense => (
        <div key={expense.id} className="flex items-center gap-3 rounded-xl bg-[var(--bg-subtle)] p-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate">{expense.description}</p>
            <div className="flex flex-wrap gap-1.5 mt-1 text-[10px] text-[var(--text-muted)]">
              <span>{formatCategory(expense.category)}</span>
              {!expense.expense_date && expense.expense_year && <span>· {expense.expense_year}</span>}
              {expense.expense_date && <span>· {new Date(`${expense.expense_date.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB')}</span>}
              {expense.is_recurring ? <Tag>Repeats {expense.recurrence_frequency}</Tag> : null}
            </div>
          </div>
          <span className="text-sm font-medium text-red-400">-£{Number(expense.amount).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
          {expense.receipt_document_id ? (
            <button title="Download receipt" onClick={() => downloadReceipt(expense)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><Download size={14} /></button>
          ) : (
            <label title="Upload receipt" className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <Upload size={14} />
              <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx" onChange={event => {
                const file = event.target.files?.[0];
                if (file) attachReceipt(expense.id, file).catch(error => alert(error.message));
              }} />
            </label>
          )}
          <button title="Edit expense" onClick={() => edit(expense)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><Pencil size={14} /></button>
          <button title="Delete expense" onClick={async () => {
            if (!await confirmAction(`Delete “${expense.description}”?`)) return;
            await api.delete(`/api/property-expenses/${expense.id}`);
            await load();
          }} className="text-[var(--text-muted)] hover:text-red-400"><Trash2 size={14} /></button>
        </div>
      ))}
    </div>
  );

  return (
    <Card className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><BadgePoundSterling size={16} />Property Costs</h3>
          <p className="text-xs text-[var(--text-muted)]">Running costs and historic expenditure</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}>
          <Plus size={14} className="mr-1.5" /> {showForm ? 'Cancel' : 'Add expense'}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl bg-[var(--bg-subtle)] p-3"><Select label="Financial year" value={year} onChange={setYear} options={yearOptions.map(value => ({ value, label: financialYearLabel(value) }))} /></div>
        <div className="rounded-xl bg-[var(--bg-subtle)] p-3"><p className="text-xs text-[var(--text-muted)]">Year to date</p><p className="text-lg font-bold">£{yearToDateTotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</p></div>
        <div className="rounded-xl bg-[var(--bg-subtle)] p-3"><p className="text-xs text-[var(--text-muted)]">All-time total</p><p className="text-lg font-bold">£{allTimeTotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</p></div>
      </div>

      {showForm && (
        <div className="rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] p-4 space-y-3">
          <Input label="Description" value={form.description} onChange={description => setForm(current => ({ ...current, description }))} placeholder="e.g. Boiler repair" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Amount (£)" type="number" value={form.amount} onChange={amount => setForm(current => ({ ...current, amount }))} />
            <Select label="Category" value={form.category} onChange={category => setForm(current => ({ ...current, category }))} options={CATEGORIES} />
            <DatePicker label="Date" value={form.expense_date} onChange={expense_date => setForm(current => ({ ...current, expense_date }))} />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <button type="button" onClick={() => setForm(current => ({ ...current, is_recurring: !current.is_recurring }))}
              className={`rounded-xl border px-3 py-2 text-xs font-medium ${form.is_recurring ? 'border-[var(--accent-orange)] text-[var(--accent-orange)]' : 'border-[var(--border-input)] text-[var(--text-muted)]'}`}>
              {form.is_recurring ? '✓ Recurring expense' : 'Make recurring'}
            </button>
            {form.is_recurring && <Select label="Repeats" value={form.recurrence_frequency} onChange={recurrence_frequency => setForm(current => ({ ...current, recurrence_frequency }))}
              options={[{ value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' }, { value: 'annually', label: 'Annually' }]} />}
            <Button variant="gradient" size="sm" disabled={!form.description.trim() || !form.amount || Number(form.amount) < 0} onClick={() => save().catch(error => alert(error.message))}>
              {editingId ? 'Update expense' : 'Save expense'}
            </Button>
          </div>
        </div>
      )}

      <div>
        <div className="h-28 flex items-end gap-1" aria-label={`Monthly expense graph for ${financialYearLabel(year)}`}>
          {monthlyTotals.map(month => (
            <div key={month.label} className="flex-1 flex flex-col items-center gap-1">
              <div title={`${month.label}: £${month.value.toFixed(2)}`} className="w-full rounded-t bg-[var(--accent-orange)]/60 min-h-[2px]" style={{ height: `${Math.max(2, (month.value / maxMonth) * 80)}px` }} />
              <span className="text-[9px] text-[var(--text-muted)]">{month.label.slice(0, 1)}</span>
            </div>
          ))}
        </div>
      </div>

      {loading ? <p className="text-sm text-[var(--text-muted)]">Loading costs…</p> : expenses.length === 0 ? (
        <EmptyState icon={<ReceiptText size={32} />} message="No expenses recorded" />
      ) : (
        <div className="space-y-5">
          {renderExpenses('Running Costs', runningCosts)}
          {renderExpenses('Historic Costs', historicCosts)}
        </div>
      )}
    </Card>
  );
}
