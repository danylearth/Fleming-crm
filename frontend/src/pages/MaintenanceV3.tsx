import { useState, useEffect } from 'react';
import V3Layout from '../components/V3Layout';
import { Card, GlassCard, Button, SearchBar, Input, Select, EmptyState } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { Plus, X, AlertCircle, Clock, CheckCircle2, Wrench, MapPin, ChevronDown, ChevronUp } from 'lucide-react';

interface MaintenanceItem {
  id: number;
  property_id: number;
  address: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  reported_date: string;
  resolved_date: string | null;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-blue-500/20 text-blue-400',
  medium: 'bg-amber-500/20 text-amber-400',
  high: 'bg-orange-500/20 text-orange-400',
  urgent: 'bg-red-500/20 text-red-400',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-500/20 text-red-400',
  in_progress: 'bg-amber-500/20 text-amber-400',
  resolved: 'bg-emerald-500/20 text-emerald-400',
};

const STATUS_LABELS: Record<string, string> = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved' };
const PRIORITY_LABELS: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };

export default function MaintenanceV3() {
  const api = useApi();
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ property_id: '', address: '', title: '', description: '', priority: 'medium', status: 'open' });

  const load = async () => {
    try {
      const data = await api.get('/api/maintenance');
      setItems(Array.isArray(data) ? data : data.items || []);
    } catch { setItems([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const counts = {
    open: items.filter(i => i.status === 'open').length,
    in_progress: items.filter(i => i.status === 'in_progress').length,
    resolved: items.filter(i => i.status === 'resolved').length,
  };

  const filtered = items.filter(i => {
    if (filterStatus !== 'all' && i.status !== filterStatus) return false;
    if (filterPriority !== 'all' && i.priority !== filterPriority) return false;
    if (search && !i.title.toLowerCase().includes(search.toLowerCase()) && !i.address?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const updateStatus = async (id: number, status: string) => {
    try { await api.put(`/api/maintenance/${id}`, { status }); await load(); } catch {}
  };

  const addItem = async () => {
    try {
      await api.post('/api/maintenance', { ...form, property_id: form.property_id ? Number(form.property_id) : undefined });
      setShowAdd(false);
      setForm({ property_id: '', address: '', title: '', description: '', priority: 'medium', status: 'open' });
      await load();
    } catch {}
  };

  return (
    <V3Layout title="Maintenance" breadcrumb={[{ label: 'Maintenance' }]}>
      <div className="p-4 md:p-8">
        {/* Stats Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6">
          {[
            { label: 'Open', count: counts.open, icon: <AlertCircle size={20} />, color: 'text-red-400' },
            { label: 'In Progress', count: counts.in_progress, icon: <Clock size={20} />, color: 'text-amber-400' },
            { label: 'Resolved', count: counts.resolved, icon: <CheckCircle2 size={20} />, color: 'text-emerald-400' },
          ].map(s => (
            <GlassCard key={s.label} className="p-5 flex items-center gap-4">
              <div className={`${s.color}`}>{s.icon}</div>
              <div>
                <p className="text-2xl font-bold">{s.count}</p>
                <p className="text-xs text-white/50">{s.label}</p>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 mb-6">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Search maintenance..." />
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <Select value={filterStatus} onChange={setFilterStatus} options={[
              { value: 'all', label: 'All Status' }, ...Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))
            ]} className="w-full sm:w-40" />
            <Select value={filterPriority} onChange={setFilterPriority} options={[
              { value: 'all', label: 'All Priority' }, ...Object.entries(PRIORITY_LABELS).map(([v, l]) => ({ value: v, label: l }))
            ]} className="w-full sm:w-40" />
            <Button variant="gradient" size="sm" onClick={() => setShowAdd(true)}>
              <Plus size={14} className="mr-1.5" /> Report Issue
            </Button>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="text-center text-white/30 py-16">Loading...</div>
        ) : filtered.length === 0 ? (
          <EmptyState message="No maintenance items found" icon={<Wrench size={32} />} />
        ) : (
          <div className="space-y-3">
            {filtered.map(item => (
              <Card key={item.id} className="p-5" hover onClick={() => setExpanded(expanded === item.id ? null : item.id)}>
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    item.priority === 'urgent' ? 'bg-red-500/20' : item.priority === 'high' ? 'bg-orange-500/20' : 'bg-white/[0.06]'
                  }`}>
                    <Wrench size={18} className={item.priority === 'urgent' ? 'text-red-400' : 'text-white/50'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{item.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <MapPin size={11} className="text-white/30" />
                      <span className="text-xs text-white/40 truncate">{item.address}</span>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${PRIORITY_COLORS[item.priority]}`}>
                    {PRIORITY_LABELS[item.priority] || item.priority}
                  </span>
                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[item.status]}`}>
                    {STATUS_LABELS[item.status] || item.status}
                  </span>
                  <span className="text-xs text-white/30">{new Date(item.reported_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                  {expanded === item.id ? <ChevronUp size={16} className="text-white/30" /> : <ChevronDown size={16} className="text-white/30" />}
                </div>

                {expanded === item.id && (
                  <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-3">
                    {item.description && <p className="text-sm text-white/60">{item.description}</p>}
                    {item.resolved_date && <p className="text-xs text-emerald-400">Resolved: {new Date(item.resolved_date).toLocaleDateString('en-GB')}</p>}
                    <div className="flex gap-2">
                      {item.status !== 'in_progress' && (
                        <Button variant="outline" size="sm" onClick={(e: any) => { e.stopPropagation(); updateStatus(item.id, 'in_progress'); }}>Mark In Progress</Button>
                      )}
                      {item.status !== 'resolved' && (
                        <Button variant="outline" size="sm" onClick={(e: any) => { e.stopPropagation(); updateStatus(item.id, 'resolved'); }}>Mark Resolved</Button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Add Modal */}
        {showAdd && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-50" onClick={() => setShowAdd(false)}>
            <div className="bg-[#232323] rounded-t-2xl md:rounded-2xl border border-white/[0.1] w-full md:w-[480px] max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold">Report Issue</h3>
                <button onClick={() => setShowAdd(false)} className="text-white/40 hover:text-white"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <Input label="Title" value={form.title} onChange={v => setForm(p => ({ ...p, title: v }))} placeholder="Issue title" />
                <Input label="Property Address" value={form.address} onChange={v => setForm(p => ({ ...p, address: v }))} placeholder="Address" />
                <Input label="Property ID" value={form.property_id} onChange={v => setForm(p => ({ ...p, property_id: v }))} placeholder="Property ID" />
                <Input label="Description" value={form.description} onChange={v => setForm(p => ({ ...p, description: v }))} placeholder="Describe the issue..." />
                <Select label="Priority" value={form.priority} onChange={v => setForm(p => ({ ...p, priority: v }))} options={Object.entries(PRIORITY_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
                  <Button variant="gradient" onClick={addItem} disabled={!form.title}>Report</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </V3Layout>
  );
}
