import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import {
  Search, Users, Mail, Phone, MapPin, Building2, Home,
  ArrowUpRight, User
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface Landlord {
  id: number;
  name: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  properties_count: number;
  status: string;
}

interface Property {
  id: number;
  address: string;
  postcode: string;
  status: string;
  rent_amount: number;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  active:   { label: 'Active',   bg: 'bg-emerald-50', text: 'text-emerald-600' },
  inactive: { label: 'Inactive', bg: 'bg-gray-100',   text: 'text-gray-500' },
  prospect: { label: 'Prospect', bg: 'bg-violet-50',  text: 'text-violet-600' },
};

function initials(name: string) {
  return name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

const COLORS = ['bg-sky-500', 'bg-violet-500', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500', 'bg-indigo-500'];

export default function LandlordsV2() {
  const api = useApi();
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/landlords');
      const list = Array.isArray(data) ? data : data.landlords || [];
      setLandlords(list);
      if (list.length > 0 && !selectedId) setSelectedId(list[0].id);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setDetailLoading(true);
    (async () => {
      try {
        const d = await api.get(`/api/landlords/${selectedId}`);
        if (!cancelled) {
          setDetail(d.landlord || d);
          setProperties(d.properties || []);
        }
      } catch { /* ignore */ }
      if (!cancelled) setDetailLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedId]);

  const filtered = landlords.filter(l =>
    !search || l.name?.toLowerCase().includes(search.toLowerCase()) ||
    l.company?.toLowerCase().includes(search.toLowerCase())
  );

  const sel = detail;
  const st = sel ? (STATUS_CONFIG[sel.status?.toLowerCase()] || STATUS_CONFIG.active) : null;

  return (
    <div className="flex h-full font-[Lufga]" style={{ background: '#f6f7f3' }}>
      {/* Left panel — landlord list */}
      <div className="w-80 flex-shrink-0 border-r border-gray-200/60 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
              <Users className="w-4.5 h-4.5 text-violet-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Landlords</h2>
            <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {filtered.length}
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search landlords..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200/60 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
            </div>
          ) : filtered.map((l, i) => (
            <button
              key={l.id}
              onClick={() => setSelectedId(l.id)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors border-b border-gray-50 ${
                selectedId === l.id ? 'bg-violet-50/60' : 'hover:bg-gray-50'
              }`}
            >
              <div className={`w-10 h-10 rounded-full ${COLORS[i % COLORS.length]} flex items-center justify-center text-white text-sm font-semibold flex-shrink-0`}>
                {initials(l.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{l.name}</p>
                <p className="text-xs text-gray-500 truncate">{l.company || 'Individual'}</p>
              </div>
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Home className="w-3 h-3" />
                {l.properties_count ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Center — detail */}
      <div className="flex-1 overflow-y-auto p-8">
        {!sel && !detailLoading && (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <User className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>Select a landlord</p>
            </div>
          </div>
        )}

        {detailLoading && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
          </div>
        )}

        {sel && !detailLoading && (
          <div className="max-w-3xl">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
              <div className={`w-14 h-14 rounded-2xl ${COLORS[landlords.findIndex(l => l.id === sel.id) % COLORS.length] || 'bg-sky-500'} flex items-center justify-center text-white text-xl font-semibold`}>
                {initials(sel.name)}
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">{sel.name}</h2>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-sm text-gray-500">{sel.company || 'Individual'}</span>
                  {st && (
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${st.bg} ${st.text}`}>
                      {st.label}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Contact info grid */}
            <div className="bg-white rounded-2xl border border-gray-200/60 p-6 mb-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Contact Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-sky-50 flex items-center justify-center">
                    <Mail className="w-4 h-4 text-sky-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Email</p>
                    <p className="text-sm text-gray-900">{sel.email || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <Phone className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Phone</p>
                    <p className="text-sm text-gray-900">{sel.phone || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:col-span-2">
                  <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Address</p>
                    <p className="text-sm text-gray-900">{sel.address || '—'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Properties */}
            <div className="bg-white rounded-2xl border border-gray-200/60 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-violet-600" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900">Properties</h3>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {properties.length}
                  </span>
                </div>
              </div>
              {properties.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No properties linked</p>
              ) : (
                <div className="space-y-2">
                  {properties.map((p: Property) => (
                    <Link
                      key={p.id}
                      to={`/properties/${p.id}`}
                      className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors group"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900 group-hover:text-violet-600 transition-colors">
                          {p.address}
                        </p>
                        <p className="text-xs text-gray-500">{p.postcode}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {p.rent_amount && (
                          <span className="text-sm font-medium text-gray-700">
                            £{Number(p.rent_amount).toLocaleString()}
                          </span>
                        )}
                        <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-violet-500" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
