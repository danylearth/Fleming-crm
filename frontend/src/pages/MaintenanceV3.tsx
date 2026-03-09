import { useState, useEffect, useRef } from 'react';
import V3Layout from '../components/V3Layout';
import { GlassCard, Button, Input, Tag, SearchBar, EmptyState, DataTable } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { Plus, X, AlertCircle, Clock, CheckCircle2, Wrench, MapPin, ChevronDown, ChevronUp, Search, Building2 } from 'lucide-react';

interface MaintenanceItem {
  id: number; property_id: number; address: string; title: string; description: string;
  priority: string; status: string; reported_date: string; resolved_date: string | null;
  reporter_name: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  urgent: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const STATUS_MAP = [
  { key: 'open', label: 'Open', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { key: 'in_progress', label: 'In Progress', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { key: 'awaiting_parts', label: 'Awaiting Parts', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  { key: 'completed', label: 'Completed', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { key: 'closed', label: 'Closed', color: 'bg-[var(--bg-hover)] text-[var(--text-muted)]' },
];

function statusStyle(s: string) {
  return STATUS_MAP.find(st => st.key === s)?.color || 'bg-[var(--bg-hover)] text-[var(--text-muted)]';
}
function statusLabel(s: string) {
  return STATUS_MAP.find(st => st.key === s)?.label || s;
}

function formatDate(d: string) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MaintenanceV3() {
  const api = useApi();
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [properties, setProperties] = useState<{ id: number; address: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', property_id: '' });
  const [propDropOpen, setPropDropOpen] = useState(false);
  const [propSearch, setPropSearch] = useState('');

  const load = async () => {
    try {
      const [data, props] = await Promise.all([
        api.get('/api/maintenance'),
        api.get('/api/properties'),
      ]);
      setItems(Array.isArray(data) ? data : data.items || []);
      setProperties(props);
    } catch { setItems([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const statusCounts = items.reduce((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const filtered = items.filter(i => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (search && !i.title.toLowerCase().includes(search.toLowerCase()) && !i.address?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const updateStatus = async (id: number, status: string) => {
    try { await api.put(`/api/maintenance/${id}`, { status }); await load(); } catch { }
  };

  const addItem = async () => {
    try {
      const prop = properties.find(p => p.id === Number(form.property_id));
      await api.post('/api/maintenance', { ...form, property_id: Number(form.property_id), address: prop?.address || '' });
      setShowAdd(false);
      setForm({ title: '', description: '', priority: 'medium', property_id: '' });
      await load();
    } catch { }
  };

  const selectedProp = properties.find(p => p.id === Number(form.property_id));
  const PRIORITY_LABELS: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };

  return (
    <V3Layout title="Maintenance" breadcrumb={[{ label: 'Maintenance' }]}>
      <div className="p-4 md:p-8 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Issues', value: items.length, accent: true },
            { label: 'Open', value: statusCounts['open'] || 0, warn: (statusCounts['open'] || 0) > 0 },
            { label: 'In Progress', value: statusCounts['in_progress'] || 0 },
            { label: 'Completed', value: (statusCounts['completed'] || 0) + (statusCounts['closed'] || 0) },
          ].map(s => (
            <GlassCard key={s.label} className="p-4">
              <p className="text-xs text-[var(--text-muted)]">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.warn ? 'text-orange-400' : s.accent ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                {s.value}
              </p>
            </GlassCard>
          ))}
        </div>

        {/* Search + Add */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1"><SearchBar value={search} onChange={setSearch} placeholder="Search maintenance..." /></div>
          <Button variant="gradient" onClick={() => setShowAdd(true)}>
            <Plus size={16} className="mr-2" /> Report Issue
          </Button>
        </div>

        {/* Status filter */}
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'all', label: `All (${items.length})` },
            ...STATUS_MAP.map(s => ({ key: s.key, label: `${s.label} (${statusCounts[s.key] || 0})` })),
          ].map(f => (
            <Tag key={f.key} active={statusFilter === f.key} onClick={() => setStatusFilter(f.key)}>
              {f.label}
            </Tag>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-16 text-[var(--text-muted)] text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <EmptyState message={search || statusFilter !== 'all' ? 'No maintenance items match your filters' : 'No maintenance items yet'} />
        ) : (
          <DataTable<MaintenanceItem>
            columns={[
              {
                key: 'title', header: 'Title',
                render: (item) => (
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.priority === 'urgent' ? 'bg-red-500/20' : item.priority === 'high' ? 'bg-orange-500/20' : 'bg-[var(--bg-hover)]'
                      }`}>
                      <Wrench size={14} className={item.priority === 'urgent' ? 'text-red-400' : 'text-[var(--text-muted)]'} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.title}</p>
                      <p className="text-xs text-[var(--text-muted)] truncate md:hidden">{item.address}</p>
                    </div>
                  </div>
                ),
              },
              {
                key: 'property', header: 'Property', hideClass: 'hidden md:table-cell',
                render: (item) => (
                  <p className="text-xs text-[var(--text-secondary)] truncate max-w-[200px] flex items-center gap-1">
                    <MapPin size={10} className="text-[var(--text-muted)] shrink-0" />{item.address}
                  </p>
                ),
              },
              {
                key: 'reporter', header: 'Reported By', hideClass: 'hidden lg:table-cell',
                render: (item) => <span className="text-xs text-[var(--text-muted)]">{item.reporter_name || '—'}</span>,
              },
              {
                key: 'priority', header: 'Priority',
                render: (item) => (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${PRIORITY_COLORS[item.priority]}`}>
                    {PRIORITY_LABELS[item.priority] || item.priority}
                  </span>
                ),
              },
              {
                key: 'status', header: 'Status',
                render: (item) => (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusStyle(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                ),
              },
              {
                key: 'date', header: 'Date', hideClass: 'hidden sm:table-cell',
                render: (item) => <span className="text-xs text-[var(--text-muted)]">{formatDate(item.reported_date)}</span>,
              },
              {
                key: 'expand', header: '', align: 'right', width: 'w-20',
                render: (item) => expanded === item.id ? <ChevronUp size={14} className="text-[var(--text-muted)]" /> : <ChevronDown size={14} className="text-[var(--text-muted)]" />,
              },
            ]}
            data={filtered}
            rowKey={(item) => item.id}
            onRowClick={(item) => setExpanded(expanded === item.id ? null : item.id)}
            expandedId={expanded}
            expandedRow={(item) => (
              <div className="px-4 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)] space-y-3">
                {item.description && <p className="text-sm text-[var(--text-secondary)]">{item.description}</p>}
                {item.resolved_date && <p className="text-xs text-emerald-400">Resolved: {formatDate(item.resolved_date)}</p>}
                <div className="flex gap-2">
                  {item.status !== 'in_progress' && item.status !== 'completed' && item.status !== 'closed' && (
                    <Button variant="outline" size="sm" onClick={(e: any) => { e.stopPropagation(); updateStatus(item.id, 'in_progress'); }}>Mark In Progress</Button>
                  )}
                  {item.status !== 'completed' && item.status !== 'closed' && (
                    <Button variant="outline" size="sm" onClick={(e: any) => { e.stopPropagation(); updateStatus(item.id, 'completed'); }}>Mark Completed</Button>
                  )}
                </div>
              </div>
            )}
          />
        )}

        {/* Add Modal */}
        {showAdd && (
          <div className="fixed inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm flex items-end md:items-center justify-center z-50" onClick={() => setShowAdd(false)}>
            <div className="bg-[var(--bg-card)] rounded-t-2xl md:rounded-2xl border border-[var(--border-input)] w-full md:w-[480px] max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold">Report Issue</h3>
                <button onClick={() => setShowAdd(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <Input label="Title *" value={form.title} onChange={v => setForm(p => ({ ...p, title: v }))} placeholder="Issue title" />
                {/* Property selector */}
                <div className="relative">
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Property *</label>
                  <button type="button" onClick={() => setPropDropOpen(!propDropOpen)}
                    className="w-full flex items-center justify-between bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-sm text-left hover:border-[var(--accent-orange)]/40 transition-colors">
                    <span className={selectedProp ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
                      {selectedProp ? selectedProp.address : 'Select property...'}
                    </span>
                    <ChevronDown size={14} className="text-[var(--text-muted)]" />
                  </button>
                  {propDropOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-[var(--bg-card)] border border-[var(--border-input)] rounded-xl shadow-2xl overflow-hidden">
                      <div className="p-2 border-b border-[var(--border-subtle)]">
                        <div className="flex items-center gap-2 bg-[var(--bg-input)] rounded-lg px-3 py-2">
                          <Search size={14} className="text-[var(--text-muted)]" />
                          <input value={propSearch} onChange={e => setPropSearch(e.target.value)} placeholder="Search properties..."
                            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none" autoFocus />
                        </div>
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {properties.filter(p => p.address.toLowerCase().includes(propSearch.toLowerCase())).map(p => (
                          <button key={p.id} onClick={() => { setForm(f => ({ ...f, property_id: String(p.id) })); setPropDropOpen(false); setPropSearch(''); }}
                            className="w-full text-left px-3 py-2.5 text-sm hover:bg-[var(--bg-hover)] transition-colors truncate text-[var(--text-secondary)]">
                            {p.address}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <Input label="Description" value={form.description} onChange={v => setForm(p => ({ ...p, description: v }))} placeholder="Describe the issue..." />
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Priority</label>
                  <div className="flex gap-1.5">
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                      <button key={k} onClick={() => setForm(p => ({ ...p, priority: k }))}
                        className={`flex-1 text-xs py-2 rounded-lg border font-medium transition-colors ${form.priority === k ? PRIORITY_COLORS[k] + ' border-current' : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                          }`}>{v}</button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
                  <Button variant="gradient" onClick={addItem} disabled={!form.title || !form.property_id}>Report</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </V3Layout>
  );
}
