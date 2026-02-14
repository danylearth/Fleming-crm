import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { GlassCard, SearchBar, Select, StatusDot, EmptyState, Tag } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { Building2, LayoutGrid, List, ArrowRight } from 'lucide-react';
import PropertyMap from '../components/v3/PropertyMap';

interface Property {
  id: number; address: string; postcode: string; rent_amount: number;
  status: string; landlord_name: string; current_tenant: string | null;
  bedrooms: number; property_type: string;
}

export default function PropertiesV3() {
  const api = useApi();
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    api.get('/api/properties')
      .then(data => setProperties(Array.isArray(data) ? data : []))
      .catch(() => setProperties([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = properties.filter(p => {
    if (search && !p.address.toLowerCase().includes(search.toLowerCase()) && !p.postcode?.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (typeFilter !== 'all' && p.property_type !== typeFilter) return false;
    return true;
  });

  const statuses = ['all', ...Array.from(new Set(properties.map(p => p.status).filter(Boolean)))];
  const types = ['all', ...Array.from(new Set(properties.map(p => p.property_type).filter(Boolean)))];

  if (loading) {
    return (
      <V3Layout title="Properties" breadcrumb={[{ label: 'Properties' }]}>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-[var(--border-input)] border-t-orange-500 rounded-full animate-spin" />
        </div>
      </V3Layout>
    );
  }

  return (
    <V3Layout title="Properties" breadcrumb={[{ label: 'Properties' }]}>
      <div className="flex h-full">
        {/* Left: Search + Grid/List */}
        <div className="flex-1 p-4 md:p-6 overflow-y-auto">
          {/* Search */}
          <SearchBar value={search} onChange={setSearch} placeholder="Search properties..." />

          {/* Filters + View Toggle */}
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              options={statuses.map(s => ({ value: s, label: s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1) }))}
              className="w-full sm:w-40"
            />
            <Select
              value={typeFilter}
              onChange={setTypeFilter}
              options={types.map(t => ({ value: t, label: t === 'all' ? 'All Types' : t.charAt(0).toUpperCase() + t.slice(1) }))}
              className="w-full sm:w-40"
            />
            <div className="ml-auto flex items-center gap-1 bg-[var(--bg-input)] rounded-xl p-1">
              <button
                onClick={() => setView('grid')}
                className={`p-2 rounded-lg transition-colors ${view === 'grid' ? 'bg-[var(--bg-input)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => setView('list')}
                className={`p-2 rounded-lg transition-colors ${view === 'list' ? 'bg-[var(--bg-input)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
              >
                <List size={16} />
              </button>
            </div>
          </div>

          <p className="text-xs text-[var(--text-muted)] mt-3 mb-4">{filtered.length} properties</p>

          {/* Grid View */}
          {view === 'grid' && (
            filtered.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map(prop => (
                  <GlassCard key={prop.id} onClick={() => navigate(`/v3/properties/${prop.id}`)} className="overflow-hidden">
                    <div className="h-32 bg-gradient-to-br from-[var(--glass-from)] to-[var(--glass-to)] flex items-center justify-center">
                      <Building2 size={28} className="text-[var(--text-faint)]" />
                    </div>
                    <div className="p-4">
                      <p className="font-semibold text-sm truncate">{prop.address}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">{prop.postcode}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <StatusDot status={prop.status === 'active' ? 'active' : 'inactive'} />
                        <span className="text-xs text-[var(--text-secondary)] capitalize">{prop.status}</span>
                        <span className="text-xs text-[var(--text-muted)] ml-auto">{prop.bedrooms} bed • {prop.property_type}</span>
                      </div>
                      <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
                        <span className="text-sm font-bold bg-gradient-to-r from-orange-500 to-pink-500 bg-clip-text text-transparent">
                          £{prop.rent_amount?.toLocaleString()}/mo
                        </span>
                        <ArrowRight size={14} className="text-[var(--text-muted)]" />
                      </div>
                      <div className="mt-2 space-y-0.5">
                        {prop.landlord_name && <p className="text-xs text-[var(--text-muted)]">Landlord: {prop.landlord_name}</p>}
                        {prop.current_tenant && <p className="text-xs text-[var(--text-muted)]">Tenant: {prop.current_tenant}</p>}
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            ) : (
              <EmptyState message="No properties match your filters" />
            )
          )}

          {/* List View */}
          {view === 'list' && (
            filtered.length ? (
              <div className="space-y-2">
                {filtered.map(prop => (
                  <div
                    key={prop.id}
                    onClick={() => navigate(`/v3/properties/${prop.id}`)}
                    className="flex items-center gap-4 p-4 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors border border-[var(--border-subtle)]"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[var(--bg-hover)] flex items-center justify-center shrink-0">
                      <Building2 size={18} className="text-[var(--text-muted)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{prop.address}</p>
                      <p className="text-xs text-[var(--text-muted)]">{prop.postcode}</p>
                    </div>
                    <span className="text-xs text-[var(--text-muted)] capitalize">{prop.property_type}</span>
                    <StatusDot status={prop.status === 'active' ? 'active' : 'inactive'} />
                    <span className="text-sm font-semibold w-24 text-right">£{prop.rent_amount?.toLocaleString()}</span>
                    <ArrowRight size={14} className="text-[var(--text-faint)]" />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No properties match your filters" />
            )
          )}
        </div>

        {/* Right: Map */}
        <div className="hidden lg:block w-80 xl:w-96 border-l border-[var(--border-subtle)]">
          <PropertyMap properties={filtered} onPropertyClick={(id) => navigate(`/v3/properties/${id}`)} />
        </div>
      </div>
    </V3Layout>
  );
}
