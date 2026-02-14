import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Users, UserPlus, Building2, Home, Wrench,
  ClipboardList, Receipt, BarChart3, Settings, LogOut, Search,
  Send, Paperclip, Mic, Bell, MoreHorizontal, FileText,
  Calendar, Clock, CheckCircle, Circle, AlertTriangle, ChevronRight,
  Timer, FolderOpen, Plug, MessageSquare
} from 'lucide-react';

// AI Context for pages to inject context
interface AIContextType {
  setPageContext: (ctx: PageContext) => void;
}

interface PageContext {
  title?: string;
  widgets?: Array<{ type: 'tasks' | 'stats' | 'alerts' | 'contacts'; data: any }>;
  suggestions?: string[];
}

const AIContext = createContext<AIContextType>({ setPageContext: () => {} });
export const useAI = () => useContext(AIContext);

const NAV_ITEMS = [
  { icon: LayoutDashboard, href: '/v2', label: 'Dashboard' },
  { icon: UserPlus, href: '/v2/enquiries', label: 'Enquiries' },
  { icon: Users, href: '/v2/tenants', label: 'Tenants' },
  { icon: Building2, href: '/v2/landlords', label: 'Landlords' },
  { icon: BarChart3, href: '/v2/bdm', label: 'BDM' },
  { icon: Home, href: '/v2/properties', label: 'Properties' },
  { icon: Wrench, href: '/v2/maintenance', label: 'Maintenance' },
  { icon: ClipboardList, href: '/v2/tasks', label: 'Tasks' },
  { icon: Receipt, href: '/v2/transactions', label: 'Financials' },
];

interface AIMessage {
  role: 'user' | 'assistant';
  text: string;
  time: string;
}

export default function AILayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([
    { role: 'assistant', text: "Morning Sam. You've got 2 compliance certs expiring this week and 3 new enquiries waiting. Want me to prioritise your day?", time: now() },
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiTyping, setAiTyping] = useState(false);
  const [pageContext, setPageContext] = useState<PageContext>({});
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages]);

  function now() {
    return new Date().toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
  }

  const handleSend = () => {
    if (!aiInput.trim()) return;
    const msg = aiInput.trim();
    setAiMessages(prev => [...prev, { role: 'user', text: msg, time: now() }]);
    setAiInput('');
    setAiTyping(true);

    setTimeout(() => {
      let response = '';
      const lower = msg.toLowerCase();
      if (lower.includes('prioriti') || lower.includes('today') || lower.includes('morning')) {
        response = "Here's your priority list for today:\n\n1. Chase landlord ref for Eleanor Whitfield (2 days overdue)\n2. Gas safety cert expiring — 12 Queens Drive (3 days left)\n3. 3 new enquiries need first contact\n4. Viewing at 2pm — 8 Oak Street with James Morton\n\nWant me to auto-send the reference chase?";
      } else if (lower.includes('enquir') || lower.includes('applicant')) {
        response = "You have 5 active enquiries:\n\n• Eleanor Whitfield — Viewing booked (14 Feb)\n• James Morton — New (awaiting call)\n• Sarah Chen — Referencing in progress\n\n2 need immediate attention. Want me to draft response emails?";
      } else if (lower.includes('compliance') || lower.includes('cert') || lower.includes('gas') || lower.includes('epc')) {
        response = "Compliance overview:\n\n⚠ 5 Gas Safety certs expiring within 30 days\n⚠ 3 EICR certs expiring within 30 days\n⚠ 2 EPC certs expiring within 30 days\n\n12 Queens Drive is most urgent — expires in 3 days. Want me to contact the registered gas engineer?";
      } else if (lower.includes('rent') || lower.includes('money') || lower.includes('financ') || lower.includes('arrear')) {
        response = "Financial snapshot:\n\n£8,450 collected this month\n£1,200 outstanding (2 tenants)\n£340 maintenance spend\n\nMrs. Patterson at 42 Victoria Road is 14 days late — second month running. Want me to generate an arrears letter?";
      } else if (lower.includes('property') || lower.includes('void') || lower.includes('vacant')) {
        response = "Portfolio: 10 properties, 6 let (60% occupancy)\n\n4 void properties:\n• 23 Church Lane — void 45 days\n• 78 Station Road — void 12 days\n• 15 Oak Street, Flat 2 — void 8 days\n• 42 Victoria Rd, Flat 1 — void 3 days\n\nChurch Lane is concerning — 45 days void. Want me to check comparable rents and suggest a price adjustment?";
      } else {
        response = `I can help with that. Based on your current portfolio of 10 properties and 82 landlords, I'd suggest focusing on the compliance alerts first — 10 certs need attention. What specifically would you like me to look into?`;
      }
      setAiMessages(prev => [...prev, { role: 'assistant', text: response, time: now() }]);
      setAiTyping(false);
    }, 1000);
  };

  const initials = user?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'SF';

  return (
    <AIContext.Provider value={{ setPageContext }}>
      <div className="font-[Lufga] flex h-screen overflow-hidden" style={{ background: '#f6f7f3' }}>
        {/* Left icon sidebar */}
        <aside className="w-14 flex flex-col items-center py-4 gap-1 bg-[#2a2a2a] flex-shrink-0">
          {/* Logo */}
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center mb-4">
            <span className="text-white text-sm font-bold tracking-tight">F</span>
          </div>

          {/* Nav icons */}
          <nav className="flex-1 flex flex-col items-center gap-0.5">
            {NAV_ITEMS.map((item) => {
              const isActive = location.pathname === item.href ||
                (item.href !== '/' && location.pathname.startsWith(item.href));
              return (
                <Link key={item.href} to={item.href}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all group relative ${
                    isActive
                      ? 'bg-white/15 text-white'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                  }`}
                  title={item.label}>
                  <item.icon className="w-[18px] h-[18px]" />
                  {/* Tooltip */}
                  <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-[10px] font-medium rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Bottom icons */}
          <div className="flex flex-col items-center gap-1">
            <button className="w-10 h-10 rounded-xl flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/5 transition-all" title="Settings">
              <Settings className="w-[18px] h-[18px]" />
            </button>
            <button onClick={logout}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/5 transition-all" title="Logout">
              <LogOut className="w-[18px] h-[18px]" />
            </button>
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center mt-2" title={user?.name}>
              <span className="text-[10px] font-semibold text-white">{initials}</span>
            </div>
          </div>
        </aside>

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>

        {/* AI Sidebar — always visible */}
        <aside className="w-80 bg-white border-l border-gray-200/60 flex flex-col flex-shrink-0">
          {/* AI Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#e8e4de] to-[#d4cfc7] flex items-center justify-center">
                <span className="text-gray-700 text-sm font-bold">◉</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">AI Assistant</p>
                <p className="text-[10px] text-emerald-500">Online</p>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <button className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-400"><Search className="w-4 h-4" /></button>
              <button className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-400"><MoreHorizontal className="w-4 h-4" /></button>
            </div>
          </div>

          {/* Widget strip */}
          <div className="grid grid-cols-2 gap-2 p-3 border-b border-gray-100">
            <WidgetCard icon={<Timer className="w-4 h-4" />} label="Timer" value={
              <span className="text-lg font-bold text-gray-900 tracking-tight">08:45</span>
            } />
            <WidgetCard icon={<FolderOpen className="w-4 h-4" />} label="Docs" value={
              <span className="text-[11px] text-gray-500">3 pending</span>
            } />
          </div>

          {/* Tasks widget */}
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-900">Tasks</p>
              <button className="text-gray-300 hover:text-gray-500"><MoreHorizontal className="w-3.5 h-3.5" /></button>
            </div>
            <div className="space-y-1.5">
              {[
                { text: 'Chase landlord ref — Whitfield', done: false, urgent: true },
                { text: 'Gas cert renewal — Queens Dr', done: false, urgent: true },
                { text: 'Call James Morton (new enquiry)', done: false, urgent: false },
                { text: 'Update rent schedule', done: true, urgent: false },
              ].map((task, i) => (
                <div key={i} className="flex items-center gap-2">
                  {task.done
                    ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    : <Circle className={`w-3.5 h-3.5 flex-shrink-0 ${task.urgent ? 'text-red-400' : 'text-gray-300'}`} />
                  }
                  <span className={`text-xs ${task.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{task.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {aiMessages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-4 h-4 rounded bg-gradient-to-br from-[#e8e4de] to-[#d4cfc7] flex items-center justify-center">
                      <span className="text-gray-600 text-[7px] font-bold">◉</span>
                    </div>
                    <span className="text-[10px] text-gray-400">{msg.time}</span>
                  </div>
                )}
                {msg.role === 'user' && (
                  <span className="text-[10px] text-gray-400 mb-1">{msg.time}</span>
                )}
                <div className={`max-w-[92%] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-line ${
                  msg.role === 'user'
                    ? 'bg-[#2a2a2a] text-white rounded-2xl rounded-br-sm'
                    : 'bg-[#f6f7f3] text-gray-700 rounded-2xl rounded-bl-sm'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {aiTyping && (
              <div className="flex items-start">
                <div className="bg-[#f6f7f3] px-4 py-3 rounded-2xl rounded-bl-sm">
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

          {/* Suggestions */}
          <div className="px-3 py-2 flex flex-wrap gap-1.5 border-t border-gray-50">
            {['Prioritise my day', 'Compliance check', 'Void properties', 'Financials'].map(s => (
              <button key={s} onClick={() => setAiInput(s)}
                className="text-[10px] font-medium px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors">
                {s}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-100">
            <div className="flex items-center gap-2 bg-[#f6f7f3] rounded-xl px-3 py-2.5">
              <input
                type="text"
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Ask anything..."
                className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none font-[Lufga]"
              />
              <button className="text-gray-300 hover:text-gray-500 transition-colors"><Paperclip className="w-4 h-4" /></button>
              <button className="text-gray-300 hover:text-gray-500 transition-colors"><Mic className="w-4 h-4" /></button>
              <button onClick={handleSend}
                className={`p-1.5 rounded-lg transition-all ${
                  aiInput.trim() ? 'bg-[#2a2a2a] text-white' : 'bg-gray-200 text-gray-400'
                }`}>
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </AIContext.Provider>
  );
}

function WidgetCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="bg-[#f6f7f3] rounded-xl p-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-gray-400">{icon}</span>
        <span className="text-[10px] text-gray-400">{label}</span>
      </div>
      {value}
    </div>
  );
}
