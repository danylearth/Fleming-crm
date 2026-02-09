import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { Building2, Users, Wrench, AlertTriangle, UserCheck } from 'lucide-react';

interface DashboardStats {
  properties: number;
  propertiesLet: number;
  landlords: number;
  tenants: number;
  activeTenancies: number;
  openMaintenance: number;
  monthlyIncome: number;
  outstandingRent: number;
  recentMaintenance: Array<{
    id: number;
    title: string;
    priority: string;
    status: string;
    address: string;
    created_at: string;
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

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Building2}
          label="Properties"
          value={stats.properties.toString()}
          subtext={`${stats.propertiesLet} currently let`}
          color="blue"
          href="/properties"
        />
        <StatCard
          icon={UserCheck}
          label="Landlords"
          value={stats.landlords.toString()}
          subtext="Active clients"
          color="purple"
          href="/landlords"
        />
        <StatCard
          icon={Users}
          label="Tenants"
          value={stats.tenants.toString()}
          subtext={`${stats.activeTenancies} active tenancies`}
          color="green"
          href="/tenants"
        />
        <StatCard
          icon={Wrench}
          label="Maintenance"
          value={stats.openMaintenance.toString()}
          subtext="Open requests"
          color={stats.openMaintenance > 0 ? 'amber' : 'gray'}
          href="/maintenance"
        />
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-navy-900 to-navy-800 rounded-2xl p-6 text-white lg:col-span-2">
          <h3 className="text-navy-200 text-sm font-medium mb-4">Financial Summary</h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-navy-300 text-sm">Monthly Income</p>
              <p className="text-3xl font-bold text-gold-500">£{stats.monthlyIncome.toLocaleString()}</p>
              <p className="text-navy-400 text-xs mt-1">Collected this month</p>
            </div>
            <div>
              <p className="text-navy-300 text-sm">Outstanding Rent</p>
              <p className={`text-3xl font-bold ${stats.outstandingRent > 0 ? 'text-red-400' : 'text-green-400'}`}>
                £{stats.outstandingRent.toLocaleString()}
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
