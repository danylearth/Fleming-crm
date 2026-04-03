import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { Card, GlassCard, Button, Select, Avatar, EmptyState, DatePicker } from '../components/v3';
import { useApi } from '../hooks/useApi';
import {
  ArrowLeft, Pencil, Save, X, Calendar, Clock, User, Building2,
  CheckCircle2, AlertTriangle, Inbox, Trash2, FileText, Download,
  Upload, Link as LinkIcon, UserCircle, Users
} from 'lucide-react';

interface Task {
  id: number;
  title: string;
  description: string;
  assigned_to: string;
  priority: string;
  status: string;
  due_date: string;
  follow_up_date?: string;
  notes?: string;
  created_at: string;
  entity_type?: string;
  entity_id?: number;
  task_type?: string;
  relatedEntity?: { address?: string; name?: string; first_name_1?: string; last_name_1?: string };
  documents?: Document[];
}

interface Document {
  id: number;
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  uploaded_at: string;
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  low: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  medium: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  high: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ size: number; className?: string }>; color: string; bg: string }> = {
  pending: { label: 'Pending', icon: Inbox, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  in_progress: { label: 'In Progress', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
};

const TASK_TYPES = ['manual', 'viewing', 'follow_up', 'document', 'maintenance', 'onboarding', 'compliance', 'other'];

export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Task>>({});
  const [uploading, setUploading] = useState(false);

  // Entity options for linking
  const [properties, setProperties] = useState<{ id: number; address: string }[]>([]);
  const [landlords, setLandlords] = useState<{ id: number; name: string }[]>([]);
  const [tenants, setTenants] = useState<{ id: number; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: number; name: string; role: string }[]>([]);

  const load = useCallback(async () => {
    try {
      const [taskData, props, lands, tens, usrs] = await Promise.all([
        api.get(`/api/tasks/${id}`),
        api.get('/api/properties'),
        api.get('/api/landlords'),
        api.get('/api/tenants'),
        api.get('/api/users'),
      ]);
      setTask(taskData);
      setForm(taskData);
      setProperties(props);
      setLandlords(lands);
      setTenants(tens);
      setUsers(usrs);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [api, id]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!task) return;
    setSaving(true);
    try {
      await api.put(`/api/tasks/${task.id}`, form);
      await load();
      setEditing(false);
    } catch (e) {
      console.error(e);
      alert('Failed to save task');
    }
    setSaving(false);
  };

  const updateStatus = async (status: string) => {
    if (!task) return;
    try {
      await api.put(`/api/tasks/${task.id}`, { ...task, status });
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const deleteTask = async () => {
    if (!task || !confirm('Delete this task? This will also delete all attached files.')) return;
    try {
      await api.delete(`/api/tasks/${task.id}`);
      navigate('/tasks');
    } catch (e) {
      console.error(e);
      alert('Failed to delete task');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !task) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('doc_type', 'task_attachment');

      const response = await fetch(`/api/documents/task/${task.id}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');
      await load();
    } catch (err) {
      console.error(err);
      alert('Failed to upload file');
    }
    setUploading(false);
    e.target.value = ''; // Reset input
  };

  const downloadDocument = (docId: number) => {
    window.open(`/api/documents/download/${docId}`, '_blank');
  };

  const deleteDocument = async (docId: number) => {
    if (!confirm('Delete this file?')) return;
    try {
      await api.delete(`/api/documents/${docId}`);
      await load();
    } catch (err) {
      console.error(err);
      alert('Failed to delete file');
    }
  };

  if (loading) {
    return (
      <Layout title="Task">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-[var(--border-input)] border-t-orange-500 rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!task) {
    return (
      <Layout title="Task">
        <div className="p-8">
          <EmptyState message="Task not found" />
          <div className="text-center mt-4">
            <Button variant="ghost" onClick={() => navigate('/tasks')}>
              <ArrowLeft size={14} className="mr-2" /> Back to Tasks
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  const priority = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;
  const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;
  const isOverdue = task.status !== 'completed' && task.due_date && new Date(task.due_date) < new Date();

  return (
    <Layout title="Task">
      <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
        {/* Back button */}
        <button onClick={() => navigate('/tasks')} className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
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

            {/* Notes */}
            <Card className="p-5">
              <h3 className="text-sm font-semibold mb-3">Notes</h3>
              {editing ? (
                <textarea
                  value={form.notes || ''}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full min-h-[100px] bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl p-3 text-sm resize-none outline-none"
                  placeholder="Additional notes..."
                />
              ) : (
                <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">
                  {task.notes || 'No notes'}
                </p>
              )}
            </Card>

            {/* Status actions */}
            {task.status !== 'completed' && !editing && (
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

            {/* Documents */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Attachments</h3>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                  <Button variant="outline" size="sm" disabled={uploading}>
                    <Upload size={14} className="mr-1.5" /> {uploading ? 'Uploading...' : 'Upload'}
                  </Button>
                </label>
              </div>

              {task.documents && task.documents.length > 0 ? (
                <div className="space-y-2">
                  {task.documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors">
                      <div className="w-9 h-9 rounded-lg bg-[var(--bg-hover)] flex items-center justify-center">
                        <FileText size={16} className="text-[var(--text-muted)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.original_name}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {(doc.size / 1024).toFixed(1)} KB • {new Date(doc.uploaded_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => downloadDocument(doc.id)}
                          className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          onClick={() => deleteDocument(doc.id)}
                          className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-red-400 hover:text-red-300 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)] text-center py-4">No attachments</p>
              )}
            </Card>
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
                    <DatePicker
                      value={form.due_date?.slice(0, 10) || ''}
                      onChange={v => setForm(f => ({ ...f, due_date: v }))}
                    />
                  ) : (
                    <p className={`text-sm font-medium ${isOverdue ? 'text-red-400' : ''}`}>
                      {task.due_date ? new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'}
                    </p>
                  )}
                </div>
              </div>

              {/* Follow-up date */}
              {(editing || task.follow_up_date) && (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--bg-hover)] flex items-center justify-center text-[var(--text-muted)]">
                    <Calendar size={16} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Follow-up Date</p>
                    {editing ? (
                      <DatePicker
                        value={form.follow_up_date?.slice(0, 10) || ''}
                        onChange={v => setForm(f => ({ ...f, follow_up_date: v }))}
                      />
                    ) : (
                      <p className="text-sm font-medium">
                        {task.follow_up_date ? new Date(task.follow_up_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Assigned to */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[var(--bg-hover)] flex items-center justify-center text-[var(--text-muted)]">
                  <User size={16} />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Assigned To</p>
                  {editing ? (
                    <Select
                      value={form.assigned_to || ''}
                      onChange={v => setForm(f => ({ ...f, assigned_to: v }))}
                      options={[
                        { value: '', label: 'Unassigned' },
                        ...users.map(u => ({ value: u.name, label: `${u.name} (${u.role})` }))
                      ]}
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
                  <Select
                    value={form.task_type || 'manual'}
                    onChange={v => setForm(f => ({ ...f, task_type: v }))}
                    options={TASK_TYPES.map(t => ({ value: t, label: t.replace('_', ' ').replace(/^\w/, c => c.toUpperCase()) }))}
                  />
                </div>
              )}
            </Card>

            {/* Entity linking - Always editable */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <LinkIcon size={14} /> Linked Entity
                </h3>
                {!editing && (
                  <button
                    onClick={() => setEditing(true)}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <Pencil size={12} />
                  </button>
                )}
              </div>

              {editing ? (
                <div className="space-y-3">
                  <Select
                    label="Link Type"
                    value={form.entity_type || ''}
                    onChange={v => setForm(f => ({ ...f, entity_type: v, entity_id: undefined }))}
                    options={[
                      { value: '', label: 'None' },
                      { value: 'property', label: 'Property' },
                      { value: 'landlord', label: 'Landlord' },
                      { value: 'tenant', label: 'Tenant' },
                    ]}
                  />

                  {form.entity_type === 'property' && (
                    <Select
                      label="Property"
                      value={String(form.entity_id || '')}
                      onChange={v => setForm(f => ({ ...f, entity_id: v ? Number(v) : undefined }))}
                      options={[
                        { value: '', label: 'Select property...' },
                        ...properties.map(p => ({ value: String(p.id), label: p.address }))
                      ]}
                    />
                  )}

                  {form.entity_type === 'landlord' && (
                    <Select
                      label="Landlord"
                      value={String(form.entity_id || '')}
                      onChange={v => setForm(f => ({ ...f, entity_id: v ? Number(v) : undefined }))}
                      options={[
                        { value: '', label: 'Select landlord...' },
                        ...landlords.map(l => ({ value: String(l.id), label: l.name }))
                      ]}
                    />
                  )}

                  {form.entity_type === 'tenant' && (
                    <Select
                      label="Tenant"
                      value={String(form.entity_id || '')}
                      onChange={v => setForm(f => ({ ...f, entity_id: v ? Number(v) : undefined }))}
                      options={[
                        { value: '', label: 'Select tenant...' },
                        ...tenants.map(t => ({ value: String(t.id), label: t.name }))
                      ]}
                    />
                  )}
                </div>
              ) : task.entity_type && task.entity_id ? (
                <button
                  onClick={() => {
                    const base = task.entity_type === 'property' ? 'properties' :
                                 task.entity_type === 'landlord' ? 'landlords' :
                                 task.entity_type === 'tenant' ? 'tenants' : '';
                    if (base) navigate(`/${base}/${task.entity_id}`);
                  }}
                  className="flex items-center gap-3 w-full p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-[var(--bg-hover)] flex items-center justify-center text-[var(--text-muted)]">
                    {task.entity_type === 'property' && <Building2 size={16} />}
                    {task.entity_type === 'landlord' && <UserCircle size={16} />}
                    {task.entity_type === 'tenant' && <Users size={16} />}
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{task.entity_type}</p>
                    {task.relatedEntity && (
                      <p className="text-sm font-medium">
                        {task.entity_type === 'property' && task.relatedEntity.address}
                        {task.entity_type === 'landlord' && task.relatedEntity.name}
                        {task.entity_type === 'tenant' && task.relatedEntity.name}
                        {task.entity_type === 'tenant_enquiry' && `${task.relatedEntity.first_name_1} ${task.relatedEntity.last_name_1}`}
                      </p>
                    )}
                  </div>
                  <ArrowLeft size={16} className="rotate-180 text-[var(--text-muted)]" />
                </button>
              ) : (
                <div className="text-center py-3">
                  <p className="text-sm text-[var(--text-muted)] mb-2">Not linked to any entity</p>
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                    <LinkIcon size={12} className="mr-1" /> Link Entity
                  </Button>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
