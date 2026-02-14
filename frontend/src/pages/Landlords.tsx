import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { UserCheck, Plus, X, Phone, Mail, Building2, Search, ChevronLeft, ChevronRight } from 'lucide-react';

interface Landlord {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  property_count: number;
}

export default function Landlords() {
  const api = useApi();
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 10;
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', address: '', notes: '' });

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    api.get('/api/landlords').then(setLandlords).catch(console.error).finally(() => setLoading(false));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/landlords', formData);
      setShowModal(false);
      setFormData({ name: '', email: '', phone: '', address: '', notes: '' });
      loadData();
    } catch (err: any) { alert(err.message); }
  };

  const filtered = landlords.filter(l => 
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.email?.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === paged.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(paged.map(l => l.id)));
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
          <p className="text-xs text-gray-400 mb-0.5">Contacts</p>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Landlords</h1>
            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{filtered.length} Landlords</span>
          </div>
        </div>
        <button onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors">
          + Add Landlord
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Address</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Properties</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-16">
                    <UserCheck className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-500">No landlords found</p>
                  </td>
                </tr>
              ) : paged.map(landlord => {
                const initials = landlord.name.charAt(0).toUpperCase();
                return (
                  <tr key={landlord.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    <td className="w-10 px-3 py-3">
                      <input type="checkbox" checked={selectedIds.has(landlord.id)}
                        onChange={() => toggleSelect(landlord.id)}
                        className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" />
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/landlords/${landlord.id}`} className="flex items-center gap-3 group">
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-gray-600">{initials}</span>
                        </div>
                        <p className="text-sm font-semibold text-gray-900 group-hover:text-gray-600">{landlord.name}</p>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-700">{landlord.email}</p>
                      <p className="text-xs text-gray-400">{landlord.phone}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{landlord.address || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-gray-400" /> {landlord.property_count}
                      </span>
                    </td>
                  </tr>
                );
              })}
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
              <h2 className="text-lg font-bold text-gray-900">Add Landlord</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name *</label>
                <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Email</label>
                  <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Phone</label>
                  <input type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Address</label>
                <input type="text" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notes</label>
                <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium">Cancel</button>
                <button type="submit"
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium">Add Landlord</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
