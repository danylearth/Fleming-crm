import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import {
  Building2, Users, Wrench, AlertTriangle, UserCheck, UserPlus,
  ClipboardList, Calendar, Flame, Zap, FileText, Clock, ChevronRight,
  TrendingUp
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

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Greeting */}
      <div className="text-center py-4">
        <p className="text-sm text-gray-400 mb-1">{dateStr}</p>
        <h1 className="text-2xl font-bold text-gray-900">{greeting}, {user?.name?.split(' ')[0] || 'there'}</h1>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Properties" value={String(stats.properties)} sub={`${stats.propertiesLet} let · ${occupancyRate}% occupancy`} href="/properties" />
        <StatCard label="Landlords" value={String(stats.landlords)} sub={`${stats.bdmProspects || 0} BDM prospects`} href="/landlords" />
        <StatCard label="Active Tenancies" value={String(stats.activeTenancies || stats.tenants)} sub={`${stats.openMaintenance} open maintenance`} href="/tenants" />
      </div>

      {/* Compliance Alerts */}
      {stats.complianceAlerts && stats.complianceAlerts.length > 0 && (
        <div className="border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-900">Compliance Alerts</h2>
              <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{stats.complianceAlerts.length}</span>
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {stats.complianceAlerts.slice(0, 5).map((alert, i) => (
              <Link key={i} to={`/properties/${alert.property_id}`} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  {alert.type === 'Gas Safety' && <Flame className="w-4 h-4 text-gray-400" />}
                  {alert.type === 'EICR' && <Zap className="w-4 h-4 text-gray-400" />}
                  {alert.type === 'EPC' && <FileText className="w-4 h-4 text-gray-400" />}
                  <span className="text-sm text-gray-900">{alert.address}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{alert.type}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                    alert.status === 'expired'
                      ? 'border-red-300 text-red-600'
                      : 'border-amber-300 text-amber-600'
                  }`}>
                    {alert.status === 'expired' ? 'Expired' : 'Expiring Soon'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Two-column: Pipelines */}
      <div className="grid grid-cols-2 gap-4">
        {/* BDM Pipeline */}
        <div className="border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Landlord BDM Pipeline</h2>
            <Link to="/landlords-bdm" className="text-xs text-gray-400 hover:text-gray-700">View all →</Link>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <PipelineStat value={stats.bdmNew || 0} label="New" />
            <PipelineStat value={stats.bdmContacted || 0} label="Contacted" />
            <PipelineStat value={stats.bdmInterested || 0} label="Interested" />
            <PipelineStat value={stats.bdmProspects || 0} label="Total" bold />
          </div>
        </div>

        {/* Enquiries Pipeline */}
        <div className="border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Tenant Enquiries</h2>
            <Link to="/tenant-enquiries" className="text-xs text-gray-400 hover:text-gray-700">View all →</Link>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <PipelineStat value={stats.enquiriesNew || 0} label="New" />
            <PipelineStat value={stats.enquiriesViewing || 0} label="Viewing" />
            <PipelineStat value={stats.enquiriesOnboarding || 0} label="Onboarding" />
            <PipelineStat value={stats.enquiries || 0} label="Total" bold />
          </div>
        </div>
      </div>

      {/* Two-column: Tasks + Financial */}
      <div className="grid grid-cols-3 gap-4">
        {/* Tasks */}
        <div className="col-span-2 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Tasks</h2>
            <Link to="/tasks" className="text-xs text-gray-400 hover:text-gray-700">View all →</Link>
          </div>
          <div className="px-5 py-3">
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center py-3 border border-gray-100 rounded-lg">
                <p className={`text-2xl font-bold ${stats.tasksOverdue > 0 ? 'text-red-600' : 'text-gray-300'}`}>{stats.tasksOverdue || 0}</p>
                <p className="text-xs text-gray-400">Overdue</p>
              </div>
              <div className="text-center py-3 border border-gray-100 rounded-lg">
                <p className={`text-2xl font-bold ${stats.tasksDueToday > 0 ? 'text-amber-600' : 'text-gray-300'}`}>{stats.tasksDueToday || 0}</p>
                <p className="text-xs text-gray-400">Due Today</p>
              </div>
              <div className="text-center py-3 border border-gray-100 rounded-lg">
                <p className="text-2xl font-bold text-gray-900">{stats.tasksUpcoming || 0}</p>
                <p className="text-xs text-gray-400">Upcoming</p>
              </div>
            </div>
            {stats.recentTasks && stats.recentTasks.length > 0 && (
              <div className="space-y-1">
                {stats.recentTasks.slice(0, 4).map(task => (
                  <Link key={task.id} to="/tasks" className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        task.priority === 'high' ? 'bg-red-500' : task.priority === 'medium' ? 'bg-amber-500' : 'bg-gray-300'
                      }`} />
                      <span className="text-sm text-gray-900">{task.title}</span>
                    </div>
                    <span className="text-xs text-gray-400">{task.due_date ? new Date(task.due_date).toLocaleDateString('en-GB') : ''}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Financial */}
        <div className="border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Financials</h2>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-400">Monthly Income</p>
              <p className="text-2xl font-bold text-gray-900">£{stats.monthlyIncome?.toLocaleString() || 0}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Outstanding Rent</p>
              <p className={`text-2xl font-bold ${stats.outstandingRent > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                £{stats.outstandingRent?.toLocaleString() || 0}
              </p>
            </div>
            <div className="pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-gray-500">Occupancy</span>
                <span className="font-semibold text-gray-900">{occupancyRate}%</span>
              </div>
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-gray-900 rounded-full transition-all" style={{ width: `${occupancyRate}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-1">{stats.propertiesLet} of {stats.properties} let</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Maintenance */}
      {stats.recentMaintenance && stats.recentMaintenance.length > 0 && (
        <div className="border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Recent Maintenance</h2>
            <Link to="/maintenance" className="text-xs text-gray-400 hover:text-gray-700">View all →</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {stats.recentMaintenance.slice(0, 4).map(req => (
              <div key={req.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    req.priority === 'urgent' ? 'bg-red-500' : req.priority === 'high' ? 'bg-amber-500' : 'bg-gray-300'
                  }`} />
                  <div>
                    <p className="text-sm text-gray-900">{req.title}</p>
                    <p className="text-xs text-gray-400">{req.address}</p>
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                  req.status === 'open' ? 'border-red-300 text-red-600' :
                  req.status === 'in_progress' ? 'border-amber-300 text-amber-600' :
                  'border-gray-300 text-gray-600'
                }`}>
                  {req.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, href }: { label: string; value: string; sub: string; href: string }) {
  return (
    <Link to={href} className="border border-gray-200 rounded-lg p-5 hover:border-gray-300 transition-colors">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </Link>
  );
}

function PipelineStat({ value, label, bold }: { value: number; label: string; bold?: boolean }) {
  return (
    <div className="text-center py-2">
      <p className={`text-xl font-bold ${bold ? 'text-gray-900' : 'text-gray-700'}`}>{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}
