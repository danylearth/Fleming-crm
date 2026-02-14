import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import {
  Users, Search, Mail, Phone, Home, Calendar, DollarSign,
  ChevronRight, User
} from 'lucide-react';

interface Tenant {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  property_id: number;
  property_address: string;
  tenancy_start: string;
  tenancy_end: string;
  rent_amount: number;
  status: string;
}

const statusColors: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-600',
  inactive: 'bg-gray-100 text-gray-500',
  pending: 'bg-amber-50 text-amber-600',
  ended: 'bg-red-50 text-red-500',
};

export default function TenantsV2() {
  const api = useApi();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Tenant | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/tenants');
      setTenants(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [api]);

  useEffect(() => { load(); }, []);

  const filtered = tenants.filter(t => {
    if (!search) return true;
    const s = search.toLowerCase();
    return `${t.first_name} ${t.last_name}`.toLowerCase().includes(s) ||
      t.email?.toLowerCase().includes(s) ||
      t.property_address?.toLowerCase().includes(s);
  });

  const initials = (t: Tenant) =>
    `${t.first_name?.[0] || ''}${t.last_name?.[0] || ''}`.toUpperCase();

  const fmt = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#f6f7f3] font-[Lufga]">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-[#2a2a2a] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-screen bg-[#f6f7f3] font-[Lufga] overflow-hidden">
      {/* Left panel — tenant list */}
      <div className="w-[380px] border-r border-gray-200/60 flex flex-col bg-white">
        {/* Header */}
        <div className="p-6 border-b border-gray-200/60">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
              <Users size={18} className="text-violet-600" />
            </div>
            <h1 className="text-lg font-semibold text-[#2a2a2a]">Tenants</h1>
            <span className="ml-auto text-sm text-gray-400">{tenants.length}</span>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tenants..."
              className="w-full pl-9 pr-4 py-2.5 bg-[#f6f7f3] rounded-xl border border-gray-200/60 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.map(t => (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              className={`w-full flex items-center gap-3 px-6 py-4 text-left border-b border-gray-100 transition-colors ${
                selected?.id === t.id ? 'bg-[#f6f7f3]' : 'hover:bg-gray-50'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-sm font-semibold shrink-0">
                {initials(t)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#2a2a2a] truncate">{t.first_name} {t.last_name}</p>
                <p className="text-xs text-gray-400 truncate">{t.property_address || 'No property'}</p>
              </div>
              <ChevronRight size={14} className="text-gray-300 shrink-0" />
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-12">No tenants found</p>
          )}
        </div>
      </div>

      {/* Right panel — detail */}
      <div className="flex-1 overflow-y-auto p-8">
        {selected ? (
          <div className="max-w-2xl">
            {/* Name header */}
            <div className="flex items-center gap-4 mb-8">
              <div className="w-14 h-14 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center text-xl font-semibold">
                {initials(selected)}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[#2a2a2a]">{selected.first_name} {selected.last_name}</h2>
                <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[selected.status] || 'bg-gray-100 text-gray-500'}`}>
                  {selected.status}
                </span>
              </div>
            </div>

            {/* Contact info */}
            <div className="bg-white rounded-2xl border border-gray-200/60 p-6 mb-4">
              <h3 className="text-sm font-semibold text-[#2a2a2a] mb-4 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center">
                  <User size={14} className="text-sky-600" />
                </div>
                Contact Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <Mail size={14} className="text-gray-400" />
                  <span className="text-gray-600">{selected.email || '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone size={14} className="text-gray-400" />
                  <span className="text-gray-600">{selected.phone || '—'}</span>
                </div>
              </div>
            </div>

            {/* Property */}
            <div className="bg-white rounded-2xl border border-gray-200/60 p-6 mb-4">
              <h3 className="text-sm font-semibold text-[#2a2a2a] mb-4 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Home size={14} className="text-amber-600" />
                </div>
                Property
              </h3>
              <p className="text-sm text-gray-600">{selected.property_address || 'No property assigned'}</p>
            </div>

            {/* Tenancy details */}
            <div className="bg-white rounded-2xl border border-gray-200/60 p-6 mb-4">
              <h3 className="text-sm font-semibold text-[#2a2a2a] mb-4 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <Calendar size={14} className="text-emerald-600" />
                </div>
                Tenancy Details
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Start Date</p>
                  <p className="text-sm text-[#2a2a2a] font-medium">{fmt(selected.tenancy_start)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">End Date</p>
                  <p className="text-sm text-[#2a2a2a] font-medium">{fmt(selected.tenancy_end)}</p>
                </div>
              </div>
            </div>

            {/* Rent */}
            <div className="bg-white rounded-2xl border border-gray-200/60 p-6">
              <h3 className="text-sm font-semibold text-[#2a2a2a] mb-4 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
                  <DollarSign size={14} className="text-green-600" />
                </div>
                Rent
              </h3>
              <p className="text-2xl font-semibold text-[#2a2a2a]">
                £{selected.rent_amount ? Number(selected.rent_amount).toLocaleString('en-GB', { minimumFractionDigits: 2 }) : '0.00'}
                <span className="text-sm text-gray-400 font-normal ml-1">/ month</span>
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Users size={24} className="text-gray-400" />
              </div>
              <p className="text-sm text-gray-400">Select a tenant to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
