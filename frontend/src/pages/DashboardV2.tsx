import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useAIChat } from '../hooks/useAIChat';
import {
  AlertTriangle, Flame, Zap, FileText, ChevronRight, ArrowUpRight,
  Building2, Users, Home, Wrench, UserPlus, Send, Clock, CheckCircle,
  Phone, Mail, Calendar, CreditCard, Shield, Eye, X, Sparkles,
  TrendingUp, Bell, ChevronDown
} from 'lucide-react';

interface DashboardStats {
  properties: number;
  propertiesLet: number;
  landlords: number;
  tenants: number;
  activeTenancies: number;
  openMaintenance: number;
  monthlyIncome: number;
  outstandingRent: number;
  bdmProspects: number;
  bdmNew: number;
  enquiries: number;
  enquiriesNew: number;
  enquiriesViewing: number;
  tasksOverdue: number;
  tasksDueToday: number;
  tasksUpcoming: number;
  complianceAlerts: Array<{ property_id: number; address: string; type: string; expiry_date: string; status: 'expired' | 'expiring'; }>;
  recentMaintenance: Array<{ id: number; title: string; priority: string; status: string; address: string; created_at: string; }>;
  recentTasks: Array<{ id: number; title: string; priority: string; due_date: string; related_to: string; }>;
}

interface ActionCard {
  id: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  icon: typeof AlertTriangle;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  actions: Array<{ label: string; href?: string; primary?: boolean }>;
  category: 'compliance' | 'enquiries' | 'financial' | 'maintenance' | 'tasks';
}

interface AIMessage {
  role: 'user' | 'assistant';
  text: string;
  cards?: ActionCard[];
}

export default function DashboardV2() {
  const api = useApi();
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const ai = useAIChat();
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/api/dashboard').then(setStats).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ai.messages]);

  // Generate AI action cards from real data
  const generateCards = (s: DashboardStats): ActionCard[] => {
    const cards: ActionCard[] = [];

    // Compliance alerts
    s.complianceAlerts?.slice(0, 3).forEach((alert, i) => {
      const daysLeft = alert.expiry_date
        ? Math.ceil((new Date(alert.expiry_date).getTime() - Date.now()) / 86400000)
        : null;
      cards.push({
        id: `compliance-${i}`,
        priority: alert.status === 'expired' ? 'urgent' : 'high',
        icon: alert.type === 'Gas Safety' ? Flame : alert.type === 'EICR' ? Zap : FileText,
        iconBg: alert.status === 'expired' ? 'bg-red-50' : 'bg-amber-50',
        iconColor: alert.status === 'expired' ? 'text-red-500' : 'text-amber-500',
        title: `${alert.type} ${alert.status === 'expired' ? 'expired' : 'expiring'} — ${alert.address}`,
        description: daysLeft !== null
          ? (daysLeft < 0 ? `${Math.abs(daysLeft)} days overdue. This is a legal requirement.` : `${daysLeft} days remaining. Book renewal now to avoid lapse.`)
          : 'Certificate needs attention.',
        actions: [
          { label: 'Book engineer', primary: true },
          { label: 'View property', href: `/properties/${alert.property_id}` },
        ],
        category: 'compliance',
      });
    });

    // New enquiries
    if (s.enquiriesNew > 0) {
      cards.push({
        id: 'enquiries-new',
        priority: 'high',
        icon: UserPlus,
        iconBg: 'bg-blue-50',
        iconColor: 'text-blue-500',
        title: `${s.enquiriesNew} new ${s.enquiriesNew === 1 ? 'enquiry' : 'enquiries'} waiting`,
        description: 'First contact within 2 hours significantly increases conversion. These applicants haven\'t been contacted yet.',
        actions: [
          { label: 'View enquiries', href: '/v2/enquiries', primary: true },
          { label: 'Auto-respond' },
        ],
        category: 'enquiries',
      });
    }

    // Outstanding rent
    if (s.outstandingRent > 0) {
      cards.push({
        id: 'rent-outstanding',
        priority: 'high',
        icon: CreditCard,
        iconBg: 'bg-red-50',
        iconColor: 'text-red-500',
        title: `£${s.outstandingRent.toLocaleString()} outstanding rent`,
        description: 'Overdue rent across your portfolio. Early intervention prevents arrears from escalating.',
        actions: [
          { label: 'Send reminders', primary: true },
          { label: 'View details', href: '/v2/transactions' },
        ],
        category: 'financial',
      });
    }

    // Overdue tasks
    if (s.tasksOverdue > 0) {
      cards.push({
        id: 'tasks-overdue',
        priority: 'medium',
        icon: Clock,
        iconBg: 'bg-amber-50',
        iconColor: 'text-amber-500',
        title: `${s.tasksOverdue} overdue ${s.tasksOverdue === 1 ? 'task' : 'tasks'}`,
        description: 'These were due before today. I can reprioritise or reschedule them for you.',
        actions: [
          { label: 'View tasks', href: '/v2/tasks', primary: true },
          { label: 'Reschedule all' },
        ],
        category: 'tasks',
      });
    }

    // Open maintenance
    if (s.openMaintenance > 2) {
      cards.push({
        id: 'maintenance-open',
        priority: 'medium',
        icon: Wrench,
        iconBg: 'bg-orange-50',
        iconColor: 'text-orange-500',
        title: `${s.openMaintenance} open maintenance requests`,
        description: 'Several maintenance items need attention. Delays risk tenant satisfaction.',
        actions: [
          { label: 'View requests', href: '/v2/maintenance', primary: true },
          { label: 'Assign contractor' },
        ],
        category: 'maintenance',
      });
    }

    // Void properties
    const voids = s.properties - s.propertiesLet;
    if (voids > 0) {
      cards.push({
        id: 'voids',
        priority: 'medium',
        icon: Home,
        iconBg: 'bg-gray-100',
        iconColor: 'text-gray-500',
        title: `${voids} void ${voids === 1 ? 'property' : 'properties'}`,
        description: `${Math.round((s.propertiesLet / s.properties) * 100)}% occupancy. Each void week costs roughly £${Math.round((s.monthlyIncome / s.propertiesLet) / 4)} in lost rent.`,
        actions: [
          { label: 'View properties', href: '/v2/properties', primary: true },
          { label: 'Adjust pricing' },
        ],
        category: 'financial',
      });
    }

    // Tasks due today
    if (s.tasksDueToday > 0) {
      cards.push({
        id: 'tasks-today',
        priority: 'low',
        icon: Calendar,
        iconBg: 'bg-emerald-50',
        iconColor: 'text-emerald-500',
        title: `${s.tasksDueToday} ${s.tasksDueToday === 1 ? 'task' : 'tasks'} due today`,
        description: 'On your plate for today. I can help you work through them.',
        actions: [
          { label: 'Start working', href: '/v2/tasks', primary: true },
        ],
        category: 'tasks',
      });
    }

    // BDM prospects
    if (s.bdmNew > 0) {
      cards.push({
        id: 'bdm-new',
        priority: 'low',
        icon: Building2,
        iconBg: 'bg-purple-50',
        iconColor: 'text-purple-500',
        title: `${s.bdmNew} new BDM prospects`,
        description: 'New landlord leads in the pipeline. Follow up to grow the portfolio.',
        actions: [
          { label: 'View pipeline', href: '/v2/bdm', primary: true },
        ],
        category: 'enquiries',
      });
    }

    return cards.sort((a, b) => {
      const p = { urgent: 0, high: 1, medium: 2, low: 3 };
      return p[a.priority] - p[b.priority];
    });
  };

  // Generate greeting
  const getGreeting = (s: DashboardStats) => {
    const now = new Date();
    const time = now.getHours() < 12 ? 'Morning' : now.getHours() < 18 ? 'Afternoon' : 'Evening';
    const name = user?.name?.split(' ')[0] || 'Sam';

    const urgentItems: string[] = [];
    const expiredCount = s.complianceAlerts?.filter(a => a.status === 'expired').length || 0;
    const expiringCount = s.complianceAlerts?.filter(a => a.status === 'expiring').length || 0;

    if (expiredCount > 0) urgentItems.push(`${expiredCount} expired certificate${expiredCount > 1 ? 's' : ''}`);
    if (expiringCount > 0) urgentItems.push(`${expiringCount} cert${expiringCount > 1 ? 's' : ''} expiring soon`);
    if (s.enquiriesNew > 0) urgentItems.push(`${s.enquiriesNew} new enquir${s.enquiriesNew > 1 ? 'ies' : 'y'}`);
    if (s.outstandingRent > 0) urgentItems.push(`£${s.outstandingRent.toLocaleString()} outstanding rent`);
    if (s.tasksOverdue > 0) urgentItems.push(`${s.tasksOverdue} overdue task${s.tasksOverdue > 1 ? 's' : ''}`);

    if (urgentItems.length === 0) {
      return `${time}, ${name}. Everything looks good today — no urgent items. Your portfolio is ${Math.round((s.propertiesLet / s.properties) * 100)}% occupied with ${s.properties} properties under management.`;
    }

    const itemList = urgentItems.length <= 2
      ? urgentItems.join(' and ')
      : urgentItems.slice(0, -1).join(', ') + ', and ' + urgentItems[urgentItems.length - 1];

    return `${time}, ${name}. You've got ${itemList}. Here's what I'd prioritise today:`;
  };

  const handleSend = () => {
    if (!chatInput.trim()) return;
    ai.send(chatInput.trim());
    setChatInput('');
  };

  const handleDismiss = (id: string) => {
    setDismissed(prev => new Set([...prev, id]));
  };

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  const cards = generateCards(stats).filter(c => !dismissed.has(c.id));
  const greeting = getGreeting(stats);
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Date */}
      <p className="text-xs text-gray-400 mb-6">{dateStr}</p>

      {/* AI Greeting */}
      <div className="flex items-start gap-4 mb-8">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#e8e4de] to-[#d4cfc7] flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-gray-600 text-base font-bold">◉</span>
        </div>
        <div className="flex-1">
          <p className="text-2xl font-bold text-gray-900 tracking-tight leading-snug">{greeting}</p>
        </div>
      </div>

      {/* Quick stats — subtle, not dominant */}
      <div className="flex items-center gap-6 mb-8 px-14">
        {[
          { label: 'Properties', value: stats.properties, sub: `${Math.round((stats.propertiesLet / stats.properties) * 100)}% let` },
          { label: 'Rent roll', value: `£${(stats.monthlyIncome || 0).toLocaleString()}`, sub: '/month' },
          { label: 'Enquiries', value: stats.enquiries || 0, sub: `${stats.enquiriesNew || 0} new` },
          { label: 'Tasks', value: (stats.tasksOverdue || 0) + (stats.tasksDueToday || 0) + (stats.tasksUpcoming || 0), sub: `${stats.tasksOverdue || 0} overdue` },
        ].map((s, i) => (
          <div key={i} className="flex items-baseline gap-1.5">
            <span className="text-sm font-bold text-gray-900">{s.value}</span>
            <span className="text-[11px] text-gray-400">{s.label}</span>
            <span className="text-[10px] text-gray-300">· {s.sub}</span>
          </div>
        ))}
      </div>

      {/* Action cards */}
      <div className="space-y-3 mb-8 px-14">
        {cards.map(card => (
          <div key={card.id} className="bg-white rounded-2xl border border-gray-200/60 p-5 group hover:border-gray-300 transition-all">
            <div className="flex items-start gap-4">
              <div className={`w-9 h-9 rounded-xl ${card.iconBg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                <card.icon className={`w-4 h-4 ${card.iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 mb-1">{card.title}</p>
                    <p className="text-xs text-gray-500 leading-relaxed">{card.description}</p>
                  </div>
                  <button onClick={() => handleDismiss(card.id)}
                    className="text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 mt-0.5">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  {card.actions.map((action, i) => (
                    action.href ? (
                      <Link key={i} to={action.href}
                        className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                          action.primary
                            ? 'bg-[#2a2a2a] text-white hover:bg-[#1a1a1a]'
                            : 'text-gray-500 hover:bg-gray-50 border border-gray-200'
                        }`}>
                        {action.label}
                      </Link>
                    ) : (
                      <button key={i}
                        className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                          action.primary
                            ? 'bg-[#2a2a2a] text-white hover:bg-[#1a1a1a]'
                            : 'text-gray-500 hover:bg-gray-50 border border-gray-200'
                        }`}>
                        {action.label}
                      </button>
                    )
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}

        {cards.length === 0 && (
          <div className="text-center py-12">
            <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-900">All clear</p>
            <p className="text-xs text-gray-400 mt-1">Nothing needs your attention right now</p>
          </div>
        )}
      </div>

      {/* Chat history */}
      {ai.messages.length > 0 && (
        <div className="space-y-4 mb-6 px-14">
          {ai.messages.map((msg, i) => (
            <div key={i} className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#e8e4de] to-[#d4cfc7] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-gray-600 text-[10px] font-bold">◉</span>
                </div>
              )}
              {msg.role === 'system' && (
                <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                </div>
              )}
              <div className="max-w-[80%]">
                <div className={`px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
                  msg.role === 'user'
                    ? 'bg-[#2a2a2a] text-white rounded-2xl rounded-br-sm'
                    : msg.role === 'system'
                    ? 'bg-emerald-50 text-emerald-700 rounded-2xl text-xs font-medium'
                    : 'bg-white border border-gray-200/60 text-gray-700 rounded-2xl rounded-bl-sm'
                }`}>
                  {msg.text}
                </div>
                {/* Action buttons */}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="flex items-center gap-2 mt-2 ml-1">
                    {msg.actions.map(action => (
                      action.type === 'link' ? (
                        <Link key={action.id} to={action.href!}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[#2a2a2a] text-white hover:bg-[#1a1a1a] transition-colors">
                          {action.label}
                        </Link>
                      ) : action.type === 'dismiss' ? (
                        <button key={action.id}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-50 border border-gray-200 transition-colors">
                          {action.label}
                        </button>
                      ) : (
                        <button key={action.id} onClick={() => ai.executeAction(action.id, action)}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[#2a2a2a] text-white hover:bg-[#1a1a1a] transition-colors">
                          {action.label}
                        </button>
                      )
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {ai.typing && (
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#e8e4de] to-[#d4cfc7] flex items-center justify-center flex-shrink-0">
                <span className="text-gray-600 text-[10px] font-bold">◉</span>
              </div>
              <div className="bg-white border border-gray-200/60 px-4 py-3 rounded-2xl rounded-bl-sm">
                <div className="flex gap-1.5">
                  <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      )}

      {/* Chat input */}
      <div className="px-14">
        <div className="flex items-center gap-3 bg-white rounded-2xl border border-gray-200/60 px-5 py-3.5 focus-within:border-gray-300 transition-colors">
          <Sparkles className="w-4 h-4 text-gray-300" />
          <input
            ref={inputRef}
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Ask me anything — compliance, finances, enquiries, what to focus on..."
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none font-[Lufga]"
          />
          <button onClick={handleSend}
            className={`p-2 rounded-xl transition-all ${
              chatInput.trim() ? 'bg-[#2a2a2a] text-white' : 'bg-gray-100 text-gray-400'
            }`}>
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2.5 ml-1">
          {['What should I focus on?', 'Compliance check', 'Financial summary', 'New enquiries'].map(s => (
            <button key={s} onClick={() => { setChatInput(s); inputRef.current?.focus(); }}
              className="text-[10px] font-medium px-2.5 py-1 rounded-full border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-white transition-colors">
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
