import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import {
  AlertTriangle, Flame, Zap, FileText, ChevronRight, ArrowUpRight,
  Building2, Users, Home, Wrench, UserPlus, TrendingUp, TrendingDown,
  Calendar, Clock, CheckCircle, Circle, Eye, Phone, Mail, Plus
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

export default function DashboardV2() {
  const api = useApi();
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/dashboard').then(setStats).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good Morning' : now.getHours() < 18 ? 'Good Afternoon' : 'Good Evening';
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const occupancyRate = stats.properties > 0 ? Math.round((stats.propertiesLet / stats.properties) * 100) : 0;
  const voidCount = stats.properties - stats.propertiesLet;

  // Group compliance by type
  const alertsByType: Record<string, number> = {};
  stats.complianceAlerts?.forEach(a => {
    alertsByType[a.type] = (alertsByType[a.type] || 0) + 1;
  });
  const expiredCount = stats.complianceAlerts?.filter(a => a.status === 'expired').length || 0;

  // Calendar - next 5 days
  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-10">
        <p className="text-sm text-gray-400 mb-1">{dateStr}</p>
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">{greeting}, {user?.name?.split(' ')[0] || 'Sam'}</h1>
      </div>

      {/* Stat cards — big numbers */}
      <div className="grid grid-cols-4 gap-5 mb-8">
        <StatCard
          label="Monthly Rent"
          value={`£${stats.monthlyIncome?.toLocaleString() || '0'}`}
          sub="collected"
          trend={stats.monthlyIncome > 0 ? 'up' : undefined}
          href="/transactions"
        />
        <StatCard
          label="Outstanding"
          value={`£${stats.outstandingRent?.toLocaleString() || '0'}`}
          sub="overdue"
          alert={stats.outstandingRent > 0}
          href="/transactions"
        />
        <StatCard
          label="Occupancy"
          value={`${occupancyRate}%`}
          sub={`${stats.propertiesLet} of ${stats.properties} let`}
          href="/properties"
          bar={occupancyRate}
        />
        <StatCard
          label="Maintenance"
          value={String(stats.openMaintenance || 0)}
          sub="open requests"
          alert={(stats.openMaintenance || 0) > 3}
          href="/maintenance"
        />
      </div>

      {/* Two-column: Compliance + Calendar */}
      <div className="grid grid-cols-5 gap-5 mb-8">
        {/* Compliance — 3 cols */}
        <div className="col-span-3 bg-white rounded-2xl border border-gray-200/60 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                expiredCount > 0 ? 'bg-red-50' : 'bg-amber-50'
              }`}>
                <AlertTriangle className={`w-4 h-4 ${expiredCount > 0 ? 'text-red-500' : 'text-amber-500'}`} />
              </div>
              <h2 className="text-sm font-semibold text-gray-900">Compliance</h2>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                expiredCount > 0 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
              }`}>{stats.complianceAlerts?.length || 0}</span>
            </div>
            <Link to="/properties" className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5">
              View all <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Type summary strip */}
          {Object.keys(alertsByType).length > 0 && (
            <div className="flex items-center gap-4 px-5 py-2.5 border-b border-gray-50 bg-gray-50/30">
              {Object.entries(alertsByType).map(([type, count]) => (
                <div key={type} className="flex items-center gap-1.5">
                  {type === 'Gas Safety' && <Flame className="w-3.5 h-3.5 text-orange-400" />}
                  {type === 'EICR' && <Zap className="w-3.5 h-3.5 text-blue-400" />}
                  {type === 'EPC' && <FileText className="w-3.5 h-3.5 text-emerald-400" />}
                  <span className="text-xs text-gray-600">{type}</span>
                  <span className="text-[10px] font-semibold text-gray-400">{count}</span>
                </div>
              ))}
            </div>
          )}

          <div className="divide-y divide-gray-50">
            {stats.complianceAlerts?.slice(0, 5).map((alert, i) => {
              const daysLeft = alert.expiry_date
                ? Math.ceil((new Date(alert.expiry_date).getTime() - Date.now()) / 86400000)
                : null;
              return (
                <Link key={i} to={`/properties/${alert.property_id}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 font-medium">{alert.address}</p>
                    <p className="text-[11px] text-gray-400">{alert.type}</p>
                  </div>
                  <div className="text-right">
                    {daysLeft !== null && daysLeft < 0 ? (
                      <span className="text-xs font-semibold text-red-600">{Math.abs(daysLeft)}d overdue</span>
                    ) : daysLeft !== null ? (
                      <span className="text-xs text-gray-500">{daysLeft}d left</span>
                    ) : null}
                  </div>
                  <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${
                    alert.status === 'expired'
                      ? 'bg-red-50 text-red-600'
                      : 'bg-amber-50 text-amber-600'
                  }`}>
                    {alert.status === 'expired' ? 'Expired' : 'Expiring'}
                  </span>
                </Link>
              );
            })}
            {(!stats.complianceAlerts || stats.complianceAlerts.length === 0) && (
              <div className="flex items-center justify-center py-10">
                <div className="text-center">
                  <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
                  <p className="text-sm text-gray-400">All compliant</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Calendar preview — 2 cols */}
        <div className="col-span-2 bg-white rounded-2xl border border-gray-200/60 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-gray-500" />
              </div>
              <h2 className="text-sm font-semibold text-gray-900">This Week</h2>
            </div>
            <Link to="/tasks" className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5">
              View <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="divide-y divide-gray-50">
            {days.map((d, i) => {
              const isToday = i === 0;
              const dayTasks = stats.recentTasks?.filter(t =>
                t.due_date && new Date(t.due_date).toDateString() === d.toDateString()
              ) || [];
              return (
                <div key={i} className={`flex items-start gap-4 px-5 py-3 ${isToday ? 'bg-gray-50/30' : ''}`}>
                  <div className="w-12 flex-shrink-0">
                    <p className={`text-2xl font-bold tracking-tight ${isToday ? 'text-gray-900' : 'text-gray-300'}`}>{d.getDate()}</p>
                    <p className={`text-[10px] font-medium ${isToday ? 'text-red-500' : 'text-gray-400'}`}>
                      {dayNames[d.getDay()]}
                    </p>
                  </div>
                  <div className="flex-1 space-y-1">
                    {dayTasks.length > 0 ? dayTasks.map((t, j) => (
                      <div key={j} className="flex items-center gap-2">
                        <div className={`w-0.5 h-4 rounded-full ${
                          t.priority === 'high' ? 'bg-red-400' : t.priority === 'medium' ? 'bg-amber-400' : 'bg-gray-300'
                        }`} />
                        <span className="text-xs text-gray-700">{t.title}</span>
                      </div>
                    )) : (
                      <p className="text-[11px] text-gray-300 italic">{isToday ? 'No tasks today' : '—'}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Two-column: Pipelines */}
      <div className="grid grid-cols-2 gap-5 mb-8">
        {/* Enquiry Pipeline */}
        <div className="bg-white rounded-2xl border border-gray-200/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                <UserPlus className="w-4 h-4 text-blue-500" />
              </div>
              <h2 className="text-sm font-semibold text-gray-900">Enquiries</h2>
            </div>
            <Link to="/tenant-enquiries" className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5">
              View <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="flex items-center gap-2 mb-4">
            {[
              { label: 'New', value: stats.enquiriesNew || 0, color: 'bg-blue-500' },
              { label: 'Viewing', value: stats.enquiriesViewing || 0, color: 'bg-amber-500' },
              { label: 'Onboarding', value: stats.enquiriesOnboarding || 0, color: 'bg-emerald-500' },
            ].map((stage, i) => (
              <div key={i} className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-400">{stage.label}</span>
                  <span className="text-sm font-bold text-gray-900">{stage.value}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${stage.color}`}
                    style={{ width: `${stats.enquiries ? (stage.value / stats.enquiries) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400">{stats.enquiries || 0} total enquiries</p>
        </div>

        {/* BDM Pipeline */}
        <div className="bg-white rounded-2xl border border-gray-200/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-purple-500" />
              </div>
              <h2 className="text-sm font-semibold text-gray-900">BDM Pipeline</h2>
            </div>
            <Link to="/landlords-bdm" className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5">
              View <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="flex items-center gap-2 mb-4">
            {[
              { label: 'New', value: stats.bdmNew || 0, color: 'bg-blue-500' },
              { label: 'Contacted', value: stats.bdmContacted || 0, color: 'bg-amber-500' },
              { label: 'Interested', value: stats.bdmInterested || 0, color: 'bg-emerald-500' },
            ].map((stage, i) => (
              <div key={i} className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-400">{stage.label}</span>
                  <span className="text-sm font-bold text-gray-900">{stage.value}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${stage.color}`}
                    style={{ width: `${stats.bdmProspects ? (stage.value / stats.bdmProspects) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400">{stats.bdmProspects || 0} total prospects</p>
        </div>
      </div>

      {/* Two-column: Recent Maintenance + Recent Activity */}
      <div className="grid grid-cols-2 gap-5">
        {/* Maintenance */}
        <div className="bg-white rounded-2xl border border-gray-200/60 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center">
                <Wrench className="w-4 h-4 text-orange-500" />
              </div>
              <h2 className="text-sm font-semibold text-gray-900">Maintenance</h2>
            </div>
            <Link to="/maintenance" className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5">
              View <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {stats.recentMaintenance?.slice(0, 4).map(req => (
              <div key={req.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50 transition-colors">
                <div className={`w-1 h-8 rounded-full flex-shrink-0 ${
                  req.priority === 'urgent' ? 'bg-red-400' : req.priority === 'high' ? 'bg-amber-400' : 'bg-gray-200'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">{req.title}</p>
                  <p className="text-[11px] text-gray-400">{req.address}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${
                  req.status === 'open' ? 'bg-red-50 text-red-600' :
                  req.status === 'in_progress' ? 'bg-amber-50 text-amber-600' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {req.status === 'in_progress' ? 'In Progress' : req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                </span>
              </div>
            ))}
            {(!stats.recentMaintenance || stats.recentMaintenance.length === 0) && (
              <div className="flex items-center justify-center py-10">
                <p className="text-sm text-gray-400">No open requests</p>
              </div>
            )}
          </div>
        </div>

        {/* Portfolio Overview */}
        <div className="bg-white rounded-2xl border border-gray-200/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
                <Home className="w-4 h-4 text-gray-500" />
              </div>
              <h2 className="text-sm font-semibold text-gray-900">Portfolio</h2>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-900 tracking-tight">{stats.properties}</p>
              <p className="text-[11px] text-gray-400">Properties</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-900 tracking-tight">{stats.landlords}</p>
              <p className="text-[11px] text-gray-400">Landlords</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-900 tracking-tight">{stats.tenants || stats.activeTenancies}</p>
              <p className="text-[11px] text-gray-400">Tenants</p>
            </div>
          </div>
          {/* Occupancy bar */}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-gray-400">Occupancy rate</span>
              <span className="text-xs font-semibold text-gray-900">{occupancyRate}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gray-900 rounded-full transition-all" style={{ width: `${occupancyRate}%` }} />
            </div>
            {voidCount > 0 && (
              <p className="text-[11px] text-amber-600 mt-1.5">{voidCount} void {voidCount === 1 ? 'property' : 'properties'}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, trend, alert, href, bar }: {
  label: string; value: string; sub: string; trend?: 'up' | 'down'; alert?: boolean; href: string; bar?: number;
}) {
  return (
    <Link to={href} className="bg-white rounded-2xl border border-gray-200/60 p-5 hover:border-gray-300 transition-all group">
      <p className="text-xs text-gray-400 mb-2">{label}</p>
      <div className="flex items-end justify-between">
        <p className={`text-3xl font-bold tracking-tight ${alert ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
        {trend === 'up' && <TrendingUp className="w-4 h-4 text-emerald-400" />}
        {trend === 'down' && <TrendingDown className="w-4 h-4 text-red-400" />}
      </div>
      {bar !== undefined && (
        <div className="h-1 bg-gray-100 rounded-full overflow-hidden mt-2">
          <div className="h-full bg-gray-900 rounded-full" style={{ width: `${bar}%` }} />
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-1">{sub}</p>
    </Link>
  );
}
