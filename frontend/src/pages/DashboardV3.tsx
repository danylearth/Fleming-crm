import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { Card, GlassCard, SectionHeader, StatusDot, EmptyState, Tag, Button } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { getPropertyImage } from '../utils/propertyImages';
import {
  Building2, Users, Wrench, MessageSquare, AlertTriangle,
  ChevronRight, ChevronLeft, Clock, CheckCircle2, ArrowRight,
  CalendarDays, List, MoreVertical
} from 'lucide-react';

// ─── Types ───
interface DashboardData {
  stats: { properties: number; active_tenancies: number; open_maintenance: number; active_enquiries: number };
  complianceAlerts: { id: number; property_address: string; type: string; expiry_date: string }[];
  upcomingMaintenance: any[];
  overdueTasks: any[];
}
interface Property {
  id: number; address: string; postcode: string; rent_amount: number;
  status: string; landlord_name: string; current_tenant: string | null;
  bedrooms: number; property_type: string;
}
interface Task {
  id: number; title: string; description: string; status: string;
  priority: string; due_date: string; property_address?: string;
  task_type?: string; assigned_to?: string;
}
interface Enquiry {
  id: number; status: string; first_name_1?: string; last_name_1?: string;
  property_address?: string; property_id?: number; created_at?: string;
  email_1?: string; phone_1?: string;
}

// ─── Team ───
const TEAM = [
  { id: 'all', name: 'Everyone', role: 'All Team', color: 'from-orange-500 to-pink-500', initials: 'All' },
  { id: 'danyl', name: 'Danyl', role: 'Director', color: 'from-violet-500 to-purple-500', initials: 'D' },
  { id: 'sarah', name: 'Sarah Chen', role: 'Property Manager', color: 'from-cyan-500 to-blue-500', initials: 'SC' },
  { id: 'alex', name: 'Alex Morgan', role: 'Lettings Negotiator', color: 'from-emerald-500 to-teal-500', initials: 'AM' },
  { id: 'mike', name: 'Mike Ross', role: 'Maintenance Lead', color: 'from-amber-500 to-orange-500', initials: 'MR' },
];

// ─── Calendar helpers ───
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 7AM - 7PM

function getMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  let startDow = first.getDay() - 1; if (startDow < 0) startDow = 6;
  const last = new Date(year, month + 1, 0);
  const days: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(d);
  while (days.length % 7 !== 0) days.push(null);
  return days;
}
function fmtDate(y: number, m: number, d: number) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function dayLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return { weekday: d.toLocaleDateString('en-GB', { weekday: 'long' }), day: d.getDate() };
}

// ─── Activity type config ───
const ACTIVITY_TYPES = [
  { key: 'task', label: 'Tasks', color: 'bg-orange-500', check: 'accent-orange-500' },
  { key: 'viewing', label: 'Viewings', color: 'bg-purple-500', check: 'accent-purple-500' },
  { key: 'maintenance', label: 'Maintenance', color: 'bg-blue-500', check: 'accent-blue-500' },
];

export default function DashboardV3() {
  const api = useApi();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [viewings, setViewings] = useState<any[]>([]);
  const [maintenanceItems, setMaintenanceItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // View toggle
  const [view, setView] = useState<'list' | 'calendar'>('list');

  // Calendar state
  const now = new Date();
  const todayStr = fmtDate(now.getFullYear(), now.getMonth(), now.getDate());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedMember, setSelectedMember] = useState('all');
  const [activeTypes, setActiveTypes] = useState<Record<string, boolean>>({ task: true, viewing: true, maintenance: true });
  const [calViewMode, setCalViewMode] = useState<'day' | 'week' | 'month'>('day');

  useEffect(() => {
    Promise.all([
      api.get('/api/dashboard').catch(() => null),
      api.get('/api/properties').catch(() => []),
      api.get('/api/tasks').catch(() => []),
      api.get('/api/tenant-enquiries').catch(() => []),
      api.get('/api/property-viewings').catch(() => []),
      api.get('/api/maintenance').catch(() => []),
    ]).then(([dash, props, tks, enqs, vws, mnt]) => {
      setDashboard(dash);
      setProperties(Array.isArray(props) ? props : []);
      setTasks(Array.isArray(tks) ? tks : []);
      setEnquiries(Array.isArray(enqs) ? enqs : []);
      setViewings(Array.isArray(vws) ? vws : []);
      setMaintenanceItems(Array.isArray(mnt) ? mnt : []);
    }).finally(() => setLoading(false));
  }, []);

  const firstName = user?.name?.split(' ')[0] || 'there';

  // ─── Calendar events ───
  const calEvents = useMemo(() => {
    const evts: { id: string; title: string; date: string; startHour: number; duration: number; type: string; color: string; bgLight: string; priority?: string; avatars: string[] }[] = [];
    tasks.forEach(t => {
      if (!t.due_date) return;
      evts.push({
        id: `task-${t.id}`, title: t.title, date: t.due_date.slice(0, 10),
        startHour: 9 + (t.id % 8), duration: 1, type: 'task',
        color: 'border-orange-500/60', bgLight: 'bg-orange-500/10',
        priority: t.priority, avatars: ['D'],
      });
    });
    viewings.forEach((v: any) => {
      if (!v.viewing_date) return;
      const hour = v.viewing_time ? parseInt(v.viewing_time.split(':')[0]) : 10;
      evts.push({
        id: `viewing-${v.id}`, title: `Viewing: ${v.property_address || 'Property'}`,
        date: v.viewing_date.slice(0, 10), startHour: hour, duration: 1, type: 'viewing',
        color: 'border-purple-500/60', bgLight: 'bg-purple-500/10', avatars: ['SC', 'AM'],
      });
    });
    maintenanceItems.forEach((m: any) => {
      const d = m.scheduled_date || m.created_at;
      if (!d) return;
      evts.push({
        id: `maint-${m.id}`, title: m.title || m.description || 'Maintenance',
        date: d.slice(0, 10), startHour: 11 + (m.id % 5), duration: 1, type: 'maintenance',
        color: 'border-blue-500/60', bgLight: 'bg-blue-500/10', avatars: ['MR'],
      });
    });
    return evts;
  }, [tasks, viewings, maintenanceItems]);

  // Events by date
  const eventsByDate = useMemo(() => {
    const m: Record<string, typeof calEvents> = {};
    calEvents.forEach(e => {
      if (!activeTypes[e.type]) return;
      if (!m[e.date]) m[e.date] = [];
      m[e.date].push(e);
    });
    return m;
  }, [calEvents, activeTypes]);

  const selectedDayEvents = eventsByDate[selectedDate] || [];

  // Mini calendar grid
  const miniGrid = getMonthGrid(calYear, calMonth);

  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y-1); } else setCalMonth(m => m-1); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y+1); } else setCalMonth(m => m+1); };

  const prevDay = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    setSelectedDate(fmtDate(d.getFullYear(), d.getMonth(), d.getDate()));
    setCalYear(d.getFullYear()); setCalMonth(d.getMonth());
  };
  const nextDay = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    setSelectedDate(fmtDate(d.getFullYear(), d.getMonth(), d.getDate()));
    setCalYear(d.getFullYear()); setCalMonth(d.getMonth());
  };

  const toggleType = (key: string) => setActiveTypes(prev => ({ ...prev, [key]: !prev[key] }));

  // ─── List view helpers (original dashboard) ───
  const stats = dashboard?.stats || {
    properties: properties.length,
    active_tenancies: properties.filter(p => p.status === 'active').length,
    open_maintenance: 0,
    active_enquiries: enquiries.length,
  };
  const daysUntil = (date: string) => Math.ceil((new Date(date).getTime() - Date.now()) / (1000*60*60*24));
  const urgencyColor = (date: string) => { const d = daysUntil(date); return d < 0 ? 'text-red-400' : d < 30 ? 'text-amber-400' : 'text-emerald-400'; };

  if (loading) {
    return (
      <V3Layout hideTopBar>
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-2 border-[var(--border-input)] border-t-orange-500 rounded-full animate-spin" />
        </div>
      </V3Layout>
    );
  }

  const { weekday, day: dayNum } = dayLabel(selectedDate);
  const isToday = selectedDate === todayStr;

  return (
    <V3Layout hideTopBar>
      <div className="p-4 md:p-8 space-y-6">
        {/* Header with view toggle */}
        <div className="pt-10 md:pt-0 flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Hello, {firstName} 👋</h1>
            <p className="text-[var(--text-secondary)] mt-1 text-sm">Here's what's happening with your properties today.</p>
          </div>
          <div className="flex items-center gap-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-full p-1">
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                view === 'list' ? 'bg-gradient-to-r from-orange-500 to-pink-500 text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <List size={15} /> List
            </button>
            <button
              onClick={() => setView('calendar')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                view === 'calendar' ? 'bg-gradient-to-r from-orange-500 to-pink-500 text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <CalendarDays size={15} /> Calendar
            </button>
          </div>
        </div>

        {view === 'list' ? (
          /* ═══════════════════════════════════════════════
             LIST VIEW (original dashboard)
             ═══════════════════════════════════════════════ */
          <div className="space-y-6 md:space-y-8">
            {/* Stats Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Properties', value: stats.properties, icon: Building2, color: 'from-orange-500 to-pink-500' },
                { label: 'Active Tenancies', value: stats.active_tenancies, icon: Users, color: 'from-purple-500 to-indigo-500' },
                { label: 'Open Maintenance', value: stats.open_maintenance, icon: Wrench, color: 'from-amber-500 to-orange-500' },
                { label: 'Active Enquiries', value: stats.active_enquiries, icon: MessageSquare, color: 'from-pink-500 to-rose-500' },
              ].map(stat => (
                <GlassCard key={stat.label} className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                      <stat.icon size={18} />
                    </div>
                  </div>
                  <p className={`text-3xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>{stat.value}</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">{stat.label}</p>
                </GlassCard>
              ))}
            </div>

            {/* Compliance + Pipeline */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="p-6">
                <SectionHeader title="Compliance Alerts" action={() => navigate('/v3/properties')} actionLabel="View All" />
                {dashboard?.complianceAlerts?.length ? (
                  <div className="space-y-3">
                    {dashboard.complianceAlerts.slice(0, 5).map((alert, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors">
                        <div className="flex items-center gap-3">
                          <AlertTriangle size={16} className={urgencyColor(alert.expiry_date)} />
                          <div><p className="text-sm font-medium">{alert.property_address}</p><p className="text-xs text-[var(--text-muted)]">{alert.type}</p></div>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-medium ${urgencyColor(alert.expiry_date)}`}>
                            {daysUntil(alert.expiry_date) < 0 ? `${Math.abs(daysUntil(alert.expiry_date))}d overdue` : `${daysUntil(alert.expiry_date)}d left`}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">{new Date(alert.expiry_date).toLocaleDateString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <EmptyState message="No compliance alerts" />}
              </Card>

              <Card className="p-6">
                <SectionHeader title="Enquiry Pipeline" action={() => navigate('/v3/enquiries')} actionLabel="View All" />
                {enquiries.length ? (
                  <div className="space-y-3">
                    {enquiries.slice(0, 5).map((enq) => {
                      const name = [enq.first_name_1, enq.last_name_1].filter(Boolean).join(' ') || 'Unknown';
                      const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
                        new: { label: 'New', color: 'text-blue-400', bg: 'bg-blue-500/20' },
                        viewing: { label: 'Viewing', color: 'text-purple-400', bg: 'bg-purple-500/20' },
                        awaiting: { label: 'Awaiting', color: 'text-amber-400', bg: 'bg-amber-500/20' },
                        in_progress: { label: 'In Progress', color: 'text-amber-400', bg: 'bg-amber-500/20' },
                        onboarding: { label: 'Onboarding', color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
                        completed: { label: 'Completed', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
                        converted: { label: 'Converted', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
                        rejected: { label: 'Rejected', color: 'text-red-400', bg: 'bg-red-500/20' },
                        closed: { label: 'Closed', color: 'text-gray-400', bg: 'bg-gray-500/20' },
                      };
                      const cfg = statusConfig[enq.status] || { label: enq.status, color: 'text-gray-400', bg: 'bg-gray-500/20' };
                      const daysAgo = enq.created_at ? Math.floor((Date.now() - new Date(enq.created_at).getTime()) / (1000*60*60*24)) : null;
                      return (
                        <div key={enq.id} onClick={() => navigate('/v3/enquiries')} className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.bg} ${cfg.color} shrink-0`}><MessageSquare size={14} /></div>
                            <div className="min-w-0"><p className="text-sm font-medium truncate">{name}</p><p className="text-xs text-[var(--text-muted)] truncate">{enq.property_address || 'No property linked'}</p></div>
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                            {daysAgo !== null && <p className="text-xs text-[var(--text-muted)]">{daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}</p>}
                          </div>
                        </div>
                      );
                    })}
                    {enquiries.length > 5 && <p className="text-xs text-[var(--text-muted)] pt-1">+{enquiries.length - 5} more enquiries</p>}
                  </div>
                ) : <EmptyState message="No enquiries yet" />}
              </Card>
            </div>

            {/* Recent Tasks */}
            <Card className="p-6">
              <SectionHeader title="Recent Tasks" action={() => navigate('/v3/tasks')} actionLabel="View All" />
              {tasks.length ? (
                <div className="space-y-2">
                  {tasks.slice(0, 5).map(task => (
                    <div key={task.id} className="flex items-center gap-4 p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        task.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400'
                        : task.priority === 'high' ? 'bg-red-500/20 text-red-400'
                        : 'bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                      }`}>
                        {task.status === 'completed' ? <CheckCircle2 size={16} /> : <Clock size={16} />}
                      </div>
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{task.title}</p><p className="text-xs text-[var(--text-muted)] truncate">{task.property_address || task.description}</p></div>
                      <div className="text-right shrink-0">
                        <Tag active={task.priority === 'high'}>{task.priority}</Tag>
                        {task.due_date && <p className={`text-xs mt-1 ${urgencyColor(task.due_date)}`}>{new Date(task.due_date).toLocaleDateString()}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState message="No tasks yet" />}
            </Card>

            {/* Properties Carousel */}
            <div>
              <SectionHeader title="My Properties" action={() => navigate('/v3/properties')} actionLabel="View All" />
              {properties.length ? (
                <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2 scrollbar-hide">
                  {properties.map(prop => (
                    <GlassCard key={prop.id} onClick={() => navigate(`/v3/properties/${prop.id}`)} className="min-w-[280px] max-w-[280px] shrink-0 overflow-hidden">
                      <img src={getPropertyImage(prop.id, 400, 240)} alt={prop.address} className="h-36 w-full object-cover" loading="lazy" />
                      <div className="p-4">
                        <div className="flex items-center gap-2 mb-1"><StatusDot status={prop.status === 'active' ? 'active' : 'inactive'} /><span className="text-xs text-[var(--text-muted)] capitalize">{prop.status}</span></div>
                        <p className="font-semibold text-sm truncate">{prop.address}</p>
                        <p className="text-xs text-[var(--text-muted)]">{prop.postcode}</p>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border-subtle)]">
                          <span className="text-sm font-bold bg-gradient-to-r from-orange-500 to-pink-500 bg-clip-text text-transparent">£{prop.rent_amount?.toLocaleString()}/mo</span>
                          <ArrowRight size={14} className="text-[var(--text-muted)]" />
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              ) : <EmptyState message="No properties found" />}
            </div>
          </div>
        ) : (
          /* ═══════════════════════════════════════════════
             CALENDAR VIEW (Nozti-style day view)
             ═══════════════════════════════════════════════ */
          <div className="space-y-4">
            {/* Top bar: Today button + month nav + Day/Week/Month toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setSelectedDate(todayStr); setCalYear(now.getFullYear()); setCalMonth(now.getMonth()); }}
                  className="px-4 py-2 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 text-white text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Today
                </button>
                <div className="flex items-center gap-1">
                  <button onClick={prevDay} className="w-8 h-8 rounded-full hover:bg-[var(--bg-hover)] flex items-center justify-center transition-colors">
                    <ChevronLeft size={16} />
                  </button>
                  <button onClick={nextDay} className="w-8 h-8 rounded-full hover:bg-[var(--bg-hover)] flex items-center justify-center transition-colors">
                    <ChevronRight size={16} />
                  </button>
                </div>
                <span className="text-lg font-semibold">
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                </span>
              </div>
              <div className="hidden md:flex items-center gap-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-full p-1">
                {(['month', 'week', 'day'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setCalViewMode(m)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all capitalize ${
                      calViewMode === m ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Team selector */}
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
              {TEAM.map(member => {
                const active = selectedMember === member.id;
                return (
                  <button key={member.id} onClick={() => setSelectedMember(member.id)}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border transition-all shrink-0 ${
                      active ? 'border-orange-500/50 bg-orange-500/10' : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--border-input)]'
                    }`}>
                    <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${member.color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                      {member.initials}
                    </div>
                    <div className="text-left hidden sm:block">
                      <p className={`text-sm font-medium ${active ? 'text-orange-400' : ''}`}>{member.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{member.role}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Main calendar area: Day schedule + Right sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
              {/* ── Day schedule (time slots) ── */}
              <Card className="p-0 overflow-hidden">
                {/* Day header */}
                <div className="flex items-center justify-center gap-3 py-4 border-b border-[var(--border-subtle)]">
                  <button onClick={prevDay} className="w-8 h-8 rounded-full hover:bg-[var(--bg-hover)] flex items-center justify-center"><ChevronLeft size={16} /></button>
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-secondary)] text-sm">{weekday}</span>
                    <span className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                      isToday ? 'bg-gradient-to-r from-orange-500 to-pink-500 text-white' : 'bg-[var(--bg-subtle)]'
                    }`}>{dayNum}</span>
                  </div>
                  <button onClick={nextDay} className="w-8 h-8 rounded-full hover:bg-[var(--bg-hover)] flex items-center justify-center"><ChevronRight size={16} /></button>
                </div>

                {/* Time slots */}
                <div className="relative overflow-y-auto max-h-[600px]">
                  {/* Timezone label */}
                  <div className="sticky top-0 z-10 bg-[var(--bg-card)] border-b border-[var(--border-subtle)] px-4 py-2 text-xs text-[var(--text-muted)]">
                    GMT {Intl.DateTimeFormat().resolvedOptions().timeZone.includes('London') ? '+00:00' : '+00:00'}
                  </div>

                  {HOURS.map(hour => {
                    const hourEvents = selectedDayEvents.filter(e => e.startHour === hour);
                    const timeLabel = `${hour > 12 ? hour - 12 : hour === 0 ? 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`;

                    return (
                      <div key={hour} className="flex border-b border-[var(--border-subtle)] border-dashed min-h-[80px]">
                        {/* Time label */}
                        <div className="w-20 shrink-0 px-4 py-3 text-xs text-[var(--text-muted)] text-right border-r border-[var(--border-subtle)]">
                          {timeLabel}
                        </div>
                        {/* Event area */}
                        <div className="flex-1 p-2 flex flex-col gap-2">
                          {hourEvents.map(evt => (
                            <div key={evt.id} className={`${evt.bgLight} border-l-[3px] ${evt.color} rounded-xl p-3 cursor-pointer hover:brightness-110 transition-all`}>
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="text-[10px] text-[var(--text-muted)] mb-1">
                                    {`${hour > 12 ? hour-12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'} - ${(hour+evt.duration) > 12 ? (hour+evt.duration)-12 : hour+evt.duration}:00 ${(hour+evt.duration) >= 12 ? 'PM' : 'AM'}`}
                                  </p>
                                  <p className="text-sm font-medium">{evt.title}</p>
                                </div>
                                <button className="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center shrink-0">
                                  <MoreVertical size={14} className="text-[var(--text-muted)]" />
                                </button>
                              </div>
                              {/* Avatars */}
                              <div className="flex -space-x-2 mt-2">
                                {evt.avatars.map((a, i) => {
                                  const member = TEAM.find(m => m.initials === a);
                                  return (
                                    <div key={i} className={`w-7 h-7 rounded-full bg-gradient-to-br ${member?.color || 'from-gray-400 to-gray-500'} flex items-center justify-center text-white text-[10px] font-bold border-2 border-[var(--bg-card)]`}>
                                      {a}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* ── Right sidebar: Mini calendar + Filters ── */}
              <div className="space-y-5">
                {/* Mini calendar */}
                <Card className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <button onClick={prevMonth} className="w-7 h-7 rounded-full hover:bg-[var(--bg-hover)] flex items-center justify-center"><ChevronLeft size={14} /></button>
                    <span className="text-sm font-semibold">{MONTHS[calMonth]} {calYear}</span>
                    <button onClick={nextMonth} className="w-7 h-7 rounded-full hover:bg-[var(--bg-hover)] flex items-center justify-center"><ChevronRight size={14} /></button>
                  </div>

                  {/* Day headers */}
                  <div className="grid grid-cols-7 mb-1">
                    {DAYS_SHORT.map(d => (
                      <div key={d} className="text-center text-[10px] text-[var(--text-muted)] font-medium py-1">{d}</div>
                    ))}
                  </div>

                  {/* Days */}
                  <div className="grid grid-cols-7 gap-y-1">
                    {miniGrid.map((day, i) => {
                      if (day === null) return <div key={i} />;
                      const dateStr = fmtDate(calYear, calMonth, day);
                      const isSel = dateStr === selectedDate;
                      const isTod = dateStr === todayStr;
                      const dayEvts = eventsByDate[dateStr] || [];
                      return (
                        <button
                          key={i}
                          onClick={() => setSelectedDate(dateStr)}
                          className="flex flex-col items-center py-1"
                        >
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                            isSel ? 'bg-gradient-to-r from-orange-500 to-pink-500 text-white'
                            : isTod ? 'ring-1 ring-orange-500/50 text-orange-400'
                            : 'hover:bg-[var(--bg-hover)]'
                          }`}>
                            {day}
                          </span>
                          {dayEvts.length > 0 && (
                            <div className="flex gap-0.5 mt-0.5">
                              {dayEvts.slice(0, 3).map((e, j) => (
                                <div key={j} className={`w-1 h-1 rounded-full ${
                                  e.type === 'task' ? 'bg-orange-500' : e.type === 'viewing' ? 'bg-purple-500' : 'bg-blue-500'
                                }`} />
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </Card>

                {/* Activity Types */}
                <Card className="p-5">
                  <h3 className="text-sm font-semibold mb-3">Activity Types</h3>
                  <div className="space-y-2.5">
                    {ACTIVITY_TYPES.map(at => (
                      <label key={at.key} className="flex items-center gap-3 cursor-pointer group">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                          activeTypes[at.key]
                            ? `${at.color} border-transparent`
                            : 'border-[var(--border-input)] bg-transparent'
                        }`}>
                          {activeTypes[at.key] && (
                            <svg viewBox="0 0 12 12" className="w-3 h-3 text-white"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          )}
                        </div>
                        <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">{at.label}</span>
                        <input type="checkbox" checked={activeTypes[at.key]} onChange={() => toggleType(at.key)} className="sr-only" />
                      </label>
                    ))}
                  </div>
                </Card>

                {/* Ownership (foundation for assignment) */}
                <Card className="p-5">
                  <h3 className="text-sm font-semibold mb-3">Ownership</h3>
                  <div className="space-y-2.5">
                    {['My Activities', 'All Activities'].map(opt => (
                      <label key={opt} className="flex items-center gap-3 cursor-pointer group">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                          (opt === 'All Activities' && selectedMember === 'all') || (opt === 'My Activities' && selectedMember !== 'all')
                            ? 'border-orange-500'
                            : 'border-[var(--border-input)]'
                        }`}>
                          {((opt === 'All Activities' && selectedMember === 'all') || (opt === 'My Activities' && selectedMember !== 'all')) && (
                            <div className="w-2 h-2 rounded-full bg-orange-500" />
                          )}
                        </div>
                        <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">{opt}</span>
                      </label>
                    ))}
                  </div>
                </Card>

                {/* Status */}
                <Card className="p-5">
                  <h3 className="text-sm font-semibold mb-3">Status</h3>
                  <div className="space-y-2.5">
                    {['Open Activities', 'Completed', 'All'].map(opt => (
                      <label key={opt} className="flex items-center gap-3 cursor-pointer group">
                        <div className="w-4 h-4 rounded-full border-2 border-[var(--border-input)] flex items-center justify-center">
                          {opt === 'Open Activities' && <div className="w-2 h-2 rounded-full bg-orange-500" />}
                        </div>
                        <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">{opt}</span>
                      </label>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>
    </V3Layout>
  );
}
