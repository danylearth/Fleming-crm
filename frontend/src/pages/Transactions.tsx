import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { PoundSterling, Plus, X, ArrowUpRight, ArrowDownRight, Search } from 'lucide-react';

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

export default function Transactions() {
  const api = useApi();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tenancies, setTenancies] = useState<Tenancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState({
    tenancy_id: '', type: 'payment', amount: '', description: '', 
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [trans, tens] = await Promise.all([
        api.get('/api/transactions'),
        api.get('/api/tenancies')
      ]);
      setTransactions(trans);
      setTenancies(tens.filter((t: any) => t.status === 'active'));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/transactions', {
        ...formData,
        tenancy_id: parseInt(formData.tenancy_id),
        amount: parseFloat(formData.amount)
      });
      setShowModal(false);
      setFormData({ tenancy_id: '', type: 'payment', amount: '', description: '', date: new Date().toISOString().split('T')[0] });
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const filtered = transactions.filter(t => 
    t.address.toLowerCase().includes(search.toLowerCase()) ||
    t.tenant_name.toLowerCase().includes(search.toLowerCase())
  );

  const typeLabels: Record<string, string> = {
    rent_due: 'Rent Due',
    payment: 'Payment',
    deposit: 'Deposit',
    fee: 'Fee',
    refund: 'Refund'
  };

  const isIncome = (type: string) => ['payment', 'deposit'].includes(type);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-navy-200 border-t-navy-900 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Transactions</h1>
          <p className="text-gray-500 mt-1">Rent payments and financial records</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-navy-900 hover:bg-navy-800 text-white font-medium rounded-xl transition-all"
        >
          <Plus className="w-4 h-4" />
          Record Transaction
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search transactions..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <PoundSterling className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="font-semibold text-navy-900 mb-1">No transactions yet</h3>
          <p className="text-gray-500 text-sm">Record your first transaction to get started</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-50">
            {filtered.map(trans => (
              <div key={trans.id} className="p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  isIncome(trans.type) ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  {isIncome(trans.type) ? (
                    <ArrowDownRight className="w-5 h-5 text-green-600" />
                  ) : (
                    <ArrowUpRight className="w-5 h-5 text-red-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-navy-900">{typeLabels[trans.type]}</span>
                    {trans.description && (
                      <span className="text-gray-400">—</span>
                    )}
                    {trans.description && (
                      <span className="text-gray-500 truncate">{trans.description}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate">
                    {trans.address} • {trans.tenant_name}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${isIncome(trans.type) ? 'text-green-600' : 'text-red-600'}`}>
                    {isIncome(trans.type) ? '+' : '-'}£{trans.amount.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(trans.date).toLocaleDateString('en-GB')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-navy-900">Record Transaction</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1.5">Tenancy *</label>
                <select
                  value={formData.tenancy_id}
                  onChange={e => setFormData({ ...formData, tenancy_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                  required
                >
                  <option value="">Select tenancy...</option>
                  {tenancies.map(t => (
                    <option key={t.id} value={t.id}>{t.address} ({t.tenant_name})</option>
                  ))}
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-1.5">Type *</label>
                  <select
                    value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                  >
                    <option value="payment">Payment Received</option>
                    <option value="rent_due">Rent Due</option>
                    <option value="deposit">Deposit</option>
                    <option value="fee">Fee</option>
                    <option value="refund">Refund</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-1.5">Amount (£) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={e => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                    required
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1.5">Date *</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={e => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1.5">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional notes..."
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-navy-900 text-white font-medium rounded-xl hover:bg-navy-800"
                >
                  Save Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
