import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { Card, GlassCard, Button, Input, Avatar, EmptyState } from '../components/v3';
import { useApi } from '../hooks/useApi';
import {
  ArrowLeft, Pencil, Save, X, Calendar, Clock, User, Building2,
  CheckCircle2, AlertTriangle, Inbox, Plus, Trash2
} from 'lucide-react';

interface Task {
  id: number;
  title: string;
  description: string;
  assigned_to: string;
  priority: string;
  status: string;
  due_date: string;
  created_at: string;
  entity_type?: string;
  entity_id?: number;
  task_type?: string;
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  low: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  medium: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  high: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
};

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  pending: { label: 'Pending', icon: Inbox, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  in_progress: { label: 'In Progress', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
};

const TASK_TYPES = ['manual', 'viewing', 'follow_up', 'document', 'maintenance', 'onboarding', 'compliance', 'other'];

export default function TaskDetailV3() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Task>>({});

  const load = async () => {
    try {
      const data = await api.get(`/api/tasks/${id}`);
      setTask(data);
      setForm(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const save = async () => {
    if (!task) return;
    setSaving(true);
    try {
      await api.put(`/api/tasks/${task.id}`, form);
      await load();
      setEditing(false);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const updateStatus = async (status: string) => {
    if (!task) return;
    try {
      await api.put(`/api/tasks/${task.id}`, { status });
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const deleteTask = async () => {
    if (!task || !confirm('Delete this task?')) return;
    try {
      await api.delete(`/api/tasks/${task.id}`);
      navigate('/v3/tasks');
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <V3Layout title="Task">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-[var(--border-input)] border-t-orange-500 rounded-full animate-spin" />
        </div>
      </V3Layout>
    );
  }

  if (!task) {
    return (
      <V3Layout title="Task">
        <div className="p-8">
          <EmptyState message="Task not found" />
          <div className="text-center mt-4">
            <Button variant="ghost" onClick={() => navigate('/v3/tasks')}>
              <ArrowLeft size={14} className="mr-2" /> Back to Tasks
            </Button>
          </div>
        </div>
      </V3Layout>
    );
  }

  const priority = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;
  const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;
  const isOverdue = task.status !== 'completed' && task.due_date && new Date(task.due_date) < new Date();

  return (
    <V3Layout title="Task">
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        {/* Back button */}
        <button onClick={() => navigate('/v3/tasks')} className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          <ArrowLeft size={16} /> Back to Tasks
        </button>

        {/* Hero card */}
        <GlassCard className={`p-6 border-l-4 ${priority.border}`}>
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {editing ? (
                <input
                  value={form.title || ''}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full text-xl font-bold bg-transparent border-b border-[var(--border-input)] outline-none pb-1 mb-2"
                  placeholder="Task title"
                />
              ) : (
                <h1 className={`text-xl md:text-2xl font-bold ${task.status === 'completed' ? 'line-through text-[var(--text-muted)]' : ''}`}>
                  {task.title}
                </h1>
              )}

              <div className="flex flex-wrap items-center gap-3 mt-3">
                {/* Priority */}
                <span className={`text-xs font-medium px-3 py-1 rounded-full ${priority.bg} ${priority.text}`}>
                  {task.priority}
                </span>

                {/* Status */}
                <span className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full ${statusCfg.bg} ${statusCfg.color}`}>
                  <StatusIcon size={12} />
                  {statusCfg.label}
                </span>

                {/* Task type */}
                {task.task_type && task.task_type !== 'manual' && (
                  <span className="text-xs px-3 py-1 rounded-full bg-[var(--bg-hover)] text-[var(--text-muted)]">
                    {task.task_type.replace('_', ' ')}
                  </span>
                )}

                {/* Overdue */}
                {isOverdue && (
                  <span className="flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full bg-red-500/10 text-red-400">
                    <AlertTriangle size={12} /> Overdue
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {editing ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setForm(task); }}>
                    <X size={14} className="mr-1" /> Cancel
                  </Button>
                  <Button variant="gradient" size="sm" onClick={save} disabled={saving}>
                    <Save size={14} className="mr-1" /> {saving ? 'Saving...' : 'Save'}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                    <Pencil size={14} className="mr-1" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deleteTask} className="text-red-400 hover:text-red-300">
                    <Trash2 size={14} />
                  </Button>
                </>
              )}
            </div>
          </div>
        </GlassCard>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column - Main details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description */}
            <Card className="p-5">
              <h3 className="text-sm font-semibold mb-3">Description</h3>
              {editing ? (
                <textarea
                  value={form.description || ''}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full min-h-[120px] bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl p-3 text-sm resize-none outline-none"
                  placeholder="Task description..."
                />
              ) : (
                <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">
                  {task.description || 'No description'}
                </p>
              )}
            </Card>

            {/* Status actions */}
            {task.status !== 'completed' && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold mb-3">Actions</h3>
                <div className="flex flex-wrap gap-2">
                  {task.status === 'pending' && (
                    <Button variant="outline" size="sm" onClick={() => updateStatus('in_progress')}>
                      <Clock size={14} className="mr-1.5" /> Start Task
                    </Button>
                  )}
                  <Button variant="gradient" size="sm" onClick={() => updateStatus('completed')}>
                    <CheckCircle2 size={14} className="mr-1.5" /> Mark Complete
                  </Button>
                </div>
              </Card>
            )}

            {/* Completed banner */}
            {task.status === 'completed' && (
              <Card className="p-5 bg-emerald-500/5 border-emerald-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 size={20} className="text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-emerald-400">Task Completed</h3>
                    <p className="text-xs text-[var(--text-muted)]">This task has been marked as done</p>
                  </div>
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={() => updateStatus('pending')}>
                    Reopen
                  </Button>
                </div>
              </Card>
            )}
          </div>

          {/* Right column - Meta */}
          <div className="space-y-5">
            {/* Details */}
            <Card className="p-5 space-y-4">
              <h3 className="text-sm font-semibold">Details</h3>

              {/* Due date */}
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isOverdue ? 'bg-red-500/10 text-red-400' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'}`}>
                  <Calendar size={16} />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Due Date</p>
                  {editing ? (
                    <input
                      type="date"
                      value={form.due_date?.slice(0, 10) || ''}
                      onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                      className="w-full bg-transparent border-b border-[var(--border-input)] text-sm outline-none"
                    />
                  ) : (
                    <p className={`text-sm font-medium ${isOverdue ? 'text-red-400' : ''}`}>
                      {task.due_date ? new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'}
                    </p>
                  )}
                </div>
              </div>

              {/* Assigned to */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[var(--bg-hover)] flex items-center justify-center text-[var(--text-muted)]">
                  <User size={16} />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Assigned To</p>
                  {editing ? (
                    <input
                      value={form.assigned_to || ''}
                      onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                      className="w-full bg-transparent border-b border-[var(--border-input)] text-sm outline-none"
                      placeholder="Person name"
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      {task.assigned_to && <Avatar name={task.assigned_to} size="xs" />}
                      <p className="text-sm font-medium">{task.assigned_to || 'Unassigned'}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Created */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[var(--bg-hover)] flex items-center justify-center text-[var(--text-muted)]">
                  <Clock size={16} />
                </div>
                <div>
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Created</p>
                  <p className="text-sm font-medium">
                    {task.created_at ? new Date(task.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown'}
                  </p>
                </div>
              </div>

              {/* Priority selector (edit mode) */}
              {editing && (
                <div>
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">Priority</p>
                  <div className="flex gap-2">
                    {['low', 'medium', 'high'].map(p => {
                      const pc = PRIORITY_COLORS[p];
                      return (
                        <button
                          key={p}
                          onClick={() => setForm(f => ({ ...f, priority: p }))}
                          className={`flex-1 text-xs py-2 rounded-lg border font-medium transition-colors capitalize ${
                            form.priority === p ? `${pc.bg} ${pc.text} ${pc.border}` : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Task type (edit mode) */}
              {editing && (
                <div>
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">Type</p>
                  <select
                    value={form.task_type || 'manual'}
                    onChange={e => setForm(f => ({ ...f, task_type: e.target.value }))}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-3 py-2 text-sm"
                  >
                    {TASK_TYPES.map(t => (
                      <option key={t} value={t}>{t.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}</option>
                    ))}
                  </select>
                </div>
              )}
            </Card>

            {/* Entity link */}
            {task.entity_type && task.entity_id && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold mb-3">Linked To</h3>
                <button
                  onClick={() => navigate(`/v3/${task.entity_type === 'property' ? 'properties' : task.entity_type + 's'}/${task.entity_id}`)}
                  className="flex items-center gap-3 w-full p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-[var(--bg-hover)] flex items-center justify-center text-[var(--text-muted)]">
                    <Building2 size={16} />
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{task.entity_type}</p>
                    <p className="text-sm font-medium">View {task.entity_type}</p>
                  </div>
                </button>
              </Card>
            )}
          </div>
        </div>
      </div>
    </V3Layout>
  );
}
