import { useState, useEffect } from 'react';
import V3Layout from '../components/V3Layout';
import { Card, GlassCard, Button, SearchBar, Input, Select, Avatar, ProgressRing, EmptyState } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { Plus, X, CheckCircle2, Clock, Inbox, Calendar } from 'lucide-react';

interface Task {
  id: number;
  title: string;
  description: string;
  assigned_to: string;
  priority: string;
  status: string;
  due_date: string;
  created_at: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-blue-500/20 text-blue-400',
  medium: 'bg-amber-500/20 text-amber-400',
  high: 'bg-red-500/20 text-red-400',
};

const STATUS_LABELS: Record<string, string> = { pending: 'Pending', in_progress: 'In Progress', completed: 'Completed' };
const PRIORITY_LABELS: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' };

function isOverdue(task: Task) {
  return task.status !== 'completed' && task.due_date && new Date(task.due_date) < new Date();
}

export default function TasksV3() {
  const api = useApi();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', assigned_to: '', priority: 'medium', status: 'pending', due_date: '' });

  const load = async () => {
    try {
      const data = await api.get('/api/tasks');
      setTasks(Array.isArray(data) ? data : data.tasks || []);
    } catch { setTasks([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const counts = {
    completed: tasks.filter(t => t.status === 'completed').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    pending: tasks.filter(t => t.status === 'pending').length,
  };

  const filtered = tasks.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    return true;
  });

  const updateStatus = async (id: number, status: string) => {
    try { await api.put(`/api/tasks/${id}`, { status }); await load(); } catch {}
  };

  const addTask = async () => {
    try {
      await api.post('/api/tasks', form);
      setShowAdd(false);
      setForm({ title: '', description: '', assigned_to: '', priority: 'medium', status: 'pending', due_date: '' });
      await load();
    } catch {}
  };

  const completionPct = tasks.length > 0 ? Math.round((counts.completed / tasks.length) * 100) : 0;

  return (
    <V3Layout title="Tasks" breadcrumb={[{ label: 'Tasks' }]}>
      <div className="p-4 md:p-8">
        {/* Stats Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
          {[
            { label: 'Done', count: counts.completed, icon: <CheckCircle2 size={20} />, color: 'text-emerald-400' },
            { label: 'In Progress', count: counts.in_progress, icon: <Clock size={20} />, color: 'text-amber-400' },
            { label: 'In Queue', count: counts.pending, icon: <Inbox size={20} />, color: 'text-blue-400' },
          ].map(s => (
            <GlassCard key={s.label} className="p-5 flex items-center gap-4">
              <div className={`${s.color}`}>{s.icon}</div>
              <div>
                <p className="text-2xl font-bold">{s.count}</p>
                <p className="text-xs text-[var(--text-secondary)]">{s.label}</p>
              </div>
            </GlassCard>
          ))}
          <GlassCard className="p-5 flex items-center justify-center">
            <ProgressRing value={completionPct} size={56} strokeWidth={4} label="Complete" />
          </GlassCard>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 mb-6">
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <Select value={filterStatus} onChange={setFilterStatus} options={[
              { value: 'all', label: 'All Status' }, ...Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))
            ]} className="w-full sm:w-40" />
            <Select value={filterPriority} onChange={setFilterPriority} options={[
              { value: 'all', label: 'All Priority' }, ...Object.entries(PRIORITY_LABELS).map(([v, l]) => ({ value: v, label: l }))
            ]} className="w-full sm:w-40" />
          </div>
          <div className="sm:ml-auto">
            <Button variant="gradient" size="sm" onClick={() => setShowAdd(true)}>
              <Plus size={14} className="mr-1.5" /> Add Task
            </Button>
          </div>
        </div>

        {/* Task List */}
        {loading ? (
          <div className="text-center text-[var(--text-muted)] py-16">Loading...</div>
        ) : filtered.length === 0 ? (
          <EmptyState message="No tasks found" icon={<CheckCircle2 size={32} />} />
        ) : (
          <div className="space-y-3">
            {filtered.map(task => {
              const overdue = isOverdue(task);
              const taskPct = task.status === 'completed' ? 100 : task.status === 'in_progress' ? 50 : 0;
              return (
                <Card key={task.id} className={`p-4 md:p-5 ${overdue ? 'border-red-500/40' : ''}`} hover>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <ProgressRing value={taskPct} size={40} strokeWidth={3} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-[var(--text-muted)]' : ''}`}>{task.title}</p>
                          {overdue && <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-medium">Overdue</span>}
                        </div>
                        {task.description && <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{task.description}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap pl-[52px] sm:pl-0">
                      {task.assigned_to && <Avatar name={task.assigned_to} size="xs" />}
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${PRIORITY_COLORS[task.priority]}`}>
                        {PRIORITY_LABELS[task.priority] || task.priority}
                      </span>
                      {task.due_date && (
                        <div className={`flex items-center gap-1 text-xs ${overdue ? 'text-red-400' : 'text-[var(--text-muted)]'}`}>
                          <Calendar size={12} />
                          {new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </div>
                      )}
                      <div className="flex gap-1">
                        {task.status !== 'in_progress' && task.status !== 'completed' && (
                          <Button variant="ghost" size="sm" onClick={() => updateStatus(task.id, 'in_progress')}>Start</Button>
                        )}
                        {task.status !== 'completed' && (
                          <Button variant="ghost" size="sm" onClick={() => updateStatus(task.id, 'completed')}>Done</Button>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Add Modal */}
        {showAdd && (
          <div className="fixed inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm flex items-end md:items-center justify-center z-50" onClick={() => setShowAdd(false)}>
            <div className="bg-[var(--bg-card)] rounded-t-2xl md:rounded-2xl border border-[var(--border-input)] w-full md:w-[480px] max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold">Add Task</h3>
                <button onClick={() => setShowAdd(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <Input label="Title" value={form.title} onChange={v => setForm(p => ({ ...p, title: v }))} placeholder="Task title" />
                <Input label="Description" value={form.description} onChange={v => setForm(p => ({ ...p, description: v }))} placeholder="Description..." />
                <Input label="Assigned To" value={form.assigned_to} onChange={v => setForm(p => ({ ...p, assigned_to: v }))} placeholder="Person name" />
                <Select label="Priority" value={form.priority} onChange={v => setForm(p => ({ ...p, priority: v }))} options={Object.entries(PRIORITY_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
                <Input label="Due Date" value={form.due_date} onChange={v => setForm(p => ({ ...p, due_date: v }))} type="date" />
                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
                  <Button variant="gradient" onClick={addTask} disabled={!form.title}>Add Task</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </V3Layout>
  );
}
