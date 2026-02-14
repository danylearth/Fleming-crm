import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import {
  Wrench, Search, AlertTriangle, Clock, CheckCircle, XCircle,
  Filter, Home, Calendar
} from 'lucide-react';

interface MaintenanceItem {
  id: number;
  title: string;
  description: string;
  property_id: number;
  address: string;
  priority: string;
  status: string;
  reported_by: string;
  assigned_to: string;
  created_at: string;
}

const statusColors: Record<string, string> = {
  open: 'bg-amber-50 text-amber-600',
  in_progress: 'bg-sky-50 text-sky-600',
  completed: 'bg-emerald-50 text-emerald-600',
  cancelled: 'bg-gray-100 text-gray-500',
};

const statusLabels: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const priorityColors: Record<string, string> = {
  low: 'bg-gray-300',
  medium: 'bg-amber-400',
  high: 'bg-orange-500',
  urgent: 'bg-red-500',
};

export default function MaintenanceV2() {
  const api = useApi();
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/maintenance');
      setItems(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [api]);

  useEffect(() => { load(); }, []);

  const filtered = items.filter(i => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && i.priority !== priorityFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return i.title?.toLowerCase().includes(s) || i.address?.toLowerCase().includes(s);
  });

  const count = (status: string) => items.filter(i => i.status === status).length;
  const fmt = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#f6f7f3] font-[Lufga]">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-[#2a2a2a] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen bg-[#f6f7f3] font-[Lufga] overflow-hidden">
      <div className="p-8 pb-0">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center">
            <Wrench size={18} className="text-rose-600" />
          </div>
          <h1 className="text-lg font-semibold text-[#2a2a2a]">Maintenance</h1>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Open', value: count('open'), icon: AlertTriangle, iconColor: 'text-amber-500', bg: 'bg-amber-50' },
            { label: 'In Progress', value: count('in_progress'), icon: Clock, iconColor: 'text-sky-500', bg: 'bg-sky-50' },
            { label: 'Completed', value: count('completed'), icon: CheckCircle, iconColor: 'text-emerald-500', bg: 'bg-emerald-50' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-200/60 p-5 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center`}>
                <s.icon size={18} className={s.iconColor} />
              </div>
              <div>
                <p className="text-2xl font-semibold text-[#2a2a2a]">{s.value}</p>
                <p className="text-xs text-gray-400">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search requests..."
              className="w-full pl-9 pr-4 py-2.5 bg-white rounded-xl border border-gray-200/60 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 bg-white rounded-xl border border-gray-200/60 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
          >
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            className="px-3 py-2.5 bg-white rounded-xl border border-gray-200/60 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
          >
            <option value="all">All Priority</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="bg-white rounded-2xl border border-gray-200/60 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200/60">
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3 w-1"></th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Title</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Property</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Status</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Priority</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors">
                  <td className="px-0 py-4 pl-1">
                    <div className={`w-1 h-8 rounded-full ${priorityColors[item.priority] || 'bg-gray-300'}`} />
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-sm font-medium text-[#2a2a2a]">{item.title}</p>
                    {item.reported_by && <p className="text-xs text-gray-400 mt-0.5">by {item.reported_by}</p>}
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-sm text-gray-600 flex items-center gap-1.5">
                      <Home size={12} className="text-gray-400" /> {item.address || '—'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[item.status] || 'bg-gray-100 text-gray-500'}`}>
                      {statusLabels[item.status] || item.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-xs text-gray-500 capitalize">{item.priority}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Calendar size={11} /> {fmt(item.created_at)}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-sm text-gray-400">No maintenance requests found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
