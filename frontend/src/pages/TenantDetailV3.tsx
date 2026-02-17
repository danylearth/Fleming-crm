import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { GlassCard, Button, Input, Select, Avatar, StatusDot, SectionHeader, EmptyState } from '../components/v3';
import DocumentUpload from '../components/v3/DocumentUpload';
import RentPayments from '../components/v3/RentPayments';
import { useApi } from '../hooks/useApi';
import { Pencil, Save, X, Mail, Phone, Building2, Calendar, FileText, MessageSquare, Clock, Wrench, AlertTriangle, ChevronRight, Plus, User, Shield } from 'lucide-react';

interface Tenant {
  id: number; name: string; email: string; phone: string; property_id: number;
  property_address: string; move_in_date: string; status: string; notes: string;
}

interface AuditEntry {
  id: number; user_email: string; action: string; entity_type: string;
  entity_id: number; changes: string; created_at: string;
}

interface MaintenanceRequest {
  id: number; property_id: number; tenant_id: number; title: string;
  description: string; status: string; priority: string; address: string;
  created_at: string; resolution_notes: string; contractor: string; cost: number;
}

interface TenantNote {
  id: string; text: string; author: string; created_at: string;
}

function TimeAgo({ date }: { date: string }) {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  let label = '';
  if (days > 30) label = then.toLocaleDateString();
  else if (days > 0) label = `${days}d ago`;
  else if (hrs > 0) label = `${hrs}h ago`;
  else if (mins > 0) label = `${mins}m ago`;
  else label = 'Just now';
  return <span className="text-[10px] text-[var(--text-muted)]">{label}</span>;
}

function actionIcon(action: string) {
  switch (action) {
    case 'create': return <Plus size={12} />;
    case 'update': return <Pencil size={12} />;
    case 'delete': return <X size={12} />;
    default: return <Clock size={12} />;
  }
}

function actionColor(action: string) {
  switch (action) {
    case 'create': return 'bg-green-500/20 text-green-400';
    case 'update': return 'bg-blue-500/20 text-blue-400';
    case 'delete': return 'bg-red-500/20 text-red-400';
    default: return 'bg-[var(--bg-hover)] text-[var(--text-muted)]';
  }
}

function priorityColor(priority: string) {
  switch (priority) {
    case 'urgent': return 'text-red-400';
    case 'high': return 'text-orange-400';
    case 'medium': return 'text-yellow-400';
    default: return 'text-[var(--text-muted)]';
  }
}

function statusLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function TenantDetailV3() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', move_in_date: '', status: 'active', notes: '' });
  const [saving, setSaving] = useState(false);

  // Timeline (audit log)
  const [timeline, setTimeline] = useState<AuditEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);

  // Maintenance
  const [maintenance, setMaintenance] = useState<MaintenanceRequest[]>([]);
  const [maintenanceLoading, setMaintenanceLoading] = useState(true);

  // Notes
  const [notes, setNotes] = useState<TenantNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const t = await api.get(`/api/tenants/${id}`);
        setTenant(t);
        setForm({ name: t.name, email: t.email || '', phone: t.phone || '', move_in_date: t.move_in_date || '', status: t.status || 'active', notes: t.notes || '' });
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [id]);

  // Load timeline
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const logs = await api.get(`/api/audit-log?entity_type=tenant&entity_id=${id}&limit=50`);
        setTimeline(Array.isArray(logs) ? logs : []);
      } catch {
        setTimeline([]);
      }
      setTimelineLoading(false);
    })();
  }, [id]);

  // Load maintenance
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const all = await api.get('/api/maintenance');
        setMaintenance(Array.isArray(all) ? all.filter((m: MaintenanceRequest) => m.tenant_id === Number(id)) : []);
      } catch {
        setMaintenance([]);
      }
      setMaintenanceLoading(false);
    })();
  }, [id]);

  // Load notes from tenant.notes field (stored as JSON array)
  useEffect(() => {
    if (tenant?.notes) {
      try {
        const parsed = JSON.parse(tenant.notes);
        if (Array.isArray(parsed)) { setNotes(parsed); return; }
      } catch { /* not JSON, treat as single note */ }
      if (tenant.notes.trim()) {
        setNotes([{ id: '1', text: tenant.notes, author: 'System', created_at: new Date().toISOString() }]);
      }
    }
  }, [tenant?.notes]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.put(`/api/tenants/${id}`, { ...form, notes: JSON.stringify(notes) });
      setTenant({ ...tenant!, ...updated });
      setEditing(false);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    setAddingNote(true);
    const note: TenantNote = {
      id: Date.now().toString(),
      text: newNote.trim(),
      author: 'You',
      created_at: new Date().toISOString()
    };
    const updated = [...notes, note];
    try {
      await api.put(`/api/tenants/${id}`, { notes: JSON.stringify(updated) });
      setNotes(updated);
      setNewNote('');
    } catch (e) { console.error(e); }
    setAddingNote(false);
  };

  const cancelEdit = () => {
    setEditing(false);
    if (tenant) setForm({ name: tenant.name, email: tenant.email || '', phone: tenant.phone || '', move_in_date: tenant.move_in_date || '', status: tenant.status || 'active', notes: tenant.notes || '' });
  };

  if (loading) return <V3Layout title="Loading..."><div className="p-8 text-[var(--text-muted)] text-sm">Loading...</div></V3Layout>;
  if (!tenant) return <V3Layout title="Not Found"><div className="p-8 text-[var(--text-muted)]">Tenant not found</div></V3Layout>;

  return (
    <V3Layout breadcrumb={[{ label: 'Tenants', to: '/v3/tenants' }, { label: tenant.name }]}>
      <div className="p-4 md:p-8 space-y-6 md:space-y-8">
        {/* Header with property E-panel */}
        <GlassCard className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
            <Avatar name={tenant.name} size="xl" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{tenant.name}</h1>
                <StatusDot status={tenant.status === 'active' ? 'active' : 'inactive'} size="md" />
                <span className="text-xs text-[var(--text-muted)] capitalize">{tenant.status}</span>
              </div>
              {/* Property E-Panel inline */}
              {tenant.property_id ? (
                <button onClick={() => navigate(`/v3/properties/${tenant.property_id}`)}
                  className="flex items-center gap-2 mt-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors group">
                  <div className="w-7 h-7 rounded-lg bg-[var(--bg-hover)] flex items-center justify-center group-hover:bg-[var(--accent-orange)]/20 transition-colors">
                    <Building2 size={14} className="text-[var(--text-muted)] group-hover:text-[var(--accent-orange)] transition-colors" />
                  </div>
                  <span>{tenant.property_address || `Property #${tenant.property_id}`}</span>
                  <ChevronRight size={14} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ) : (
                <p className="text-xs text-[var(--text-muted)] mt-2">No property linked</p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant={editing ? 'ghost' : 'outline'} onClick={() => editing ? cancelEdit() : setEditing(true)}>
                {editing ? <><X size={14} className="mr-2" />Cancel</> : <><Pencil size={14} className="mr-2" />Edit</>}
              </Button>
              {editing && (
                <Button variant="gradient" onClick={handleSave} disabled={saving}>
                  <Save size={14} className="mr-2" />{saving ? 'Saving...' : 'Save'}
                </Button>
              )}
            </div>
          </div>
        </GlassCard>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* ========== LEFT COLUMN — Static info ========== */}
          <div className="lg:col-span-3 space-y-6">
            {/* Personal Information */}
            <GlassCard className="p-6">
              <SectionHeader title="Personal Information" icon={<User size={16} />} />
              {editing ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="Name" value={form.name} onChange={v => setForm({ ...form, name: v })} />
                  <Input label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} type="email" />
                  <Input label="Phone" value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
                  <Input label="Move-in Date" value={form.move_in_date} onChange={v => setForm({ ...form, move_in_date: v })} placeholder="YYYY-MM-DD" />
                  <Select label="Status" value={form.status} onChange={v => setForm({ ...form, status: v })} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { icon: Mail, label: 'Email', value: tenant.email },
                    { icon: Phone, label: 'Phone', value: tenant.phone },
                    { icon: Calendar, label: 'Move-in Date', value: tenant.move_in_date ? new Date(tenant.move_in_date).toLocaleDateString() : null },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[var(--bg-hover)] flex items-center justify-center">
                        <Icon size={16} className="text-[var(--text-muted)]" />
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-muted)]">{label}</p>
                        <p className="text-sm">{value || '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>

            {/* KYC / Compliance placeholder */}
            <GlassCard className="p-6">
              <SectionHeader title="KYC & Compliance" icon={<Shield size={16} />} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: 'ID Verified', value: 'Pending' },
                  { label: 'Right to Rent', value: 'Pending' },
                  { label: 'Credit Check', value: 'Not started' },
                  { label: 'References', value: 'Not started' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between py-2 px-3 rounded-xl bg-[var(--bg-hover)]/50">
                    <span className="text-xs text-[var(--text-secondary)]">{item.label}</span>
                    <span className="text-xs text-[var(--text-muted)]">{item.value}</span>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Rent Payments */}
            <RentPayments tenantId={tenant.id} compact />

            {/* Documents */}
            <DocumentUpload entityType="tenant" entityId={tenant.id} />
          </div>

          {/* ========== RIGHT COLUMN — Notes, Timeline, Maintenance ========== */}
          <div className="lg:col-span-2 space-y-6">
            {/* Notes */}
            <GlassCard className="p-6">
              <SectionHeader title="Notes" icon={<MessageSquare size={16} />} />
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {notes.length === 0 && (
                  <p className="text-xs text-[var(--text-muted)]">No notes yet</p>
                )}
                {notes.map(note => (
                  <div key={note.id} className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5">
                    <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{note.text}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] text-[var(--text-muted)]">{note.author}</span>
                      <TimeAgo date={note.created_at} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <input
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addNote()}
                  placeholder="Add a note..."
                  className="flex-1 bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-orange)]/50 transition-colors"
                />
                <Button variant="gradient" onClick={addNote} disabled={addingNote || !newNote.trim()}>
                  <Plus size={14} />
                </Button>
              </div>
            </GlassCard>

            {/* Activity Timeline */}
            <GlassCard className="p-6">
              <SectionHeader title="Activity Timeline" icon={<Clock size={16} />} />
              {timelineLoading ? (
                <p className="text-xs text-[var(--text-muted)]">Loading...</p>
              ) : timeline.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">No activity recorded yet</p>
              ) : (
                <div className="relative space-y-0">
                  {/* Timeline line */}
                  <div className="absolute left-[13px] top-2 bottom-2 w-px bg-[var(--border-input)]" />
                  {timeline.slice(0, 20).map((entry, i) => {
                    let changes: Record<string, unknown> = {};
                    try { changes = JSON.parse(entry.changes || '{}'); } catch { /* noop */ }
                    const changedKeys = Object.keys(changes).filter(k => k !== 'id');

                    return (
                      <div key={entry.id} className="relative flex items-start gap-3 py-2">
                        <div className={`w-[26px] h-[26px] rounded-full flex items-center justify-center shrink-0 z-10 ${actionColor(entry.action)}`}>
                          {actionIcon(entry.action)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-[var(--text-primary)] capitalize">{entry.action}</span>
                            <span className="text-[10px] text-[var(--text-muted)]">{entry.entity_type}</span>
                          </div>
                          {changedKeys.length > 0 && (
                            <p className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">
                              Changed: {changedKeys.join(', ')}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-[var(--text-muted)]">{entry.user_email || 'System'}</span>
                            <TimeAgo date={entry.created_at} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </GlassCard>

            {/* Maintenance */}
            <GlassCard className="p-6">
              <SectionHeader title="Maintenance" icon={<Wrench size={16} />} />
              {maintenanceLoading ? (
                <p className="text-xs text-[var(--text-muted)]">Loading...</p>
              ) : maintenance.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">No maintenance requests</p>
              ) : (
                <div className="space-y-3">
                  {maintenance.map(m => (
                    <div key={m.id} className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {m.priority && ['urgent', 'high'].includes(m.priority) && (
                              <AlertTriangle size={12} className={priorityColor(m.priority)} />
                            )}
                            <span className="text-sm font-medium text-[var(--text-primary)] truncate">{m.title || 'Untitled'}</span>
                          </div>
                          {m.description && (
                            <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">{m.description}</p>
                          )}
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${
                          m.status === 'open' ? 'bg-orange-500/20 text-orange-400' :
                          m.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400' :
                          m.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                          'bg-[var(--bg-hover)] text-[var(--text-muted)]'
                        }`}>
                          {statusLabel(m.status)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        {m.address && <span className="text-[10px] text-[var(--text-muted)] truncate">{m.address}</span>}
                        <TimeAgo date={m.created_at} />
                      </div>
                      {m.resolution_notes && (
                        <p className="text-[10px] text-[var(--text-secondary)] mt-1 italic">Resolution: {m.resolution_notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>
        </div>
      </div>
    </V3Layout>
  );
}
