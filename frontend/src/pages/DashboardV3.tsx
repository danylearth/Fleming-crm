import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { Card, GlassCard, SectionHeader, StatusDot, EmptyState, Tag } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import {
  Building2, Users, Wrench, MessageSquare, AlertTriangle,
  ChevronRight, Clock, CheckCircle2, ArrowRight
} from 'lucide-react';

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
}

interface Enquiry {
  id: number; status: string;
}

export default function DashboardV3() {
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
      setEnquiries(Array.isArray(enqs) ? enqs : []);
    }).finally(() => setLoading(false));
  }, []);

  const firstName = user?.name?.split(' ')[0] || 'there';

  const stats = dashboard?.stats || {
    properties: properties.length,
    active_tenancies: properties.filter(p => p.status === 'active').length,
    open_maintenance: 0,
    active_enquiries: enquiries.length,
  };

  const daysUntil = (date: string) => {
    const diff = (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return Math.ceil(diff);
  };

  const urgencyColor = (date: string) => {
    const d = daysUntil(date);
    if (d < 0) return 'text-red-400';
    if (d < 30) return 'text-amber-400';
    return 'text-emerald-400';
  };

  // Pipeline stats
  const pipelineCounts = {
    new: enquiries.filter(e => e.status === 'new').length,
    in_progress: enquiries.filter(e => e.status === 'in_progress').length,
    completed: enquiries.filter(e => e.status === 'completed' || e.status === 'closed').length,
  };

  if (loading) {
    return (
      <V3Layout hideTopBar>
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-2 border-[var(--border-input)] border-t-orange-500 rounded-full animate-spin" />
        </div>
      </V3Layout>
    );
  }

  return (
    <V3Layout hideTopBar>
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
          {/* Compliance Alerts */}
          <Card className="p-6">
            <SectionHeader title="Compliance Alerts" action={() => navigate('/v3/properties')} actionLabel="View All" />
            {dashboard?.complianceAlerts?.length ? (
              <div className="space-y-3">
                {dashboard.complianceAlerts.slice(0, 5).map((alert, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors">
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
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No compliance alerts" />
            )}
          </Card>

          {/* Pipeline */}
          <Card className="p-6">
            <SectionHeader title="Enquiry Pipeline" action={() => navigate('/v3/enquiries')} actionLabel="View All" />
            <div className="space-y-4 mt-2">
              {[
                { label: 'New', count: pipelineCounts.new, color: 'bg-blue-500' },
                { label: 'In Progress', count: pipelineCounts.in_progress, color: 'bg-amber-500' },
                { label: 'Completed', count: pipelineCounts.completed, color: 'bg-emerald-500' },
              ].map(stage => (
                <div key={stage.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-[var(--text-secondary)]">{stage.label}</span>
                    <span className="text-sm font-bold">{stage.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${stage.color} transition-all duration-500`}
                      style={{ width: `${enquiries.length ? (stage.count / enquiries.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
              <p className="text-xs text-[var(--text-muted)] pt-1">{enquiries.length} total enquiries</p>
            </div>
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
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No tasks yet" />
          )}
        </Card>

        {/* My Properties Carousel */}
        <div>
          <SectionHeader title="My Properties" action={() => navigate('/v3/properties')} actionLabel="View All" />
          {properties.length ? (
            <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2 scrollbar-hide">
              {properties.map(prop => (
                <GlassCard
                  key={prop.id}
                  onClick={() => navigate(`/v3/properties/${prop.id}`)}
                  className="min-w-[280px] max-w-[280px] shrink-0 overflow-hidden"
                >
                  {/* Image placeholder */}
                  <div className="h-36 bg-gradient-to-br from-[var(--glass-from)] to-[var(--glass-to)] flex items-center justify-center">
                    <Building2 size={32} className="text-[var(--text-faint)]" />
                  </div>
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
    </V3Layout>
  );
}
