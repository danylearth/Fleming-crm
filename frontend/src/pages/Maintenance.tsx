import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { Wrench, Plus, X, AlertTriangle, Clock, CheckCircle2, Search, ChevronLeft, ChevronRight } from 'lucide-react';

interface MaintenanceRequest {
  id: number; property_id: number; reported_by: string; title: string; description: string;
  priority: string; status: string; contractor: string; cost: number; notes: string;
  address: string; landlord_name: string; created_at: string;
}
interface Property { id: number; address: string; }

const STATUS_CONFIG: Record<string, { label: string; border: string; text: string }> = {
  open:        { label: 'Open',        border: 'border-red-300',     text: 'text-red-600' },
  in_progress: { label: 'In Progress', border: 'border-amber-300',   text: 'text-amber-700' },
  completed:   { label: 'Completed',   border: 'border-emerald-300', text: 'text-emerald-700' },
  closed:      { label: 'Closed',      border: 'border-gray-300',    text: 'text-gray-600' },
};

const PRIORITY_CONFIG: Record<string, { label: string; border: string; text: string }> = {
  low:    { label: 'Low',    border: 'border-gray-300',  text: 'text-gray-600' },
  medium: { label: 'Medium', border: 'border-sky-300',   text: 'text-sky-700' },
  high:   { label: 'High',   border: 'border-amber-300', text: 'text-amber-700' },
  urgent: { label: 'Urgent', border: 'border-red-300',   text: 'text-red-600' },
};

export default function Maintenance() {
  const api = useApi();
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 10;
  const [formData, setFormData] = useState({ property_id: '', reported_by: '', title: '', description: '', priority: 'medium' });
  const [editData, setEditData] = useState({ status: '', contractor: '', cost: '', notes: '' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [reqs, props] = await Promise.all([api.get('/api/maintenance'), api.get('/api/properties')]);
      setRequests(reqs); setProperties(props);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/maintenance', { ...formData, property_id: parseInt(formData.property_id) });
      setShowModal(false); setFormData({ property_id: '', reported_by: '', title: '', description: '', priority: 'medium' }); loadData();
    } catch (err: any) { alert(err.message); }
  };

  const handleUpdate = async (id: number) => {
    try {
      await api.put(`/api/maintenance/${id}`, { ...editData, cost: editData.cost ? parseFloat(editData.cost) : null });
      setEditingId(null); loadData();
    } catch (err: any) { alert(err.message); }
  };

  const startEdit = (req: MaintenanceRequest) => {
    setEditingId(req.id);
    setEditData({ status: req.status, contractor: req.contractor || '', cost: req.cost?.toString() || '', notes: req.notes || '' });
  };

  const filtered = requests.filter(r => {
    const matchesSearch = r.title.toLowerCase().includes(search.toLowerCase()) || r.address.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || r.status === filter;
    return matchesSearch && matchesFilter;
  });

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const toggleSelect = (id: number) => { setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const toggleSelectAll = () => { if (selectedIds.size === paged.length) setSelectedIds(new Set()); else setSelectedIds(new Set(paged.map(r => r.id))); };

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none";

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Operations</p>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Maintenance</h1>
            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {requests.filter(r => r.status === 'open').length} Open
            </span>
          </div>
        </div>
        <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors">+ Log Issue</button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search..." value={search}
            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200" />
        </div>
        <div className="flex items-center gap-1 ml-auto">
          {['all', 'open', 'in_progress', 'completed'].map(s => (
            <button key={s} onClick={() => { setFilter(s); setCurrentPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filter === s ? 'bg-gray-900 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {s === 'all' ? 'All' : s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="border border-gray-200 rounded-lg overflow-hidden flex-1">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50">
                <th className="w-10 px-3 py-3"><input type="checkbox" checked={paged.length>0&&selectedIds.size===paged.length} onChange={toggleSelectAll} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" /></th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Issue</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Property</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-16"><Wrench className="w-10 h-10 text-gray-300 mx-auto mb-2" /><p className="text-sm font-medium text-gray-500">No maintenance requests</p></td></tr>
              ) : paged.map(req => {
                const pc = PRIORITY_CONFIG[req.priority] || PRIORITY_CONFIG.medium;
                const sc = STATUS_CONFIG[req.status] || STATUS_CONFIG.open;

                if (editingId === req.id) {
                  return (
                    <tr key={req.id} className="border-b border-gray-100">
                      <td colSpan={7} className="px-4 py-4">
                        <div className="grid grid-cols-4 gap-3 mb-3">
                          <div><label className="block text-xs text-gray-500 mb-1">Status</label><select value={editData.status} onChange={e => setEditData({...editData, status: e.target.value})} className={inputCls}><option value="open">Open</option><option value="in_progress">In Progress</option><option value="completed">Completed</option><option value="closed">Closed</option></select></div>
                          <div><label className="block text-xs text-gray-500 mb-1">Contractor</label><input type="text" value={editData.contractor} onChange={e => setEditData({...editData, contractor: e.target.value})} className={inputCls} /></div>
                          <div><label className="block text-xs text-gray-500 mb-1">Cost (£)</label><input type="number" value={editData.cost} onChange={e => setEditData({...editData, cost: e.target.value})} className={inputCls} /></div>
                          <div><label className="block text-xs text-gray-500 mb-1">Notes</label><input type="text" value={editData.notes} onChange={e => setEditData({...editData, notes: e.target.value})} className={inputCls} /></div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleUpdate(req.id)} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm">Save</button>
                          <button onClick={() => setEditingId(null)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm">Cancel</button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={req.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    <td className="w-10 px-3 py-3"><input type="checkbox" checked={selectedIds.has(req.id)} onChange={() => toggleSelect(req.id)} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" /></td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900">{req.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{req.description}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-700">{req.address}</p>
                      {req.reported_by && <p className="text-xs text-gray-400">By: {req.reported_by}</p>}
                    </td>
                    <td className="px-4 py-3"><span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full border ${pc.border} ${pc.text} bg-white`}>{pc.label}</span></td>
                    <td className="px-4 py-3"><span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full border ${sc.border} ${sc.text} bg-white`}>{sc.label}</span></td>
                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(req.created_at).toLocaleDateString('en-GB')}</td>
                    <td className="px-4 py-3"><button onClick={() => startEdit(req)} className="text-xs text-gray-500 hover:text-gray-900 font-medium">Update</button></td>
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

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-lg w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Log Maintenance Issue</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div><label className="block text-xs text-gray-500 mb-1">Property *</label><select value={formData.property_id} onChange={e => setFormData({...formData, property_id: e.target.value})} className={inputCls} required><option value="">Select property...</option>{properties.map(p => <option key={p.id} value={p.id}>{p.address}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">Reported By</label><input type="text" value={formData.reported_by} onChange={e => setFormData({...formData, reported_by: e.target.value})} placeholder="Tenant name or 'Inspection'" className={inputCls} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Priority</label><select value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value})} className={inputCls}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">Issue Title *</label><input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className={inputCls} required /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Description *</label><textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={3} className={inputCls} required /></div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium">Log Issue</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
