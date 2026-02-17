import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { GlassCard, Button, Input, Select, Avatar, Tag, StatusDot, SearchBar, EmptyState } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { Plus, X, Mail, Building2, Calendar, Search, ChevronDown, Users } from 'lucide-react';

interface Tenant {
  id: number; name: string; email: string; phone: string; property_id: number;
  property_address: string; move_in_date: string; status: string; notes: string;
}

interface Property {
  id: number; address: string; postcode?: string; property_type?: string; landlord_id?: number;
}

interface Landlord {
  id: number; name: string; email?: string;
}

function FilterDropdown({ label, icon, value, displayValue, onClear, children }: {
  label: string; icon: React.ReactNode; value: string | number | null;
  displayValue: string; onClear: () => void; children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors border ${
          value ? 'bg-[var(--accent-orange)]/10 border-[var(--accent-orange)]/30 text-[var(--text-primary)]' : 'bg-[var(--bg-input)] border-[var(--border-input)] text-[var(--text-muted)]'
        }`}>
        {icon}
        <span className="truncate max-w-[140px]">{value ? displayValue : label}</span>
        {value ? (
          <button onClick={e => { e.stopPropagation(); onClear(); }} className="hover:text-[var(--text-primary)]"><X size={12} /></button>
        ) : (
          <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-64 bg-[var(--bg-card)] border border-[var(--border-input)] rounded-xl shadow-xl overflow-hidden">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export default function TenantsV3() {
  const navigate = useNavigate();
  const api = useApi();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', property_id: '', move_in_date: '', status: 'active', notes: '' });
  const [saving, setSaving] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [propertySearch, setPropertySearch] = useState('');
  const [propertyDropdownOpen, setPropertyDropdownOpen] = useState(false);
  const propertyDropdownRef = useRef<HTMLDivElement>(null);
  // List filters
  const [filterPropertyId, setFilterPropertyId] = useState<number | null>(null);
  const [filterLandlordId, setFilterLandlordId] = useState<number | null>(null);
  const [filterPropertySearch, setFilterPropertySearch] = useState('');
  const [filterLandlordSearch, setFilterLandlordSearch] = useState('');

  const load = async () => {
    try { setTenants(await api.get('/api/tenants')); } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    (async () => {
      try { setProperties(await api.get('/api/properties')); } catch {}
      try { setLandlords(await api.get('/api/landlords')); } catch {}
    })();
  }, []);

  // Close property dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (propertyDropdownRef.current && !propertyDropdownRef.current.contains(e.target as Node)) setPropertyDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedProperty = properties.find(p => p.id === Number(form.property_id));
  const filteredProperties = properties.filter(p =>
    p.address.toLowerCase().includes(propertySearch.toLowerCase()) ||
    (p.postcode || '').toLowerCase().includes(propertySearch.toLowerCase())
  );

  // Build a map of property_id → landlord_id
  const propertyLandlordMap = properties.reduce((acc, p) => {
    if (p.landlord_id) acc[p.id] = p.landlord_id;
    return acc;
  }, {} as Record<number, number>);

  // Properties belonging to selected landlord
  const landlordPropertyIds = filterLandlordId
    ? properties.filter(p => p.landlord_id === filterLandlordId).map(p => p.id)
    : null;

  const filtered = tenants.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) || t.email?.toLowerCase().includes(search.toLowerCase());
    const tStatus = t.status || 'active';
    const matchStatus = statusFilter === 'all' || tStatus === statusFilter;
    const matchProperty = !filterPropertyId || t.property_id === filterPropertyId;
    const matchLandlord = !landlordPropertyIds || landlordPropertyIds.includes(t.property_id);
    return matchSearch && matchStatus && matchProperty && matchLandlord;
  });

  const statusCounts = tenants.reduce((acc, t) => {
    const s = t.status || 'active';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.post('/api/tenants', { ...form, property_id: form.property_id ? Number(form.property_id) : null });
      setShowModal(false);
      setForm({ name: '', email: '', phone: '', property_id: '', move_in_date: '', status: 'active', notes: '' });
      await load();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const statusFilters = ['all', 'active', 'inactive'];

  return (
    <V3Layout title="Tenants" breadcrumb={[{ label: 'Tenants' }]}>
      <div className="p-4 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="flex-1"><SearchBar value={search} onChange={setSearch} placeholder="Search tenants..." /></div>
          <Button variant="gradient" onClick={() => setShowModal(true)}>
            <Plus size={16} className="mr-2" /> Add Tenant
          </Button>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Property filter */}
          <FilterDropdown
            label="Property"
            icon={<Building2 size={14} />}
            value={filterPropertyId}
            displayValue={properties.find(p => p.id === filterPropertyId)?.address || ''}
            onClear={() => setFilterPropertyId(null)}
          >
            {(close) => (
              <>
                <div className="p-2 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2 bg-[var(--bg-input)] rounded-lg px-2.5 py-1.5">
                    <Search size={13} className="text-[var(--text-muted)]" />
                    <input value={filterPropertySearch} onChange={e => setFilterPropertySearch(e.target.value)} placeholder="Search properties..."
                      className="bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none flex-1" autoFocus />
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {properties.filter(p => p.address.toLowerCase().includes(filterPropertySearch.toLowerCase())).map(p => (
                    <button key={p.id} onClick={() => { setFilterPropertyId(p.id); setFilterPropertySearch(''); close(); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors ${filterPropertyId === p.id ? 'bg-[var(--bg-hover)]' : ''}`}>
                      <Building2 size={14} className="text-[var(--text-muted)] shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm truncate">{p.address}</p>
                        {p.postcode && <p className="text-[10px] text-[var(--text-muted)]">{p.postcode}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </FilterDropdown>

          {/* Landlord filter */}
          <FilterDropdown
            label="Landlord"
            icon={<Users size={14} />}
            value={filterLandlordId}
            displayValue={landlords.find(l => l.id === filterLandlordId)?.name || ''}
            onClear={() => setFilterLandlordId(null)}
          >
            {(close) => (
              <>
                <div className="p-2 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2 bg-[var(--bg-input)] rounded-lg px-2.5 py-1.5">
                    <Search size={13} className="text-[var(--text-muted)]" />
                    <input value={filterLandlordSearch} onChange={e => setFilterLandlordSearch(e.target.value)} placeholder="Search landlords..."
                      className="bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none flex-1" autoFocus />
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {landlords.filter(l => l.name.toLowerCase().includes(filterLandlordSearch.toLowerCase())).map(l => (
                    <button key={l.id} onClick={() => { setFilterLandlordId(l.id); setFilterLandlordSearch(''); close(); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors ${filterLandlordId === l.id ? 'bg-[var(--bg-hover)]' : ''}`}>
                      <Users size={14} className="text-[var(--text-muted)] shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm truncate">{l.name}</p>
                        {l.email && <p className="text-[10px] text-[var(--text-muted)]">{l.email}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </FilterDropdown>

          <div className="w-px h-6 bg-[var(--border-subtle)] mx-1 hidden sm:block" />

          {/* Status filter pills */}
          {statusFilters.map(s => {
            const count = s === 'all' ? tenants.length : (statusCounts[s] || 0);
            return (
              <Tag key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
                {s.charAt(0).toUpperCase() + s.slice(1)} ({count})
              </Tag>
            );
          })}
        </div>

        {loading ? (
          <div className="text-center py-16 text-[var(--text-muted)] text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <EmptyState message={search || statusFilter !== 'all' ? 'No tenants match your filters' : 'No tenants yet'} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(t => (
              <GlassCard key={t.id} onClick={() => navigate(`/v3/tenants/${t.id}`)} className="p-5">
                <div className="flex items-start gap-4">
                  <Avatar name={t.name} size="lg" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm truncate">{t.name}</h3>
                      <StatusDot status={t.status === 'active' ? 'active' : 'inactive'} />
                    </div>
                    {t.email && (
                      <p className="text-xs text-[var(--text-secondary)] truncate flex items-center gap-1 mt-1">
                        <Mail size={11} /> {t.email}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 space-y-1.5">
                  {t.property_address && (
                    <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 truncate">
                      <Building2 size={12} /> {t.property_address}
                    </p>
                  )}
                  {t.move_in_date && (
                    <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
                      <Calendar size={12} /> {new Date(t.move_in_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-[var(--overlay-bg)] backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-[var(--bg-card)] border border-[var(--border-input)] rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-md space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Tenant</h2>
              <button onClick={() => setShowModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
            </div>
            {/* Property (required) */}
            <div ref={propertyDropdownRef} className="relative">
              <label className="block text-xs text-[var(--text-muted)] mb-1.5">Property <span className="text-red-400">*</span></label>
              <button type="button" onClick={() => setPropertyDropdownOpen(!propertyDropdownOpen)}
                className={`w-full flex items-center justify-between gap-2 bg-[var(--bg-input)] border rounded-xl px-3 py-2.5 text-sm text-left transition-colors ${
                  !form.property_id ? 'border-[var(--border-input)]' : 'border-[var(--accent-orange)]/30'
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
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors ${
                          Number(form.property_id) === p.id ? 'bg-[var(--bg-hover)]' : ''
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
            <Input label="Name" value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="Full name" />
            <Input label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} placeholder="email@example.com" type="email" />
            <Input label="Phone" value={form.phone} onChange={v => setForm({ ...form, phone: v })} placeholder="+44..." />
            <Input label="Move-in Date" value={form.move_in_date} onChange={v => setForm({ ...form, move_in_date: v })} placeholder="YYYY-MM-DD" />
            <Select label="Status" value={form.status} onChange={v => setForm({ ...form, status: v })} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button variant="gradient" onClick={handleSave} disabled={saving || !form.name.trim() || !form.property_id}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
              {!form.property_id && <p className="text-[10px] text-[var(--text-muted)]">Property selection required</p>}
            </div>
          </div>
        </div>
      )}
    </V3Layout>
  );
}
