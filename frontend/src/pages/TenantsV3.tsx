import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { GlassCard, Button, Input, Select, Avatar, Tag, SearchBar, EmptyState, DataTable, type Column } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { Plus, X, Mail, Phone, Building2, Calendar, Search, ChevronDown, LayoutGrid, List } from 'lucide-react';

interface Tenant {
  id: number; name: string; email: string; phone: string; property_id: number;
  property_address: string; tenancy_end_date: string; monthly_rent: number;
  status: string; nok_name: string;
}

export default function TenantsV3() {
  const navigate = useNavigate();
  const api = useApi();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', property_id: '', status: 'active', notes: '' });
  const [saving, setSaving] = useState(false);
  const [properties, setProperties] = useState<{ id: number; address: string; postcode?: string }[]>([]);
  const [propertySearch, setPropertySearch] = useState('');
  const [propertyDropdownOpen, setPropertyDropdownOpen] = useState(false);
  const propertyDropdownRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const [data, props] = await Promise.all([
        api.get('/api/tenants'),
        api.get('/api/properties'),
      ]);
      setTenants(Array.isArray(data) ? data : []);
      setProperties(Array.isArray(props) ? props : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (propertyDropdownRef.current && !propertyDropdownRef.current.contains(e.target as Node)) setPropertyDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = tenants.filter(t => {
    const matchSearch = !search || [t.name, t.email, t.phone, t.property_address]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()));
    const tStatus = t.status || 'active';
    if (statusFilter !== 'all' && tStatus !== statusFilter) return false;
    return matchSearch;
  });

  const statusCounts = tenants.reduce((acc, t) => {
    const s = t.status || 'active';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const endingSoon = tenants.filter(t => {
    if (!t.tenancy_end_date) return false;
    const days = Math.ceil((new Date(t.tenancy_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days > 0 && days <= 60;
  }).length;

  const missingNok = tenants.filter(t => !t.nok_name && (t.status || 'active') === 'active').length;

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.post('/api/tenants', { ...form, property_id: form.property_id ? Number(form.property_id) : null });
      setShowModal(false);
      setForm({ name: '', email: '', phone: '', property_id: '', status: 'active', notes: '' });
      await load();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const selectedProperty = properties.find(p => p.id === Number(form.property_id));
  const filteredProperties = properties.filter(p =>
    p.address.toLowerCase().includes(propertySearch.toLowerCase()) ||
    (p.postcode || '').toLowerCase().includes(propertySearch.toLowerCase())
  );

  function formatDate(d: string) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <V3Layout title="Tenants" breadcrumb={[{ label: 'Tenants' }]}>
      <div className="p-4 md:p-8 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Tenants', value: tenants.length, accent: true },
            { label: 'Active', value: statusCounts['active'] || 0 },
            { label: 'Ending Soon', value: endingSoon, warn: endingSoon > 0 },
            { label: 'Missing NOK', value: missingNok, warn: missingNok > 0 },
          ].map(s => (
            <GlassCard key={s.label} className="p-4">
              <p className="text-xs text-[var(--text-muted)]">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.warn ? 'text-orange-400' : s.accent ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                {s.value}
              </p>
            </GlassCard>
          ))}
        </div>

        {/* Search + View Toggle + Add */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1"><SearchBar value={search} onChange={setSearch} placeholder="Search tenants..." /></div>
          <div className="flex items-center gap-1 bg-[var(--bg-input)] rounded-xl p-1 border border-[var(--border-input)]">
            <button onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
              <List size={16} />
            </button>
            <button onClick={() => setViewMode('card')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'card' ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
              <LayoutGrid size={16} />
            </button>
          </div>
          <Button variant="gradient" onClick={() => setShowModal(true)}>
            <Plus size={16} className="mr-2" /> Add Tenant
          </Button>
        </div>

        {/* Status filter */}
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'all', label: `All (${tenants.length})` },
            { key: 'active', label: `Active (${statusCounts['active'] || 0})` },
            { key: 'inactive', label: `Inactive (${statusCounts['inactive'] || 0})` },
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
          <EmptyState message={search || statusFilter !== 'all' ? 'No tenants match your filters' : 'No tenants yet — add your first one'} />
        ) : viewMode === 'list' ? (
          <DataTable<Tenant>
            columns={[
              {
                key: 'name', header: 'Name',
                render: (t) => (
                  <div className="flex items-center gap-3">
                    <Avatar name={t.name} size="sm" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{t.name}</p>
                      <p className="text-xs text-[var(--text-muted)] truncate md:hidden">{t.email || t.phone}</p>
                    </div>
                  </div>
                ),
              },
              {
                key: 'contact', header: 'Contact', hideClass: 'hidden md:table-cell',
                render: (t) => (
                  <div className="space-y-0.5">
                    {t.email && <p className="text-xs text-[var(--text-secondary)] truncate flex items-center gap-1"><Mail size={10} />{t.email}</p>}
                    {t.phone && <p className="text-xs text-[var(--text-muted)] flex items-center gap-1"><Phone size={10} />{t.phone}</p>}
                  </div>
                ),
              },
              {
                key: 'property', header: 'Property', hideClass: 'hidden lg:table-cell',
                render: (t) => t.property_address ? (
                  <p className="text-xs text-[var(--text-secondary)] truncate max-w-[200px] flex items-center gap-1">
                    <Building2 size={10} className="text-[var(--text-muted)] shrink-0" />{t.property_address}
                  </p>
                ) : (
                  <span className="text-xs text-[var(--text-muted)]">—</span>
                ),
              },
              {
                key: 'status', header: 'Status',
                render: (t) => {
                  const s = t.status || 'active';
                  return (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${s === 'active' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-[var(--bg-hover)] text-[var(--text-muted)] border-[var(--border-subtle)]'
                      }`}>
                      {s === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  );
                },
              },
              {
                key: 'tenancy_end', header: 'Tenancy End', hideClass: 'hidden sm:table-cell',
                render: (t) => t.tenancy_end_date ? (
                  <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                    <Calendar size={10} />{formatDate(t.tenancy_end_date)}
                  </span>
                ) : (
                  <span className="text-xs text-[var(--text-muted)]">—</span>
                ),
              },
              {
                key: 'rent', header: 'Rent', align: 'right', hideClass: 'hidden sm:table-cell',
                render: (t) => (
                  <span className="text-sm font-semibold">
                    {t.monthly_rent ? `£${t.monthly_rent.toLocaleString()}` : '—'}
                  </span>
                ),
              },
            ]}
            data={filtered}
            rowKey={(t) => t.id}
            onRowClick={(t) => navigate(`/v3/tenants/${t.id}`)}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(t => (
              <GlassCard key={t.id} onClick={() => navigate(`/v3/tenants/${t.id}`)} className="p-5">
                <div className="flex items-start gap-4">
                  <Avatar name={t.name} size="lg" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{t.name}</h3>
                    {t.email && (
                      <p className="text-xs text-[var(--text-secondary)] truncate flex items-center gap-1 mt-1">
                        <Mail size={11} /> {t.email}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  {t.property_address && (
                    <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 truncate">
                      <Building2 size={12} /> {t.property_address}
                    </p>
                  )}
                  {t.tenancy_end_date && (
                    <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
                      <Calendar size={12} /> Ends {formatDate(t.tenancy_end_date)}
                    </p>
                  )}
                </div>
                {t.monthly_rent && (
                  <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                    <span className="text-sm font-bold bg-gradient-to-r from-orange-500 to-pink-500 bg-clip-text text-transparent">
                      £{t.monthly_rent.toLocaleString()}/mo
                    </span>
                  </div>
                )}
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-[var(--overlay-bg)] backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-[var(--bg-card)] border border-[var(--border-input)] rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-md space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Tenant</h2>
              <button onClick={() => setShowModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
            </div>
            {/* Property selector */}
            <div ref={propertyDropdownRef} className="relative">
              <label className="block text-xs text-[var(--text-muted)] mb-1.5">Property <span className="text-red-400">*</span></label>
              <button type="button" onClick={() => setPropertyDropdownOpen(!propertyDropdownOpen)}
                className={`w-full flex items-center justify-between gap-2 bg-[var(--bg-input)] border rounded-xl px-3 py-2.5 text-sm text-left transition-colors ${!form.property_id ? 'border-[var(--border-input)]' : 'border-[var(--accent-orange)]/30'
                  }`}>
                {selectedProperty ? (
                  <span className="flex items-center gap-2 truncate">
                    <Building2 size={14} className="text-[var(--text-muted)] shrink-0" />
                    <span className="truncate">{selectedProperty.address}</span>
                  </span>
                ) : (
                  <span className="text-[var(--text-muted)]">Select a property...</span>
                )}
                <ChevronDown size={14} className={`text-[var(--text-muted)] shrink-0 transition-transform ${propertyDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {propertyDropdownOpen && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[var(--bg-card)] border border-[var(--border-input)] rounded-xl shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-[var(--border-subtle)]">
                    <div className="flex items-center gap-2 bg-[var(--bg-input)] rounded-lg px-2.5 py-1.5">
                      <Search size={13} className="text-[var(--text-muted)]" />
                      <input value={propertySearch} onChange={e => setPropertySearch(e.target.value)} placeholder="Search properties..."
                        className="bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none flex-1" autoFocus />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {filteredProperties.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)] px-3 py-4 text-center">No properties found</p>
                    ) : filteredProperties.map(p => (
                      <button key={p.id} onClick={() => { setForm({ ...form, property_id: String(p.id) }); setPropertyDropdownOpen(false); setPropertySearch(''); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors ${Number(form.property_id) === p.id ? 'bg-[var(--bg-hover)]' : ''
                          }`}>
                        <Building2 size={14} className="text-[var(--text-muted)] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm truncate">{p.address}</p>
                          {p.postcode && <p className="text-[10px] text-[var(--text-muted)]">{p.postcode}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Input label="Name *" value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="Full name" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} placeholder="email@example.com" type="email" />
              <Input label="Phone" value={form.phone} onChange={v => setForm({ ...form, phone: v })} placeholder="+44..." />
            </div>
            <Select label="Status" value={form.status} onChange={v => setForm({ ...form, status: v })} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button variant="gradient" onClick={handleSave} disabled={saving || !form.name.trim() || !form.property_id}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </V3Layout>
  );
}
