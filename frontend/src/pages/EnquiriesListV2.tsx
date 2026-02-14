import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import {
  Search, Phone, Mail, MapPin, Briefcase, Calendar, CheckCircle,
  Clock, Home, Shield, CreditCard, User, ChevronDown, MoreHorizontal,
  Send, Paperclip, Mic, Plus, Eye, UserPlus, ArrowUpRight,
  FileText, AlertTriangle, Star, Circle, LayoutDashboard, Users as UsersIcon,
  Building2, Wrench, ClipboardList, Receipt, BarChart3, Settings, LogOut
} from 'lucide-react';

const NAV_ITEMS = [
  { icon: LayoutDashboard, href: '/v2', label: 'Dashboard' },
  { icon: UserPlus, href: '/v2/enquiries/list', label: 'Enquiries' },
  { icon: UsersIcon, href: '/v2/tenants', label: 'Tenants' },
  { icon: Building2, href: '/v2/landlords', label: 'Landlords' },
  { icon: BarChart3, href: '/v2/bdm', label: 'BDM' },
  { icon: Home, href: '/v2/properties', label: 'Properties' },
  { icon: Wrench, href: '/v2/maintenance', label: 'Maintenance' },
  { icon: ClipboardList, href: '/v2/tasks', label: 'Tasks' },
  { icon: Receipt, href: '/v2/transactions', label: 'Financials' },
];

interface TenantEnquiry {
  id: number;
  title_1: string;
  first_name_1: string;
  last_name_1: string;
  email_1: string;
  phone_1: string;
  is_joint_application: number;
  first_name_2?: string;
  last_name_2?: string;
  status: string;
  viewing_date?: string;
  follow_up_date?: string;
  linked_property_id?: number;
  property_address?: string;
  created_at: string;
  kyc_completed_1: number;
  kyc_completed_2: number;
  date_of_birth_1?: string;
  current_address_1?: string;
  employment_status_1?: string;
  employer_1?: string;
  income_1?: string;
  notes?: string;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  new:               { label: 'New',               bg: 'bg-emerald-50',  text: 'text-emerald-600' },
  viewing_booked:    { label: 'Viewing Booked',    bg: 'bg-violet-50',   text: 'text-violet-600' },
  awaiting_response: { label: 'Awaiting Response', bg: 'bg-amber-50',    text: 'text-amber-600' },
  onboarding:        { label: 'Onboarding',        bg: 'bg-sky-50',      text: 'text-sky-600' },
  converted:         { label: 'Converted',         bg: 'bg-gray-100',    text: 'text-gray-600' },
  rejected:          { label: 'Rejected',          bg: 'bg-red-50',      text: 'text-red-600' },
};

interface AIMessage { role: 'user' | 'assistant'; text: string; time: string; }

function now() { return new Date().toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' }); }

export default function EnquiriesListV2() {
  const api = useApi();
  const [enquiries, setEnquiries] = useState<TenantEnquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<TenantEnquiry | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiTyping, setAiTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [aiMessages]);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/tenant-enquiries');
      setEnquiries(data);
      if (data.length > 0) {
        setSelected(data[0]);
        setAiMessages([{ role: 'assistant', text: `You're viewing ${data[0].first_name_1} ${data[0].last_name_1}'s application. They applied ${new Date(data[0].created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${data[0].property_address ? ` for ${data[0].property_address}` : ''}. What would you like to know?`, time: now() }]);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [api]);

  useEffect(() => { load(); }, []);

  const selectEnquiry = (e: TenantEnquiry) => {
    setSelected(e);
    const name = `${e.first_name_1} ${e.last_name_1}`.trim();
    setAiMessages([{
      role: 'assistant',
      text: `Switched to ${name}. Status: ${STATUS_CONFIG[e.status]?.label || e.status}. ${e.property_address ? `Property: ${e.property_address}.` : 'No property linked.'} ${e.kyc_completed_1 ? 'KYC verified.' : 'KYC pending.'} Ask me anything about this applicant.`,
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
      if (lower.includes('risk') || lower.includes('flag') || lower.includes('check')) {
        response = `Risk assessment for ${name}:\n\n${selected.kyc_completed_1 ? '✓ KYC verified' : '⏳ KYC pending'}\n${selected.employer_1 ? `✓ Employed at ${selected.employer_1}` : '⏳ Employment not verified'}\n${selected.income_1 ? `✓ Income: £${selected.income_1}` : '⏳ Income not provided'}\n\nOverall: ${selected.kyc_completed_1 && selected.employer_1 ? 'Low risk — recommend proceeding' : 'Medium risk — pending verifications'}`;
      } else if (lower.includes('chase') || lower.includes('remind') || lower.includes('email')) {
        response = `I can draft a follow-up email to ${name}:\n\nSubject: Your application for ${selected.property_address || 'the property'}\n\n"Hi ${selected.first_name_1}, just checking in on your application. Please let us know if you need any further information..."\n\nWant me to send this to ${selected.email_1 || 'their email'}?`;
      } else if (lower.includes('property') || lower.includes('match') || lower.includes('similar')) {
        response = selected.property_address
          ? `${name} is currently linked to ${selected.property_address}. Based on their profile I can search for alternative matches if this falls through. Want me to look?`
          : `${name} isn't linked to a property yet. Based on their application details, I can suggest matching properties from the portfolio. Shall I?`;
      } else if (lower.includes('status') || lower.includes('move') || lower.includes('stage')) {
        response = `${name} is currently at "${STATUS_CONFIG[selected.status]?.label}". Next steps would be:\n\n${
          selected.status === 'new' ? '→ Schedule a viewing or request more information'
          : selected.status === 'viewing_booked' ? '→ After viewing: move to Awaiting Response or Onboarding'
          : selected.status === 'awaiting_response' ? '→ Follow up — they\'ve been waiting. Chase or close.'
          : selected.status === 'onboarding' ? '→ Complete referencing, sign tenancy, collect deposit'
          : '→ No further action needed'
        }\n\nWant me to update the status?`;
      } else {
        response = `${name} applied on ${new Date(selected.created_at).toLocaleDateString('en-GB')}. ${selected.email_1 ? `Email: ${selected.email_1}. ` : ''}${selected.phone_1 ? `Phone: ${selected.phone_1}. ` : ''}${selected.employer_1 ? `Works at ${selected.employer_1}. ` : ''}Currently "${STATUS_CONFIG[selected.status]?.label}". What specifically would you like to do?`;
      }
      setAiMessages(prev => [...prev, { role: 'assistant', text: response, time: now() }]);
      setAiTyping(false);
    }, 1000);
  };

  const filtered = enquiries.filter(e => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return e.first_name_1?.toLowerCase().includes(s) || e.last_name_1?.toLowerCase().includes(s) ||
      e.email_1?.toLowerCase().includes(s) || e.property_address?.toLowerCase().includes(s);
  });

  // Group by status
  const grouped: Record<string, TenantEnquiry[]> = {};
  filtered.forEach(e => {
    const key = e.status || 'new';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e);
  });

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" /></div>;
  }

  const st = selected ? (STATUS_CONFIG[selected.status] || STATUS_CONFIG.new) : null;
  const daysAgo = selected ? Math.floor((Date.now() - new Date(selected.created_at).getTime()) / 86400000) : 0;

  const location = useLocation();
  const { logout } = useAuth();

  return (
    <div className="font-[Lufga] flex h-screen overflow-hidden" style={{ background: '#f6f7f3' }}>
      {/* Icon sidebar */}
      <aside className="w-14 flex flex-col items-center py-4 gap-1 bg-[#2a2a2a] flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center mb-4">
          <span className="text-white text-sm font-bold tracking-tight">F</span>
        </div>
        <nav className="flex-1 flex flex-col items-center gap-0.5">
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname.startsWith(item.href);
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

      {/* Left: Contact list */}
      <div className="w-72 border-r border-gray-200/60 flex flex-col bg-white flex-shrink-0">
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900 tracking-tight">Enquiries</h2>
            <Link to="/v2/enquiries" className="text-gray-400 hover:text-gray-600" title="Board view">
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#f6f7f3] rounded-lg focus:outline-none font-[Lufga]" />
          </div>
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto">
          {Object.entries(STATUS_CONFIG).map(([status, config]) => {
            const items = grouped[status];
            if (!items || items.length === 0) return null;
            return (
              <div key={status}>
                <div className="px-4 py-2 flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{config.label}</span>
                  <span className="text-[10px] text-gray-300">{items.length}</span>
                </div>
                {items.map(e => {
                  const name = `${e.first_name_1 || ''} ${e.last_name_1 || ''}`.trim();
                  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                  const isSelected = selected?.id === e.id;
                  return (
                    <button key={e.id} onClick={() => selectEnquiry(e)}
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
                        <p className="text-[10px] text-gray-400 truncate">{e.property_address || e.email_1 || 'No property'}</p>
                      </div>
                      {isSelected && <div className="w-1 h-6 rounded-full bg-[#2a2a2a]" />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Center: Detail */}
      <div className="flex-1 overflow-y-auto" style={{ background: '#f6f7f3' }}>
        {selected ? (
          <div className="p-8">
            {/* Profile header */}
            <div className="bg-white rounded-2xl border border-gray-200/60 p-6 mb-5">
              <div className="flex items-start gap-6">
                {/* Avatar */}
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-bold text-gray-600">
                    {`${selected.first_name_1?.[0] || ''}${selected.last_name_1?.[0] || ''}`.toUpperCase()}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                      {selected.first_name_1} {selected.last_name_1}
                    </h1>
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${st!.bg} ${st!.text}`}>
                      {st!.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-3">
                    {selected.phone_1 && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-gray-300" />
                        <div>
                          <p className="text-[10px] text-gray-400">Phone</p>
                          <p className="text-sm text-gray-900">{selected.phone_1}</p>
                        </div>
                      </div>
                    )}
                    {selected.email_1 && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-gray-300" />
                        <div>
                          <p className="text-[10px] text-gray-400">Email</p>
                          <p className="text-sm text-gray-900">{selected.email_1}</p>
                        </div>
                      </div>
                    )}
                    {selected.current_address_1 && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-gray-300" />
                        <div>
                          <p className="text-[10px] text-gray-400">Address</p>
                          <p className="text-sm text-gray-900">{selected.current_address_1}</p>
                        </div>
                      </div>
                    )}
                    {selected.employer_1 && (
                      <div className="flex items-center gap-2">
                        <Briefcase className="w-4 h-4 text-gray-300" />
                        <div>
                          <p className="text-[10px] text-gray-400">Employer</p>
                          <p className="text-sm text-gray-900">{selected.employer_1}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
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
              <MiniStat label="Applied" value={daysAgo === 0 ? 'Today' : `${daysAgo}d ago`} />
              <MiniStat label="KYC" value={selected.kyc_completed_1 ? 'Verified' : 'Pending'} ok={!!selected.kyc_completed_1} />
              <MiniStat label="Property" value={selected.property_address ? 'Linked' : 'None'} ok={!!selected.property_address} />
              <MiniStat label="Joint" value={selected.is_joint_application ? 'Yes' : 'No'} />
            </div>

            {/* Property card */}
            {selected.property_address && (
              <div className="bg-white rounded-2xl border border-gray-200/60 p-5 mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <Home className="w-4 h-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900">Linked Property</h3>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-semibold text-gray-900">{selected.property_address}</p>
                    {selected.viewing_date && (
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Viewing: {new Date(selected.viewing_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </p>
                    )}
                  </div>
                  {selected.linked_property_id && (
                    <Link to={`/properties/${selected.linked_property_id}`}
                      className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5">
                      View <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Joint applicant */}
            {selected.is_joint_application === 1 && selected.first_name_2 && (
              <div className="bg-white rounded-2xl border border-gray-200/60 p-5 mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-4 h-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900">Joint Applicant</h3>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <span className="text-xs font-semibold text-gray-600">
                      {selected.first_name_2?.[0]}{selected.last_name_2?.[0]}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{selected.first_name_2} {selected.last_name_2}</p>
                    <p className="text-[11px] text-gray-400">
                      {selected.kyc_completed_2 ? '✓ KYC Verified' : 'KYC Pending'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
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
            <p className="text-sm text-gray-400">Select an enquiry to view details</p>
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
              <p className="text-[10px] text-emerald-500">About this applicant</p>
            </div>
          </div>
        </div>

        {/* Suggestions for this applicant */}
        {selected && (
          <div className="px-3 py-2 border-b border-gray-50 flex flex-wrap gap-1.5">
            {['Risk check', 'Chase email', 'Match properties', 'Update status'].map(s => (
              <button key={s} onClick={() => setAiInput(s)}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Messages */}
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

        {/* Input */}
        <div className="p-3 border-t border-gray-100">
          <div className="flex items-center gap-1.5 bg-[#f6f7f3] rounded-xl px-3 py-2">
            <input type="text" value={aiInput} onChange={e => setAiInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAiSend()}
              placeholder="Ask about this applicant..."
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
