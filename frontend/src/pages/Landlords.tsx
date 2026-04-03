import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { GlassCard, Button, Input, Avatar, Tag, SearchBar, EmptyState, DataTable, SearchDropdown } from '../components/ui';
import BulkActions from '../components/ui/BulkActions';
import { useApi } from '../hooks/useApi';
import { Plus, X, Building2, Phone, Mail, Search, Check, LayoutGrid, List, User, AlertCircle, Briefcase } from 'lucide-react';
import { usePortfolio, filterByPortfolio } from '../context/PortfolioContext';

interface Landlord {
  id: number; name: string; email: string; phone: string;
  address: string; postcode?: string; notes: string; property_count: number;
  landlord_type?: string; entity_type?: string; company_number?: string;
}

interface Property {
  id: number; address: string; postcode: string; landlord_id: number | null;
}

interface TenantOption {
  id: number; name: string; property_id: number;
}

export default function Landlords() {
  const navigate = useNavigate();
  const api = useApi();
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [directors, setDirectors] = useState<{ id: number; landlord_id: number; name?: string; email?: string; phone?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', address: '', postcode: '', notes: '',
    landlord_type: 'external', entity_type: 'individual', company_number: ''
  });
  const [duplicateWarning, setDuplicateWarning] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
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
      const [data, props, tns, dirs] = await Promise.all([
        api.get('/api/landlords'),
        api.get('/api/properties'),
        api.get('/api/tenants'),
        api.get('/api/directors'),
      ]);
      setLandlords(data);
      setProperties(props);
      setTenants(Array.isArray(tns) ? tns.map((t: { id: number; name: string; property_id: number }) => ({ id: t.id, name: t.name, property_id: t.property_id })) : []);
      setDirectors(Array.isArray(dirs) ? dirs : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const landlordProperties = properties.reduce((acc, p) => {
    if (p.landlord_id) {
      if (!acc[p.landlord_id]) acc[p.landlord_id] = [];
      acc[p.landlord_id].push(p);
    }
    return acc;
  }, {} as Record<number, Property[]>);

  // Helper to check if a landlord matches via director
  const getMatchedDirector = (landlordId: number) => {
    if (!search) return null;
    const landlordDirectors = directors.filter(d => d.landlord_id === landlordId);
    return landlordDirectors.find(d =>
      d.name?.toLowerCase().includes(search.toLowerCase()) ||
      d.email?.toLowerCase().includes(search.toLowerCase()) ||
      d.phone?.toLowerCase().includes(search.toLowerCase())
    );
  };

  const portfolioFiltered = filterByPortfolio(landlords, portfolioFilter);
  const filtered = portfolioFiltered.filter(l => {
    // Check if search matches landlord details
    const matchesLandlord = !search || [l.name, l.email, l.phone, l.address, l.company_number]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()));

    // Check if search matches any directors for this landlord
    const matchedDirector = getMatchedDirector(l.id);
    const matchesDirector = !!matchedDirector;

    const matchSearch = matchesLandlord || matchesDirector;

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
    // Validate required fields
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Name is required';
    if (!form.email.trim()) errors.email = 'Email is required';
    if (!form.phone.trim()) errors.phone = 'Phone is required';

    // Basic email validation
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = 'Please enter a valid email address';
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setSaving(true);
    setValidationErrors({});
    setDuplicateWarning('');

    try {
      // Check for duplicates (skip if API fails)
      try {
        const params = new URLSearchParams();
        if (form.email) params.append('email', form.email);
        if (form.phone) params.append('phone', form.phone);

        const duplicates = await api.get(`/api/landlords/check-duplicates?${params}`);

        if (duplicates && duplicates.length > 0) {
          const msg = duplicates.map((d: { match_type: string; source: string; name: string }) =>
            `${d.match_type === 'email' ? 'Email' : 'Phone'} already exists in ${d.source} (${d.name})`
          ).join(', ');
          setDuplicateWarning(`This user data already exists: ${msg}`);
          setSaving(false);
          return;
        }
      } catch (dupError) {
        console.warn('Duplicate check failed, continuing anyway:', dupError);
        // Continue with save even if duplicate check fails
      }

      // Map form fields to backend schema
      const landlordData = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        address: form.postcode ? `${form.address}, ${form.postcode}` : form.address,
        company_number: form.entity_type === 'company' ? form.company_number : null,
        notes: form.notes || null
      };

      const newLandlord = await api.post('/api/landlords', landlordData);

      // Only update properties if some were selected
      if (selectedPropertyIds.length > 0) {
        // Fetch each property first, then update with new landlord_id
        for (const pid of selectedPropertyIds) {
          const property = await api.get(`/api/properties/${pid}`);
          await api.put(`/api/properties/${pid}`, {
            ...property,
            landlord_id: newLandlord.id
          });
        }
      }

      setShowModal(false);
      setForm({
        name: '', email: '', phone: '', address: '', postcode: '', notes: '',
        landlord_type: 'external', entity_type: 'individual', company_number: ''
      });
      setSelectedPropertyIds([]);
      setDuplicateWarning('');
      setValidationErrors({});

      // Force reload landlords list
      await load();
    } catch (e: unknown) {
      console.error('Save error:', e);
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      const errorMsg = err?.response?.data?.error || err?.message || 'Failed to save landlord. Please try again.';
      setDuplicateWarning(errorMsg);
    } finally {
      setSaving(false);
      // Always reload after save attempt
      await load();
    }
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
    <Layout title="Landlords" breadcrumb={[{ label: 'Landlords' }]}>
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
            variant={editMode ? "outline" : "primary"}
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
                render: (l) => {
                  const matchedDirector = getMatchedDirector(l.id);
                  return (
                    <div className="flex items-center gap-3">
                      <Avatar name={l.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{l.name}</p>
                          {matchedDirector && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 whitespace-nowrap">
                              <User size={9} />
                              via {matchedDirector.name}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-muted)] truncate md:hidden">{l.email || l.phone}</p>
                      </div>
                    </div>
                  );
                },
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
                  <div className="flex items-center gap-1 flex-wrap">
                    <Building2 size={10} className="text-[var(--text-muted)] shrink-0" />
                    <span className="text-xs text-[var(--text-secondary)] truncate max-w-[200px]">
                      {l._props.slice(0, 2).map(p => p.address).join(', ')}
                      {l._props.length > 2 && ` +${l._props.length - 2} more`}
                    </span>
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
            onRowClick={(l) => navigate(`/landlords/${l.id}`)}
          />
          </>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(l => {
              const lProps = landlordProperties[l.id] || [];
              const matchedDirector = getMatchedDirector(l.id);
              return (
                <GlassCard key={l.id} onClick={() => navigate(`/landlords/${l.id}`)} className="p-5">
                  <div className="flex items-start gap-4">
                    <Avatar name={l.name} size="lg" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm truncate">{l.name}</h3>
                        {matchedDirector && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 whitespace-nowrap">
                            <User size={9} />
                          </span>
                        )}
                      </div>
                      {matchedDirector && (
                        <p className="text-[10px] text-blue-400 mt-0.5">via {matchedDirector.name}</p>
                      )}
                      {l.email && (
                        <p className="text-xs text-[var(--text-secondary)] truncate flex items-center gap-1 mt-1">
                          <Mail size={11} /> {l.email}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <Tag>{lProps.length} {lProps.length === 1 ? 'property' : 'properties'}</Tag>
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
          <div className="bg-[var(--bg-card)] border border-[var(--border-input)] rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-3xl space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Landlord</h2>
              <button onClick={() => setShowModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
            </div>

            {/* Duplicate warning */}
            {duplicateWarning && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-500">{duplicateWarning}</p>
              </div>
            )}

            {/* Entity Type Toggle */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Entity Type *</label>
              <div className="flex items-center gap-1 bg-[var(--bg-input)] rounded-xl p-1 border border-[var(--border-input)]">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, entity_type: 'individual' })}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    form.entity_type === 'individual'
                      ? 'bg-[var(--text-primary)] text-[var(--bg-page)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  Individual
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, entity_type: 'company' })}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    form.entity_type === 'company'
                      ? 'bg-[var(--text-primary)] text-[var(--bg-page)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  Limited Company
                </button>
              </div>
            </div>

            {/* Two-column grid layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Input
                  label="Name *"
                  value={form.name}
                  onChange={v => setForm({ ...form, name: v })}
                  placeholder={form.entity_type === 'company' ? 'Company name' : 'Full name'}
                />
                {validationErrors.name && (
                  <p className="text-xs text-red-500 mt-1">{validationErrors.name}</p>
                )}
              </div>

              <div>
                <Input
                  label="Email *"
                  value={form.email}
                  onChange={v => setForm({ ...form, email: v })}
                  placeholder="email@example.com"
                  type="email"
                />
                {validationErrors.email && (
                  <p className="text-xs text-red-500 mt-1">{validationErrors.email}</p>
                )}
              </div>

              <div>
                <Input
                  label="Phone *"
                  value={form.phone}
                  onChange={v => setForm({ ...form, phone: v })}
                  placeholder="+44..."
                />
                {validationErrors.phone && (
                  <p className="text-xs text-red-500 mt-1">{validationErrors.phone}</p>
                )}
              </div>

              {/* Company Number - Only for "Limited Company" */}
              {form.entity_type === 'company' && (
                <Input
                  label="Company Number"
                  value={form.company_number}
                  onChange={v => setForm({ ...form, company_number: v })}
                  placeholder="12345678"
                />
              )}

              <div>
                <Input
                  label={form.entity_type === 'company' ? 'Registered Address' : 'Address'}
                  value={form.address}
                  onChange={v => setForm({ ...form, address: v })}
                  placeholder="Address"
                />
              </div>

              <div>
                <Input
                  label="Postcode"
                  value={form.postcode}
                  onChange={v => setForm({ ...form, postcode: v })}
                  placeholder="Postcode"
                />
              </div>
            </div>

            {/* Company helper text - Only for "Limited Company" */}
            {form.entity_type === 'company' && (
              <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <Briefcase size={16} className="text-blue-500 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-400">For limited companies, add directors from the landlord detail page after saving.</p>
              </div>
            )}

            <PropertyMultiSelect
              properties={properties}
              selected={selectedPropertyIds}
              onChange={setSelectedPropertyIds}
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button variant="gradient" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
            {selectedPropertyIds.length === 0 && (
              <p className="text-xs text-[var(--text-muted)] text-center">Optional: You can link properties later</p>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}

/* ========== Property Multi-Select Component ========== */
function PropertyMultiSelect({ properties, selected, onChange }: {
  properties: { id: number; address: string; postcode: string; landlord_id: number | null }[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showOnlyUnlinked, setShowOnlyUnlinked] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Filter by search and optionally by unlinked status
  const filtered = properties.filter(p => {
    const matchesSearch = p.address.toLowerCase().includes(search.toLowerCase()) ||
      p.postcode.toLowerCase().includes(search.toLowerCase());
    const isUnlinked = !p.landlord_id || selected.includes(p.id);
    return matchesSearch && (!showOnlyUnlinked || isUnlinked);
  });

  const toggle = (id: number) => {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };

  const selectedProps = properties.filter(p => selected.includes(p.id));
  const fullAddress = (p: Property) => p.postcode ? `${p.address}, ${p.postcode}` : p.address;

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Property (Optional)</label>
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-sm text-left hover:border-[var(--accent-orange)]/40 transition-colors">
        <span className={selected.length > 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
          {selected.length === 0 ? 'Select properties (optional)...' :
            selected.length === 1 ? fullAddress(selectedProps[0]) :
              `${selected.length} properties selected`}
        </span>
        <Search size={14} className="text-[var(--text-muted)]" />
      </button>
      {selectedProps.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selectedProps.map(p => (
            <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-[var(--accent-orange)]/10 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 rounded-lg px-2 py-1">
              <Building2 size={10} />
              <span className="truncate max-w-[180px]">{fullAddress(p)}</span>
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
            <label className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-[var(--bg-hover)]">
              <input
                type="checkbox"
                checked={showOnlyUnlinked}
                onChange={(e) => setShowOnlyUnlinked(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
              />
              <span className="text-[var(--text-secondary)]">Show only unlinked properties</span>
            </label>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] text-center py-4">
                {showOnlyUnlinked ? 'No unlinked properties found' : 'No properties found'}
              </p>
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
                    <p className="text-sm truncate">{fullAddress(p)}</p>
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
