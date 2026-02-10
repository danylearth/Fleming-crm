import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { Building2, Users, Wrench, AlertTriangle, UserCheck, UserPlus, ClipboardList, Calendar, AlertCircle, Flame, Zap, FileText, TrendingUp, Clock } from 'lucide-react';

interface DashboardStats {
  properties: number;
  propertiesLet: number;
  landlords: number;
  tenants: number;
  activeTenancies: number;
  openMaintenance: number;
  monthlyIncome: number;
  outstandingRent: number;
  // New fields
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
  complianceAlerts: Array<{
    property_id: number;
    address: string;
    type: string;
    expiry_date: string;
    status: 'expired' | 'expiring';
  }>;
  recentMaintenance: Array<{
    id: number;
    title: string;
    priority: string;
    status: string;
    address: string;
    created_at: string;
  }>;
  recentTasks: Array<{
    id: number;
    title: string;
    priority: string;
    due_date: string;
    related_to: string;
  }>;
}

export default function Dashboard() {
  const api = useApi();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/dashboard')
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-navy-200 border-t-navy-900 rounded-full animate-spin" />
      </div>
    );
  }

  const occupancyRate = stats.properties > 0 ? Math.round((stats.propertiesLet / stats.properties) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-navy-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Overview of your property portfolio</p>
      </div>

      {/* Compliance Alerts Banner */}
      {stats.complianceAlerts && stats.complianceAlerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-red-800 font-semibold mb-3">
            <AlertTriangle className="w-5 h-5" />
            Compliance Alerts ({stats.complianceAlerts.length})
          </div>
          <div className="space-y-2">
            {stats.complianceAlerts.slice(0, 5).map((alert, i) => (
              <Link 
                key={i} 
                to={`/properties/${alert.property_id}`}
                className="flex items-center justify-between p-3 bg-white rounded-xl hover:bg-red-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {alert.type === 'Gas Safety' && <Flame className="w-4 h-4 text-orange-500" />}
                  {alert.type === 'EICR' && <Zap className="w-4 h-4 text-blue-500" />}
                  {alert.type === 'EPC' && <FileText className="w-4 h-4 text-green-500" />}
                  <span className="text-sm font-medium text-navy-900">{alert.address}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">{alert.type}</span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    alert.status === 'expired' ? 'bg-red-200 text-red-800' : 'bg-yellow-200 text-yellow-800'
                  }`}>
                    {alert.status === 'expired' ? 'EXPIRED' : 'Expiring Soon'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline Summary Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* BDM Pipeline */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-500" />
              <h3 className="font-semibold text-navy-900">Landlord BDM Pipeline</h3>
            </div>
            <Link to="/bdm" className="text-sm text-gold-600 hover:text-gold-700 font-medium">View all →</Link>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center p-3 bg-gray-50 rounded-xl">
              <p className="text-2xl font-bold text-navy-900">{stats.bdmNew || 0}</p>
              <p className="text-xs text-gray-500">New</p>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-xl">
              <p className="text-2xl font-bold text-blue-600">{stats.bdmContacted || 0}</p>
              <p className="text-xs text-blue-600">Contacted</p>
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-xl">
              <p className="text-2xl font-bold text-yellow-600">{stats.bdmInterested || 0}</p>
              <p className="text-xs text-yellow-600">Interested</p>
            </div>
            <div className="text-center p-3 bg-purple-50 rounded-xl">
              <p className="text-2xl font-bold text-purple-600">{stats.bdmProspects || 0}</p>
              <p className="text-xs text-purple-600">Total</p>
            </div>
          </div>
        </div>

        {/* Enquiries Pipeline */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-green-500" />
              <h3 className="font-semibold text-navy-900">Tenant Enquiries</h3>
            </div>
            <Link to="/tenant-enquiries" className="text-sm text-gold-600 hover:text-gold-700 font-medium">View all →</Link>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center p-3 bg-gray-50 rounded-xl">
              <p className="text-2xl font-bold text-navy-900">{stats.enquiriesNew || 0}</p>
              <p className="text-xs text-gray-500">New</p>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-xl">
              <p className="text-2xl font-bold text-blue-600">{stats.enquiriesViewing || 0}</p>
              <p className="text-xs text-blue-600">Viewing</p>
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-xl">
              <p className="text-2xl font-bold text-yellow-600">{stats.enquiriesOnboarding || 0}</p>
              <p className="text-xs text-yellow-600">Onboarding</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-xl">
              <p className="text-2xl font-bold text-green-600">{stats.enquiries || 0}</p>
              <p className="text-xs text-green-600">Total</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tasks Summary */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-navy-500" />
            <h3 className="font-semibold text-navy-900">Tasks Overview</h3>
          </div>
          <Link to="/tasks" className="text-sm text-gold-600 hover:text-gold-700 font-medium">View all →</Link>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className={`p-4 rounded-xl ${stats.tasksOverdue > 0 ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className={`w-4 h-4 ${stats.tasksOverdue > 0 ? 'text-red-500' : 'text-gray-400'}`} />
              <span className={`text-sm font-medium ${stats.tasksOverdue > 0 ? 'text-red-700' : 'text-gray-500'}`}>Overdue</span>
            </div>
            <p className={`text-3xl font-bold ${stats.tasksOverdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>{stats.tasksOverdue || 0}</p>
          </div>
          <div className={`p-4 rounded-xl ${stats.tasksDueToday > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'}`}>
            <div className="flex items-center gap-2 mb-1">
              <Clock className={`w-4 h-4 ${stats.tasksDueToday > 0 ? 'text-yellow-500' : 'text-gray-400'}`} />
              <span className={`text-sm font-medium ${stats.tasksDueToday > 0 ? 'text-yellow-700' : 'text-gray-500'}`}>Due Today</span>
            </div>
            <p className={`text-3xl font-bold ${stats.tasksDueToday > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>{stats.tasksDueToday || 0}</p>
          </div>
          <div className="p-4 rounded-xl bg-green-50">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-green-500" />
              <span className="text-sm font-medium text-green-700">Upcoming</span>
            </div>
            <p className="text-3xl font-bold text-green-600">{stats.tasksUpcoming || 0}</p>
          </div>
        </div>
        {/* Recent Tasks List */}
        {stats.recentTasks && stats.recentTasks.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
            {stats.recentTasks.slice(0, 3).map(task => (
              <Link key={task.id} to="/tasks" className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    task.priority === 'high' ? 'bg-red-500' :
                    task.priority === 'medium' ? 'bg-yellow-500' : 'bg-gray-300'
                  }`} />
                  <span className="text-sm font-medium text-navy-900">{task.title}</span>
                </div>
                <span className="text-xs text-gray-500">{task.due_date ? new Date(task.due_date).toLocaleDateString('en-GB') : ''}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-navy-900 to-navy-800 rounded-2xl p-6 text-white lg:col-span-2">
          <h3 className="text-navy-200 text-sm font-medium mb-4">Financial Summary</h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-navy-300 text-sm">Monthly Income</p>
              <p className="text-3xl font-bold text-gold-500">£{stats.monthlyIncome?.toLocaleString() || 0}</p>
              <p className="text-navy-400 text-xs mt-1">Collected this month</p>
            </div>
            <div>
              <p className="text-navy-300 text-sm">Outstanding Rent</p>
              <p className={`text-3xl font-bold ${stats.outstandingRent > 0 ? 'text-red-400' : 'text-green-400'}`}>
                £{stats.outstandingRent?.toLocaleString() || 0}
              </p>
              <p className="text-navy-400 text-xs mt-1">
                {stats.outstandingRent > 0 ? 'Awaiting payment' : 'All collected'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-gray-500 text-sm font-medium mb-4">Occupancy Rate</h3>
          <div className="flex items-end gap-4">
            <p className="text-4xl font-bold text-navy-900">{occupancyRate}%</p>
            <div className="flex-1 mb-2">
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-gold-500 to-gold-400 rounded-full transition-all"
                  style={{ width: `${occupancyRate}%` }}
                />
              </div>
            </div>
          </div>
          <p className="text-gray-400 text-sm mt-2">
            {stats.propertiesLet} of {stats.properties} properties let
          </p>
        </div>
      </div>

      {/* Recent Maintenance */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-navy-900">Recent Maintenance Requests</h3>
          <Link to="/maintenance" className="text-sm text-gold-600 hover:text-gold-700 font-medium">
            View all →
          </Link>
        </div>
        
        {stats.recentMaintenance.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Wrench className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            No maintenance requests
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {stats.recentMaintenance.map(req => (
              <div key={req.id} className="p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  req.priority === 'urgent' ? 'bg-red-100' :
                  req.priority === 'high' ? 'bg-orange-100' :
                  'bg-gray-100'
                }`}>
                  {req.priority === 'urgent' ? (
                    <AlertTriangle className={`w-5 h-5 text-red-500`} />
                  ) : (
                    <Wrench className={`w-5 h-5 ${
                      req.priority === 'high' ? 'text-orange-500' : 'text-gray-500'
                    }`} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-navy-900 truncate">{req.title}</p>
                  <p className="text-sm text-gray-500 truncate">{req.address}</p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  req.status === 'open' ? 'bg-red-50 text-red-600' :
                  req.status === 'in_progress' ? 'bg-amber-50 text-amber-600' :
                  'bg-green-50 text-green-600'
                }`}>
                  {req.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <QuickAction href="/properties" icon={Building2} label="Add Property" />
        <QuickAction href="/landlords" icon={UserCheck} label="Add Landlord" />
        <QuickAction href="/tenants" icon={Users} label="Add Tenant" />
        <QuickAction href="/maintenance" icon={Wrench} label="Log Issue" />
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, subtext, color, href }: {
  icon: typeof Building2;
  label: string;
  value: string;
  subtext: string;
  color: string;
  href: string;
}) {
  const colorStyles: Record<string, { bg: string; icon: string }> = {
    blue: { bg: 'bg-blue-50', icon: 'text-blue-500' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-500' },
    green: { bg: 'bg-green-50', icon: 'text-green-500' },
    amber: { bg: 'bg-amber-50', icon: 'text-amber-500' },
    gray: { bg: 'bg-gray-50', icon: 'text-gray-400' },
  };
  const style = colorStyles[color] || colorStyles.gray;

  return (
    <Link to={href} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-gray-200 transition-all group">
      <div className={`w-10 h-10 ${style.bg} rounded-xl flex items-center justify-center mb-3 group-hover:scale-105 transition-transform`}>
        <Icon className={`w-5 h-5 ${style.icon}`} />
      </div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-navy-900 mt-1">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{subtext}</p>
    </Link>
  );
}

function QuickAction({ href, icon: Icon, label }: { href: string; icon: typeof Building2; label: string }) {
  return (
    <Link
      to={href}
      className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-gray-100 hover:border-gold-300 hover:bg-gold-50/50 transition-all group"
    >
      <div className="w-10 h-10 bg-gray-50 group-hover:bg-gold-100 rounded-xl flex items-center justify-center transition-all">
        <Icon className="w-5 h-5 text-gray-500 group-hover:text-gold-600" />
      </div>
      <span className="text-sm text-gray-600 group-hover:text-navy-900">{label}</span>
    </Link>
  );
}
