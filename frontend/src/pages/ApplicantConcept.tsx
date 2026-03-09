import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  ArrowLeft, Download, Printer, Star, MapPin, Edit3, Share2,
  Phone, Mail, Calendar, FileText, MessageSquare, Clock, ChevronRight,
  Home, User, Shield, Flame, Zap, AlertTriangle, CheckCircle, X,
  Send, Paperclip, Mic, MoreHorizontal, ChevronDown, Search,
  Building2, Key, CreditCard, Activity, Eye, Plus, LayoutDashboard,
  Users, Wrench, ClipboardList, Receipt, UserPlus, Settings, Bell,
  LogOut, ChevronLeft, BarChart3, FolderOpen, Bookmark, Link2, Globe
} from 'lucide-react';

const APPLICANT = {
  name: 'Eleanor Whitfield',
  email: 'eleanor.w@gmail.com',
  phone: '07841 293 847',
  status: 'Viewing Booked',
  source: 'Rightmove',
  appliedDate: '12 Feb 2026',
  budget: '£1,200/mo',
  moveDate: '1 Mar 2026',
  occupation: 'Marketing Manager',
  employer: 'Saatchi & Saatchi',
  salary: '£52,000',
  currentAddress: '14 Elm Grove, SW11 3PQ',
  references: 2,
  creditScore: 742,
  pets: 'No',
  smoker: 'No',
  guarantor: 'Yes — Patricia Whitfield (Mother)',
};

const PROPERTY = {
  address: '12 Queens Drive, Flat 3',
  postcode: 'SW4 8BJ',
  rent: '£1,150/mo',
  type: 'Flat',
  beds: 2,
  baths: 1,
  sqft: 680,
  status: 'Available',
  epc: 'C',
  available: '1 Mar 2026',
  landlord: 'Mrs. J. Hargreaves',
  image: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&h=400&fit=crop',
  images: [
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=200&h=150&fit=crop',
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=200&h=150&fit=crop',
    'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=200&h=150&fit=crop',
  ],
};

const TIMELINE = [
  { date: '14 Feb', time: '10:30', event: 'Viewing confirmed for 12 Queens Drive', type: 'viewing', user: 'Sam Fleming' },
  { date: '13 Feb', time: '16:20', event: 'References requested via email', type: 'document', user: 'System' },
  { date: '12 Feb', time: '14:45', event: 'Called applicant — viewing arranged for 14th', type: 'call', user: 'Sam Fleming' },
  { date: '12 Feb', time: '14:15', event: 'Enquiry received via Rightmove', type: 'new', user: 'System' },
];

const AI_MESSAGES = [
  { role: 'assistant', text: "Hi Sam. I can see you're reviewing Eleanor Whitfield's application. Her credit score is strong at 742 and rent-to-income is a healthy 26%. One thing to note — the landlord reference is still pending after 2 days. Want me to send a chase?", time: '3:40 pm' },
];

const TABS = ['Overview', 'Documents', 'Activity', 'Notes', 'Compliance'];

const NAV_SECTIONS: { label: string | null; items: { icon: any; label: string; href: string; active: boolean; badge?: number }[] }[] = [
  {
    label: null,
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', href: '/', active: false },
    ]
  },
  {
    label: 'Contacts',
    items: [
      { icon: UserPlus, label: 'Enquiries', href: '/tenant-enquiries', active: true, badge: 5 },
      { icon: Users, label: 'Tenants', href: '/tenants', active: false },
      { icon: Building2, label: 'Landlords', href: '/landlords', active: false },
      { icon: BarChart3, label: 'BDM Pipeline', href: '/landlords-bdm', active: false },
    ]
  },
  {
    label: 'Property',
    items: [
      { icon: Home, label: 'Properties', href: '/properties', active: false },
      { icon: Wrench, label: 'Maintenance', href: '/maintenance', active: false },
    ]
  },
  {
    label: 'Operations',
    items: [
      { icon: ClipboardList, label: 'Tasks', href: '/tasks', active: false },
      { icon: Receipt, label: 'Financials', href: '/transactions', active: false },
      { icon: FileText, label: 'Reports', href: '#', active: false },
    ]
  },
];

export default function ApplicantConcept() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('Overview');
  const [aiMessages, setAiMessages] = useState(AI_MESSAGES);
  const [aiInput, setAiInput] = useState('');
  const [aiTyping, setAiTyping] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [complianceScore] = useState(78);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages]);

  const handleAiSend = () => {
    if (!aiInput.trim()) return;
    const msg = aiInput.trim();
    setAiMessages(prev => [...prev, { role: 'user', text: msg, time: new Date().toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' }) }]);
    setAiInput('');
    setAiTyping(true);

    setTimeout(() => {
      let response = '';
      if (msg.toLowerCase().includes('credit') || msg.toLowerCase().includes('score')) {
        response = `Eleanor's credit score is ${APPLICANT.creditScore} — that's solidly in the "Good" range. Her salary of ${APPLICANT.salary} gives a rent-to-income ratio of ~26%, well within the 30% limit. No red flags here.`;
      } else if (msg.toLowerCase().includes('reference') || msg.toLowerCase().includes('chase') || msg.toLowerCase().includes('landlord')) {
        response = `Her employer reference from ${APPLICANT.employer} came through clean — verified role and salary. The current landlord at ${APPLICANT.currentAddress} hasn't responded yet (2 days). I can draft and send a chase email now if you'd like.`;
      } else if (msg.toLowerCase().includes('property') || msg.toLowerCase().includes('match') || msg.toLowerCase().includes('similar')) {
        response = `Based on Eleanor's budget of ${APPLICANT.budget} and 2-bed preference:\n\n• 12 Queens Drive, Flat 3 — £1,150/mo (viewing booked)\n• 8 Oak Street — £1,100/mo (available now)\n• 15 Church Lane, Flat 1 — £1,200/mo (available 15 Mar)\n\nShall I book additional viewings?`;
      } else if (msg.toLowerCase().includes('risk') || msg.toLowerCase().includes('flag') || msg.toLowerCase().includes('assess')) {
        response = `Risk assessment for Eleanor Whitfield:\n\nCredit: 742 — Good\nAffordability: 26% ratio — Pass\nGuarantor: Provided — Patricia Whitfield\nReferences: 1/2 verified\nPets: None · Smoker: No\n\nOverall: Low risk. Recommend proceeding to offer once landlord reference clears.`;
      } else {
        response = `Eleanor applied ${APPLICANT.appliedDate} for ${PROPERTY.address} at ${PROPERTY.rent}. She's a ${APPLICANT.occupation} at ${APPLICANT.employer}, earning ${APPLICANT.salary}. Currently at viewing stage with a compliance score of ${complianceScore}%. What specifically would you like to know?`;
      }
      setAiMessages(prev => [...prev, { role: 'assistant', text: response, time: new Date().toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' }) }]);
      setAiTyping(false);
    }, 1200);
  };

  const arcRadius = 58;
  const arcCircumference = Math.PI * arcRadius;
  const arcProgress = (complianceScore / 100) * arcCircumference;

  return (
    <div className="font-[Lufga] flex h-screen overflow-hidden" style={{ background: '#f6f7f3' }}>
      {/* Sidebar Navigation */}
      <aside className={`flex flex-col bg-white border-r border-gray-200/60 transition-all duration-200 ${sidebarCollapsed ? 'w-16' : 'w-56'}`}>
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center">
                <span className="text-white text-xs font-bold tracking-tight">F</span>
              </div>
              <span className="text-sm font-semibold text-gray-900 tracking-tight">Fleming</span>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center mx-auto">
              <span className="text-white text-xs font-bold tracking-tight">F</span>
            </div>
          )}
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`p-1 rounded hover:bg-gray-100 text-gray-400 ${sidebarCollapsed ? 'hidden' : ''}`}>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        {!sidebarCollapsed && (
          <div className="px-3 py-3">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
              <Search className="w-3.5 h-3.5 text-gray-400" />
              <input type="text" placeholder="Search..." className="bg-transparent text-xs text-gray-700 placeholder-gray-400 focus:outline-none w-full" />
            </div>
          </div>
        )}

        {/* Nav sections */}
        <nav className="flex-1 overflow-y-auto px-2 py-1">
          {NAV_SECTIONS.map((section, si) => (
            <div key={si} className="mb-3">
              {section.label && !sidebarCollapsed && (
                <p className="px-2 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{section.label}</p>
              )}
              {sidebarCollapsed && section.label && (
                <div className="w-6 h-px bg-gray-100 mx-auto mb-2" />
              )}
              {section.items.map((item, ii) => (
                <a key={ii} href={item.href}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg mb-0.5 transition-all ${item.active
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                    } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
                  title={sidebarCollapsed ? item.label : undefined}>
                  <item.icon className={`w-4 h-4 flex-shrink-0 ${item.active ? 'text-white' : 'text-gray-400'}`} />
                  {!sidebarCollapsed && (
                    <>
                      <span className="text-xs font-medium flex-1">{item.label}</span>
                      {item.badge && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${item.active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                          }`}>{item.badge}</span>
                      )}
                    </>
                  )}
                </a>
              ))}
            </div>
          ))}
        </nav>

        {/* User */}
        <div className={`border-t border-gray-100 p-3 ${sidebarCollapsed ? 'flex justify-center' : ''}`}>
          {!sidebarCollapsed ? (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                <span className="text-[10px] font-semibold text-gray-600">SF</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate">{user?.name || 'Sam Fleming'}</p>
                <p className="text-[10px] text-gray-400">Admin</p>
              </div>
              <button className="text-gray-300 hover:text-gray-500">
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
              <span className="text-[10px] font-semibold text-gray-600">SF</span>
            </div>
          )}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200/60">
          <div className="flex items-center gap-4">
            <a href="/tenant-enquiries" className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <ArrowLeft className="w-4 h-4 text-gray-500" />
            </a>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                <span className="text-xs font-semibold text-gray-600">EW</span>
              </div>
              <div>
                <h1 className="text-base font-semibold text-gray-900 tracking-tight">{APPLICANT.name}</h1>
                <p className="text-[11px] text-gray-400">{APPLICANT.occupation} · {APPLICANT.source} · Applied {APPLICANT.appliedDate}</p>
              </div>
              <span className="ml-2 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                {APPLICANT.status}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 mr-2">
              {[
                { icon: FolderOpen, tip: 'Files' },
                { icon: Bookmark, tip: 'Save' },
                { icon: Link2, tip: 'Copy link' },
                { icon: Globe, tip: 'Portal' },
                { icon: Edit3, tip: 'Edit' },
                { icon: Share2, tip: 'Share' },
              ].map(({ icon: Icon, tip }, i) => (
                <button key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${i === 0 ? 'bg-gray-100 text-gray-700' : 'hover:bg-gray-50 text-gray-400 hover:text-gray-600'
                  }`} title={tip}>
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <Download className="w-3.5 h-3.5" /> Download
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors">
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
          </div>
        </header>

        {/* Pipeline strip */}
        <div className="px-6 py-2.5 bg-white border-b border-gray-200/60">
          <div className="flex items-center gap-1">
            {[
              { stage: 1, label: 'New', people: ['EW', 'JR', 'MK'], active: false, past: true },
              { stage: 2, label: 'Viewing', people: ['EW'], active: true, past: false },
              { stage: 3, label: 'Referencing', people: ['AT', 'BL'], active: false, past: false },
              { stage: 4, label: 'Approved', people: [], active: false, past: false },
            ].map((s, i) => (
              <div key={i} className="flex items-center">
                {i > 0 && <div className="w-8 flex items-center justify-center"><ChevronRight className="w-3.5 h-3.5 text-gray-300" /></div>}
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${s.active ? 'bg-emerald-50 border border-emerald-200' : s.past ? 'bg-gray-50 border border-gray-100' : 'hover:bg-gray-50'
                  }`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${s.active ? 'bg-emerald-500 text-white' : s.past ? 'bg-gray-300 text-white' : 'bg-gray-200 text-gray-500'
                    }`}>{s.stage}</span>
                  <div className="flex -space-x-1.5">
                    {s.people.map((p, j) => (
                      <div key={j} className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold border-2 border-white ${s.active && j === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                        }`}>{p}</div>
                    ))}
                    {s.people.length === 0 && <div className="w-6 h-6 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center">
                      <Plus className="w-3 h-3 text-gray-300" />
                    </div>}
                  </div>
                  <span className={`text-[11px] font-medium ${s.active ? 'text-emerald-700' : 'text-gray-400'}`}>{s.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main scrollable content */}
          <div className="flex-1 overflow-y-auto">
            {/* Tabs */}
            <div className="px-6 bg-white border-b border-gray-200/60 sticky top-0 z-10">
              <div className="flex items-center gap-6">
                {TABS.map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`py-3 text-xs font-medium border-b-2 transition-all ${activeTab === tab
                        ? 'border-gray-900 text-gray-900'
                        : 'border-transparent text-gray-400 hover:text-gray-600'
                      }`}>{tab}</button>
                ))}
              </div>
            </div>

            {/* Page content */}
            <div className="p-6 grid grid-cols-5 gap-5">
              {/* Left column — 2 cols */}
              <div className="col-span-2 space-y-5">
                {/* Compliance Score */}
                <div className="bg-white rounded-xl p-5 border border-gray-200/60">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-gray-400" />
                      <h3 className="text-sm font-semibold text-gray-900">Compliance Score</h3>
                    </div>
                    <button className="text-gray-300 hover:text-gray-500"><MoreHorizontal className="w-4 h-4" /></button>
                  </div>

                  <div className="flex flex-col items-center">
                    <svg width="160" height="90" viewBox="0 0 160 90" className="mb-2">
                      <path d="M 20 85 A 58 58 0 0 1 140 85" fill="none" stroke="#f1f1ef" strokeWidth="8" strokeLinecap="round" />
                      <path d="M 20 85 A 58 58 0 0 1 140 85" fill="none"
                        stroke={complianceScore >= 80 ? '#22c55e' : complianceScore >= 60 ? '#f59e0b' : '#ef4444'}
                        strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={`${arcProgress} ${arcCircumference}`} />
                      <line x1="80" y1="85" x2={80 + 40 * Math.cos(Math.PI - (complianceScore / 100) * Math.PI)} y2={85 - 40 * Math.sin(Math.PI - (complianceScore / 100) * Math.PI)}
                        stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" />
                      <circle cx="80" cy="85" r="3" fill="#1a1a1a" />
                    </svg>
                    <p className="text-[11px] text-gray-400 -mt-1">Compliance Score</p>
                    <p className="text-3xl font-bold text-gray-900 tracking-tight">{complianceScore}%</p>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full mt-1 bg-amber-50 text-amber-600">
                      Pending Items
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-100">
                    <div>
                      <p className="text-[10px] text-gray-400">Credit Score</p>
                      <p className="text-lg font-bold text-gray-900">{APPLICANT.creditScore}</p>
                      <div className="h-1 bg-gray-100 rounded-full overflow-hidden mt-1">
                        <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${(APPLICANT.creditScore / 999) * 100}%` }} />
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400">Rent-to-Income</p>
                      <p className="text-lg font-bold text-gray-900">26%</p>
                      <div className="h-1 bg-gray-100 rounded-full overflow-hidden mt-1">
                        <div className="h-full bg-emerald-400 rounded-full" style={{ width: '26%' }} />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 p-3 bg-amber-50/50 rounded-lg border border-amber-100/60">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-amber-700">Landlord reference still pending — 2 days since request.</p>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4">
                    <button className="flex-1 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                    <button className="flex-1 py-2 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors">Approve</button>
                  </div>
                </div>

                {/* Documents */}
                <div className="bg-white rounded-xl p-5 border border-gray-200/60">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-400" />
                      <h3 className="text-sm font-semibold text-gray-900">Documents</h3>
                    </div>
                    <button className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { name: 'ID — Passport', status: 'verified', icon: CreditCard },
                      { name: 'Bank Statement', status: 'verified', icon: Receipt },
                      { name: 'Employer Ref', status: 'verified', icon: Building2 },
                      { name: 'Landlord Ref', status: 'pending', icon: Home },
                    ].map((doc, i) => (
                      <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors cursor-pointer">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${doc.status === 'verified' ? 'bg-emerald-50' : 'bg-amber-50'
                          }`}>
                          <doc.icon className={`w-4 h-4 ${doc.status === 'verified' ? 'text-emerald-500' : 'text-amber-500'}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">{doc.name}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {doc.status === 'verified'
                              ? <><CheckCircle className="w-3 h-3 text-emerald-500" /><span className="text-[10px] text-emerald-600">Verified</span></>
                              : <><Clock className="w-3 h-3 text-amber-500" /><span className="text-[10px] text-amber-600">Pending</span></>
                            }
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Center column — 3 cols */}
              <div className="col-span-3 space-y-5">
                {/* Property Preview */}
                <div className="bg-white rounded-xl p-5 border border-gray-200/60">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Home className="w-4 h-4 text-gray-400" />
                      <h3 className="text-sm font-semibold text-gray-900">Property Match</h3>
                    </div>
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">Available</span>
                  </div>
                  <div className="flex gap-3">
                    <div className="relative flex-1 rounded-lg overflow-hidden" style={{ aspectRatio: '16/10' }}>
                      <img src={PROPERTY.image} alt={PROPERTY.address} className="w-full h-full object-cover" />
                      <div className="absolute top-2 left-2 px-2 py-0.5 bg-white/90 backdrop-blur-sm rounded text-[10px] font-medium text-gray-700">
                        {PROPERTY.type}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 w-20">
                      {PROPERTY.images.map((img, i) => (
                        <div key={i} className="rounded-lg overflow-hidden border border-gray-100 cursor-pointer hover:border-gray-300 transition-colors" style={{ aspectRatio: '4/3' }}>
                          <img src={img} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-6 mt-4 pt-4 border-t border-gray-100">
                    {[
                      { icon: MapPin, label: 'Area', value: `${PROPERTY.sqft} ft²` },
                      { icon: Building2, label: 'Beds', value: String(PROPERTY.beds) },
                      { icon: Key, label: 'Baths', value: String(PROPERTY.baths) },
                      { icon: Zap, label: 'EPC', value: PROPERTY.epc },
                      { icon: CreditCard, label: 'Rent', value: PROPERTY.rent },
                    ].map(({ icon: Icon, label, value }, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-gray-300" />
                        <div>
                          <p className="text-[10px] text-gray-400">{label}</p>
                          <p className="text-sm font-semibold text-gray-900">{value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Applicant Info */}
                <div className="bg-white rounded-xl p-5 border border-gray-200/60">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <h3 className="text-sm font-semibold text-gray-900">Applicant Details</h3>
                    </div>
                    <button className="text-gray-300 hover:text-gray-500"><MoreHorizontal className="w-4 h-4" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                    {[
                      { icon: Mail, label: 'Email', value: APPLICANT.email },
                      { icon: Phone, label: 'Phone', value: APPLICANT.phone },
                      { icon: Building2, label: 'Employer', value: APPLICANT.employer },
                      { icon: CreditCard, label: 'Salary', value: APPLICANT.salary },
                      { icon: Calendar, label: 'Move Date', value: APPLICANT.moveDate },
                      { icon: Key, label: 'Budget', value: APPLICANT.budget },
                      { icon: MapPin, label: 'Current Address', value: APPLICANT.currentAddress },
                      { icon: Shield, label: 'Guarantor', value: APPLICANT.guarantor },
                    ].map(({ icon: Icon, label, value }, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <Icon className="w-4 h-4 text-gray-300 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-[10px] text-gray-400">{label}</p>
                          <p className="text-sm text-gray-900">{value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Activity Timeline */}
                <div className="bg-white rounded-xl p-5 border border-gray-200/60">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-gray-400" />
                      <h3 className="text-sm font-semibold text-gray-900">Activity</h3>
                    </div>
                    <button className="text-xs text-gray-400 hover:text-gray-600">View all</button>
                  </div>
                  <div className="space-y-0">
                    {TIMELINE.map((item, i) => (
                      <div key={i} className="flex items-start gap-3 relative">
                        {i < TIMELINE.length - 1 && (
                          <div className="absolute left-[11px] top-6 w-px h-full bg-gray-100" />
                        )}
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${item.type === 'viewing' ? 'bg-emerald-50' :
                            item.type === 'call' ? 'bg-blue-50' :
                              item.type === 'document' ? 'bg-amber-50' :
                                'bg-gray-50'
                          }`}>
                          {item.type === 'viewing' ? <Eye className="w-3 h-3 text-emerald-600" /> :
                            item.type === 'call' ? <Phone className="w-3 h-3 text-blue-600" /> :
                              item.type === 'document' ? <FileText className="w-3 h-3 text-amber-600" /> :
                                <Plus className="w-3 h-3 text-gray-500" />}
                        </div>
                        <div className="flex-1 pb-4">
                          <p className="text-sm text-gray-900">{item.event}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{item.date} at {item.time} · {item.user}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* AI Chat Sidebar — full height */}
          <div className="w-80 bg-white border-l border-gray-200/60 flex flex-col flex-shrink-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-sm">
                  <span className="text-white text-sm font-bold">◉</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">AI Assistant</p>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <p className="text-[10px] text-emerald-500">Online</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-400"><Bell className="w-4 h-4" /></button>
                <button className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-400"><MoreHorizontal className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {aiMessages.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-4 h-4 rounded bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
                        <span className="text-white text-[7px] font-bold">◉</span>
                      </div>
                      <span className="text-[10px] text-gray-400">AI Assistant · {msg.time}</span>
                    </div>
                  )}
                  {msg.role === 'user' && (
                    <span className="text-[10px] text-gray-400 mb-1">{msg.time}</span>
                  )}
                  <div className={`max-w-[92%] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-line ${msg.role === 'user'
                      ? 'bg-gray-900 text-white rounded-2xl rounded-br-md'
                      : 'bg-gray-50 text-gray-700 border border-gray-100 rounded-2xl rounded-bl-md'
                    }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {aiTyping && (
                <div className="flex items-start">
                  <div className="bg-gray-50 border border-gray-100 px-4 py-3 rounded-2xl rounded-bl-md">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Quick prompts */}
            <div className="px-4 py-2 flex flex-wrap gap-1.5 border-t border-gray-50">
              {['Risk assessment', 'Chase references', 'Match properties', 'Summarise'].map(prompt => (
                <button key={prompt} onClick={() => setAiInput(prompt)}
                  className="text-[10px] font-medium px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors">
                  {prompt}
                </button>
              ))}
            </div>

            {/* Chat input */}
            <div className="p-3 border-t border-gray-100">
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                <input
                  type="text"
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAiSend()}
                  placeholder="Ask about this applicant..."
                  className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none font-[Lufga]"
                />
                <button className="text-gray-300 hover:text-gray-500 transition-colors"><Paperclip className="w-4 h-4" /></button>
                <button className="text-gray-300 hover:text-gray-500 transition-colors"><Mic className="w-4 h-4" /></button>
                <button onClick={handleAiSend}
                  className={`p-1.5 rounded-lg transition-all ${aiInput.trim() ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-400'
                    }`}>
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
