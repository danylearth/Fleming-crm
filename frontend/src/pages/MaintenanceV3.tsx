import { useState, useEffect, useRef } from 'react';
import V3Layout from '../components/V3Layout';
import { Card, GlassCard, Button, Input, EmptyState } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { Plus, X, AlertCircle, Clock, CheckCircle2, Wrench, MapPin, ChevronDown, ChevronUp, Search, Building2, Users, UserCircle, Tag } from 'lucide-react';

interface MaintenanceItem {
  id: number; property_id: number; address: string; title: string; description: string;
  priority: string; status: string; reported_date: string; resolved_date: string | null;
}

const PRIORITY_COLORS: Record<string, string> = { low: 'bg-blue-500/20 text-blue-400', medium: 'bg-amber-500/20 text-amber-400', high: 'bg-orange-500/20 text-orange-400', urgent: 'bg-red-500/20 text-red-400' };
const STATUS_COLORS: Record<string, string> = { open: 'bg-red-500/20 text-red-400', in_progress: 'bg-amber-500/20 text-amber-400', resolved: 'bg-emerald-500/20 text-emerald-400' };
const STATUS_LABELS: Record<string, string> = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved' };
const PRIORITY_LABELS: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
const ISSUE_TYPES = ['plumbing', 'electrical', 'structural', 'heating', 'pest_control', 'appliance', 'damp_mould', 'garden', 'security', 'other'];

/* ========== Filter Dropdown ========== */
function FilterDropdown({ icon: Icon, label, value, displayValue, onClear, items, onSelect }: {
  icon: any; label: string; value: number | string | null; displayValue?: string;
  onClear: () => void; items: { id: number | string; label: string }[]; onSelect: (id: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const filtered = items.filter(i => i.label.toLowerCase().includes(search.toLowerCase()));
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
          value ? 'bg-[var(--accent-orange)]/10 border-[var(--accent-orange)]/30 text-[var(--accent-orange)]'
            : 'bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
        }`}>
        <Icon size={14} />
        <span className="max-w-[120px] truncate">{value ? displayValue : label}</span>
        {value ? <X size={12} className="hover:text-white" onClick={e => { e.stopPropagation(); onClear(); }} />
          : <ChevronDown size={12} className={open ? 'rotate-180' : ''} />}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-64 bg-[var(--bg-card)] border border-[var(--border-input)] rounded-xl shadow-2xl overflow-hidden right-0">
          <div className="p-2 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2 bg-[var(--bg-input)] rounded-lg px-3 py-2">
              <Search size={14} className="text-[var(--text-muted)]" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${label.toLowerCase()}...`}
                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none" autoFocus />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? <p className="text-xs text-[var(--text-muted)] text-center py-4">No results</p>
              : filtered.map(i => (
                <button key={i.id} onClick={() => { onSelect(i.id); setOpen(false); setSearch(''); }}
                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-[var(--bg-hover)] transition-colors truncate ${value === i.id ? 'text-[var(--accent-orange)]' : 'text-[var(--text-secondary)]'}`}>
                  {i.label}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterTags({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => (
        <button key={o.key} onClick={() => onChange(o.key)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            value === o.key ? 'bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/30'
              : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-subtle)] hover:text-[var(--text-secondary)]'
          }`}>{o.label}</button>
      ))}
    </div>
  );
}

export default function MaintenanceV3() {
  const api = useApi();
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [properties, setProperties] = useState<{ id: number; address: string; landlord_id: number | null }[]>([]);
  const [landlords, setLandlords] = useState<{ id: number; name: string }[]>([]);
  const [tenants, setTenants] = useState<{ id: number; name: string; property_id: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterProperty, setFilterProperty] = useState<number | null>(null);
  const [filterLandlord, setFilterLandlord] = useState<number | null>(null);
  const [filterTenant, setFilterTenant] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', status: 'open', property_id: '' });
  const [propDropOpen, setPropDropOpen] = useState(false);
  const [propSearch, setPropSearch] = useState('');

  const load = async () => {
    try {
      const [data, props, lands, tens] = await Promise.all([
        api.get('/api/maintenance'), api.get('/api/properties'), api.get('/api/landlords'), api.get('/api/tenants'),
      ]);
      setItems(Array.isArray(data) ? data : data.items || []);
      setProperties(props); setLandlords(lands); setTenants(tens);
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
    if (filterProperty && i.property_id !== filterProperty) return false;
    if (filterLandlord) {
      const landlordPropertyIds = properties.filter(p => p.landlord_id === filterLandlord).map(p => p.id);
      if (!landlordPropertyIds.includes(i.property_id)) return false;
    }
    if (filterTenant) {
      const tenantPropId = tenants.find(t => t.id === filterTenant)?.property_id;
      if (i.property_id !== tenantPropId) return false;
    }
    return true;
  });

  const updateStatus = async (id: number, status: string) => {
    try { await api.put(`/api/maintenance/${id}`, { status }); await load(); } catch {}
  };

  const addItem = async () => {
    try {
      const prop = properties.find(p => p.id === Number(form.property_id));
      await api.post('/api/maintenance', { ...form, property_id: Number(form.property_id), address: prop?.address || '' });
      setShowAdd(false);
      setForm({ title: '', description: '', priority: 'medium', status: 'open', property_id: '' });
      await load();
    } catch {}
  };

  const hasFilters = filterProperty || filterLandlord || filterTenant || filterType;
  const selectedProp = properties.find(p => p.id === Number(form.property_id));

  return (
    <V3Layout title="Maintenance" breadcrumb={[{ label: 'Maintenance' }]}>
      <div className="p-4 md:p-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          {[
            { label: 'Open', count: counts.open, icon: <AlertCircle size={20} />, color: 'text-red-400' },
            { label: 'In Progress', count: counts.in_progress, icon: <Clock size={20} />, color: 'text-amber-400' },
            { label: 'Resolved', count: counts.resolved, icon: <CheckCircle2 size={20} />, color: 'text-emerald-400' },
          ].map(s => (
            <GlassCard key={s.label} className="p-5 flex items-center gap-4">
              <div className={s.color}>{s.icon}</div>
              <div>
                <p className="text-2xl font-bold">{s.count}</p>
                <p className="text-xs text-[var(--text-secondary)]">{s.label}</p>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5">
                <Search size={16} className="text-[var(--text-muted)]" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search maintenance..."
                  className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none" />
                {search && <button onClick={() => setSearch('')}><X size={14} className="text-[var(--text-muted)]" /></button>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <FilterDropdown icon={Building2} label="Property" value={filterProperty}
                displayValue={properties.find(p => p.id === filterProperty)?.address}
                onClear={() => setFilterProperty(null)}
                items={properties.map(p => ({ id: p.id, label: p.address }))}
                onSelect={id => setFilterProperty(id)} />
              <FilterDropdown icon={UserCircle} label="Landlord" value={filterLandlord}
                displayValue={landlords.find(l => l.id === filterLandlord)?.name}
                onClear={() => setFilterLandlord(null)}
                items={landlords.map(l => ({ id: l.id, label: l.name }))}
                onSelect={id => setFilterLandlord(id)} />
              <FilterDropdown icon={Users} label="Tenant" value={filterTenant}
                displayValue={tenants.find(t => t.id === filterTenant)?.name}
                onClear={() => setFilterTenant(null)}
                items={tenants.map(t => ({ id: t.id, label: t.name }))}
                onSelect={id => setFilterTenant(id)} />
              <FilterDropdown icon={Tag} label="Type" value={filterType}
                displayValue={filterType ? filterType.replace('_', ' ').replace(/^\w/, c => c.toUpperCase()) : undefined}
                onClear={() => setFilterType(null)}
                items={ISSUE_TYPES.map(t => ({ id: t, label: t.replace('_', ' ').replace(/^\w/, c => c.toUpperCase()) }))}
                onSelect={id => setFilterType(id)} />
              <Button variant="gradient" onClick={() => setShowAdd(true)}>
                <Plus size={14} className="mr-1.5" /> Report Issue
              </Button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <FilterTags options={[{ key: 'all', label: 'All Status' }, ...Object.entries(STATUS_LABELS).map(([k, v]) => ({ key: k, label: v }))]}
              value={filterStatus} onChange={setFilterStatus} />
            <div className="hidden sm:block w-px h-5 bg-[var(--border-subtle)]" />
            <FilterTags options={[{ key: 'all', label: 'All Priority' }, ...Object.entries(PRIORITY_LABELS).map(([k, v]) => ({ key: k, label: v }))]}
              value={filterPriority} onChange={setFilterPriority} />
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="text-center text-[var(--text-muted)] py-16">Loading...</div>
        ) : filtered.length === 0 ? (
          <EmptyState message={hasFilters || search ? 'No maintenance items match your filters' : 'No maintenance items yet'} icon={<Wrench size={32} />} />
        ) : (
          <div className="space-y-3">
            {filtered.map(item => (
              <Card key={item.id} className="p-5" hover onClick={() => setExpanded(expanded === item.id ? null : item.id)}>
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    item.priority === 'urgent' ? 'bg-red-500/20' : item.priority === 'high' ? 'bg-orange-500/20' : 'bg-[var(--bg-hover)]'
                  }`}>
                    <Wrench size={18} className={item.priority === 'urgent' ? 'text-red-400' : 'text-[var(--text-secondary)]'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{item.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <MapPin size={11} className="text-[var(--text-muted)]" />
                      <span className="text-xs text-[var(--text-muted)] truncate">{item.address}</span>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${PRIORITY_COLORS[item.priority]}`}>
                    {PRIORITY_LABELS[item.priority] || item.priority}
                  </span>
                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[item.status]}`}>
                    {STATUS_LABELS[item.status] || item.status}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">{new Date(item.reported_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                  {expanded === item.id ? <ChevronUp size={16} className="text-[var(--text-muted)]" /> : <ChevronDown size={16} className="text-[var(--text-muted)]" />}
                </div>
                {expanded === item.id && (
                  <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] space-y-3">
                    {item.description && <p className="text-sm text-[var(--text-secondary)]">{item.description}</p>}
                    {item.resolved_date && <p className="text-xs text-emerald-400">Resolved: {new Date(item.resolved_date).toLocaleDateString('en-GB')}</p>}
                    <div className="flex gap-2">
                      {item.status !== 'in_progress' && item.status !== 'resolved' && (
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
          <div className="fixed inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm flex items-end md:items-center justify-center z-50" onClick={() => setShowAdd(false)}>
            <div className="bg-[var(--bg-card)] rounded-t-2xl md:rounded-2xl border border-[var(--border-input)] w-full md:w-[480px] max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold">Report Issue</h3>
                <button onClick={() => setShowAdd(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <Input label="Title" value={form.title} onChange={v => setForm(p => ({ ...p, title: v }))} placeholder="Issue title" />
                
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
                        className={`flex-1 text-xs py-2 rounded-lg border font-medium transition-colors ${
                          form.priority === k ? PRIORITY_COLORS[k] + ' border-current' : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-muted)]'
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
