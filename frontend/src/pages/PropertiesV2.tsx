import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import {
  Search, Plus, Home, BedDouble, Bath, Building2,
  MapPin, User, PoundSterling, ArrowUpRight
} from 'lucide-react';

interface Property {
  id: number;
  address: string;
  postcode: string;
  property_type: string;
  bedrooms: number;
  bathrooms: number;
  rent_amount: number;
  status: string;
  landlord_name: string;
  gas_safety_expiry: string | null;
  eicr_expiry: string | null;
  epc_expiry: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  available:   { label: 'Available',   bg: 'bg-emerald-50',  text: 'text-emerald-600' },
  occupied:    { label: 'Occupied',    bg: 'bg-sky-50',      text: 'text-sky-600' },
  maintenance: { label: 'Maintenance', bg: 'bg-amber-50',    text: 'text-amber-600' },
  void:        { label: 'Void',        bg: 'bg-red-50',      text: 'text-red-600' },
};

function complianceDot(expiry: string | null) {
  if (!expiry) return 'bg-gray-300';
  const days = (new Date(expiry).getTime() - Date.now()) / 86400000;
  if (days < 0) return 'bg-red-500';
  if (days < 30) return 'bg-amber-400';
  return 'bg-emerald-500';
}

export default function PropertiesV2() {
  const api = useApi();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/properties');
      setProperties(Array.isArray(data) ? data : data.properties || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = properties.filter(p =>
    !search || p.address?.toLowerCase().includes(search.toLowerCase()) ||
    p.postcode?.toLowerCase().includes(search.toLowerCase()) ||
    p.landlord_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 font-[Lufga] min-h-screen" style={{ background: '#f6f7f3' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Properties</h1>
            <p className="text-sm text-gray-500">{filtered.length} properties</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search properties..."
              className="pl-10 pr-4 py-2.5 rounded-xl border border-gray-200/60 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 w-64"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-[#2a2a2a] text-white rounded-xl text-sm font-medium hover:bg-[#3a3a3a] transition-colors">
            <Plus className="w-4 h-4" />
            Add Property
          </button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(p => {
            const st = STATUS_CONFIG[p.status?.toLowerCase()] || STATUS_CONFIG.available;
            return (
              <Link
                key={p.id}
                to={`/properties/${p.id}`}
                className="bg-white rounded-2xl border border-gray-200/60 p-5 hover:border-gray-300 transition-colors group"
              >
                {/* Top row */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate group-hover:text-sky-600 transition-colors">
                      {p.address}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-500">
                      <MapPin className="w-3.5 h-3.5" />
                      {p.postcode}
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${st.bg} ${st.text} whitespace-nowrap`}>
                    {st.label}
                  </span>
                </div>

                {/* Type + beds/baths */}
                <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
                  <span className="flex items-center gap-1.5">
                    <Home className="w-3.5 h-3.5" />
                    {p.property_type || 'Property'}
                  </span>
                  <span className="flex items-center gap-1">
                    <BedDouble className="w-3.5 h-3.5" />
                    {p.bedrooms ?? '-'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Bath className="w-3.5 h-3.5" />
                    {p.bathrooms ?? '-'}
                  </span>
                </div>

                {/* Bottom row */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                      <PoundSterling className="w-3.5 h-3.5" />
                      {p.rent_amount ? `${Number(p.rent_amount).toLocaleString()} pcm` : '—'}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-gray-500">
                      <User className="w-3 h-3" />
                      {p.landlord_name || '—'}
                    </span>
                  </div>
                  {/* Compliance dots */}
                  <div className="flex items-center gap-1.5" title="Gas · EICR · EPC">
                    <span className={`w-2.5 h-2.5 rounded-full ${complianceDot(p.gas_safety_expiry)}`} />
                    <span className={`w-2.5 h-2.5 rounded-full ${complianceDot(p.eicr_expiry)}`} />
                    <span className={`w-2.5 h-2.5 rounded-full ${complianceDot(p.epc_expiry)}`} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No properties found</p>
        </div>
      )}
    </div>
  );
}
