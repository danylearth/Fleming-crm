import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { Plus, X, CheckCircle2, Circle, AlertTriangle, Clock, CheckCheck, ChevronLeft, ChevronRight } from 'lucide-react';

interface Task {
  id: number;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'active' | 'completed' | 'archived';
  assigned_to: number;
  assigned_to_name: string;
  due_date: string;
  task_type: string;
  entity_type: string;
  entity_id: number;
  created_at: string;
}

interface User {
  id: number;
  name: string;
  email: string;
}

const priorityColor: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-400',
  low: 'bg-emerald-400',
};

const priorityLabel: Record<string, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function getWeekDays(baseDate: Date): Date[] {
  const start = new Date(baseDate);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function fmt(d: Date) {
  return d.toISOString().split('T')[0];
}

function initials(name: string) {
  return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

export default function TasksV2() {
  const api = useApi();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekBase, setWeekBase] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', assigned_to: '', due_date: '', task_type: 'general' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    Promise.all([api.get('/api/tasks'), api.get('/api/users')])
      .then(([t, u]) => { setTasks(t); setUsers(u); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const weekDays = getWeekDays(weekBase);
  const today = fmt(new Date());

  const activeTasks = tasks.filter(t => t.status === 'active');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const overdueTasks = activeTasks.filter(t => t.due_date && t.due_date < today);

  const tasksByDate: Record<string, Task[]> = {};
  tasks.forEach(t => {
    const key = t.due_date?.split('T')[0] || 'unscheduled';
    if (!tasksByDate[key]) tasksByDate[key] = [];
    tasksByDate[key].push(t);
  });

  const toggleComplete = async (task: Task) => {
    const newStatus = task.status === 'completed' ? 'active' : 'completed';
    try {
      await api.put(`/api/tasks/${task.id}`, { status: newStatus });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    } catch (e) { console.error(e); }
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const created = await api.post('/api/tasks', {
        ...form,
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
        status: 'active',
      });
      setTasks(prev => [...prev, created]);
      setShowModal(false);
      setForm({ title: '', description: '', priority: 'medium', assigned_to: '', due_date: '', task_type: 'general' });
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const shiftWeek = (dir: number) => {
    const d = new Date(weekBase);
    d.setDate(d.getDate() + dir * 7);
    setWeekBase(d);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <div className="p-8 font-[Lufga]">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Tasks</h1>
          <p className="text-sm text-gray-400 mt-1">Calendar overview</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-[#2a2a2a] text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-[#3a3a3a] transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Task
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Active', value: activeTasks.length, icon: Clock, color: 'text-blue-600' },
          { label: 'Completed', value: completedTasks.length, icon: CheckCheck, color: 'text-emerald-600' },
          { label: 'Overdue', value: overdueTasks.length, icon: AlertTriangle, color: 'text-red-500' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-200/60 p-6">
            <div className="flex items-center gap-3">
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <span className="text-sm text-gray-500">{s.label}</span>
            </div>
            <p className="text-3xl font-bold tracking-tight mt-2">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Week nav */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => shiftWeek(-1)} className="p-2 rounded-xl border border-gray-200/60 hover:bg-gray-50">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h2 className="text-lg font-semibold">
          {monthNames[weekDays[0].getMonth()]} {weekDays[0].getFullYear()}
        </h2>
        <button onClick={() => shiftWeek(1)} className="p-2 rounded-xl border border-gray-200/60 hover:bg-gray-50">
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => setWeekBase(new Date())}
          className="text-sm text-gray-500 hover:text-gray-900 ml-2"
        >
          Today
        </button>
      </div>

      {/* Calendar week */}
      <div className="bg-white rounded-2xl border border-gray-200/60 divide-y divide-gray-100">
        {weekDays.map(day => {
          const key = fmt(day);
          const isToday = key === today;
          const dayTasks = tasksByDate[key] || [];

          return (
            <div key={key} className={`flex ${isToday ? 'bg-gray-50/50' : ''}`}>
              {/* Date column */}
              <div className={`w-28 shrink-0 p-5 text-center border-r border-gray-100 ${isToday ? 'bg-[#2a2a2a] text-white rounded-l-2xl first:rounded-tl-2xl last:rounded-bl-2xl' : ''}`}>
                <p className={`text-xs font-medium uppercase tracking-wider ${isToday ? 'text-gray-300' : 'text-gray-400'}`}>
                  {dayNames[day.getDay()]}
                </p>
                <p className={`text-4xl font-bold tracking-tight mt-1 ${isToday ? 'text-white' : 'text-gray-900'}`}>
                  {day.getDate()}
                </p>
              </div>

              {/* Tasks */}
              <div className="flex-1 p-4 min-h-[80px]">
                {dayTasks.length === 0 ? (
                  <p className="text-sm text-gray-300 py-2">No tasks</p>
                ) : (
                  <div className="space-y-2">
                    {dayTasks.map(task => (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 group"
                      >
                        {/* Priority bar */}
                        <div className={`w-1 h-8 rounded-full ${priorityColor[task.priority]}`} />

                        {/* Checkbox */}
                        <button onClick={() => toggleComplete(task)} className="shrink-0">
                          {task.status === 'completed' ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <Circle className="w-5 h-5 text-gray-300 group-hover:text-gray-400" />
                          )}
                        </button>

                        {/* Title */}
                        <span className={`text-sm flex-1 ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                          {task.title}
                        </span>

                        {/* Priority pill */}
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${
                          task.priority === 'high' ? 'border-red-200 text-red-600 bg-red-50' :
                          task.priority === 'medium' ? 'border-amber-200 text-amber-600 bg-amber-50' :
                          'border-emerald-200 text-emerald-600 bg-emerald-50'
                        }`}>
                          {priorityLabel[task.priority]}
                        </span>

                        {/* Assignee avatar */}
                        {task.assigned_to_name && (
                          <div className="w-7 h-7 rounded-full bg-[#2a2a2a] text-white flex items-center justify-center text-xs font-medium">
                            {initials(task.assigned_to_name)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Task Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl border border-gray-200/60 w-full max-w-lg p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold tracking-tight">New Task</h2>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Title</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gray-400"
                  placeholder="Task title..."
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gray-400 h-20 resize-none"
                  placeholder="Optional description..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Priority</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gray-400"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Due Date</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gray-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Assign To</label>
                <select
                  value={form.assigned_to}
                  onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gray-400"
                >
                  <option value="">Unassigned</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleCreate}
                disabled={!form.title || saving}
                className="w-full bg-[#2a2a2a] text-white py-2.5 rounded-xl text-sm font-medium hover:bg-[#3a3a3a] transition-colors disabled:opacity-40"
              >
                {saving ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
