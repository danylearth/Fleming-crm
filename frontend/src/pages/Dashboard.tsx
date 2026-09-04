import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { Card, GlassCard, SectionHeader, StatusDot, EmptyState, Tag } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { getPropertyImage, getPropertyPlaceholder } from '../utils/propertyImages';
import {
  Building2, Users, Wrench, MessageSquare, AlertTriangle,
  Clock, CheckCircle2, ArrowRight, CalendarDays, Trash2
} from 'lucide-react';

interface MaintenanceItem {
  id: number; property_address: string; description: string; status: string; priority: string;
}

interface OverdueTask {
  id: number; title: string; status: string; priority: string; due_date: string;
}

interface DashboardData {
  stats: { properties: number; active_tenancies: number; open_maintenance: number; active_enquiries: number };
  complianceAlerts: { id: number; property_address: string; type: string; expiry_date: string }[];
  recentMaintenance: MaintenanceItem[];
  recentTasks: OverdueTask[];
}

interface Property {
  id: number; address: string; postcode: string; rent_amount: number;
  status: string; landlord_name: string; current_tenant: string | null;
  bedrooms: number; property_type: string; image_url?: string | null;
}

interface Task {
  id: number; title: string; description: string; status: string;
  priority: string; due_date: string; property_address?: string; assigned_to?: string;
}

interface Enquiry {
  id: number; status: string; first_name_1?: string; last_name_1?: string;
  property_address?: string; property_id?: number; created_at?: string;
  email_1?: string; phone_1?: string;
  application_form_completed?: number | boolean; application_review_status?: string;
  tenancy_agreement_completed?: boolean;
}

export default function Dashboard() {
  const api = useApi();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/dashboard').catch(() => null),
      api.get('/api/properties').catch(() => []),
      api.get('/api/tasks').catch(() => []),
      api.get('/api/tenant-enquiries').catch(() => []),
    ]).then(([dash, props, tks, enqs]) => {
      setDashboard(dash);
      setProperties(Array.isArray(props) ? props : []);
      setTasks(Array.isArray(tks) ? tks : []);
      setEnquiries(Array.isArray(enqs) ? enqs.filter((enquiry: Enquiry) => enquiry.status !== 'converted') : []);
    }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstName = user?.name?.split(' ')[0] || 'there';

  const stats = dashboard?.stats || {
    properties: properties.length,
    active_tenancies: properties.filter(p => p.status === 'active').length,
    open_maintenance: 0,
    active_enquiries: enquiries.length,
  };

  const now = useMemo(() => Date.now(), []);

  const calendarDays = useMemo(() => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, offset) => {
      const date = new Date(start);
      date.setDate(start.getDate() + offset);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return {
        key,
        date,
        tasks: tasks.filter(task => task.due_date?.slice(0, 10) === key && task.status !== 'completed'),
      };
    });
  }, [now, tasks]);

  const teamColors = ['bg-violet-400', 'bg-cyan-400', 'bg-emerald-400', 'bg-amber-400', 'bg-pink-400'];
  const colorForMember = (name?: string) => {
    if (!name) return 'bg-slate-400';
    const hash = Array.from(name).reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return teamColors[hash % teamColors.length];
  };

  const daysUntil = (date: string) => {
    const diff = (new Date(date).getTime() - now) / (1000 * 60 * 60 * 24);
    return Math.ceil(diff);
  };

  const urgencyColor = (date: string) => {
    const d = daysUntil(date);
    if (d < 0) return 'text-red-400';
    if (d < 30) return 'text-amber-400';
    return 'text-emerald-400';
  };

  const deleteTask = async (task: Task) => {
    if (!confirm(`Delete reminder “${task.title}”?`)) return;
    try {
      await api.delete(`/api/tasks/${task.id}`);
      setTasks(current => current.filter(item => item.id !== task.id));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Reminder could not be deleted');
    }
  };

  if (loading) {
    return (
      <Layout hideTopBar>
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-2 border-[var(--border-input)] border-t-orange-500 rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout hideTopBar>
      <div className="p-4 md:p-8 space-y-6 md:space-y-8">
        {/* Greeting */}
        <div className="pt-10 md:pt-0">
          <h1 className="text-2xl md:text-4xl font-bold">Hello, {firstName} 👋</h1>
          <p className="text-[var(--text-secondary)] mt-1 text-sm">Here's what's happening with your properties today.</p>
        </div>

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
              <p className={`text-3xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>
                {stat.value}
              </p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">{stat.label}</p>
            </GlassCard>
          ))}
        </div>

        {/* Two Column: Compliance + Pipeline */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Compliance and maintenance alerts */}
          <Card className="p-6">
            <SectionHeader title="Compliance Alerts & Maintenance Requests" action={() => navigate('/maintenance')} actionLabel="View All" />
            {dashboard?.complianceAlerts?.length || dashboard?.recentMaintenance?.length ? (
              <div className="space-y-3">
                {dashboard.complianceAlerts.slice(0, 3).map((alert, i) => (
                  <button key={`compliance-${i}`} onClick={() => navigate(`/properties/${alert.id}`)} className="w-full flex items-center justify-between p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors text-left">
                    <div className="flex items-center gap-3">
                      <AlertTriangle size={16} className={urgencyColor(alert.expiry_date)} />
                      <div>
                        <p className="text-sm font-medium">{alert.property_address}</p>
                        <p className="text-xs text-[var(--text-muted)]">{alert.type}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${urgencyColor(alert.expiry_date)}`}>
                        {daysUntil(alert.expiry_date) < 0
                          ? `${Math.abs(daysUntil(alert.expiry_date))}d overdue`
                          : `${daysUntil(alert.expiry_date)}d left`}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">{new Date(alert.expiry_date).toLocaleDateString()}</p>
                    </div>
                  </button>
                ))}
                {dashboard.recentMaintenance.slice(0, 3).map(item => (
                  <button key={`maintenance-${item.id}`} onClick={() => navigate('/maintenance')} className="w-full flex items-center justify-between p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors text-left">
                    <div className="flex items-center gap-3 min-w-0"><Wrench size={16} className="text-amber-400 shrink-0" /><div className="min-w-0"><p className="text-sm font-medium truncate">{item.property_address}</p><p className="text-xs text-[var(--text-muted)] truncate">{item.description}</p></div></div>
                    <span className="text-[10px] font-semibold uppercase text-amber-400">{item.status.replace('_', ' ')}</span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState message="No compliance alerts or open maintenance requests" />
            )}
          </Card>

          {/* Pipeline */}
          <Card className="p-6">
            <SectionHeader title="Enquiry Pipeline" action={() => navigate('/enquiries')} actionLabel="View All" />
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
                  const readyForReview = !!enq.application_form_completed && enq.application_review_status === 'pending';
                  const daysAgo = enq.created_at ? Math.floor((now - new Date(enq.created_at).getTime()) / (1000 * 60 * 60 * 24)) : null;

                  return (
                    <div
                      key={enq.id}
                      onClick={() => navigate('/enquiries')}
                      className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.bg} ${cfg.color} shrink-0`}>
                          <MessageSquare size={14} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{name}</p>
                          <p className="text-xs text-[var(--text-muted)] truncate">
                            {enq.property_address || 'No property linked'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        {readyForReview && <span className="mb-1 inline-block rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">New</span>}
                        <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                        {daysAgo !== null && (
                          <p className="text-xs text-[var(--text-muted)]">
                            {daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
                {enquiries.length > 5 && (
                  <p className="text-xs text-[var(--text-muted)] pt-1">+{enquiries.length - 5} more enquiries</p>
                )}
              </div>
            ) : (
              <EmptyState message="No enquiries yet" />
            )}
          </Card>
        </div>

        {/* Team Calendar */}
        <Card className="p-6">
          <SectionHeader title="Team Calendar" action={() => navigate('/tasks')} actionLabel="Open Calendar" />
          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map(({ key, date, tasks: dayTasks }, index) => (
              <button
                key={key}
                onClick={() => navigate('/tasks')}
                className={`min-h-24 rounded-xl border p-2 text-left transition-colors hover:bg-[var(--bg-hover)] ${index === 0 ? 'border-orange-500/40 bg-orange-500/5' : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40'}`}
              >
                <span className="block text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  {date.toLocaleDateString('en-GB', { weekday: 'short' })}
                </span>
                <span className="block text-lg font-semibold mt-0.5">{date.getDate()}</span>
                <div className="flex flex-wrap gap-1 mt-3" aria-label={`${dayTasks.length} open tasks`}>
                  {dayTasks.slice(0, 6).map(task => (
                    <span key={task.id} title={`${task.title}${task.assigned_to ? ` — ${task.assigned_to}` : ''}`} className={`w-2 h-2 rounded-full ${colorForMember(task.assigned_to)}`} />
                  ))}
                  {dayTasks.length > 6 && <span className="text-[9px] text-[var(--text-muted)]">+{dayTasks.length - 6}</span>}
                </div>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 text-xs text-[var(--text-muted)]">
            <CalendarDays size={14} />
            {[...new Set(calendarDays.flatMap(day => day.tasks.map(task => task.assigned_to).filter(Boolean)))].map(name => (
              <span key={name} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${colorForMember(name)}`} />{name}
              </span>
            ))}
            {calendarDays.some(day => day.tasks.some(task => !task.assigned_to)) && (
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400" />Unassigned</span>
            )}
          </div>
        </Card>

        {/* Recent Tasks */}
        <Card className="p-6">
          <SectionHeader title="Recent Tasks" action={() => navigate('/tasks')} actionLabel="View All" />
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
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{task.property_address || task.description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <Tag active={task.priority === 'high'}>{task.priority}</Tag>
                    {task.due_date && (
                      <p className={`text-xs mt-1 ${urgencyColor(task.due_date)}`}>
                        {new Date(task.due_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteTask(task)}
                    className="p-2 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    aria-label={`Delete ${task.title}`}
                    title="Delete reminder"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No tasks yet" />
          )}
        </Card>

        {/* My Properties Carousel */}
        <div>
          <SectionHeader title="My Properties" action={() => navigate('/properties')} actionLabel="View All" />
          {properties.length ? (
            <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2 scrollbar-hide">
              {properties.map(prop => (
                <GlassCard
                  key={prop.id}
                  onClick={() => navigate(`/properties/${prop.id}`)}
                  className="min-w-[280px] max-w-[280px] shrink-0 overflow-hidden"
                >
                  <img
                    src={getPropertyImage(prop.id, 400, 240, `${prop.address}, ${prop.postcode}`, prop.image_url, prop.landlord_name)}
                    alt={prop.address}
                    className="h-36 w-full object-cover"
                    loading="lazy"
                    onError={event => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = getPropertyPlaceholder(prop.id, 400, 240, prop.landlord_name);
                    }}
                  />
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusDot status={prop.status === 'active' ? 'active' : 'inactive'} />
                      <span className="text-xs text-[var(--text-muted)] capitalize">{prop.status}</span>
                    </div>
                    <p className="font-semibold text-sm truncate">{prop.address}</p>
                    <p className="text-xs text-[var(--text-muted)]">{prop.postcode}</p>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border-subtle)]">
                      <span className="text-sm font-bold bg-gradient-to-r from-orange-500 to-pink-500 bg-clip-text text-transparent">
                        £{prop.rent_amount?.toLocaleString()}/mo
                      </span>
                      <ArrowRight size={14} className="text-[var(--text-muted)]" />
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          ) : (
            <EmptyState message="No properties found" />
          )}
        </div>
      </div>
    </Layout>
  );
}
