import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { PoundSterling, Plus, X, ArrowUpRight, ArrowDownRight, Search, ChevronLeft, ChevronRight } from 'lucide-react';

interface Transaction {
  id: number;
  tenancy_id: number;
  type: string;
  amount: number;
  description: string;
  date: string;
  address: string;
  tenant_name: string;
}

interface Tenancy {
  id: number;
  address: string;
  tenant_name: string;
}

const typeLabels: Record<string, string> = {
  rent_due: 'Rent Due', payment: 'Payment', deposit: 'Deposit', fee: 'Fee', refund: 'Refund'
};
const isIncome = (type: string) => ['payment', 'deposit'].includes(type);

export default function Transactions() {
  const api = useApi();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tenancies, setTenancies] = useState<Tenancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 10;
  const [formData, setFormData] = useState({
    tenancy_id: '', type: 'payment', amount: '', description: '', date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [trans, tens] = await Promise.all([api.get('/api/transactions'), api.get('/api/tenancies')]);
      setTransactions(trans);
      setTenancies(tens.filter((t: any) => t.status === 'active'));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/transactions', { ...formData, tenancy_id: parseInt(formData.tenancy_id), amount: parseFloat(formData.amount) });
      setShowModal(false);
      setFormData({ tenancy_id: '', type: 'payment', amount: '', description: '', date: new Date().toISOString().split('T')[0] });
      loadData();
    } catch (err: any) { alert(err.message); }
  };

  const filtered = transactions.filter(t =>
    t.address.toLowerCase().includes(search.toLowerCase()) ||
    t.tenant_name.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === paged.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(paged.map(t => t.id)));
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Finance</p>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{filtered.length} Records</span>
          </div>
        </div>
        <button onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors">
          + Record Transaction
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search..." value={search}
            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200" />
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="border border-gray-200 rounded-lg overflow-hidden flex-1">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50">
                <th className="w-10 px-3 py-3">
                  <input type="checkbox" checked={paged.length > 0 && selectedIds.size === paged.length}
                    onChange={toggleSelectAll} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Property / Tenant</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <PoundSterling className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-500">No transactions found</p>
                  </td>
                </tr>
              ) : paged.map(trans => (
                <tr key={trans.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                  <td className="w-10 px-3 py-3">
                    <input type="checkbox" checked={selectedIds.has(trans.id)}
                      onChange={() => toggleSelect(trans.id)}
                      className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center ${isIncome(trans.type) ? 'bg-gray-100' : 'bg-gray-100'}`}>
                        {isIncome(trans.type) ? <ArrowDownRight className="w-3.5 h-3.5 text-gray-600" /> : <ArrowUpRight className="w-3.5 h-3.5 text-gray-600" />}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{typeLabels[trans.type]}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-700">{trans.address}</p>
                    <p className="text-xs text-gray-400">{trans.tenant_name}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{trans.description || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{new Date(trans.date).toLocaleDateString('en-GB')}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-semibold ${isIncome(trans.type) ? 'text-emerald-700' : 'text-red-600'}`}>
                      {isIncome(trans.type) ? '+' : '-'}£{trans.amount.toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button key={page} onClick={() => setCurrentPage(page)}
                className={`w-8 h-8 text-sm font-medium rounded-lg ${page === currentPage ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {page}
              </button>
            ))}
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-lg w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Record Transaction</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tenancy *</label>
                <select value={formData.tenancy_id} onChange={e => setFormData({ ...formData, tenancy_id: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" required>
                  <option value="">Select tenancy...</option>
                  {tenancies.map(t => <option key={t.id} value={t.id}>{t.address} ({t.tenant_name})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Type *</label>
                  <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none">
                    <option value="payment">Payment Received</option><option value="rent_due">Rent Due</option>
                    <option value="deposit">Deposit</option><option value="fee">Fee</option><option value="refund">Refund</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Amount (£) *</label>
                  <input type="number" step="0.01" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" required />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Date *</label>
                <input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" required />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <input type="text" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional notes..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium">Cancel</button>
                <button type="submit"
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium">Save Transaction</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
