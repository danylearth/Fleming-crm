import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import {
  CheckCircle, Circle, Clock, AlertTriangle, Calendar, Filter,
  ChevronLeft, ChevronRight, Search, X as XIcon, Plus
} from 'lucide-react';

interface Task {
  id: number;
  title: string;
  description?: string;
  priority: string;
  status: string;
  assigned_to?: number;
  assigned_to_name?: string;
  entity_type?: string;
  entity_id?: number;
  due_date?: string;
  follow_up_date?: string;
  task_type?: string;
  notes?: string;
  created_at: string;
}

interface User { id: number; name: string; email: string; }

const STATUS_STYLES: Record<string, { label: string; border: string; text: string }> = {
  active:    { label: 'In Progress', border: 'border-sky-300',    text: 'text-sky-700' },
  pending:   { label: 'Pending',     border: 'border-amber-300',  text: 'text-amber-700' },
  completed: { label: 'Completed',   border: 'border-emerald-300', text: 'text-emerald-700' },
  archived:  { label: 'Archived',    border: 'border-gray-300',   text: 'text-gray-500' },
};

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-500', medium: 'bg-amber-400', low: 'bg-gray-300',
};

const TASK_TYPE_LABELS: Record<string, string> = {
  manual: 'Manual', eicr_reminder: 'EICR', epc_reminder: 'EPC',
  gas_reminder: 'Gas Safety', tenancy_end: 'Tenancy End',
  rent_review: 'Rent Review', nok_missing: 'NOK Missing', follow_up: 'Follow Up',
};

export default function Tasks() {
  const api = useApi();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('active');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [weekOffset, setWeekOffset] = useState(0);
  const [formData, setFormData] = useState({ title: '', description: '', priority: 'medium', assigned_to: '', due_date: '' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [t, u] = await Promise.all([api.get('/api/tasks'), api.get('/api/users').catch(() => [])]);
      setTasks(t); setUsers(u);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/tasks', { ...formData, assigned_to: formData.assigned_to ? parseInt(formData.assigned_to) : null, task_type: 'manual' });
      setShowForm(false); setFormData({ title: '', description: '', priority: 'medium', assigned_to: '', due_date: '' }); loadData();
    } catch (err: any) { alert(err.message || 'Failed'); }
  };

  const handleComplete = async (taskId: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const newStatus = task.status === 'completed' ? 'active' : 'completed';
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    try { await api.put(`/api/tasks/${taskId}`, { ...task, status: newStatus }); }
    catch { setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: task.status } : t)); }
  };

  const isOverdue = (d?: string) => d ? new Date(d) < new Date() : false;
  const getEntityLink = (t: Task) => {
    if (!t.entity_type || !t.entity_id) return null;
    const m: Record<string, string> = { property: `/properties/${t.entity_id}`, tenant: `/tenants/${t.entity_id}`, landlord: `/landlords/${t.entity_id}`, enquiry: `/tenant-enquiries/${t.entity_id}`, maintenance: `/maintenance` };
    return m[t.entity_type];
  };

  // Filters
  const filtered = tasks.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    if (search) {
      const s = search.toLowerCase();
      return t.title.toLowerCase().includes(s) || t.assigned_to_name?.toLowerCase().includes(s) || t.description?.toLowerCase().includes(s);
    }
    return true;
  });

  // Stats
  const active = tasks.filter(t => t.status === 'active' || t.status === 'pending');
  const completed = tasks.filter(t => t.status === 'completed');
  const overdue = active.filter(t => isOverdue(t.due_date));

  // Week calendar
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });
  const dayNames = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  const isToday = (d: Date) => d.toDateString() === today.toDateString();

  const tasksForDay = (d: Date) => active.filter(t => t.due_date && new Date(t.due_date).toDateString() === d.toDateString());

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-400">Manage your to-dos and reminders</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800">
          <Plus className="w-4 h-4" /> Add Task
        </button>
      </div>

      {/* Stat strip */}
      <div className="flex items-center gap-6 border border-gray-200 rounded-lg px-6 py-4">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          <span className="text-2xl font-bold text-gray-900">{active.length}</span>
          <span className="text-sm text-gray-400">Active</span>
        </div>
        <div className="w-px h-8 bg-gray-200" />
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-gray-400" />
          <span className="text-2xl font-bold text-gray-900">{completed.length}</span>
          <span className="text-sm text-gray-400">Completed</span>
        </div>
        <div className="w-px h-8 bg-gray-200" />
        <div className="flex items-center gap-2">
          <AlertTriangle className={`w-4 h-4 ${overdue.length > 0 ? 'text-red-500' : 'text-gray-400'}`} />
          <span className={`text-2xl font-bold ${overdue.length > 0 ? 'text-red-600' : 'text-gray-900'}`}>{overdue.length}</span>
          <span className="text-sm text-gray-400">Overdue</span>
        </div>
      </div>

      {/* Task table + Schedule row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Task list — 2 cols */}
        <div className="col-span-2">
          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200" />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200">
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
            </select>
            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200">
              <option value="all">All Priority</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Table */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50">
                  <th className="w-10 px-3 py-3" />
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Task Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Assign</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Due</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-sm text-gray-400">No tasks found</td></tr>
                ) : filtered.map(task => {
                  const st = STATUS_STYLES[task.status] || STATUS_STYLES.active;
                  const assigneeInitials = task.assigned_to_name ? task.assigned_to_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '';
                  const link = getEntityLink(task);
                  return (
                    <tr key={task.id} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${isOverdue(task.due_date) && task.status !== 'completed' ? 'bg-red-50/30' : ''}`}>
                      <td className="w-10 px-3 py-3">
                        <button onClick={() => handleComplete(task.id)} className="flex items-center justify-center" title={task.status === 'completed' ? 'Reopen' : 'Complete'}>
                          {task.status === 'completed' ? (
                            <CheckCircle className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <Circle className="w-5 h-5 text-gray-300 hover:text-emerald-400 transition-colors" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[task.priority] || 'bg-gray-300'}`} />
                          <div>
                            <p className={`text-sm font-medium ${task.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{task.title}</p>
                            {task.task_type && task.task_type !== 'manual' && (
                              <span className="text-[10px] text-gray-400">{TASK_TYPE_LABELS[task.task_type] || task.task_type}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {task.assigned_to_name ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
                              <span className="text-[10px] font-semibold text-gray-600">{assigneeInitials}</span>
                            </div>
                            <span className="text-sm text-gray-700">{task.assigned_to_name}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {task.due_date ? (
                          <span className={`text-sm ${isOverdue(task.due_date) && task.status !== 'completed' ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                            {new Date(task.due_date).toLocaleDateString('en-GB')}
                          </span>
                        ) : <span className="text-sm text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border bg-white ${st.border} ${st.text}`}>
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Schedule — 1 col */}
        <div className="space-y-4">
          {/* Week strip */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Schedule</h2>
              <div className="flex items-center gap-1">
                <button onClick={() => setWeekOffset(w => w - 1)} className="p-1 text-gray-400 hover:text-gray-700"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={() => setWeekOffset(0)} className="text-xs text-gray-500 hover:text-gray-900 px-1">Today</button>
                <button onClick={() => setWeekOffset(w => w + 1)} className="p-1 text-gray-400 hover:text-gray-700"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-4">
              {weekDays.map((d, i) => (
                <div key={i} className={`text-center py-2 rounded-lg cursor-pointer transition-colors ${
                  isToday(d) ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'
                }`}>
                  <p className={`text-[10px] ${isToday(d) ? 'text-gray-300' : 'text-gray-400'}`}>{dayNames[i]}</p>
                  <p className={`text-sm font-semibold ${isToday(d) ? 'text-white' : 'text-gray-900'}`}>{d.getDate()}</p>
                </div>
              ))}
            </div>

            {/* Tasks for this week */}
            <div className="space-y-2">
              {weekDays.map((d, i) => {
                const dayTasks = tasksForDay(d);
                if (dayTasks.length === 0) return null;
                return dayTasks.map(t => (
                  <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50">
                    <div className={`w-1 h-8 rounded-full ${PRIORITY_DOT[t.priority] || 'bg-gray-300'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{t.title}</p>
                      <p className="text-xs text-gray-400">{d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                    </div>
                    {t.assigned_to_name && (
                      <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-semibold text-gray-600">
                          {t.assigned_to_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </span>
                      </div>
                    )}
                  </div>
                ));
              })}
              {weekDays.every(d => tasksForDay(d).length === 0) && (
                <p className="text-xs text-gray-400 text-center py-4">No tasks this week</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Task Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Add Task</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><XIcon className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Title *</label>
                <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" required />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Priority</label>
                  <select value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200">
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Due Date</label>
                  <input type="date" value={formData.due_date} onChange={e => setFormData({...formData, due_date: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
                </div>
              </div>
              {users.length > 0 && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Assign To</label>
                  <select value={formData.assigned_to} onChange={e => setFormData({...formData, assigned_to: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200">
                    <option value="">Unassigned</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">Add Task</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
