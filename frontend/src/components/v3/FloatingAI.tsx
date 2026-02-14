import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Send, Sparkles, ChevronDown } from 'lucide-react';

interface AIMessage {
  role: 'user' | 'assistant';
  text: string;
  time: string;
}

const now = () => new Date().toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });

// Context-aware suggestions per page
const pageSuggestions: Record<string, string[]> = {
  '/v3': [
    'Prioritise my day',
    'Compliance alerts summary',
    'What needs attention?',
    'Show overdue tasks',
  ],
  '/v3/enquiries': [
    'Draft a response to the latest enquiry',
    'Which enquiries need follow-up?',
    'Show conversion rate this month',
    'Auto-assign enquiries to properties',
  ],
  '/v3/properties': [
    'Which properties need cert renewal?',
    'Show vacant properties',
    'Properties with highest rent yield',
    'Compliance overview across portfolio',
  ],
  '/v3/landlords': [
    'Landlords with expiring agreements',
    'Who has the most properties?',
    'Draft landlord update email',
    'Landlords needing KYC renewal',
  ],
  '/v3/tenants': [
    'Tenants with rent arrears',
    'Upcoming lease renewals',
    'Draft tenant welcome pack',
    'Show move-in dates this month',
  ],
  '/v3/bdm': [
    'Pipeline conversion rate',
    'Prospects needing follow-up',
    'Draft outreach email',
    'Best performing lead sources',
  ],
  '/v3/maintenance': [
    'Urgent open issues',
    'Average resolution time',
    'Which properties have most issues?',
    'Schedule contractor for open jobs',
  ],
  '/v3/tasks': [
    'What\'s overdue?',
    'Reschedule today\'s tasks',
    'Show my completed tasks this week',
    'Create task from last maintenance report',
  ],
  '/v3/financials': [
    'Monthly rent collection rate',
    'Who\'s in arrears?',
    'Draft arrears letter',
    'Revenue forecast next quarter',
  ],
};

// Context-aware responses
function getAIResponse(msg: string, pathname: string): string {
  const lower = msg.toLowerCase();

  if (lower.includes('prioriti') || lower.includes('today') || lower.includes('morning') || lower.includes('attention')) {
    return "Here's your priority list:\n\n1. Gas safety cert expiring — 12 Queens Drive (3 days left)\n2. 3 new enquiries need first contact\n3. Chase landlord ref for Eleanor Whitfield (2 days overdue)\n4. Viewing at 2pm — 8 Oak Street\n\nWant me to auto-send the reference chase?";
  }
  if (lower.includes('enquir') || lower.includes('applicant') || lower.includes('follow-up')) {
    return "5 active enquiries:\n\n• Eleanor Whitfield — Viewing booked (14 Feb)\n• James Morton — New (awaiting call)\n• Sarah Chen — Referencing in progress\n\n2 need immediate attention. Want me to draft response emails?";
  }
  if (lower.includes('compliance') || lower.includes('cert') || lower.includes('gas') || lower.includes('epc') || lower.includes('renewal')) {
    return "Compliance overview:\n\n⚠ 5 Gas Safety certs expiring within 30 days\n⚠ 3 EICR certs expiring within 30 days\n⚠ 2 EPC certs expiring within 30 days\n\n12 Queens Drive is most urgent — expires in 3 days. Want me to contact the gas engineer?";
  }
  if (lower.includes('rent') || lower.includes('arrear') || lower.includes('financ') || lower.includes('collection')) {
    return "Financial snapshot:\n\n£8,450 collected this month\n£1,200 outstanding (2 tenants)\n£340 maintenance spend\n\nMrs. Patterson at 42 Victoria Road is 14 days late — second month running. Want me to generate an arrears letter?";
  }
  if (lower.includes('landlord') && (lower.includes('update') || lower.includes('email') || lower.includes('draft'))) {
    return "Here's a draft landlord update:\n\n\"Dear [Landlord],\n\nMonthly property update for [Address]:\n• Rent: Collected on time\n• Maintenance: No open issues\n• Compliance: All certificates current\n• Next inspection: [Date]\n\nPlease don't hesitate to get in touch.\"\n\nShall I personalise this for a specific landlord?";
  }
  if (lower.includes('maintenance') || lower.includes('urgent') || lower.includes('issue')) {
    return "Open maintenance:\n\n🔴 Boiler repair — 8 Oak Street (reported 3 days ago, urgent)\n🟡 Leak in bathroom — 15 Church Lane (2 days, high)\n🟢 Garden fence — 42 Victoria Road (5 days, low)\n\nThe boiler at Oak Street has been escalated. Want me to chase the contractor?";
  }
  if (lower.includes('task') || lower.includes('overdue') || lower.includes('schedule')) {
    return "Task summary:\n\n✅ 15 completed this week\n⏳ 3 in progress\n🔴 2 overdue\n\nOverdue:\n• Chase reference — Eleanor Whitfield (2 days)\n• Submit EPC renewal — 22 High Street (1 day)\n\nWant me to reschedule or reassign?";
  }
  if (lower.includes('vacant') || lower.includes('empty')) {
    return "2 vacant properties:\n\n• 15 Church Lane — Vacant since Jan 28 (17 days)\n• 33 Park Avenue — Vacant since Feb 1 (13 days)\n\nEstimated monthly loss: £2,100. Both have active enquiries. Want me to prioritise viewings?";
  }
  if (lower.includes('pipeline') || lower.includes('conversion')) {
    return "BDM Pipeline:\n\n• 4 new leads\n• 2 meetings scheduled\n• 1 proposal sent\n• Conversion rate: 23% (last 90 days)\n\nTop source: Rightmove referrals. Want me to draft follow-ups for the meeting stage?";
  }
  if (lower.includes('welcome') || lower.includes('onboard')) {
    return "Tenant onboarding checklist:\n\n☐ ID verification\n☐ Right to rent check\n☐ Guarantor details\n☐ Deposit registered (DPS)\n☐ Tenancy agreement signed\n☐ Inventory completed\n☐ Key handover scheduled\n\nWant me to generate the welcome pack PDF?";
  }

  // Default contextual response based on page
  if (pathname.includes('properties')) {
    return "I can help with property management — compliance tracking, vacancy analysis, rent reviews, or tenant history. What would you like to know?";
  }
  if (pathname.includes('landlord')) {
    return "I can help with landlord communications, portfolio summaries, KYC tracking, or property performance reports. What do you need?";
  }
  if (pathname.includes('tenant')) {
    return "I can help with tenant management — arrears tracking, lease renewals, reference chasing, or onboarding. What would you like?";
  }
  if (pathname.includes('enquir')) {
    return "I can help manage enquiries — draft responses, schedule viewings, run reference checks, or convert to tenants. What would you like to do?";
  }

  return "I can help with compliance tracking, tenant management, financial reporting, maintenance scheduling, and more. What would you like to know?";
}

// Get greeting based on page
function getGreeting(pathname: string): string {
  if (pathname === '/v3') return "Morning. You've got 2 compliance certs expiring this week and 3 new enquiries. Want me to prioritise your day?";
  if (pathname.includes('enquir')) return "You have 3 enquiries needing follow-up today. Want me to summarise them?";
  if (pathname.includes('properties')) return "Viewing the portfolio. 2 properties have compliance items due soon. Need details?";
  if (pathname.includes('landlord')) return "Looking at landlords. Anyone specific you need to update or review?";
  if (pathname.includes('tenant')) return "Tenant overview ready. 1 rent payment overdue, 2 leases up for renewal this month.";
  if (pathname.includes('bdm')) return "Pipeline has 4 new leads this week. Want to review the hottest prospects?";
  if (pathname.includes('maintenance')) return "3 open maintenance items, 1 urgent. Want me to prioritise?";
  if (pathname.includes('task')) return "You have 2 overdue tasks and 5 due today. Want me to reschedule anything?";
  if (pathname.includes('financial')) return "Monthly collection is at 87%. 2 tenants outstanding. Want a breakdown?";
  return "How can I help?";
}

export default function FloatingAI() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const prevPath = useRef(location.pathname);

  // Reset greeting when page changes
  useEffect(() => {
    if (location.pathname !== prevPath.current) {
      prevPath.current = location.pathname;
      setMessages([{ role: 'assistant', text: getGreeting(location.pathname), time: now() }]);
      setHasUnread(!open);
    }
  }, [location.pathname, open]);

  // Initial greeting
  useEffect(() => {
    setMessages([{ role: 'assistant', text: getGreeting(location.pathname), time: now() }]);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) {
      setHasUnread(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSend = (text?: string) => {
    const msg = (text || input).trim();
    if (!msg) return;
    setMessages(prev => [...prev, { role: 'user', text: msg, time: now() }]);
    setInput('');
    setTyping(true);

    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: getAIResponse(msg, location.pathname),
        time: now(),
      }]);
      setTyping(false);
    }, 800 + Math.random() * 600);
  };

  const suggestions = pageSuggestions[location.pathname] || pageSuggestions['/v3'] || [];

  return (
    <>
      {/* Floating Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center shadow-lg shadow-pink-500/20 hover:shadow-pink-500/40 hover:scale-105 transition-all group"
        >
          <Sparkles size={22} className="text-white" />
          {hasUnread && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center">
              <span className="w-2.5 h-2.5 bg-gradient-to-br from-orange-500 to-pink-500 rounded-full animate-pulse" />
            </span>
          )}
        </button>
      )}

      {/* Chat Panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] h-[560px] flex flex-col rounded-2xl border border-white/[0.1] bg-[#1e1e1e] shadow-2xl shadow-black/50 overflow-hidden animate-in slide-in-from-bottom-4">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] bg-gradient-to-r from-[#232323] to-[#1e1e1e]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center">
                <Sparkles size={16} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">DOT</p>
                <p className="text-[11px] text-white/40">AI Assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors">
                <ChevronDown size={18} />
              </button>
              <button onClick={() => { setOpen(false); setMessages([{ role: 'assistant', text: getGreeting(location.pathname), time: now() }]); }} className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-thin">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-1' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center">
                        <Sparkles size={10} className="text-white" />
                      </div>
                      <span className="text-[11px] text-white/30">DOT · {msg.time}</span>
                    </div>
                  )}
                  <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-orange-500/20 to-pink-500/20 border border-orange-500/20 text-white'
                      : 'bg-white/[0.05] border border-white/[0.06] text-white/90'
                  }`}>
                    {msg.text}
                  </div>
                  {msg.role === 'user' && (
                    <p className="text-[11px] text-white/30 text-right mt-1">{msg.time}</p>
                  )}
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center">
                  <Sparkles size={10} className="text-white" />
                </div>
                <div className="bg-white/[0.05] border border-white/[0.06] rounded-2xl px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Suggestions */}
          {messages.length <= 2 && (
            <div className="px-5 pb-3 flex flex-wrap gap-1.5">
              {suggestions.slice(0, 3).map((s, i) => (
                <button key={i} onClick={() => handleSend(s)}
                  className="px-3 py-1.5 rounded-full text-[11px] font-medium bg-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.1] border border-white/[0.06] transition-colors">
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-4 py-3 border-t border-white/[0.08]">
            <div className="flex items-center gap-2 bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder='Ask DOT anything...'
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
              />
              <button onClick={() => handleSend()}
                className={`p-1.5 rounded-lg transition-colors ${input.trim() ? 'text-orange-400 hover:text-orange-300' : 'text-white/20'}`}>
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
