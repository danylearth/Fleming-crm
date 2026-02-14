import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import {
  Search, Home, MapPin, Building2, User, PoundSterling,
  BedDouble, Bath, ArrowUpRight, Send, Plus, Calendar,
  Phone, Mail, FileText, Shield, CreditCard, CheckCircle,
  AlertTriangle, Clock, LayoutGrid, List, Briefcase,
  LayoutDashboard, UserPlus, Users as UsersIcon, Wrench,
  ClipboardList, Receipt, BarChart3, Settings, LogOut,
  MoreHorizontal, Circle
} from 'lucide-react';

const NAV_ITEMS = [
  { icon: LayoutDashboard, href: '/v2', label: 'Dashboard' },
  { icon: UserPlus, href: '/v2/enquiries', label: 'Enquiries' },
  { icon: UsersIcon, href: '/v2/tenants', label: 'Tenants' },
  { icon: Building2, href: '/v2/landlords', label: 'Landlords' },
  { icon: BarChart3, href: '/v2/bdm', label: 'BDM' },
  { icon: Home, href: '/v2/properties', label: 'Properties' },
  { icon: Wrench, href: '/v2/maintenance', label: 'Maintenance' },
  { icon: ClipboardList, href: '/v2/tasks', label: 'Tasks' },
  { icon: Receipt, href: '/v2/transactions', label: 'Financials' },
];

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
  landlord_id?: number;
  landlord_email?: string;
  landlord_phone?: string;
  tenant_name?: string;
  tenant_id?: number;
  tenant_email?: string;
  tenant_phone?: string;
  gas_safety_expiry: string | null;
  eicr_expiry: string | null;
  epc_expiry: string | null;
  epc_grade?: string;
  proof_of_ownership?: boolean;
  council_tax_band?: string;
  rent_review_date?: string | null;
  has_live_tenancy?: boolean;
  tenancy_start_date?: string;
  onboarded_date?: string;
  tenure_type?: string;
  leasehold_start?: string;
  leasehold_end?: string;
  leaseholder_info?: string;
  service_type?: string;
  management_charge_percent?: number;
  management_charge_amount?: number;
  has_gas?: boolean;
  notes?: string;
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

function complianceLabel(expiry: string | null): { text: string; color: string } {
  if (!expiry) return { text: 'Not set', color: 'text-gray-400' };
  const days = Math.floor((new Date(expiry).getTime() - Date.now()) / 86400000);
  const dateStr = new Date(expiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (days < 0) return { text: `Expired ${dateStr}`, color: 'text-red-600' };
  if (days < 30) return { text: `${dateStr} (${days}d)`, color: 'text-amber-600' };
  return { text: dateStr, color: 'text-emerald-600' };
}

function countValidCerts(p: Property): [number, number] {
  const certs = [p.gas_safety_expiry, p.eicr_expiry, p.epc_expiry];
  let valid = 0;
  let total = 0;
  certs.forEach(c => {
    total++;
    if (c && (new Date(c).getTime() - Date.now()) > 0) valid++;
  });
  return [valid, total];
}

interface AIMessage { role: 'user' | 'assistant'; text: string; time: string; }
function now() { return new Date().toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' }); }

export default function PropertiesV2() {
  const api = useApi();
  const location = useLocation();
  const { logout } = useAuth();

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Property | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiTyping, setAiTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [aiMessages]);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/properties');
      const list = Array.isArray(data) ? data : data.properties || [];
      setProperties(list);
      if (list.length > 0) {
        setSelected(list[0]);
        setAiMessages([{ role: 'assistant', text: `You're viewing ${list[0].address}. ${list[0].status === 'occupied' ? 'Currently tenanted.' : 'Currently vacant.'} What would you like to know?`, time: now() }]);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [api]);

  useEffect(() => { load(); }, []);

  const selectProperty = (p: Property) => {
    setSelected(p);
    const [valid, total] = countValidCerts(p);
    setAiMessages([{
      role: 'assistant',
      text: `Switched to ${p.address}. Status: ${STATUS_CONFIG[p.status?.toLowerCase()]?.label || p.status}. Rent: £${p.rent_amount ? Number(p.rent_amount).toLocaleString() : '—'} pcm. Compliance: ${valid}/${total} certs valid. Landlord: ${p.landlord_name || 'Unknown'}. Ask me anything.`,
      time: now()
    }]);
  };

  const handleAiSend = () => {
    if (!aiInput.trim() || !selected) return;
    const msg = aiInput.trim();
    setAiMessages(prev => [...prev, { role: 'user', text: msg, time: now() }]);
    setAiInput('');
    setAiTyping(true);
    const p = selected;
    setTimeout(() => {
      let response = '';
      const lower = msg.toLowerCase();
      if (lower.includes('compliance') || lower.includes('cert') || lower.includes('expir')) {
        const gas = complianceLabel(p.gas_safety_expiry);
        const eicr = complianceLabel(p.eicr_expiry);
        const epc = complianceLabel(p.epc_expiry);
        response = `Compliance overview for ${p.address}:\n\n⛽ Gas Safety: ${gas.text}\n⚡ EICR: ${eicr.text}\n📊 EPC${p.epc_grade ? ` (${p.epc_grade})` : ''}: ${epc.text}\n${p.council_tax_band ? `🏛 Council Tax: Band ${p.council_tax_band}` : ''}\n${p.rent_review_date ? `📅 Rent Review: ${new Date(p.rent_review_date).toLocaleDateString('en-GB')}` : ''}`;
      } else if (lower.includes('landlord') || lower.includes('owner')) {
        response = `Landlord for ${p.address}:\n\n${p.landlord_name || 'Unknown'}${p.landlord_email ? `\n📧 ${p.landlord_email}` : ''}${p.landlord_phone ? `\n📞 ${p.landlord_phone}` : ''}\n\nService type: ${p.service_type || 'Not set'}${p.management_charge_percent ? ` at ${p.management_charge_percent}%` : ''}`;
      } else if (lower.includes('tenant') || lower.includes('occupant')) {
        if (p.has_live_tenancy && p.tenant_name) {
          response = `Current tenant at ${p.address}:\n\n${p.tenant_name}${p.tenant_email ? `\n📧 ${p.tenant_email}` : ''}${p.tenant_phone ? `\n📞 ${p.tenant_phone}` : ''}\nTenancy started: ${p.tenancy_start_date ? new Date(p.tenancy_start_date).toLocaleDateString('en-GB') : 'Unknown'}`;
        } else {
          response = `No live tenancy at ${p.address}. The property is currently ${p.status || 'available'}.`;
        }
      } else if (lower.includes('rent') || lower.includes('payment') || lower.includes('income')) {
        response = `Rent details for ${p.address}:\n\n💷 Rent: £${p.rent_amount ? Number(p.rent_amount).toLocaleString() : '—'} pcm\n📋 Service: ${p.service_type || 'Not set'}${p.management_charge_percent ? `\n💼 Charge: ${p.management_charge_percent}%` : ''}${p.management_charge_amount ? ` (£${p.management_charge_amount})` : ''}\n${p.rent_review_date ? `📅 Next review: ${new Date(p.rent_review_date).toLocaleDateString('en-GB')}` : ''}`;
      } else {
        response = `${p.address}, ${p.postcode}. ${p.property_type || 'Property'} with ${p.bedrooms || '—'} beds. Status: ${STATUS_CONFIG[p.status?.toLowerCase()]?.label || p.status}. Rent: £${p.rent_amount ? Number(p.rent_amount).toLocaleString() : '—'} pcm. Landlord: ${p.landlord_name || 'Unknown'}. What specifically would you like to know?`;
      }
      setAiMessages(prev => [...prev, { role: 'assistant', text: response, time: now() }]);
      setAiTyping(false);
    }, 800);
  };

  const filtered = properties.filter(p => {
    if (!search) return true;
    const s = search.toLowerCase();
    return p.address?.toLowerCase().includes(s) || p.postcode?.toLowerCase().includes(s) || p.landlord_name?.toLowerCase().includes(s);
  });

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" /></div>;
  }

  const st = selected ? (STATUS_CONFIG[selected.status?.toLowerCase()] || STATUS_CONFIG.available) : null;
  const [validCerts, totalCerts] = selected ? countValidCerts(selected) : [0, 0];

  return (
    <div className="font-[Lufga] flex h-screen overflow-hidden" style={{ background: '#f6f7f3' }}>
      {/* Icon sidebar */}
      <aside className="w-14 flex flex-col items-center py-4 gap-1 bg-[#2a2a2a] flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center mb-4">
          <span className="text-white text-sm font-bold tracking-tight">F</span>
        </div>
        <nav className="flex-1 flex flex-col items-center gap-0.5">
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname === item.href || (item.href !== '/v2' && location.pathname.startsWith(item.href));
            return (
              <Link key={item.href} to={item.href}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all group relative ${
                  isActive ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                }`} title={item.label}>
                <item.icon className="w-[18px] h-[18px]" />
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-[10px] font-medium rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">{item.label}</div>
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col items-center gap-1">
          <button className="w-10 h-10 rounded-xl flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/5"><Settings className="w-[18px] h-[18px]" /></button>
          <button onClick={logout} className="w-10 h-10 rounded-xl flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/5"><LogOut className="w-[18px] h-[18px]" /></button>
        </div>
      </aside>

      {/* Left list panel - only in list view */}
      {viewMode === 'list' && (
        <div className="w-72 border-r border-gray-200/60 flex flex-col bg-white flex-shrink-0">
          <div className="px-4 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900 tracking-tight">Properties</h2>
                <span className="text-xs text-gray-400">{filtered.length}</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setViewMode('grid')}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${viewMode === 'grid' ? 'bg-[#2a2a2a] text-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setViewMode('list')}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${viewMode === 'list' ? 'bg-[#2a2a2a] text-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#f6f7f3] rounded-lg focus:outline-none font-[Lufga]" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.map(p => {
              const isSelected = selected?.id === p.id;
              const pSt = STATUS_CONFIG[p.status?.toLowerCase()] || STATUS_CONFIG.available;
              return (
                <button key={p.id} onClick={() => selectProperty(p)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all ${
                    isSelected ? 'bg-[#f6f7f3]' : 'hover:bg-gray-50'
                  }`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isSelected ? 'bg-[#2a2a2a] text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    <Home className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>{p.address}</p>
                    <p className="text-[10px] text-gray-400 truncate">{p.postcode}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <div className="flex items-center gap-1" title="Gas · EICR · EPC">
                      <span className={`w-2 h-2 rounded-full ${complianceDot(p.gas_safety_expiry)}`} />
                      <span className={`w-2 h-2 rounded-full ${complianceDot(p.eicr_expiry)}`} />
                      <span className={`w-2 h-2 rounded-full ${complianceDot(p.epc_expiry)}`} />
                    </div>
                    {isSelected && <div className="w-1 h-4 rounded-full bg-[#2a2a2a]" />}
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center py-10 text-gray-400">
                <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs">No properties found</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Center content */}
      <div className="flex-1 overflow-y-auto" style={{ background: '#f6f7f3' }}>
        {viewMode === 'grid' ? (
          /* GRID VIEW */
          <div className="p-8">
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
                <div className="flex items-center gap-1 mr-2">
                  <button onClick={() => setViewMode('grid')}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${viewMode === 'grid' ? 'bg-[#2a2a2a] text-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'}`}>
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button onClick={() => setViewMode('list')}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${viewMode === 'list' ? 'bg-[#2a2a2a] text-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'}`}>
                    <List className="w-4 h-4" />
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search properties..."
                    className="pl-10 pr-4 py-2.5 rounded-xl border border-gray-200/60 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 w-64 font-[Lufga]" />
                </div>
                <button className="flex items-center gap-2 px-4 py-2.5 bg-[#2a2a2a] text-white rounded-xl text-sm font-medium hover:bg-[#3a3a3a] transition-colors">
                  <Plus className="w-4 h-4" /> Add Property
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filtered.map(p => {
                const pSt = STATUS_CONFIG[p.status?.toLowerCase()] || STATUS_CONFIG.available;
                return (
                  <button key={p.id} onClick={() => { selectProperty(p); setViewMode('list'); }}
                    className="bg-white rounded-2xl border border-gray-200/60 p-5 hover:border-gray-300 transition-colors group text-left">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate group-hover:text-sky-600 transition-colors">{p.address}</h3>
                        <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-500">
                          <MapPin className="w-3.5 h-3.5" /> {p.postcode}
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${pSt.bg} ${pSt.text} whitespace-nowrap`}>{pSt.label}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
                      <span className="flex items-center gap-1.5"><Home className="w-3.5 h-3.5" /> {p.property_type || 'Property'}</span>
                      <span className="flex items-center gap-1"><BedDouble className="w-3.5 h-3.5" /> {p.bedrooms ?? '-'}</span>
                      <span className="flex items-center gap-1"><Bath className="w-3.5 h-3.5" /> {p.bathrooms ?? '-'}</span>
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                          <PoundSterling className="w-3.5 h-3.5" /> {p.rent_amount ? `${Number(p.rent_amount).toLocaleString()} pcm` : '—'}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-gray-500">
                          <User className="w-3 h-3" /> {p.landlord_name || '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5" title="Gas · EICR · EPC">
                        <span className={`w-2.5 h-2.5 rounded-full ${complianceDot(p.gas_safety_expiry)}`} />
                        <span className={`w-2.5 h-2.5 rounded-full ${complianceDot(p.eicr_expiry)}`} />
                        <span className={`w-2.5 h-2.5 rounded-full ${complianceDot(p.epc_expiry)}`} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {filtered.length === 0 && (
              <div className="text-center py-20 text-gray-400">
                <Building2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="text-lg font-medium">No properties found</p>
              </div>
            )}
          </div>
        ) : (
          /* LIST VIEW - Detail panel */
          selected ? (
            <div className="p-8">
              {/* Header card */}
              <div className="bg-white rounded-2xl border border-gray-200/60 p-6 mb-5">
                <div className="flex items-start gap-6">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-sky-100 to-sky-200 flex items-center justify-center flex-shrink-0">
                    <Home className="w-8 h-8 text-sky-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{selected.address}</h1>
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${st!.bg} ${st!.text}`}>{st!.label}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-3">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-gray-300" />
                        <div>
                          <p className="text-[10px] text-gray-400">Postcode</p>
                          <p className="text-sm text-gray-900">{selected.postcode}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-gray-300" />
                        <div>
                          <p className="text-[10px] text-gray-400">Property Type</p>
                          <p className="text-sm text-gray-900">{selected.property_type || 'Not specified'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <BedDouble className="w-4 h-4 text-gray-300" />
                        <div>
                          <p className="text-[10px] text-gray-400">Bedrooms</p>
                          <p className="text-sm text-gray-900">{selected.bedrooms ?? '—'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Bath className="w-4 h-4 text-gray-300" />
                        <div>
                          <p className="text-[10px] text-gray-400">Bathrooms</p>
                          <p className="text-sm text-gray-900">{selected.bathrooms ?? '—'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {[Phone, Mail, Calendar, FileText].map((Icon, i) => (
                      <button key={i} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
                        <Icon className="w-4 h-4" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-4 mb-5">
                <MiniStat label="Rent" value={selected.rent_amount ? `£${Number(selected.rent_amount).toLocaleString()} pcm` : '—'} />
                <MiniStat label="Occupancy" value={selected.has_live_tenancy ? 'Occupied' : selected.status === 'void' ? 'Void' : 'Vacant'} ok={selected.has_live_tenancy ? true : undefined} />
                <MiniStat label="Service" value={selected.service_type || 'Not set'} />
                <MiniStat label="Compliance" value={`${validCerts}/${totalCerts} valid`} ok={validCerts === totalCerts ? true : validCerts === 0 ? false : undefined} />
              </div>

              {/* Core Details */}
              <div className="bg-white rounded-2xl border border-gray-200/60 p-5 mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <Home className="w-4 h-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900">Core Details</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <DetailRow label="Full Address" value={`${selected.address}, ${selected.postcode}`} />
                  <DetailRow label="Onboarded" value={selected.onboarded_date ? new Date(selected.onboarded_date).toLocaleDateString('en-GB') : 'Not recorded'} />
                  <DetailRow label="Tenure" value={selected.tenure_type || 'Freehold'} />
                  {selected.tenure_type?.toLowerCase() === 'leasehold' && (
                    <>
                      <DetailRow label="Lease Start" value={selected.leasehold_start ? new Date(selected.leasehold_start).toLocaleDateString('en-GB') : '—'} />
                      <DetailRow label="Lease End" value={selected.leasehold_end ? new Date(selected.leasehold_end).toLocaleDateString('en-GB') : '—'} />
                      {selected.leaseholder_info && <DetailRow label="Leaseholder" value={selected.leaseholder_info} />}
                    </>
                  )}
                  <DetailRow label="Live Tenancy" value={selected.has_live_tenancy ? 'Yes' : 'No'} />
                  {selected.has_live_tenancy && selected.tenancy_start_date && (
                    <DetailRow label="Tenancy Start" value={new Date(selected.tenancy_start_date).toLocaleDateString('en-GB')} />
                  )}
                </div>
              </div>

              {/* Service Type */}
              <div className="bg-white rounded-2xl border border-gray-200/60 p-5 mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <Briefcase className="w-4 h-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900">Service Type</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <DetailRow label="Service" value={selected.service_type || 'Not set'} />
                  <DetailRow label="Rent" value={selected.rent_amount ? `£${Number(selected.rent_amount).toLocaleString()} pcm` : '—'} />
                  {selected.management_charge_percent !== undefined && selected.management_charge_percent !== null && (
                    <DetailRow label="Charge %" value={`${selected.management_charge_percent}%`} />
                  )}
                  {selected.management_charge_amount !== undefined && selected.management_charge_amount !== null && (
                    <DetailRow label="Charge Amount" value={`£${Number(selected.management_charge_amount).toLocaleString()}`} />
                  )}
                </div>
              </div>

              {/* Compliance */}
              <div className="bg-white rounded-2xl border border-gray-200/60 p-5 mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-4 h-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900">Compliance</h3>
                </div>
                <div className="space-y-3">
                  <ComplianceRow label="EICR Expiry" expiry={selected.eicr_expiry} />
                  <ComplianceRow label={`EPC${selected.epc_grade ? ` (Grade ${selected.epc_grade})` : ''}`} expiry={selected.epc_expiry} />
                  <ComplianceRow label="Gas Safety Expiry" expiry={selected.gas_safety_expiry} />
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-gray-500">Proof of Ownership</span>
                    <span className={`text-xs font-medium ${selected.proof_of_ownership ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {selected.proof_of_ownership ? 'On file' : 'Not provided'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-gray-500">Council Tax Band</span>
                    <span className="text-xs font-medium text-gray-900">{selected.council_tax_band ? `Band ${selected.council_tax_band}` : 'Not set'}</span>
                  </div>
                  <ComplianceRow label="Rent Review Date" expiry={selected.rent_review_date || null} />
                </div>
              </div>

              {/* Linked Landlord */}
              <div className="bg-white rounded-2xl border border-gray-200/60 p-5 mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-4 h-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900">Linked Landlord</h3>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <span className="text-xs font-semibold text-gray-600">
                        {selected.landlord_name ? selected.landlord_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'LL'}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{selected.landlord_name || 'Unknown'}</p>
                      <div className="flex items-center gap-3">
                        {selected.landlord_email && <p className="text-[11px] text-gray-400">{selected.landlord_email}</p>}
                        {selected.landlord_phone && <p className="text-[11px] text-gray-400">{selected.landlord_phone}</p>}
                      </div>
                    </div>
                  </div>
                  {selected.landlord_id && (
                    <Link to={`/v2/landlords`} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5">
                      View <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              </div>

              {/* Linked Tenant */}
              {selected.has_live_tenancy && selected.tenant_name && (
                <div className="bg-white rounded-2xl border border-gray-200/60 p-5 mb-5">
                  <div className="flex items-center gap-2 mb-3">
                    <UsersIcon className="w-4 h-4 text-gray-400" />
                    <h3 className="text-sm font-semibold text-gray-900">Linked Tenant</h3>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                        <span className="text-xs font-semibold text-gray-600">
                          {selected.tenant_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{selected.tenant_name}</p>
                        <div className="flex items-center gap-3">
                          {selected.tenant_email && <p className="text-[11px] text-gray-400">{selected.tenant_email}</p>}
                          {selected.tenant_phone && <p className="text-[11px] text-gray-400">{selected.tenant_phone}</p>}
                        </div>
                      </div>
                    </div>
                    {selected.tenant_id && (
                      <Link to={`/v2/tenants`} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5">
                        View <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {/* Rent Payment History */}
              <div className="bg-white rounded-2xl border border-gray-200/60 p-5 mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <CreditCard className="w-4 h-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900">Rent Payment History</h3>
                </div>
                <div className="flex items-center justify-center py-6 text-gray-400">
                  <div className="text-center">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-xs">Payment history will appear here once transactions are recorded.</p>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="bg-white rounded-2xl border border-gray-200/60 p-5 mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900">Notes</h3>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{selected.notes || 'No notes recorded for this property.'}</p>
              </div>

              {/* Map placeholder */}
              <div className="bg-white rounded-2xl border border-gray-200/60 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900">Map</h3>
                </div>
                <div className="flex items-center justify-center py-10 bg-[#f6f7f3] rounded-xl">
                  <div className="text-center">
                    <MapPin className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm font-medium text-gray-400">Map view coming soon</p>
                    <p className="text-[11px] text-gray-300 mt-1">{selected.address}, {selected.postcode}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm text-gray-400">Select a property to view details</p>
              </div>
            </div>
          )
        )}
      </div>

      {/* Right: AI Chat */}
      <div className="w-72 border-l border-gray-200/60 bg-white flex flex-col flex-shrink-0">
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#e8e4de] to-[#d4cfc7] flex items-center justify-center">
              <span className="text-gray-600 text-xs font-bold">◉</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Chat</p>
              <p className="text-[10px] text-emerald-500">About this property</p>
            </div>
          </div>
        </div>

        {selected && (
          <div className="px-3 py-2 border-b border-gray-50 flex flex-wrap gap-1.5">
            {['Compliance check', 'Landlord info', 'Tenant details', 'Rent history'].map(s => (
              <button key={s} onClick={() => setAiInput(s)}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {aiMessages.map((msg, i) => (
            <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[92%] px-3 py-2 text-xs leading-relaxed whitespace-pre-line ${
                msg.role === 'user'
                  ? 'bg-[#2a2a2a] text-white rounded-2xl rounded-br-sm'
                  : 'bg-[#f6f7f3] text-gray-700 rounded-2xl rounded-bl-sm'
              }`}>
                {msg.text}
              </div>
              <p className="text-[9px] text-gray-300 mt-0.5 px-1">{msg.time}</p>
            </div>
          ))}
          {aiTyping && (
            <div className="bg-[#f6f7f3] px-4 py-2.5 rounded-2xl rounded-bl-sm inline-block">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="p-3 border-t border-gray-100">
          <div className="flex items-center gap-1.5 bg-[#f6f7f3] rounded-xl px-3 py-2">
            <input type="text" value={aiInput} onChange={e => setAiInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAiSend()}
              placeholder="Ask about this property..."
              className="flex-1 bg-transparent text-xs text-gray-900 placeholder-gray-400 focus:outline-none font-[Lufga]" />
            <button onClick={handleAiSend}
              className={`p-1 rounded-lg transition-all ${aiInput.trim() ? 'bg-[#2a2a2a] text-white' : 'bg-gray-200 text-gray-400'}`}>
              <Send className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200/60 p-3.5">
      <p className="text-[10px] text-gray-400 mb-1">{label}</p>
      <p className={`text-sm font-semibold ${
        ok === true ? 'text-emerald-600' : ok === false ? 'text-amber-600' : 'text-gray-900'
      }`}>{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-900">{value}</p>
    </div>
  );
}

function ComplianceRow({ label, expiry }: { label: string; expiry: string | null }) {
  const info = complianceLabel(expiry);
  const dotColor = complianceDot(expiry);
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className={`text-xs font-medium ${info.color}`}>{info.text}</span>
      </div>
    </div>
  );
}
