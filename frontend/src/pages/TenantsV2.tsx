import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import {
  Search, Phone, Mail, MapPin, Calendar, CheckCircle,
  Home, CreditCard, User, Send, FileText, AlertTriangle,
  LayoutDashboard, Users as UsersIcon, Building2, Wrench,
  ClipboardList, Receipt, BarChart3, Settings, LogOut,
  UserPlus, ArrowUpRight, Shield, Heart, UserCheck, Percent
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

interface Tenant {
  id: number;
  title_1: string;
  first_name_1: string;
  last_name_1: string;
  name: string;
  email: string;
  phone: string;
  date_of_birth_1?: string;
  is_joint_tenancy: number;
  title_2?: string;
  first_name_2?: string;
  last_name_2?: string;
  email_2?: string;
  phone_2?: string;
  date_of_birth_2?: string;
  nok_name?: string;
  nok_relationship?: string;
  nok_phone?: string;
  nok_email?: string;
  kyc_completed_1: number;
  kyc_completed_2: number;
  guarantor_required: number;
  guarantor_name?: string;
  guarantor_address?: string;
  guarantor_phone?: string;
  guarantor_email?: string;
  guarantor_kyc_completed: number;
  guarantor_deed_received: number;
  holding_deposit_received: number;
  holding_deposit_amount?: number;
  holding_deposit_date?: string;
  application_forms_completed: number;
  property_id?: number;
  property_address?: string;
  tenancy_start_date?: string;
  tenancy_type?: string;
  has_end_date: number;
  tenancy_end_date?: string;
  monthly_rent?: number;
  notes?: string;
  emergency_contact?: string;
  created_at: string;
  updated_at: string;
}

const STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  active:   { label: 'Active',   bg: 'bg-emerald-50',  text: 'text-emerald-600' },
  pending:  { label: 'Pending',  bg: 'bg-amber-50',    text: 'text-amber-600' },
  ended:    { label: 'Ended',    bg: 'bg-red-50',      text: 'text-red-600' },
  inactive: { label: 'Inactive', bg: 'bg-gray-100',    text: 'text-gray-600' },
};

interface AIMessage { role: 'user' | 'assistant'; text: string; time: string; }

function now() { return new Date().toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' }); }

function getOnboardingPercent(t: Tenant): number {
  let total = 4; // holding deposit, application forms, kyc_1, guarantor (if required)
  let done = 0;
  if (t.holding_deposit_received) done++;
  if (t.application_forms_completed) done++;
  if (t.kyc_completed_1) done++;
  if (t.guarantor_required) {
    total++;
    if (t.guarantor_kyc_completed && t.guarantor_deed_received) done++;
  }
  if (t.is_joint_tenancy) {
    total++;
    if (t.kyc_completed_2) done++;
  }
  done++; // base count for guarantor slot when not required
  return Math.min(100, Math.round((done / total) * 100));
}

function getTenantStatus(t: Tenant): string {
  if (t.tenancy_end_date && new Date(t.tenancy_end_date) < new Date()) return 'ended';
  if (t.tenancy_start_date && new Date(t.tenancy_start_date) <= new Date()) return 'active';
  return 'pending';
}

export default function TenantsV2() {
  const api = useApi();
  const location = useLocation();
  const { logout } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiTyping, setAiTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [aiMessages]);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/tenants');
      setTenants(data);
      if (data.length > 0) {
        setSelected(data[0]);
        const t = data[0];
        const name = `${t.first_name_1} ${t.last_name_1}`.trim();
        setAiMessages([{
          role: 'assistant',
          text: `You're viewing ${name}'s tenancy. ${t.property_address ? `Property: ${t.property_address}.` : 'No property linked.'} ${t.monthly_rent ? `Rent: £${t.monthly_rent}/month.` : ''} What would you like to know?`,
          time: now()
        }]);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [api]);

  useEffect(() => { load(); }, []);

  const selectTenant = (t: Tenant) => {
    setSelected(t);
    const name = `${t.first_name_1} ${t.last_name_1}`.trim();
    const status = getTenantStatus(t);
    setAiMessages([{
      role: 'assistant',
      text: `Switched to ${name}. Status: ${STATUS_MAP[status]?.label || status}. ${t.property_address ? `Property: ${t.property_address}.` : 'No property linked.'} ${t.kyc_completed_1 ? 'KYC verified.' : 'KYC pending.'} Ask me anything about this tenant.`,
      time: now()
    }]);
  };

  const handleAiSend = () => {
    if (!aiInput.trim() || !selected) return;
    const msg = aiInput.trim();
    setAiMessages(prev => [...prev, { role: 'user', text: msg, time: now() }]);
    setAiInput('');
    setAiTyping(true);

    const name = `${selected.first_name_1} ${selected.last_name_1}`.trim();
    setTimeout(() => {
      let response = '';
      const lower = msg.toLowerCase();
      if (lower.includes('risk') || lower.includes('check')) {
        response = `Risk assessment for ${name}:\n\n${selected.kyc_completed_1 ? '✓ KYC verified' : '⏳ KYC pending'}\n${selected.monthly_rent ? `✓ Rent: £${selected.monthly_rent}/month` : '⏳ Rent not set'}\n${selected.guarantor_required ? (selected.guarantor_kyc_completed ? '✓ Guarantor KYC verified' : '⏳ Guarantor KYC pending') : '— No guarantor required'}\n${selected.nok_name ? '✓ Next of Kin on file' : '⚠ Next of Kin missing'}\n\nOverall: ${selected.kyc_completed_1 && (!selected.guarantor_required || selected.guarantor_kyc_completed) ? 'Low risk — fully compliant' : 'Medium risk — pending verifications'}`;
      } else if (lower.includes('chase') || lower.includes('rent')) {
        response = `I can draft a rent chase email to ${name}:\n\nSubject: Rent reminder for ${selected.property_address || 'your property'}\n\n"Hi ${selected.first_name_1}, this is a friendly reminder regarding your rent payment of £${selected.monthly_rent || 0} for ${selected.property_address || 'your property'}. Please ensure payment is made at your earliest convenience..."\n\nWant me to send this to ${selected.email || 'their email'}?`;
      } else if (lower.includes('compliance') || lower.includes('kyc') || lower.includes('onboard')) {
        const pct = getOnboardingPercent(selected);
        response = `Compliance status for ${name}:\n\n${selected.kyc_completed_1 ? '✓' : '✗'} KYC (Tenant 1)\n${selected.is_joint_tenancy ? (selected.kyc_completed_2 ? '✓' : '✗') + ' KYC (Tenant 2)\n' : ''}${selected.holding_deposit_received ? '✓' : '✗'} Holding Deposit${selected.holding_deposit_amount ? ` (£${selected.holding_deposit_amount})` : ''}\n${selected.application_forms_completed ? '✓' : '✗'} Application Forms\n${selected.guarantor_required ? ((selected.guarantor_kyc_completed ? '✓' : '✗') + ' Guarantor KYC\n' + (selected.guarantor_deed_received ? '✓' : '✗') + ' Deed of Guarantee') : '— Guarantor not required'}\n\nOnboarding: ${pct}% complete.`;
      } else if (lower.includes('status') || lower.includes('update') || lower.includes('move')) {
        const status = getTenantStatus(selected);
        response = `${name} is currently "${STATUS_MAP[status]?.label}". ${selected.tenancy_end_date ? `Tenancy ends ${new Date(selected.tenancy_end_date).toLocaleDateString('en-GB')}.` : 'No end date set.'}\n\n${
          status === 'pending' ? '→ Complete onboarding checks before activating tenancy'
          : status === 'active' ? '→ Tenancy is active. Monitor rent payments and compliance.'
          : '→ Tenancy has ended. Archive or renew as needed.'
        }\n\nWant me to update the status?`;
      } else {
        response = `${name} — ${selected.email ? `Email: ${selected.email}. ` : ''}${selected.phone ? `Phone: ${selected.phone}. ` : ''}${selected.property_address ? `Property: ${selected.property_address}. ` : ''}${selected.monthly_rent ? `Rent: £${selected.monthly_rent}/month. ` : ''}${selected.tenancy_type ? `Type: ${selected.tenancy_type}. ` : ''}Currently "${STATUS_MAP[getTenantStatus(selected)]?.label}". What specifically would you like to do?`;
      }
      setAiMessages(prev => [...prev, { role: 'assistant', text: response, time: now() }]);
      setAiTyping(false);
    }, 1000);
  };

  const filtered = tenants.filter(t => {
    if (!search) return true;
    const s = search.toLowerCase();
    return t.first_name_1?.toLowerCase().includes(s) || t.last_name_1?.toLowerCase().includes(s) ||
      t.name?.toLowerCase().includes(s) || t.email?.toLowerCase().includes(s) ||
      t.property_address?.toLowerCase().includes(s);
  });

  // Group by derived status
  const grouped: Record<string, Tenant[]> = {};
  filtered.forEach(t => {
    const key = getTenantStatus(t);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  });

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" /></div>;
  }

  const st = selected ? (STATUS_MAP[getTenantStatus(selected)] || STATUS_MAP.active) : null;
  const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const onboardPct = selected ? getOnboardingPercent(selected) : 0;

  return (
    <div className="font-[Lufga] flex h-screen overflow-hidden" style={{ background: '#f6f7f3' }}>
      {/* Icon sidebar */}
      <aside className="w-14 flex flex-col items-center py-4 gap-1 bg-[#2a2a2a] flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center mb-4">
          <span className="text-white text-sm font-bold tracking-tight">F</span>
        </div>
        <nav className="flex-1 flex flex-col items-center gap-0.5">
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname.startsWith(item.href) && (item.href === '/v2' ? location.pathname === '/v2' : true);
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

      {/* Left: Tenant list */}
      <div className="w-72 border-r border-gray-200/60 flex flex-col bg-white flex-shrink-0">
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900 tracking-tight">Tenants</h2>
            <span className="text-xs text-gray-400">{tenants.length}</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#f6f7f3] rounded-lg focus:outline-none font-[Lufga]" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {(['active', 'pending', 'ended'] as const).map(status => {
            const config = STATUS_MAP[status];
            const items = grouped[status];
            if (!items || items.length === 0) return null;
            return (
              <div key={status}>
                <div className="px-4 py-2 flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{config.label}</span>
                  <span className="text-[10px] text-gray-300">{items.length}</span>
                </div>
                {items.map(t => {
                  const name = `${t.first_name_1 || ''} ${t.last_name_1 || ''}`.trim() || t.name;
                  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                  const isSelected = selected?.id === t.id;
                  return (
                    <button key={t.id} onClick={() => selectTenant(t)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all ${
                        isSelected ? 'bg-[#f6f7f3]' : 'hover:bg-gray-50'
                      }`}>
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-[#2a2a2a] text-white' : 'bg-gray-100 text-gray-600'
                      }`}>
                        <span className="text-[10px] font-semibold">{initials}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>{name}</p>
                        <p className="text-[10px] text-gray-400 truncate">{t.property_address || 'No property'}</p>
                      </div>
                      {isSelected && <div className="w-1 h-6 rounded-full bg-[#2a2a2a]" />}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-12">No tenants found</p>
          )}
        </div>
      </div>

      {/* Center: Detail */}
      <div className="flex-1 overflow-y-auto" style={{ background: '#f6f7f3' }}>
        {selected ? (
          <div className="p-8">
            {/* Profile header */}
            <div className="bg-white rounded-2xl border border-gray-200/60 p-6 mb-5">
              <div className="flex items-start gap-6">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-bold text-gray-600">
                    {`${selected.first_name_1?.[0] || ''}${selected.last_name_1?.[0] || ''}`.toUpperCase()}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                      {selected.title_1 ? `${selected.title_1} ` : ''}{selected.first_name_1} {selected.last_name_1}
                    </h1>
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${st!.bg} ${st!.text}`}>
                      {st!.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-3">
                    {selected.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-gray-300" />
                        <div>
                          <p className="text-[10px] text-gray-400">Phone</p>
                          <p className="text-sm text-gray-900">{selected.phone}</p>
                        </div>
                      </div>
                    )}
                    {selected.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-gray-300" />
                        <div>
                          <p className="text-[10px] text-gray-400">Email</p>
                          <p className="text-sm text-gray-900">{selected.email}</p>
                        </div>
                      </div>
                    )}
                    {selected.property_address && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-gray-300" />
                        <div>
                          <p className="text-[10px] text-gray-400">Address</p>
                          <p className="text-sm text-gray-900">{selected.property_address}</p>
                        </div>
                      </div>
                    )}
                    {selected.date_of_birth_1 && (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-300" />
                        <div>
                          <p className="text-[10px] text-gray-400">Date of Birth</p>
                          <p className="text-sm text-gray-900">{fmt(selected.date_of_birth_1)}</p>
                        </div>
                      </div>
                    )}
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
              <MiniStat label="Tenancy Start" value={selected.tenancy_start_date ? fmt(selected.tenancy_start_date) : 'Not set'} />
              <MiniStat label="KYC Status" value={selected.kyc_completed_1 ? 'Verified' : 'Pending'} ok={!!selected.kyc_completed_1} />
              <MiniStat label="Monthly Rent" value={selected.monthly_rent ? `£${Number(selected.monthly_rent).toLocaleString('en-GB')}` : '—'} />
              <MiniStat label="Onboarding" value={`${onboardPct}%`} ok={onboardPct === 100 ? true : onboardPct > 50 ? undefined : false} />
            </div>

            {/* Tenancy Details card */}
            <div className="bg-white rounded-2xl border border-gray-200/60 p-5 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Tenancy Details</h3>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <p className="text-[10px] text-gray-400">Start Date</p>
                  <p className="text-sm text-gray-900">{fmt(selected.tenancy_start_date)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400">Type</p>
                  <p className="text-sm text-gray-900">{selected.tenancy_type || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400">End Date</p>
                  <p className="text-sm text-gray-900">{selected.has_end_date ? fmt(selected.tenancy_end_date) : 'Rolling'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400">Monthly Rent</p>
                  <p className="text-sm text-gray-900">{selected.monthly_rent ? `£${Number(selected.monthly_rent).toLocaleString('en-GB', { minimumFractionDigits: 2 })}` : '—'}</p>
                </div>
              </div>
            </div>

            {/* Property card */}
            <div className="bg-white rounded-2xl border border-gray-200/60 p-5 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <Home className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Linked Property</h3>
              </div>
              {selected.property_address ? (
                <div className="flex items-center justify-between">
                  <p className="text-base font-semibold text-gray-900">{selected.property_address}</p>
                  {selected.property_id && (
                    <Link to={`/v2/properties`} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5">
                      View <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No property linked</p>
              )}
            </div>

            {/* Next of Kin card */}
            <div className="bg-white rounded-2xl border border-gray-200/60 p-5 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <Heart className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Next of Kin</h3>
              </div>
              {selected.nok_name ? (
                <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                  <div>
                    <p className="text-[10px] text-gray-400">Name</p>
                    <p className="text-sm text-gray-900">{selected.nok_name}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400">Relationship</p>
                    <p className="text-sm text-gray-900">{selected.nok_relationship || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400">Phone</p>
                    <p className="text-sm text-gray-900">{selected.nok_phone || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400">Email</p>
                    <p className="text-sm text-gray-900">{selected.nok_email || '—'}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertTriangle className="w-4 h-4" />
                  <p className="text-sm font-medium">Missing — next of kin details required</p>
                </div>
              )}
            </div>

            {/* Onboarding Checklist card */}
            <div className="bg-white rounded-2xl border border-gray-200/60 p-5 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Onboarding Checklist</h3>
                <span className="ml-auto text-[11px] font-semibold text-gray-400">{onboardPct}%</span>
              </div>
              <div className="space-y-2.5">
                <CheckItem label="Holding Deposit" done={!!selected.holding_deposit_received}
                  detail={selected.holding_deposit_received && selected.holding_deposit_amount ? `£${selected.holding_deposit_amount}${selected.holding_deposit_date ? ` — ${fmt(selected.holding_deposit_date)}` : ''}` : undefined} />
                <CheckItem label="Application Forms" done={!!selected.application_forms_completed} />
                <CheckItem label={`KYC — ${selected.first_name_1} ${selected.last_name_1}`} done={!!selected.kyc_completed_1} />
                {selected.is_joint_tenancy === 1 && selected.first_name_2 && (
                  <CheckItem label={`KYC — ${selected.first_name_2} ${selected.last_name_2}`} done={!!selected.kyc_completed_2} />
                )}
                {selected.guarantor_required === 1 && (
                  <>
                    <div className="border-t border-gray-100 pt-2 mt-2">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Guarantor</p>
                    </div>
                    <CheckItem label={`Guarantor: ${selected.guarantor_name || 'Not named'}`} done={!!selected.guarantor_kyc_completed}
                      detail={selected.guarantor_address || undefined} />
                    <CheckItem label="Deed of Guarantee" done={!!selected.guarantor_deed_received} />
                  </>
                )}
              </div>
            </div>

            {/* Joint Tenant card */}
            {selected.is_joint_tenancy === 1 && selected.first_name_2 && (
              <div className="bg-white rounded-2xl border border-gray-200/60 p-5 mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <UserCheck className="w-4 h-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900">Joint Tenant</h3>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <span className="text-xs font-semibold text-gray-600">
                      {selected.first_name_2?.[0]}{selected.last_name_2?.[0]}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{selected.title_2 ? `${selected.title_2} ` : ''}{selected.first_name_2} {selected.last_name_2}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <p className="text-[11px] text-gray-400">
                        {selected.kyc_completed_2 ? '✓ KYC Verified' : 'KYC Pending'}
                      </p>
                      {selected.email_2 && <p className="text-[11px] text-gray-400">{selected.email_2}</p>}
                      {selected.phone_2 && <p className="text-[11px] text-gray-400">{selected.phone_2}</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Notes card */}
            {selected.notes && (
              <div className="bg-white rounded-2xl border border-gray-200/60 p-5">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900">Notes</h3>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{selected.notes}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <UsersIcon className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm text-gray-400">Select a tenant to view details</p>
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
              <p className="text-[10px] text-emerald-500">About this tenant</p>
            </div>
          </div>
        </div>

        {selected && (
          <div className="px-3 py-2 border-b border-gray-50 flex flex-wrap gap-1.5">
            {['Risk check', 'Chase rent', 'Compliance', 'Update status'].map(s => (
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
              placeholder="Ask about this tenant..."
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

function CheckItem({ label, done, detail }: { label: string; done: boolean; detail?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${done ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-300'}`}>
        <CheckCircle className="w-3 h-3" />
      </div>
      <div>
        <p className={`text-sm ${done ? 'text-gray-900' : 'text-gray-500'}`}>{label}</p>
        {detail && <p className="text-[10px] text-gray-400">{detail}</p>}
      </div>
    </div>
  );
}
