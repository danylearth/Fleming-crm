import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import {
  Building2, Users, Wrench, AlertTriangle, UserCheck, UserPlus,
  ClipboardList, Calendar, Flame, Zap, FileText, Clock, ChevronRight,
  TrendingUp, DollarSign, AlertCircle, ArrowUpRight
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
  bdmContacted: number;
  bdmInterested: number;
  enquiries: number;
  enquiriesNew: number;
  enquiriesViewing: number;
  enquiriesOnboarding: number;
  tasksOverdue: number;
  tasksDueToday: number;
  tasksUpcoming: number;
  complianceAlerts: Array<{ property_id: number; address: string; type: string; expiry_date: string; status: 'expired' | 'expiring'; }>;
  recentMaintenance: Array<{ id: number; title: string; priority: string; status: string; address: string; created_at: string; }>;
  recentTasks: Array<{ id: number; title: string; priority: string; due_date: string; related_to: string; }>;
}

export default function Dashboard() {
  const api = useApi();
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/dashboard').then(setStats).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good Morning' : now.getHours() < 18 ? 'Good Afternoon' : 'Good Evening';
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const occupancyRate = stats.properties > 0 ? Math.round((stats.propertiesLet / stats.properties) * 100) : 0;
  const voidProperties = stats.properties - stats.propertiesLet;

  // Group compliance alerts by type
  const alertsByType: Record<string, typeof stats.complianceAlerts> = {};
  stats.complianceAlerts?.forEach(a => {
    if (!alertsByType[a.type]) alertsByType[a.type] = [];
    alertsByType[a.type].push(a);
  });
  const expiredCount = stats.complianceAlerts?.filter(a => a.status === 'expired').length || 0;
  const expiringCount = stats.complianceAlerts?.filter(a => a.status === 'expiring').length || 0;

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Greeting */}
      <div>
        <p className="text-sm text-gray-400">{dateStr}</p>
        <h1 className="text-2xl font-bold text-gray-900">{greeting}, {user?.name?.split(' ')[0] || 'there'}</h1>
      </div>

      {/* Row 1: Financial strip */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-400 mb-1">Monthly Rent</p>
          <p className="text-2xl font-bold text-gray-900">£{stats.monthlyIncome?.toLocaleString() || '0'}</p>
          <p className="text-[11px] text-gray-400 mt-1">This month</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-400 mb-1">Outstanding</p>
          <p className={`text-2xl font-bold ${stats.outstandingRent > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            £{stats.outstandingRent?.toLocaleString() || '0'}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">Overdue rent</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-400 mb-1">Maintenance</p>
          <p className="text-2xl font-bold text-gray-900">{stats.openMaintenance || 0}</p>
          <p className="text-[11px] text-gray-400 mt-1">Open requests</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-400 mb-1">Occupancy</p>
          <div className="flex items-end gap-2">
            <p className="text-2xl font-bold text-gray-900">{occupancyRate}%</p>
            <p className="text-[11px] text-gray-400 mb-1">{stats.propertiesLet}/{stats.properties} let</p>
          </div>
          {voidProperties > 0 && (
            <p className="text-[11px] text-amber-600 mt-1">{voidProperties} void</p>
          )}
        </div>
      </div>

      {/* Row 2: Compliance Alerts + Pipeline */}
      <div className="grid grid-cols-5 gap-4">
        {/* Compliance Alerts — 3 cols */}
        <div className="col-span-3 bg-white border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <AlertTriangle className={`w-4 h-4 ${expiredCount > 0 ? 'text-red-500' : 'text-amber-500'}`} />
              <h2 className="text-sm font-semibold text-gray-900">Compliance Alerts</h2>
              {(stats.complianceAlerts?.length || 0) > 0 && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  expiredCount > 0 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                }`}>{stats.complianceAlerts.length}</span>
              )}
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              {expiredCount > 0 && <span className="text-red-600 font-medium">{expiredCount} expired</span>}
              {expiringCount > 0 && <span className="text-amber-600 font-medium">{expiringCount} expiring</span>}
            </div>
          </div>

          {stats.complianceAlerts && stats.complianceAlerts.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {stats.complianceAlerts.slice(0, 6).map((alert, i) => {
                const daysUntil = alert.expiry_date
                  ? Math.ceil((new Date(alert.expiry_date).getTime() - Date.now()) / 86400000)
                  : null;
                return (
                  <Link key={i} to={`/properties/${alert.property_id}`}
                    className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">{alert.address}</p>
                    </div>
                    <span className="text-xs text-gray-400 w-20">{alert.type}</span>
                    <span className="text-xs text-gray-400 w-24 text-right">
                      {daysUntil !== null && (
                        daysUntil < 0
                          ? <span className="text-red-600 font-medium">{Math.abs(daysUntil)}d overdue</span>
                          : <span>{daysUntil}d remaining</span>
                      )}
                    </span>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full w-24 text-center ${
                      alert.status === 'expired'
                        ? 'bg-red-50 text-red-600'
                        : 'bg-amber-50 text-amber-600'
                    }`}>
                      {alert.status === 'expired' ? 'Expired' : 'Expiring'}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-gray-400">All compliant ✓</p>
            </div>
          )}
        </div>

        {/* Pipeline / Enquiries — 2 cols */}
        <div className="col-span-2 space-y-4">
          {/* Enquiry Pipeline */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Enquiry Pipeline</h2>
              <Link to="/tenant-enquiries" className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-0.5">
                View <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <PipelineStat value={stats.enquiriesNew || 0} label="New" color="bg-blue-500" />
              <PipelineStat value={stats.enquiriesViewing || 0} label="Viewing" color="bg-amber-500" />
              <PipelineStat value={stats.enquiriesOnboarding || 0} label="Onboard" color="bg-emerald-500" />
              <PipelineStat value={stats.enquiries || 0} label="Total" />
            </div>
          </div>

          {/* BDM Pipeline */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">BDM Pipeline</h2>
              <Link to="/landlords-bdm" className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-0.5">
                View <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <PipelineStat value={stats.bdmNew || 0} label="New" color="bg-blue-500" />
              <PipelineStat value={stats.bdmContacted || 0} label="Contact" color="bg-amber-500" />
              <PipelineStat value={stats.bdmInterested || 0} label="Interest" color="bg-emerald-500" />
              <PipelineStat value={stats.bdmProspects || 0} label="Total" />
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Overdue Tasks + Recent Maintenance */}
      <div className="grid grid-cols-2 gap-4">
        {/* Tasks */}
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">Tasks</h2>
            </div>
            <Link to="/tasks" className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-0.5">
              View <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="px-5 py-3">
            <div className="flex items-center gap-4 mb-3 pb-3 border-b border-gray-50">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${stats.tasksOverdue > 0 ? 'bg-red-500' : 'bg-gray-200'}`} />
                <span className={`text-sm font-semibold ${stats.tasksOverdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>{stats.tasksOverdue || 0}</span>
                <span className="text-xs text-gray-400">Overdue</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${stats.tasksDueToday > 0 ? 'bg-amber-500' : 'bg-gray-200'}`} />
                <span className="text-sm font-semibold text-gray-900">{stats.tasksDueToday || 0}</span>
                <span className="text-xs text-gray-400">Today</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-gray-200" />
                <span className="text-sm font-semibold text-gray-900">{stats.tasksUpcoming || 0}</span>
                <span className="text-xs text-gray-400">Upcoming</span>
              </div>
            </div>
            {stats.recentTasks && stats.recentTasks.length > 0 ? (
              <div className="space-y-0.5">
                {stats.recentTasks.slice(0, 5).map(task => (
                  <Link key={task.id} to="/tasks" className="flex items-center justify-between py-2 px-2 rounded hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        task.priority === 'high' ? 'bg-red-500' : task.priority === 'medium' ? 'bg-amber-400' : 'bg-gray-300'
                      }`} />
                      <span className="text-sm text-gray-900">{task.title}</span>
                    </div>
                    <span className="text-xs text-gray-400">{task.due_date ? new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-6">No upcoming tasks</p>
            )}
          </div>
        </div>

        {/* Recent Maintenance / Work Orders */}
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">Maintenance Requests</h2>
            </div>
            <Link to="/maintenance" className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-0.5">
              View <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          {stats.recentMaintenance && stats.recentMaintenance.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {stats.recentMaintenance.slice(0, 5).map(req => (
                <div key={req.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      req.priority === 'urgent' ? 'bg-red-500' : req.priority === 'high' ? 'bg-amber-500' : 'bg-gray-300'
                    }`} />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900 truncate">{req.title}</p>
                      <p className="text-xs text-gray-400">{req.address}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${
                    req.status === 'open' ? 'bg-red-50 text-red-600' :
                    req.status === 'in_progress' ? 'bg-amber-50 text-amber-600' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {req.status === 'in_progress' ? 'In Progress' : req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-gray-400">No open requests</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PipelineStat({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div className="text-center py-2">
      <div className="flex items-center justify-center gap-1.5 mb-0.5">
        {color && <div className={`w-1.5 h-1.5 rounded-full ${color}`} />}
        <p className="text-lg font-bold text-gray-900">{value}</p>
      </div>
      <p className="text-[11px] text-gray-400">{label}</p>
    </div>
  );
}
