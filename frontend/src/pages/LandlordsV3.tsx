import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { GlassCard, Button, Input, Avatar, Tag, SearchBar, EmptyState } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { Plus, X, Building2, Phone, Mail, ChevronDown, Search, Check, LayoutGrid, List, Users } from 'lucide-react';

interface Landlord {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  property_count: number;
}

interface Property {
  id: number;
  address: string;
  landlord_id: number | null;
  type?: string;
  status?: string;
}

interface Tenant {
  id: number;
  name: string;
  property_id: number | null;
}

export default function LandlordsV3() {
  const navigate = useNavigate();
  const api = useApi();
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState<number | null>(null);
  const [tenantFilter, setTenantFilter] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', notes: '' });
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('list');

  const load = async () => {
    try {
      const [data, props, tens] = await Promise.all([
        api.get('/api/landlords'),
        api.get('/api/properties'),
        api.get('/api/tenants'),
      ]);
      setLandlords(data);
      setProperties(props);
      setTenants(tens);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Build a map of landlord → their properties
  const landlordProperties = properties.reduce((acc, p) => {
    if (p.landlord_id) {
      if (!acc[p.landlord_id]) acc[p.landlord_id] = [];
      acc[p.landlord_id].push(p);
    }
    return acc;
  }, {} as Record<number, Property[]>);

  // Build tenant → property → landlord mapping
  const tenantPropertyMap = tenants.reduce((acc, t) => {
    if (t.property_id) acc[t.id] = t.property_id;
    return acc;
  }, {} as Record<number, number>);

  // Property → landlord
  const propertyLandlordMap = properties.reduce((acc, p) => {
    if (p.landlord_id) acc[p.id] = p.landlord_id;
    return acc;
  }, {} as Record<number, number>);

  const filtered = landlords.filter(l => {
    const matchSearch = !search ||
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.email?.toLowerCase().includes(search.toLowerCase()) ||
      landlordProperties[l.id]?.some(p => p.address.toLowerCase().includes(search.toLowerCase()));

    const matchProperty = !propertyFilter ||
      landlordProperties[l.id]?.some(p => p.id === propertyFilter);

    const matchTenant = !tenantFilter || (() => {
      const tPropId = tenantPropertyMap[tenantFilter];
      if (!tPropId) return false;
      return propertyLandlordMap[tPropId] === l.id;
    })();

    return matchSearch && matchProperty && matchTenant;
  });

  const handleSave = async () => {
    if (!form.name.trim() || selectedPropertyIds.length === 0) return;
    setSaving(true);
    try {
      const newLandlord = await api.post('/api/landlords', form);
      // Link selected properties to this landlord
      await Promise.all(selectedPropertyIds.map(pid =>
        api.put(`/api/properties/${pid}`, { landlord_id: newLandlord.id })
      ));
      setShowModal(false);
      setForm({ name: '', email: '', phone: '', address: '', notes: '' });
      setSelectedPropertyIds([]);
      await load();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  // Properties not yet assigned to a landlord (or all, since they can reassign)
  const availableProperties = properties;

  return (
    <V3Layout title="Landlords" breadcrumb={[{ label: 'Landlords' }]}>
      <div className="p-4 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Search landlords..." />
          </div>
          <div className="flex items-center gap-2">
            <FilterDropdown
              icon={Building2}
              label="Property"
              value={propertyFilter}
              displayValue={properties.find(p => p.id === propertyFilter)?.address}
              onClear={() => setPropertyFilter(null)}
              items={properties.map(p => ({ id: p.id, label: p.address }))}
              onSelect={id => setPropertyFilter(id)}
            />
            <FilterDropdown
              icon={Users}
              label="Tenant"
              value={tenantFilter}
              displayValue={tenants.find(t => t.id === tenantFilter)?.name}
              onClear={() => setTenantFilter(null)}
              items={tenants.map(t => ({ id: t.id, label: t.name }))}
              onSelect={id => setTenantFilter(id)}
            />
            <div className="flex items-center bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-1">
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
              <Plus size={16} className="mr-2" /> Add Landlord
            </Button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-16 text-[var(--text-muted)] text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <EmptyState message={search ? 'No landlords match your search' : 'No landlords yet. Add your first one!'} />
        ) : viewMode === 'list' ? (
          /* ==================== LIST VIEW ==================== */
          <GlassCard className="overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  {['Name', 'Contact', 'Properties', 'Address', ''].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => {
                  const lProps = landlordProperties[l.id] || [];
                  return (
                    <tr key={l.id} onClick={() => navigate(`/v3/landlords/${l.id}`)}
                      className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] cursor-pointer transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={l.name} size="sm" />
                          <span className="text-sm font-medium">{l.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-0.5">
                          {l.email && <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1"><Mail size={11} /> {l.email}</p>}
                          {l.phone && <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1"><Phone size={11} /> {l.phone}</p>}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {lProps.length > 0 ? (
                          <div className="space-y-0.5">
                            {lProps.slice(0, 2).map(p => (
                              <p key={p.id} className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5 truncate max-w-[250px]">
                                <Building2 size={11} className="text-[var(--text-muted)] shrink-0" /> {p.address}
                              </p>
                            ))}
                            {lProps.length > 2 && <p className="text-[10px] text-[var(--text-muted)]">+{lProps.length - 2} more</p>}
                          </div>
                        ) : (
                          <span className="text-xs text-amber-400">No property linked</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-xs text-[var(--text-secondary)] truncate max-w-[200px]">{l.address || '—'}</p>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Tag>{lProps.length} {lProps.length === 1 ? 'property' : 'properties'}</Tag>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </GlassCard>
        ) : (
          /* ==================== CARD VIEW ==================== */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(l => {
              const lProps = landlordProperties[l.id] || [];
              return (
                <GlassCard key={l.id} onClick={() => navigate(`/v3/landlords/${l.id}`)} className="p-5">
                  <div className="flex items-start gap-4">
                    <Avatar name={l.name} size="lg" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{l.name}</h3>
                      {l.email && (
                        <p className="text-xs text-[var(--text-secondary)] truncate flex items-center gap-1 mt-1">
                          <Mail size={11} /> {l.email}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {lProps.length > 0 ? (
                      lProps.slice(0, 3).map(p => (
                        <div key={p.id} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                          <Building2 size={12} className="text-[var(--text-muted)] shrink-0" />
                          <span className="truncate">{p.address}</span>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-amber-400">
                        <Building2 size={12} className="shrink-0" />
                        <span>No property linked</span>
                      </div>
                    )}
                    {lProps.length > 3 && (
                      <p className="text-xs text-[var(--text-muted)] pl-5">+{lProps.length - 3} more</p>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                      <Building2 size={13} />
                      <span>{lProps.length} {lProps.length === 1 ? 'property' : 'properties'}</span>
                    </div>
                    {l.phone && (
                      <Tag><Phone size={11} className="mr-1" />{l.phone}</Tag>
                    )}
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Landlord Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-[var(--overlay-bg)] backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-[var(--bg-card)] border border-[var(--border-input)] rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-md space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Landlord</h2>
              <button onClick={() => setShowModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
            </div>
            <Input label="Name *" value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="Full name" />
            <Input label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} placeholder="email@example.com" type="email" />
            <Input label="Phone" value={form.phone} onChange={v => setForm({ ...form, phone: v })} placeholder="+44..." />
            <Input label="Address" value={form.address} onChange={v => setForm({ ...form, address: v })} placeholder="Address" />

            {/* Property Selection — required */}
            <PropertyMultiSelect
              properties={availableProperties}
              selected={selectedPropertyIds}
              onChange={setSelectedPropertyIds}
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button variant="gradient" onClick={handleSave} disabled={saving || !form.name.trim() || selectedPropertyIds.length === 0}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
            {selectedPropertyIds.length === 0 && (
              <p className="text-xs text-amber-400 text-center">At least one property is required</p>
            )}
          </div>
        </div>
      )}
    </V3Layout>
  );
}

/* ========== Property Multi-Select Component ========== */
/* ========== Filter Dropdown Component ========== */
function FilterDropdown({ icon: Icon, label, value, displayValue, onClear, items, onSelect }: {
  icon: any; label: string; value: number | null; displayValue?: string;
  onClear: () => void; items: { id: number; label: string }[]; onSelect: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = items.filter(i => i.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
          value
            ? 'bg-[var(--accent-orange)]/10 border-[var(--accent-orange)]/30 text-[var(--accent-orange)]'
            : 'bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
        }`}
      >
        <Icon size={14} />
        <span className="max-w-[120px] truncate">{value ? displayValue : label}</span>
        {value ? (
          <X size={12} className="hover:text-white" onClick={e => { e.stopPropagation(); onClear(); }} />
        ) : (
          <ChevronDown size={12} className={open ? 'rotate-180' : ''} />
        )}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-64 bg-[var(--bg-card)] border border-[var(--border-input)] rounded-xl shadow-2xl overflow-hidden right-0">
          <div className="p-2 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2 bg-[var(--bg-input)] rounded-lg px-3 py-2">
              <Search size={14} className="text-[var(--text-muted)]" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none" autoFocus />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] text-center py-4">No results</p>
            ) : filtered.map(i => (
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

/* ========== Property Multi-Select Component ========== */
function PropertyMultiSelect({ properties, selected, onChange }: {
  properties: { id: number; address: string; landlord_id: number | null }[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = properties.filter(p =>
    p.address.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: number) => {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };

  const selectedProps = properties.filter(p => selected.includes(p.id));

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Property *</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-sm text-left hover:border-[var(--accent-orange)]/40 transition-colors"
      >
        <span className={selected.length > 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
          {selected.length === 0 ? 'Select properties...' :
           selected.length === 1 ? selectedProps[0]?.address :
           `${selected.length} properties selected`}
        </span>
        <ChevronDown size={14} className={`text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Selected chips */}
      {selectedProps.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selectedProps.map(p => (
            <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-[var(--accent-orange)]/10 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 rounded-lg px-2 py-1">
              <Building2 size={10} />
              <span className="truncate max-w-[180px]">{p.address}</span>
              <button onClick={(e) => { e.stopPropagation(); toggle(p.id); }}
                className="ml-0.5 hover:text-white transition-colors">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-[var(--bg-card)] border border-[var(--border-input)] rounded-xl shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2 bg-[var(--bg-input)] rounded-lg px-3 py-2">
              <Search size={14} className="text-[var(--text-muted)]" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search properties..."
                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] text-center py-4">No properties found</p>
            ) : filtered.map(p => {
              const isSelected = selected.includes(p.id);
              const taken = p.landlord_id && !isSelected;
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors ${isSelected ? 'bg-[var(--accent-orange)]/5' : ''}`}
                >
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${isSelected ? 'bg-[var(--accent-orange)] border-[var(--accent-orange)]' : 'border-[var(--border-input)]'}`}>
                    {isSelected && <Check size={12} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{p.address}</p>
                    {taken && <p className="text-[10px] text-amber-400">Already assigned to another landlord</p>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
