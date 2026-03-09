import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { GlassCard, Button, Tag, SearchBar, EmptyState, Avatar } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { Building2, Plus, List, Map, Mail, Phone, PoundSterling, Bed } from 'lucide-react';
import PropertyMap from '../components/v3/PropertyMap';

interface Property {
  id: number; address: string; postcode: string; rent_amount: number;
  status: string; landlord_name: string; current_tenant: string | null;
  bedrooms: number; property_type: string;
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

  useEffect(() => {
    api.get('/api/properties')
      .then(data => setProperties(Array.isArray(data) ? data : []))
      .catch(() => setProperties([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = properties.filter(p => {
    const matchSearch = !search || [p.address, p.postcode, p.landlord_name, p.current_tenant]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()));
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
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
          <Button variant="gradient" onClick={() => navigate('/v3/properties/new')}>
            <Plus size={16} className="mr-2" /> Add Property
          </Button>
        </div>

        {/* Status filter */}
        <div className="flex flex-wrap gap-2">
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
          <div className="h-[calc(100vh-320px)] rounded-2xl overflow-hidden border border-[var(--border-subtle)]">
            <PropertyMap properties={filtered} onPropertyClick={(id) => navigate(`/v3/properties/${id}`)} />
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
      </div>
    </V3Layout>
  );
}
