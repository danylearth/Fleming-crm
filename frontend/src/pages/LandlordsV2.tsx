import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import {
  Search, Phone, Mail, MapPin, Calendar, Home, Shield, User,
  Send, Plus, ArrowUpRight, FileText, LayoutDashboard, Users as UsersIcon,
  Building2, Wrench, ClipboardList, Receipt, BarChart3, Settings, LogOut,
  UserPlus, Upload, CheckCircle, XCircle, Heart
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

const COLORS = ['bg-sky-500', 'bg-violet-500', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500', 'bg-indigo-500'];

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  active:   { label: 'Active',   bg: 'bg-emerald-50', text: 'text-emerald-600' },
  inactive: { label: 'Inactive', bg: 'bg-gray-100',   text: 'text-gray-500' },
  prospect: { label: 'Prospect', bg: 'bg-violet-50',  text: 'text-violet-600' },
};

const DOCUMENT_CATEGORIES = [
  'Primary ID', 'Address ID', 'Proof of Funds', 'Application Forms',
  'Deed of Guarantee', 'Guarantor Forms', 'Bank Statements',
  'Council Tax Bill', 'Complaint', 'Compliments', 'Proof of Ownership',
  'Mortgage Statement', 'Other',
];

interface Landlord {
  id: number;
  name: string;
  email: string;
  alt_email?: string;
  phone: string;
  company: string;
  address: string;
  date_of_birth?: string;
  marketing_preference?: string;
  kyc_completed?: number;
  properties_count: number;
  status: string;
  notes?: string;
}

interface Property {
  id: number;
  address: string;
  postcode: string;
  status: string;
  rent_amount: number;
  tenant_name?: string;
  tenancy_start?: string;
}

interface AIMessage { role: 'user' | 'assistant'; text: string; time: string; }

function now() { return new Date().toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' }); }

function initials(name: string) {
  return name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

export default function LandlordsV2() {
  const api = useApi();
  const location = useLocation();
  const { logout } = useAuth();
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Landlord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiTyping, setAiTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [aiMessages]);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/landlords');
      const list = Array.isArray(data) ? data : data.landlords || [];
      setLandlords(list);
      if (list.length > 0) {
        setSelectedId(list[0].id);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [api]);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setDetailLoading(true);
    (async () => {
      try {
        const d = await api.get(`/api/landlords/${selectedId}`);
        if (!cancelled) {
          const landlord = d.landlord || d;
          setDetail(landlord);
          setProperties(d.properties || []);
          const name = landlord.name || 'this landlord';
          setAiMessages([{
            role: 'assistant',
            text: `You're viewing ${name}'s profile. They have ${d.properties?.length || 0} linked properties. ${landlord.kyc_completed ? 'KYC is verified.' : 'KYC is pending.'} What would you like to know?`,
            time: now()
          }]);
        }
      } catch { /* ignore */ }
      if (!cancelled) setDetailLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedId]);

  const handleAiSend = () => {
    if (!aiInput.trim() || !detail) return;
    const msg = aiInput.trim();
    setAiMessages(prev => [...prev, { role: 'user', text: msg, time: now() }]);
    setAiInput('');
    setAiTyping(true);

    const name = detail.name || 'This landlord';
    setTimeout(() => {
      let response = '';
      const lower = msg.toLowerCase();
      if (lower.includes('propert')) {
        const totalRent = properties.reduce((sum, p) => sum + (Number(p.rent_amount) || 0), 0);
        response = properties.length > 0
          ? `${name} has ${properties.length} properties with a total monthly rent of £${totalRent.toLocaleString()}:\n\n${properties.map(p => `• ${p.address} — £${Number(p.rent_amount).toLocaleString()}/mo (${p.status})`).join('\n')}`
          : `${name} has no linked properties yet.`;
      } else if (lower.includes('compliance') || lower.includes('kyc')) {
        response = `Compliance status for ${name}:\n\n${detail.kyc_completed ? '✓ KYC verified' : '⏳ KYC pending — documents needed'}\n\nDocument categories to check: Primary ID, Address ID, Proof of Funds, Proof of Ownership.`;
      } else if (lower.includes('chase') || lower.includes('doc') || lower.includes('remind')) {
        response = `I can draft a document chase email to ${name}:\n\nSubject: Outstanding Documents Required\n\n"Hi ${name.split(' ')[0]}, we're missing some compliance documents for your property portfolio. Could you please provide your outstanding ID and proof of funds at your earliest convenience..."\n\nWant me to send this to ${detail.email || 'their email'}?`;
      } else if (lower.includes('rent') || lower.includes('summar') || lower.includes('income')) {
        const totalRent = properties.reduce((sum, p) => sum + (Number(p.rent_amount) || 0), 0);
        const active = properties.filter(p => p.status?.toLowerCase() === 'active' || p.status?.toLowerCase() === 'let').length;
        response = `Rent summary for ${name}:\n\n• Total monthly rent: £${totalRent.toLocaleString()}\n• Active tenancies: ${active}\n• Properties: ${properties.length}\n• Average rent: £${properties.length ? Math.round(totalRent / properties.length).toLocaleString() : 0}/mo`;
      } else {
        response = `${name} — ${detail.email ? `Email: ${detail.email}. ` : ''}${detail.phone ? `Phone: ${detail.phone}. ` : ''}${detail.company ? `Company: ${detail.company}. ` : 'Individual landlord. '}${properties.length} properties linked. Status: ${STATUS_CONFIG[detail.status?.toLowerCase()]?.label || detail.status}. What would you like to do?`;
      }
      setAiMessages(prev => [...prev, { role: 'assistant', text: response, time: now() }]);
      setAiTyping(false);
    }, 1000);
  };

  const filtered = landlords.filter(l =>
    !search || l.name?.toLowerCase().includes(search.toLowerCase()) ||
    l.company?.toLowerCase().includes(search.toLowerCase()) ||
    l.email?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" /></div>;
  }

  const sel = detail;
  const st = sel ? (STATUS_CONFIG[sel.status?.toLowerCase()] || STATUS_CONFIG.active) : null;
  const totalRent = properties.reduce((sum, p) => sum + (Number(p.rent_amount) || 0), 0);
  const activeTenancies = properties.filter(p => p.tenant_name || p.tenancy_start).length;

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

      {/* Left: Landlord list */}
      <div className="w-72 border-r border-gray-200/60 flex flex-col bg-white flex-shrink-0">
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900 tracking-tight">Landlords</h2>
            <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{filtered.length}</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#f6f7f3] rounded-lg focus:outline-none font-[Lufga]" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.map((l, i) => {
            const isSelected = selectedId === l.id;
            const ini = initials(l.name);
            return (
              <button key={l.id} onClick={() => setSelectedId(l.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all ${
                  isSelected ? 'bg-[#f6f7f3]' : 'hover:bg-gray-50'
                }`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isSelected ? 'bg-[#2a2a2a] text-white' : COLORS[i % COLORS.length] + ' text-white'
                }`}>
                  <span className="text-[10px] font-semibold">{ini}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>{l.name}</p>
                  <p className="text-[10px] text-gray-400 truncate">{l.company || 'Individual'}</p>
                </div>
                <span className="text-[10px] text-gray-400 flex-shrink-0">{l.properties_count ?? 0} props</span>
                {isSelected && <div className="w-1 h-6 rounded-full bg-[#2a2a2a]" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Center: Detail */}
      <div className="flex-1 overflow-y-auto" style={{ background: '#f6f7f3' }}>
        {detailLoading && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
          </div>
        )}

        {!sel && !detailLoading && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-400">Select a landlord to view details</p>
          </div>
        )}

        {sel && !detailLoading && (
          <div className="p-8">
            {/* Profile header */}
            <div className="bg-white rounded-2xl border border-gray-200/60 p-6 mb-5">
              <div className="flex items-start gap-6">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-bold text-gray-600">{initials(sel.name)}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{sel.name}</h1>
                    {st && (
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${st.bg} ${st.text}`}>{st.label}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{sel.company || 'Individual Landlord'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {[Phone, Mail, FileText, Plus].map((Icon, i) => (
                    <button key={i} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
                      <Icon className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-4 mb-5">
              <MiniStat label="Properties" value={String(properties.length)} />
              <MiniStat label="KYC Status" value={sel.kyc_completed ? 'Verified' : 'Pending'} ok={!!sel.kyc_completed} />
              <MiniStat label="Total Rent" value={`£${totalRent.toLocaleString()}`} />
              <MiniStat label="Active Tenancies" value={String(activeTenancies)} />
            </div>

            {/* Contact info card */}
            <div className="bg-white rounded-2xl border border-gray-200/60 p-5 mb-5">
              <div className="flex items-center gap-2 mb-4">
                <User className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Contact Information</h3>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-300" />
                  <div>
                    <p className="text-[10px] text-gray-400">Full Name</p>
                    <p className="text-sm text-gray-900">{sel.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-300" />
                  <div>
                    <p className="text-[10px] text-gray-400">Email</p>
                    <p className="text-sm text-gray-900">{sel.email || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-300" />
                  <div>
                    <p className="text-[10px] text-gray-400">Alt Email</p>
                    <p className="text-sm text-gray-900">{sel.alt_email || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-300" />
                  <div>
                    <p className="text-[10px] text-gray-400">Phone</p>
                    <p className="text-sm text-gray-900">{sel.phone || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-300" />
                  <div>
                    <p className="text-[10px] text-gray-400">Date of Birth</p>
                    <p className="text-sm text-gray-900">{sel.date_of_birth ? new Date(sel.date_of_birth).toLocaleDateString('en-GB') : '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-gray-300" />
                  <div>
                    <p className="text-[10px] text-gray-400">Marketing Preference</p>
                    <p className="text-sm text-gray-900">{sel.marketing_preference || 'Not set'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 col-span-2">
                  <MapPin className="w-4 h-4 text-gray-300" />
                  <div>
                    <p className="text-[10px] text-gray-400">Home Address</p>
                    <p className="text-sm text-gray-900">{sel.address || '—'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Compliance card */}
            <div className="bg-white rounded-2xl border border-gray-200/60 p-5 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Compliance</h3>
              </div>
              <div className="flex items-center gap-3">
                {sel.kyc_completed ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                    <span className="text-sm font-medium text-emerald-600">KYC Verified</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-amber-500" />
                    <span className="text-sm font-medium text-amber-600">KYC Pending</span>
                  </div>
                )}
              </div>
            </div>

            {/* Properties card */}
            <div className="bg-white rounded-2xl border border-gray-200/60 p-5 mb-5">
              <div className="flex items-center gap-2 mb-4">
                <Home className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Properties</h3>
                <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{properties.length}</span>
              </div>
              {properties.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No properties linked</p>
              ) : (
                <div className="space-y-2">
                  {properties.map((p: Property) => {
                    const pStatus = p.status?.toLowerCase();
                    const pSt = pStatus === 'let' || pStatus === 'active'
                      ? { bg: 'bg-emerald-50', text: 'text-emerald-600', label: p.status }
                      : pStatus === 'vacant'
                      ? { bg: 'bg-amber-50', text: 'text-amber-600', label: 'Vacant' }
                      : { bg: 'bg-gray-100', text: 'text-gray-500', label: p.status || 'Unknown' };
                    return (
                      <Link key={p.id} to={`/v2/properties`}
                        className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors group">
                        <div>
                          <p className="text-sm font-medium text-gray-900 group-hover:text-gray-700 transition-colors">{p.address}</p>
                          <p className="text-xs text-gray-400">{p.postcode}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {p.rent_amount != null && (
                            <span className="text-sm font-medium text-gray-700">£{Number(p.rent_amount).toLocaleString()}/mo</span>
                          )}
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${pSt.bg} ${pSt.text}`}>{pSt.label}</span>
                          <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Notes card */}
            <div className="bg-white rounded-2xl border border-gray-200/60 p-5 mb-5">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Notes</h3>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">{sel.notes || 'No notes recorded.'}</p>
            </div>

            {/* Documents section */}
            <div className="bg-white rounded-2xl border border-gray-200/60 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Upload className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Documents</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {DOCUMENT_CATEGORIES.map(cat => (
                  <div key={cat} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-gray-300" />
                      <span className="text-xs text-gray-700">{cat}</span>
                    </div>
                    <button className="text-[10px] text-gray-400 hover:text-gray-600 font-medium">Upload</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
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
              <p className="text-[10px] text-emerald-500">About this landlord</p>
            </div>
          </div>
        </div>

        {sel && (
          <div className="px-3 py-2 border-b border-gray-50 flex flex-wrap gap-1.5">
            {['Properties', 'Compliance', 'Chase docs', 'Rent summary'].map(s => (
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
              placeholder="Ask about this landlord..."
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
