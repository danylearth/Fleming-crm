import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { Search, ChevronLeft, ChevronRight, Users, X } from 'lucide-react';

interface LandlordBDM {
  id: number; name: string; email: string; phone: string; address: string;
  status: string; follow_up_date?: string; source?: string; notes?: string; created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; border: string; text: string }> = {
  new:             { label: 'New',             border: 'border-emerald-300', text: 'text-emerald-700' },
  contacted:       { label: 'Contacted',       border: 'border-violet-300',  text: 'text-violet-700' },
  follow_up:       { label: 'Follow Up',       border: 'border-amber-300',   text: 'text-amber-700' },
  interested:      { label: 'Interested',      border: 'border-sky-300',     text: 'text-sky-700' },
  onboarded:       { label: 'Onboarded',       border: 'border-gray-300',    text: 'text-gray-600' },
  not_interested:  { label: 'Not Interested',  border: 'border-red-300',     text: 'text-red-600' },
};

export default function LandlordsBDM() {
  const api = useApi();
  const [prospects, setProspects] = useState<LandlordBDM[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('active');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 10;
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', address: '', source: '', notes: '' });

  useEffect(() => { loadProspects(); }, []);

  const loadProspects = async () => {
    try { setProspects(await api.get('/api/landlords-bdm')); }
    catch (err) { console.error('Failed to load prospects:', err); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/landlords-bdm', formData);
      setShowForm(false); setFormData({ name: '', email: '', phone: '', address: '', source: '', notes: '' }); loadProspects();
    } catch (err: any) { alert(err.message || 'Failed to create prospect'); }
  };

  const filteredProspects = prospects.filter(p => {
    if (filter === 'active') return !['onboarded', 'not_interested'].includes(p.status);
    if (filter === 'all') return true;
    return p.status === filter;
  }).filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.email?.toLowerCase().includes(search.toLowerCase()));

  const totalPages = Math.ceil(filteredProspects.length / perPage);
  const paged = filteredProspects.slice((currentPage - 1) * perPage, currentPage * perPage);

  const toggleSelect = (id: number) => { setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const toggleSelectAll = () => { if (selectedIds.size === paged.length) setSelectedIds(new Set()); else setSelectedIds(new Set(paged.map(p => p.id))); };

  // Stats
  const statuses = ['new', 'contacted', 'follow_up', 'interested'];

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Business Development</p>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Landlords BDM</h1>
            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{filteredProspects.length} Prospects</span>
          </div>
        </div>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors">+ Add Prospect</button>
      </div>

      {/* Pipeline Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {statuses.map(status => {
          const count = prospects.filter(p => p.status === status).length;
          const cfg = STATUS_CONFIG[status];
          return (
            <div key={status} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border bg-white ${cfg.border} ${cfg.text}`}>{cfg.label}</span>
                <span className="text-xl font-bold text-gray-900">{count}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search..." value={search}
            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200" />
        </div>
        <div className="flex items-center gap-1 ml-auto">
          {['active', 'new', 'contacted', 'follow_up', 'interested', 'all'].map(f => (
            <button key={f} onClick={() => { setFilter(f); setCurrentPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filter === f ? 'bg-gray-900 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {f === 'active' ? 'Active' : f === 'all' ? 'All' : STATUS_CONFIG[f]?.label || f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 flex flex-col">
        <div className="border border-gray-200 rounded-lg overflow-hidden flex-1">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50">
                <th className="w-10 px-3 py-3"><input type="checkbox" checked={paged.length>0&&selectedIds.size===paged.length} onChange={toggleSelectAll} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" /></th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Source</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Follow Up</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-16"><Users className="w-10 h-10 text-gray-300 mx-auto mb-2" /><p className="text-sm font-medium text-gray-500">No prospects found</p></td></tr>
              ) : paged.map(prospect => {
                const cfg = STATUS_CONFIG[prospect.status] || STATUS_CONFIG.new;
                const initials = prospect.name.charAt(0).toUpperCase();
                return (
                  <tr key={prospect.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    <td className="w-10 px-3 py-3"><input type="checkbox" checked={selectedIds.has(prospect.id)} onChange={() => toggleSelect(prospect.id)} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" /></td>
                    <td className="px-4 py-3">
                      <Link to={`/landlords-bdm/${prospect.id}`} className="flex items-center gap-3 group">
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0"><span className="text-xs font-semibold text-gray-600">{initials}</span></div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 group-hover:text-gray-600">{prospect.name}</p>
                          {prospect.address && <p className="text-xs text-gray-400">{prospect.address}</p>}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3"><p className="text-sm text-gray-700">{prospect.email}</p><p className="text-xs text-gray-400">{prospect.phone}</p></td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${cfg.border} ${cfg.text} bg-white`}>{cfg.label}</span></td>
                    <td className="px-4 py-3 text-sm text-gray-500">{prospect.source || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {prospect.follow_up_date ? (
                        <span className={new Date(prospect.follow_up_date) <= new Date() ? 'text-red-600 font-medium' : ''}>
                          {new Date(prospect.follow_up_date).toLocaleDateString('en-GB')}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button onClick={() => setCurrentPage(p => Math.max(1,p-1))} disabled={currentPage===1} className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /> Previous</button>
            {Array.from({length:totalPages},(_,i)=>i+1).map(page => (
              <button key={page} onClick={() => setCurrentPage(page)} className={`w-8 h-8 text-sm font-medium rounded-lg ${page===currentPage?'bg-gray-900 text-white':'text-gray-600 hover:bg-gray-100'}`}>{page}</button>
            ))}
            <button onClick={() => setCurrentPage(p => Math.min(totalPages,p+1))} disabled={currentPage===totalPages} className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">Next <ChevronRight className="w-4 h-4" /></button>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-lg w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Add Prospect</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div><label className="block text-xs text-gray-500 mb-1">Name *</label><input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" required /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Email</label><input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Phone</label><input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Address</label><input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Source</label><input type="text" value={formData.source} onChange={e => setFormData({...formData, source: e.target.value})} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" placeholder="e.g., Referral, Website" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Notes</label><textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" rows={3} /></div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium">Add Prospect</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
