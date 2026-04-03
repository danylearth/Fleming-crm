import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { GlassCard, Button, Input, Select, Avatar, Tag, SearchBar, EmptyState, DataTable, type Column } from '../components/v3';
import BulkActions from '../components/v3/BulkActions';
import { useApi } from '../hooks/useApi';
import { Plus, X, Mail, Phone, Building2, Calendar, Search, ChevronDown, LayoutGrid, List, User, MapPin } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { usePortfolio, filterByPortfolio } from '../context/PortfolioContext';

interface Tenant {
  id: number; name: string; email: string; phone: string; property_id: number;
  property_address: string; tenancy_end_date: string; monthly_rent: number;
  status: string; nok_name: string; landlord_type?: string;
}

interface Property {
  id: number; address: string; postcode?: string; landlord_id: number; landlord_name: string;
}

interface Landlord {
  id: number; name: string;
}

// Helper component to auto-fit map bounds to markers
function MapAutoFit({ tenants, coords, properties }: {
  tenants: Tenant[]; coords: Record<number, [number, number]>; properties: Property[];
}) {
  const map = useMap();
  useEffect(() => {
    const points: [number, number][] = tenants
      .map(t => coords[t.property_id])
      .filter((c): c is [number, number] => !!c);
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => L.latLng(p[0], p[1])));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [tenants, coords]);
  return null;
}

export default function Tenants() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const api = useApi();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [landlordFilter, setLandlordFilter] = useState<number | null>(null);
  const [propertyFilter, setPropertyFilter] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', property_id: '', status: 'active', notes: '' });
  const [saving, setSaving] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [propertySearch, setPropertySearch] = useState('');
  const [propertyDropdownOpen, setPropertyDropdownOpen] = useState(false);
  const propertyDropdownRef = useRef<HTMLDivElement>(null);
  // Filter dropdown state
  const [landlordDropdownOpen, setLandlordDropdownOpen] = useState(false);
  const [landlordSearchFilter, setLandlordSearchFilter] = useState('');
  const [propertyFilterDropdownOpen, setPropertyFilterDropdownOpen] = useState(false);
  const [propertySearchFilter, setPropertySearchFilter] = useState('');
  const landlordFilterRef = useRef<HTMLDivElement>(null);
  const propertyFilterRef = useRef<HTMLDivElement>(null);
  // Map state
  const [coords, setCoords] = useState<Record<number, [number, number]>>({});
  const [hoveredTenantId, setHoveredTenantId] = useState<number | null>(null);
  const { portfolioFilter } = usePortfolio();
  // Bulk actions state
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const load = async () => {
    try {
      const [data, props, lls] = await Promise.all([
        api.get('/api/tenants'),
        api.get('/api/properties'),
        api.get('/api/landlords'),
      ]);
      setTenants(Array.isArray(data) ? data : []);
      setProperties(Array.isArray(props) ? props : []);
      setLandlords(Array.isArray(lls) ? lls : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Auto-open modal when navigated from property page
  useEffect(() => {
    const createFor = searchParams.get('createFor');
    if (createFor && properties.length > 0) {
      setForm(f => ({ ...f, property_id: createFor }));
      setShowModal(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, properties]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (propertyDropdownRef.current && !propertyDropdownRef.current.contains(e.target as Node)) setPropertyDropdownOpen(false);
      if (landlordFilterRef.current && !landlordFilterRef.current.contains(e.target as Node)) setLandlordDropdownOpen(false);
      if (propertyFilterRef.current && !propertyFilterRef.current.contains(e.target as Node)) setPropertyFilterDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Geocode property postcodes for map markers
  useEffect(() => {
    if (properties.length === 0) return;
    const postcodes = [...new Set(properties.filter(p => p.postcode).map(p => p.postcode!))];
    const newCoords: Record<number, [number, number]> = {};
    let cancelled = false;
    (async () => {
      for (const pc of postcodes) {
        if (cancelled) break;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(pc)}&country=GB&format=json&limit=1`);
          const data = await res.json();
          if (data[0]) {
            const lat = parseFloat(data[0].lat);
            const lon = parseFloat(data[0].lon);
            properties.filter(p => p.postcode === pc).forEach(p => {
              newCoords[p.id] = [lat, lon];
            });
          }
        } catch { /* skip */ }
        await new Promise(r => setTimeout(r, 300)); // rate limit
      }
      if (!cancelled) setCoords(newCoords);
    })();
    return () => { cancelled = true; };
  }, [properties]);

  // Build a set of property IDs owned by the selected landlord
  const landlordPropertyIds = landlordFilter
    ? new Set(properties.filter(p => p.landlord_id === landlordFilter).map(p => p.id))
    : null;

  const portfolioFiltered = filterByPortfolio(tenants, portfolioFilter);
  const filtered = portfolioFiltered.filter(t => {
    const matchSearch = !search || [t.name, t.email, t.phone, t.property_address]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()));
    const tStatus = t.status || 'active';
    if (statusFilter === 'new') {
      const createdDays = (Date.now() - new Date((t as any).created_at || 0).getTime()) / 86400000;
      if (createdDays > 30 || tStatus !== 'active') return false;
    } else if (statusFilter !== 'all' && tStatus !== statusFilter) return false;
    if (landlordPropertyIds && !landlordPropertyIds.has(t.property_id)) return false;
    if (propertyFilter && t.property_id !== propertyFilter) return false;
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

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedIds.length} tenant${selectedIds.length !== 1 ? 's' : ''}? This action cannot be undone.`
    );

    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await api.post('/api/tenants/bulk-delete', { ids: selectedIds });
      setSelectedIds([]);
      await load();
    } catch (e) {
      console.error('Bulk delete error:', e);
      alert('Failed to delete tenants. Please try again.');
    }
    setIsDeleting(false);
  };

  const toggleSelectTenant = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(t => t.id));
    }
  };

  return (
    <Layout title="Tenants" breadcrumb={[{ label: 'Tenants' }]}>
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
            <Plus size={16} className="mr-2" /> Add Tenant
          </Button>
        </div>

        {/* Filter dropdowns row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Landlord filter dropdown */}
          <div className="relative" ref={landlordFilterRef}>
            <button
              onClick={() => { setLandlordDropdownOpen(!landlordDropdownOpen); setPropertyFilterDropdownOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-colors ${landlordFilter
                ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--text-primary)]'
                : 'bg-[var(--bg-input)] border-[var(--border-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
            >
              <User size={14} />
              {landlordFilter ? landlords.find(l => l.id === landlordFilter)?.name || 'Landlord' : 'Landlord'}
              {landlordFilter ? (
                <X size={12} className="ml-1 hover:text-red-400" onClick={(e) => { e.stopPropagation(); setLandlordFilter(null); }} />
              ) : (
                <ChevronDown size={12} />
              )}
            </button>
            {landlordDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="p-2">
                  <input
                    type="text"
                    placeholder="Search landlords..."
                    value={landlordSearchFilter}
                    onChange={e => setLandlordSearchFilter(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
                    autoFocus
                  />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <button
                    onClick={() => { setLandlordFilter(null); setLandlordDropdownOpen(false); setLandlordSearchFilter(''); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-[var(--bg-hover)] transition-colors ${!landlordFilter ? 'text-[var(--accent)] font-medium' : 'text-[var(--text-secondary)]'
                      }`}
                  >
                    All Landlords
                  </button>
                  {landlords
                    .filter(l => l.name.toLowerCase().includes(landlordSearchFilter.toLowerCase()))
                    .map(l => (
                      <button
                        key={l.id}
                        onClick={() => { setLandlordFilter(l.id); setLandlordDropdownOpen(false); setLandlordSearchFilter(''); }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-[var(--bg-hover)] transition-colors ${landlordFilter === l.id ? 'text-[var(--accent)] font-medium' : 'text-[var(--text-secondary)]'
                          }`}
                      >
                        {l.name}
                        <span className="text-xs text-[var(--text-muted)] ml-2">
                          ({properties.filter(p => p.landlord_id === l.id).length} properties)
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Property filter dropdown */}
          <div className="relative" ref={propertyFilterRef}>
            <button
              onClick={() => { setPropertyFilterDropdownOpen(!propertyFilterDropdownOpen); setLandlordDropdownOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-colors ${propertyFilter
                ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--text-primary)]'
                : 'bg-[var(--bg-input)] border-[var(--border-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
            >
              <Building2 size={14} />
              {propertyFilter ? (properties.find(p => p.id === propertyFilter)?.address?.split(',')[0] || 'Property') : 'Property'}
              {propertyFilter ? (
                <X size={12} className="ml-1 hover:text-red-400" onClick={(e) => { e.stopPropagation(); setPropertyFilter(null); }} />
              ) : (
                <ChevronDown size={12} />
              )}
            </button>
            {propertyFilterDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-72 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="p-2">
                  <input
                    type="text"
                    placeholder="Search properties..."
                    value={propertySearchFilter}
                    onChange={e => setPropertySearchFilter(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
                    autoFocus
                  />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <button
                    onClick={() => { setPropertyFilter(null); setPropertyFilterDropdownOpen(false); setPropertySearchFilter(''); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-[var(--bg-hover)] transition-colors ${!propertyFilter ? 'text-[var(--accent)] font-medium' : 'text-[var(--text-secondary)]'
                      }`}
                  >
                    All Properties
                  </button>
                  {(landlordFilter ? properties.filter(p => p.landlord_id === landlordFilter) : properties)
                    .filter(p =>
                      p.address.toLowerCase().includes(propertySearchFilter.toLowerCase()) ||
                      (p.postcode || '').toLowerCase().includes(propertySearchFilter.toLowerCase())
                    )
                    .map(p => (
                      <button
                        key={p.id}
                        onClick={() => { setPropertyFilter(p.id); setPropertyFilterDropdownOpen(false); setPropertySearchFilter(''); }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-[var(--bg-hover)] transition-colors ${propertyFilter === p.id ? 'text-[var(--accent)] font-medium' : 'text-[var(--text-secondary)]'
                          }`}
                      >
                        <p className="truncate">{p.address}</p>
                        <p className="text-xs text-[var(--text-muted)]">{p.landlord_name}</p>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          <div className="h-5 w-px bg-[var(--border-subtle)] hidden sm:block" />

          {/* Status filter tags */}
          {[
            { key: 'all', label: `All (${tenants.length})` },
            { key: 'new', label: `New (${tenants.filter(t => { const d = new Date(t.tenancy_end_date || ''); const days = (Date.now() - new Date((t as any).created_at || 0).getTime()) / 86400000; return days <= 30 && (t.status || 'active') === 'active'; }).length})` },
            { key: 'active', label: `Active (${statusCounts['active'] || 0})` },
            { key: 'onboarding', label: `Onboarding (${statusCounts['onboarding'] || 0})` },
            { key: 'inactive', label: `Archived (${statusCounts['inactive'] || 0})` },
          ].map(f => (
            <Tag key={f.key} active={statusFilter === f.key} onClick={() => setStatusFilter(f.key)}>
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
            entityName="tenant"
            isDeleting={isDeleting}
          />
        )}

        {/* Content */}
        {loading ? (
          <div className="text-center py-16 text-[var(--text-muted)] text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <EmptyState message={search || statusFilter !== 'all' ? 'No tenants match your filters' : 'No tenants yet — add your first one'} />
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
                <span className="text-sm text-gray-400">
                  {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Select all'}
                </span>
              </div>
            )}
            <DataTable<Tenant>
              columns={[
                ...(editMode ? [{
                  key: '_select' as const, header: '', width: 'w-12',
                  render: (t: Tenant) => (
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(t.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelectTenant(t.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                    />
                  ),
                }] : []),
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
            onRowClick={(t) => !editMode && navigate(`/v3/tenants/${t.id}`)}
            />
          </>
        ) : (
          /* ===== CARD + MAP SPLIT VIEW ===== */
          <div className="flex gap-4" style={{ height: 'calc(100vh - 320px)', minHeight: '400px' }}>
            {/* Cards (left) */}
            <div className="w-1/2 overflow-y-auto space-y-3 pr-2 p-1">
              {filtered.map(t => {
                const isHov = hoveredTenantId === t.id;
                return (
                  <GlassCard
                    key={t.id}
                    onClick={() => navigate(`/v3/tenants/${t.id}`)}
                    onMouseEnter={() => setHoveredTenantId(t.id)}
                    onMouseLeave={() => setHoveredTenantId(null)}
                    className={`p-4 ${isHov ? 'outline outline-1 outline-offset-1 outline-white/40' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar name={t.name} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-sm truncate">{t.name}</h3>
                          {t.monthly_rent && (
                            <span className="text-xs font-bold bg-gradient-to-r from-orange-500 to-pink-500 bg-clip-text text-transparent shrink-0 ml-2">
                              £{t.monthly_rent.toLocaleString()}/mo
                            </span>
                          )}
                        </div>
                        <div className="mt-1 space-y-0.5">
                          {t.email && <p className="text-xs text-[var(--text-secondary)] truncate flex items-center gap-1"><Mail size={10} />{t.email}</p>}
                          {t.phone && <p className="text-xs text-[var(--text-muted)] flex items-center gap-1"><Phone size={10} />{t.phone}</p>}
                        </div>
                        {t.property_address && (
                          <p className="text-xs text-[var(--text-muted)] flex items-center gap-1 mt-1.5 truncate">
                            <MapPin size={10} className="shrink-0" />{t.property_address}
                          </p>
                        )}
                      </div>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
            {/* Map (right) */}
            <div className="w-1/2 rounded-2xl overflow-hidden border border-[var(--border-subtle)] relative z-0">
              <MapContainer
                center={[55.953, -3.188]}
                zoom={12}
                style={{ height: '100%', width: '100%' }}
                attributionControl={false}
              >
                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                <MapAutoFit tenants={filtered} coords={coords} properties={properties} />
                {filtered.map(t => {
                  const c = coords[t.property_id];
                  if (!c) return null;
                  const isHovered = hoveredTenantId === t.id;
                  return (
                    <Marker
                      key={t.id}
                      position={c}
                      icon={L.divIcon({
                        className: '',
                        html: `<div style="width:${isHovered ? 14 : 10}px;height:${isHovered ? 14 : 10}px;background:${isHovered ? '#f97316' : '#6366f1'};border-radius:50%;border:2px solid white;box-shadow:0 0 ${isHovered ? 8 : 4}px rgba(0,0,0,0.4);transition:all .2s"></div>`,
                        iconSize: [isHovered ? 14 : 10, isHovered ? 14 : 10],
                        iconAnchor: [isHovered ? 7 : 5, isHovered ? 7 : 5],
                      })}
                    >
                      <Popup>
                        <div style={{ color: '#1a1a2e', fontSize: 12 }}>
                          <strong>{t.name}</strong><br />
                          {t.property_address}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            </div>
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
    </Layout>
  );
}
