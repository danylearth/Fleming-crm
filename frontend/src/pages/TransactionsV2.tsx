import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { Home, ArrowDownCircle, ArrowUpCircle, Wrench, Receipt, ChevronLeft, ChevronRight } from 'lucide-react';

interface Transaction {
  id: number;
  property_id: number;
  property_address: string;
  type: 'rent' | 'deposit' | 'maintenance' | 'fee';
  amount: number;
  date: string;
  description: string;
  status: 'pending' | 'completed' | 'overdue';
}

const typeIcons: Record<string, typeof Home> = {
  rent: ArrowDownCircle,
  deposit: ArrowDownCircle,
  maintenance: Wrench,
  fee: Receipt,
};

const typeLabels: Record<string, string> = {
  rent: 'Rent',
  deposit: 'Deposit',
  maintenance: 'Maintenance',
  fee: 'Fee',
};

const isIncome = (type: string) => type === 'rent' || type === 'deposit';

const statusStyles: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  overdue: 'bg-red-50 text-red-600 border-red-200',
};

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function TransactionsV2() {
  const api = useApi();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  useEffect(() => {
    api.get('/api/transactions').then(setTransactions).catch(console.error).finally(() => setLoading(false));
  }, []);

  const shiftMonth = (dir: number) => {
    setMonth(prev => {
      let m = prev.month + dir;
      let y = prev.year;
      if (m < 0) { m = 11; y--; }
      if (m > 11) { m = 0; y++; }
      return { year: y, month: m };
    });
  };

  const filtered = transactions.filter(t => {
    const d = new Date(t.date);
    if (d.getMonth() !== month.month || d.getFullYear() !== month.year) return false;
    if (filterType !== 'all' && t.type !== filterType) return false;
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    return true;
  });

  const totals = filtered.reduce((acc, t) => {
    if (isIncome(t.type)) acc.income += t.amount;
    else acc.expenses += t.amount;
    if (t.status === 'pending' || t.status === 'overdue') acc.outstanding += t.amount;
    return acc;
  }, { income: 0, expenses: 0, outstanding: 0 });

  const net = totals.income - totals.expenses;

  const fmtMoney = (n: number) => '£' + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 font-[Lufga]">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Financials</h1>
        <p className="text-sm text-gray-400 mt-1">Transaction overview</p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Income', value: fmtMoney(totals.income), color: 'text-emerald-600' },
          { label: 'Outstanding', value: fmtMoney(totals.outstanding), color: 'text-amber-600' },
          { label: 'Expenses', value: fmtMoney(totals.expenses), color: 'text-red-500' },
          { label: 'Net', value: (net >= 0 ? '+' : '-') + fmtMoney(net), color: net >= 0 ? 'text-emerald-600' : 'text-red-500' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-200/60 p-6">
            <p className="text-sm text-gray-500 mb-1">{s.label}</p>
            <p className={`text-3xl font-bold tracking-tight ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => shiftMonth(-1)} className="p-2 rounded-xl border border-gray-200/60 hover:bg-gray-50">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-lg font-semibold">{monthNames[month.month]} {month.year}</h2>
          <button onClick={() => shiftMonth(1)} className="p-2 rounded-xl border border-gray-200/60 hover:bg-gray-50">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
          >
            <option value="all">All Types</option>
            <option value="rent">Rent</option>
            <option value="deposit">Deposit</option>
            <option value="maintenance">Maintenance</option>
            <option value="fee">Fee</option>
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200/60 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-4">Type</th>
              <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-4">Property</th>
              <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-4">Description</th>
              <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-4">Amount</th>
              <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-4">Date</th>
              <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-sm text-gray-400 py-12">No transactions this month</td>
              </tr>
            ) : (
              filtered.sort((a, b) => b.date.localeCompare(a.date)).map(t => {
                const Icon = typeIcons[t.type] || Receipt;
                const income = isIncome(t.type);
                return (
                  <tr key={t.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${income ? 'text-emerald-500' : 'text-red-400'}`} />
                        <span className="text-sm font-medium text-gray-700">{typeLabels[t.type]}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-[200px] truncate">{t.property_address}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-[200px] truncate">{t.description}</td>
                    <td className={`px-6 py-4 text-sm font-semibold text-right ${income ? 'text-emerald-600' : 'text-red-500'}`}>
                      {income ? '+' : '-'}{fmtMoney(t.amount)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(t.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${statusStyles[t.status]}`}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
