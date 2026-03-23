import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { GlassCard, Button, Input, Select, Avatar, Tag, SearchBar, EmptyState, DataTable, type Column, SearchDropdown } from '../components/v3';
import BulkActions from '../components/v3/BulkActions';
import { useApi } from '../hooks/useApi';
import { Plus, X, Building2, Phone, Mail, Search, Check, LayoutGrid, List, User } from 'lucide-react';
import { usePortfolio, filterByPortfolio } from '../context/PortfolioContext';

interface Landlord {
  id: number; name: string; email: string; phone: string;
  address: string; notes: string; property_count: number;
  landlord_type?: string;
}

interface Property {
  id: number; address: string; landlord_id: number | null;
}

interface TenantOption {
  id: number; name: string; property_id: number;
}

export default function LandlordsV3() {
  const navigate = useNavigate();
  const api = useApi();
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', notes: '', landlord_type: 'external' });
  const { portfolioFilter } = usePortfolio();
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  // Filter state
  const [tenantFilter, setTenantFilter] = useState<number | null>(null);
  const [propertyFilter, setPropertyFilter] = useState<number | null>(null);
  // Bulk actions state
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const load = async () => {
    try {
      const [data, props, tns] = await Promise.all([
        api.get('/api/landlords'),
        api.get('/api/properties'),
        api.get('/api/tenants'),
      ]);
      setLandlords(data);
      setProperties(props);
      setTenants(Array.isArray(tns) ? tns.map((t: any) => ({ id: t.id, name: t.name, property_id: t.property_id })) : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const landlordProperties = properties.reduce((acc, p) => {
    if (p.landlord_id) {
      if (!acc[p.landlord_id]) acc[p.landlord_id] = [];
      acc[p.landlord_id].push(p);
    }
    return acc;
  }, {} as Record<number, Property[]>);

  const portfolioFiltered = filterByPortfolio(landlords, portfolioFilter);
  const filtered = portfolioFiltered.filter(l => {
    const matchSearch = !search || [l.name, l.email, l.phone, l.address]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()));
    if (filter === 'active' && !(landlordProperties[l.id]?.length)) return false;
    if (filter === 'new' && (landlordProperties[l.id]?.length)) return false;
    if (tenantFilter) {
      const tn = tenants.find(t => t.id === tenantFilter);
      if (tn) {
        const propIds = (landlordProperties[l.id] || []).map(p => p.id);
        if (!propIds.includes(tn.property_id)) return false;
      }
    }
    if (propertyFilter) {
      const propIds = (landlordProperties[l.id] || []).map(p => p.id);
      if (!propIds.includes(propertyFilter)) return false;
    }
    return matchSearch;
  });

  const activeCount = landlords.filter(l => (landlordProperties[l.id]?.length || 0) > 0).length;
  const newCount = landlords.length - activeCount;
  const totalProps = properties.length;

  const handleSave = async () => {
    if (!form.name.trim() || selectedPropertyIds.length === 0) return;
    setSaving(true);
    try {
      const newLandlord = await api.post('/api/landlords', form);
      await Promise.all(selectedPropertyIds.map(pid =>
        api.put(`/api/properties/${pid}`, { landlord_id: newLandlord.id })
      ));
      setShowModal(false);
      setForm({ name: '', email: '', phone: '', address: '', notes: '', landlord_type: 'external' });
      setSelectedPropertyIds([]);
      await load();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedIds.length} landlord${selectedIds.length !== 1 ? 's' : ''}? This action cannot be undone.`
    );

    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await api.post('/api/landlords/bulk-delete', { ids: selectedIds });
      setSelectedIds([]);
      await load();
    } catch (e) {
      console.error('Bulk delete error:', e);
      alert('Failed to delete landlords. Please try again.');
    }
    setIsDeleting(false);
  };

  const toggleSelectLandlord = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(l => l.id));
    }
  };

  return (
    <V3Layout title="Landlords" breadcrumb={[{ label: 'Landlords' }]}>
      <div className="p-4 md:p-8 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Landlords', value: landlords.length, accent: true },
            { label: 'Total Properties', value: totalProps },
            { label: 'Active', value: activeCount },
            { label: 'New', value: newCount },
          ].map(s => (
            <GlassCard key={s.label} className="p-4">
              <p className="text-xs text-[var(--text-muted)]">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.accent ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                {s.value}
              </p>
            </GlassCard>
          ))}
        </div>

        {/* Search + View Toggle + Edit + Add */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1"><SearchBar value={search} onChange={setSearch} placeholder="Search landlords..." /></div>
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
          <Button
            variant={editMode ? "outline" : "secondary"}
            onClick={() => {
              setEditMode(!editMode);
              if (editMode) setSelectedIds([]);
            }}
          >
            {editMode ? 'Cancel' : 'Edit'}
          </Button>
          <Button variant="gradient" onClick={() => setShowModal(true)}>
            <Plus size={16} className="mr-2" /> Add Landlord
          </Button>
        </div>

        {/* Dropdown filters + Filter tabs */}
        <div className="flex flex-wrap items-center gap-3">
          <SearchDropdown
            icon={<User size={14} />}
            placeholder="Tenant"
            searchPlaceholder="Search tenants..."
            options={tenants.map(t => ({ id: t.id, label: t.name, subtitle: properties.find(p => p.id === t.property_id)?.address }))}
            value={tenantFilter}
            onChange={setTenantFilter}
          />
          <SearchDropdown
            icon={<Building2 size={14} />}
            placeholder="Property"
            searchPlaceholder="Search properties..."
            options={properties.map(p => ({ id: p.id, label: p.address }))}
            value={propertyFilter}
            onChange={setPropertyFilter}
          />

          <div className="h-5 w-px bg-[var(--border-subtle)] hidden sm:block" />

          {[
            { key: 'all', label: `All (${landlords.length})` },
            { key: 'active', label: `Active (${activeCount})` },
            { key: 'new', label: `New (${newCount})` },
          ].map(f => (
            <Tag key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </Tag>
          ))}
        </div>

        {/* Bulk Actions */}
        {editMode && (
          <BulkActions
            selectedIds={selectedIds}
            onClearSelection={() => setSelectedIds([])}
            onBulkDelete={handleBulkDelete}
            entityName="landlord"
            isDeleting={isDeleting}
          />
        )}

        {/* Content */}
        {loading ? (
          <div className="text-center py-16 text-[var(--text-muted)] text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <EmptyState message={search || filter !== 'all' ? 'No landlords match your filters' : 'No landlords yet — add your first one'} />
        ) : viewMode === 'list' ? (
          <>
            {editMode && (
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={selectedIds.length === filtered.length && filtered.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                />
                <span className="text-sm text-[var(--text-secondary)]">
                  {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Select all'}
                </span>
              </div>
            )}
            <DataTable<Landlord & { _props: Property[] }>
              columns={[
                ...(editMode ? [{
                  key: '_select' as const, header: '', width: 'w-12',
                  render: (l: Landlord & { _props: Property[] }) => (
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(l.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelectLandlord(l.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                    />
                  ),
                }] : []),
                {
                  key: 'name', header: 'Name',
                render: (l) => (
                  <div className="flex items-center gap-3">
                    <Avatar name={l.name} size="sm" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{l.name}</p>
                      <p className="text-xs text-[var(--text-muted)] truncate md:hidden">{l.email || l.phone}</p>
                    </div>
                  </div>
                ),
              },
              {
                key: 'contact', header: 'Contact', hideClass: 'hidden md:table-cell',
                render: (l) => (
                  <div className="space-y-0.5">
                    {l.email && <p className="text-xs text-[var(--text-secondary)] truncate flex items-center gap-1"><Mail size={10} />{l.email}</p>}
                    {l.phone && <p className="text-xs text-[var(--text-muted)] flex items-center gap-1"><Phone size={10} />{l.phone}</p>}
                  </div>
                ),
              },
              {
                key: 'address', header: 'Address', hideClass: 'hidden lg:table-cell',
                render: (l) => <p className="text-xs text-[var(--text-muted)] truncate max-w-[200px]">{l.address || '—'}</p>,
              },
              {
                key: 'properties', header: 'Properties',
                render: (l) => l._props.length > 0 ? (
                  <div className="space-y-0.5">
                    {l._props.slice(0, 2).map(p => (
                      <p key={p.id} className="text-xs text-[var(--text-secondary)] flex items-center gap-1 truncate max-w-[200px]">
                        <Building2 size={10} className="text-[var(--text-muted)] shrink-0" /> {p.address}
                      </p>
                    ))}
                    {l._props.length > 2 && <p className="text-[10px] text-[var(--text-muted)]">+{l._props.length - 2} more</p>}
                  </div>
                ) : (
                  <span className="text-xs text-amber-400">No property linked</span>
                ),
              },
              {
                key: 'count', header: '', align: 'right', width: 'w-20',
                render: (l) => <Tag>{l._props.length} {l._props.length === 1 ? 'property' : 'properties'}</Tag>,
              },
            ]}
            data={filtered.map(l => ({ ...l, _props: landlordProperties[l.id] || [] }))}
            rowKey={(l) => l.id}
            onRowClick={(l) => navigate(`/v3/landlords/${l.id}`)}
          />
          </>
        ) : (
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
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                      <Building2 size={13} />
                      <span>{lProps.length} {lProps.length === 1 ? 'property' : 'properties'}</span>
                    </div>
                    {l.phone && <Tag><Phone size={11} className="mr-1" />{l.phone}</Tag>}
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
            <Select label="Portfolio Type" value={form.landlord_type} onChange={v => setForm({ ...form, landlord_type: v })} options={[{ value: 'external', label: 'Lettings Client' }, { value: 'internal', label: 'Fleming Owned' }]} />
            <PropertyMultiSelect
              properties={properties}
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
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-sm text-left hover:border-[var(--accent-orange)]/40 transition-colors">
        <span className={selected.length > 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
          {selected.length === 0 ? 'Select properties...' :
            selected.length === 1 ? selectedProps[0]?.address :
              `${selected.length} properties selected`}
        </span>
        <Search size={14} className="text-[var(--text-muted)]" />
      </button>
      {selectedProps.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selectedProps.map(p => (
            <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-[var(--accent-orange)]/10 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 rounded-lg px-2 py-1">
              <Building2 size={10} />
              <span className="truncate max-w-[180px]">{p.address}</span>
              <button onClick={(e) => { e.stopPropagation(); toggle(p.id); }} className="ml-0.5 hover:text-white transition-colors"><X size={10} /></button>
            </span>
          ))}
        </div>
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-[var(--bg-card)] border border-[var(--border-input)] rounded-xl shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2 bg-[var(--bg-input)] rounded-lg px-3 py-2">
              <Search size={14} className="text-[var(--text-muted)]" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search properties..."
                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none" autoFocus />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] text-center py-4">No properties found</p>
            ) : filtered.map(p => {
              const isSelected = selected.includes(p.id);
              const taken = p.landlord_id && !isSelected;
              return (
                <button key={p.id} onClick={() => toggle(p.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors ${isSelected ? 'bg-[var(--accent-orange)]/5' : ''}`}>
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
