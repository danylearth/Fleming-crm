import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { GlassCard, Button, Input, Select, Tag, SearchBar, EmptyState, Avatar, SearchDropdown, PostcodeAutocomplete } from '../components/v3';
import AddressAutocomplete from '../components/v3/AddressAutocomplete';
import { useApi } from '../hooks/useApi';
import { Building2, Plus, List, Map, X, Search, ChevronDown, User } from 'lucide-react';
import PropertyMap from '../components/v3/PropertyMap';
import { usePortfolio, filterByPortfolio } from '../context/PortfolioContext';

interface Property {
  id: number; address: string; postcode: string; rent_amount: number;
  status: string; landlord_name: string; current_tenant: string | null;
  bedrooms: number; property_type: string; landlord_type?: string;
}

interface LandlordOption {
  id: number; name: string;
}

interface TenantOption {
  id: number; name: string; property_id: number;
}

const STATUSES = [
  { key: 'to_let', label: 'To Let', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { key: 'let_agreed', label: 'Let Agreed', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { key: 'full_management', label: 'Full Management', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  { key: 'rent_collection', label: 'Rent Collection', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
];

function statusStyle(s: string) {
  return STATUSES.find(st => st.key === s)?.color || 'bg-[var(--bg-hover)] text-[var(--text-muted)]';
}
function statusLabel(s: string) {
  return STATUSES.find(st => st.key === s)?.label || s;
}

export default function PropertiesV3() {
  const api = useApi();
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [landlords, setLandlords] = useState<LandlordOption[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    landlord_id: '', address: '', postcode: '', property_type: 'house', bedrooms: '1',
    rent_amount: '', status: 'to_let', service_type: '', council_tax_band: '', has_gas: false,
  });
  const [llDropOpen, setLlDropOpen] = useState(false);
  const [llSearch, setLlSearch] = useState('');
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  // Filter state
  const [landlordFilter, setLandlordFilter] = useState<number | null>(null);
  const [tenantFilter, setTenantFilter] = useState<number | null>(null);
  const { portfolioFilter } = usePortfolio();
  // Map hover state
  const [hoveredPropertyId, setHoveredPropertyId] = useState<number | null>(null);

  const load = () => {
    Promise.all([api.get('/api/properties'), api.get('/api/landlords'), api.get('/api/tenants')])
      .then(([data, lls, tns]) => {
        setProperties(Array.isArray(data) ? data : []);
        setLandlords(Array.isArray(lls) ? lls.map((l: any) => ({ id: l.id, name: l.name })) : []);
        setTenants(Array.isArray(tns) ? tns.map((t: any) => ({ id: t.id, name: t.name, property_id: t.property_id })) : []);
      })
      .catch(() => setProperties([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const portfolioFiltered = filterByPortfolio(properties, portfolioFilter);
  const filtered = portfolioFiltered.filter(p => {
    const matchSearch = !search || [p.address, p.postcode, p.landlord_name, p.current_tenant]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()));
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (landlordFilter) {
      const ll = landlords.find(l => l.id === landlordFilter);
      if (ll && p.landlord_name !== ll.name) return false;
    }
    if (tenantFilter) {
      const tn = tenants.find(t => t.id === tenantFilter);
      if (tn && tn.property_id !== p.id) return false;
    }
    return matchSearch;
  });

  const statusCounts = properties.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <V3Layout title="Properties" breadcrumb={[{ label: 'Properties' }]}>
      <div className="p-4 md:p-8 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Properties', value: properties.length, accent: true },
            { label: 'To Let', value: statusCounts['to_let'] || 0 },
            { label: 'Let Agreed', value: statusCounts['let_agreed'] || 0 },
            { label: 'Managed', value: (statusCounts['full_management'] || 0) + (statusCounts['rent_collection'] || 0) },
          ].map(s => (
            <GlassCard key={s.label} className="p-4">
              <p className="text-xs text-[var(--text-muted)]">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.accent ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                {s.value}
              </p>
            </GlassCard>
          ))}
        </div>

        {/* Search + View Toggle + Add */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1"><SearchBar value={search} onChange={setSearch} placeholder="Search properties..." /></div>
          <div className="flex items-center gap-1 bg-[var(--bg-input)] rounded-xl p-1 border border-[var(--border-input)]">
            <button onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
              <List size={16} />
            </button>
            <button onClick={() => setViewMode('map')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'map' ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
              <Map size={16} />
            </button>
          </div>
          <Button variant="gradient" onClick={() => setShowAdd(true)}>
            <Plus size={16} className="mr-2" /> Add Property
          </Button>
        </div>

        {/* Dropdown filters + Status filter */}
        <div className="flex flex-wrap items-center gap-3">
          <SearchDropdown
            icon={<User size={14} />}
            placeholder="Landlord"
            searchPlaceholder="Search landlords..."
            options={landlords.map(l => ({ id: l.id, label: l.name, subtitle: `${properties.filter(p => p.landlord_name === l.name).length} properties` }))}
            value={landlordFilter}
            onChange={setLandlordFilter}
          />
          <SearchDropdown
            icon={<User size={14} />}
            placeholder="Tenant"
            searchPlaceholder="Search tenants..."
            options={tenants.map(t => ({ id: t.id, label: t.name, subtitle: properties.find(p => p.id === t.property_id)?.address }))}
            value={tenantFilter}
            onChange={setTenantFilter}
          />

          <div className="h-5 w-px bg-[var(--border-subtle)] hidden sm:block" />

          {[
            { key: 'all', label: `All (${properties.length})` },
            ...STATUSES.map(s => ({ key: s.key, label: `${s.label} (${statusCounts[s.key] || 0})` })),
          ].map(f => (
            <Tag key={f.key} active={statusFilter === f.key} onClick={() => setStatusFilter(f.key)}>
              {f.label}
            </Tag>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-16 text-[var(--text-muted)] text-sm">Loading...</div>
        ) : viewMode === 'map' ? (
          <div className="h-[calc(100vh-320px)] rounded-2xl overflow-hidden border border-[var(--border-subtle)] flex">
            {/* Property List Sidebar */}
            <div
              className="w-96 border-r border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 overflow-y-auto"
              onMouseLeave={() => setHoveredPropertyId(null)}
            >
              <div className="p-4 space-y-2">
                {filtered.map(p => {
                  const isHovered = hoveredPropertyId === p.id;
                  const isOtherHovered = hoveredPropertyId !== null && hoveredPropertyId !== p.id;
                  return (
                    <div
                      key={p.id}
                      onMouseEnter={() => setHoveredPropertyId(p.id)}
                      onClick={() => navigate(`/v3/properties/${p.id}`)}
                      className={`bg-[var(--bg-card)] border rounded-xl p-4 hover:border-[var(--accent-orange)]/40 hover:shadow-lg transition-all cursor-pointer group ${
                        isHovered ? 'border-[var(--accent-orange)]/40 shadow-lg scale-[1.02] z-10' :
                        isOtherHovered ? 'opacity-40 border-[var(--border-subtle)]' :
                        'border-[var(--border-subtle)]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center shrink-0 transition-all ${
                          isOtherHovered ? 'opacity-50' : ''
                        }`}>
                          <Building2 size={18} className="text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold text-sm truncate transition-colors ${
                            isHovered ? 'text-[var(--accent-orange)]' : ''
                          }`}>{p.address}</p>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">{p.postcode}</p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${statusStyle(p.status)}`}>
                              {statusLabel(p.status)}
                            </span>
                            <span className="text-xs text-[var(--text-muted)]">{p.bedrooms} bed</span>
                            <span className="text-xs font-semibold text-[var(--text-primary)]">£{p.rent_amount?.toLocaleString()}/mo</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Map */}
            <div className="flex-1 relative">
              <PropertyMap
                properties={filtered}
                onPropertyClick={(id) => navigate(`/v3/properties/${id}`)}
                highlightedPropertyId={hoveredPropertyId}
              />
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState message={search || statusFilter !== 'all' ? 'No properties match your filters' : 'No properties yet — add your first one'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                  <th className="text-left py-3 px-4 font-medium">Address</th>
                  <th className="text-left py-3 px-4 font-medium hidden md:table-cell">Postcode</th>
                  <th className="text-left py-3 px-4 font-medium hidden lg:table-cell">Landlord</th>
                  <th className="text-left py-3 px-4 font-medium hidden lg:table-cell">Tenant</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-right py-3 px-4 font-medium hidden sm:table-cell">Rent</th>
                  <th className="text-left py-3 px-4 font-medium hidden md:table-cell">Type</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}
                    onClick={() => navigate(`/v3/properties/${p.id}`)}
                    className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[var(--bg-hover)] flex items-center justify-center shrink-0">
                          <Building2 size={15} className="text-[var(--text-muted)]" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{p.address}</p>
                          <p className="text-xs text-[var(--text-muted)] truncate md:hidden">{p.postcode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      <span className="text-xs text-[var(--text-muted)]">{p.postcode}</span>
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell">
                      <span className="text-xs text-[var(--text-secondary)]">{p.landlord_name || '—'}</span>
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell">
                      <span className="text-xs text-[var(--text-secondary)]">{p.current_tenant || '—'}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusStyle(p.status)}`}>
                        {statusLabel(p.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right hidden sm:table-cell">
                      <span className="text-sm font-semibold">£{p.rent_amount?.toLocaleString()}</span>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      <span className="text-xs text-[var(--text-muted)] capitalize">{p.bedrooms} bed • {p.property_type}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* Add Property Modal */}
        {showAdd && <PropertyAddModal
          landlords={landlords} form={form} setForm={setForm}
          llDropOpen={llDropOpen} setLlDropOpen={setLlDropOpen}
          llSearch={llSearch} setLlSearch={setLlSearch}
          saving={saving}
          onClose={() => { setShowAdd(false); resetForm(); }}
          onSubmit={async () => {
            setSaving(true);
            try {
              const res = await api.post('/api/properties', {
                ...form,
                landlord_id: Number(form.landlord_id),
                bedrooms: Number(form.bedrooms),
                rent_amount: Number(form.rent_amount) || 0,
                has_gas: form.has_gas,
              });
              setShowAdd(false);
              resetForm();
              navigate(`/v3/properties/${res.id}`);
            } catch (e) { console.error(e); }
            setSaving(false);
          }}
        />}
      </div>
    </V3Layout>
  );

  function resetForm() {
    setForm({ landlord_id: '', address: '', postcode: '', property_type: 'house', bedrooms: '1', rent_amount: '', status: 'to_let', service_type: '', council_tax_band: '', has_gas: false });
    setLlSearch('');
    setLlDropOpen(false);
  }
}

function PropertyAddModal({ landlords, form, setForm, llDropOpen, setLlDropOpen, llSearch, setLlSearch, saving, onClose, onSubmit, lockedLandlord }: {
  landlords: LandlordOption[];
  form: any; setForm: (fn: any) => void;
  llDropOpen: boolean; setLlDropOpen: (v: boolean) => void;
  llSearch: string; setLlSearch: (v: string) => void;
  saving: boolean; onClose: () => void; onSubmit: () => void;
  lockedLandlord?: { id: number; name: string };
}) {
  const selectedLl = lockedLandlord || landlords.find(l => l.id === Number(form.landlord_id));
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-[var(--overlay-bg)] backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[var(--bg-card)] border border-[var(--border-input)] rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-lg space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add Property</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
        </div>

        {/* Landlord selector */}
        {lockedLandlord ? (
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Landlord</label>
            <div className="bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] opacity-70">
              {lockedLandlord.name}
            </div>
          </div>
        ) : (
          <div className="relative">
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Landlord *</label>
            <button type="button" onClick={() => setLlDropOpen(!llDropOpen)}
              className="w-full flex items-center justify-between bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-sm text-left hover:border-[var(--accent-orange)]/40 transition-colors">
              <span className={selectedLl ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
                {selectedLl ? selectedLl.name : 'Select landlord...'}
              </span>
              <ChevronDown size={14} className="text-[var(--text-muted)]" />
            </button>
            {llDropOpen && (
              <div className="absolute z-50 mt-1 w-full bg-[var(--bg-card)] border border-[var(--border-input)] rounded-xl shadow-2xl overflow-hidden">
                <div className="p-2 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2 bg-[var(--bg-input)] rounded-lg px-3 py-2">
                    <Search size={14} className="text-[var(--text-muted)]" />
                    <input value={llSearch} onChange={e => setLlSearch(e.target.value)} placeholder="Search landlords..."
                      className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none" autoFocus />
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {landlords.filter(l => l.name.toLowerCase().includes(llSearch.toLowerCase())).map(l => (
                    <button key={l.id} onClick={() => { setForm((f: any) => ({ ...f, landlord_id: String(l.id) })); setLlDropOpen(false); setLlSearch(''); }}
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-[var(--bg-hover)] transition-colors truncate text-[var(--text-secondary)]">
                      {l.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="relative">
          <AddressAutocomplete
            label="Address *"
            value={form.address}
            onChange={(v: string) => setForm((f: any) => ({ ...f, address: v }))}
            onSelect={(place) => {
              setForm((f: any) => ({
                ...f,
                address: place.address,
                postcode: place.postcode || f.postcode
              }));
            }}
            placeholder="Start typing an address..."
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <PostcodeAutocomplete
              label="Postcode"
              value={form.postcode}
              onChange={(v: string) => setForm((f: any) => ({ ...f, postcode: v }))}
              onAddressSelect={(address: string) => setForm((f: any) => ({ ...f, address: address }))}
              placeholder="e.g. SW1A 1AA"
              showDropdownOnAddress={true}
            />
          </div>
          <Input label="Rent (£/month)" value={form.rent_amount} onChange={(v: string) => setForm((f: any) => ({ ...f, rent_amount: v }))} placeholder="0" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Type" value={form.property_type} onChange={(v: string) => setForm((f: any) => ({ ...f, property_type: v }))}
            options={[{ value: 'house', label: 'House' }, { value: 'flat', label: 'Flat' }, { value: 'bungalow', label: 'Bungalow' }, { value: 'studio', label: 'Studio' }, { value: 'hmo', label: 'HMO' }]} />
          <Input label="Bedrooms" value={form.bedrooms} onChange={(v: string) => setForm((f: any) => ({ ...f, bedrooms: v }))} placeholder="1" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Status" value={form.status} onChange={(v: string) => setForm((f: any) => ({ ...f, status: v }))}
            options={[{ value: 'to_let', label: 'To Let' }, { value: 'let_agreed', label: 'Let Agreed' }, { value: 'full_management', label: 'Full Management' }, { value: 'rent_collection', label: 'Rent Collection' }]} />
          <Select label="Service Type" value={form.service_type} onChange={(v: string) => setForm((f: any) => ({ ...f, service_type: v }))}
            options={[{ value: '', label: 'Select...' }, { value: 'full_management', label: 'Full Management' }, { value: 'rent_collection', label: 'Rent Collection' }, { value: 'let_only', label: 'Let Only' }]} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Council Tax Band" value={form.council_tax_band} onChange={(v: string) => setForm((f: any) => ({ ...f, council_tax_band: v }))}
            options={[{ value: '', label: 'Select...' }, ...['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(b => ({ value: b, label: `Band ${b}` }))]} />
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Gas Supply</label>
            <button type="button" onClick={() => setForm((f: any) => ({ ...f, has_gas: !f.has_gas }))}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-colors w-full ${form.has_gas
                ? 'bg-[var(--accent-orange)]/10 border-[var(--accent-orange)]/30 text-[var(--accent-orange)]'
                : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                }`}>
              <div className={`w-4 h-4 rounded-md border flex items-center justify-center ${form.has_gas ? 'bg-[var(--accent-orange)] border-[var(--accent-orange)]' : 'border-[var(--border-input)]'
                }`}>
                {form.has_gas && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5L4.5 7.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </div>
              <span className="text-sm">Has Gas</span>
            </button>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="gradient" onClick={onSubmit} disabled={saving || !form.address || !form.landlord_id}>
            {saving ? 'Creating...' : 'Create Property'}
          </Button>
        </div>
      </div>
    </div>
  );
}
