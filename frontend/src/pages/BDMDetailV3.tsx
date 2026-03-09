import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { GlassCard, Button, Input, Select, Avatar, SectionHeader } from '../components/v3';
import DocumentUpload from '../components/v3/DocumentUpload';
import { useApi } from '../hooks/useApi';
import {
  Pencil, Save, X, Mail, Phone, MapPin, Calendar, MessageSquare, Clock,
  Plus, User, ArrowRight, UserPlus, XCircle, ChevronRight, AlertTriangle
} from 'lucide-react';

interface Prospect {
  id: number; name: string; email: string; phone: string; address: string;
  status: string; follow_up_date: string; source: string; notes: string;
  created_at: string; updated_at: string;
}

interface AuditEntry {
  id: number; user_email: string; action: string; entity_type: string;
  entity_id: number; changes: string; created_at: string;
}

interface ProspectNote {
  id: string; text: string; author: string; created_at: string;
}

const STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not Interested' },
];

function statusColor(s: string) {
  switch (s) {
    case 'new': return 'bg-blue-500/20 text-blue-400';
    case 'contacted': return 'bg-purple-500/20 text-purple-400';
    case 'follow_up': return 'bg-amber-500/20 text-amber-400';
    case 'interested': return 'bg-green-500/20 text-green-400';
    case 'onboarded': return 'bg-emerald-500/20 text-emerald-400';
    case 'not_interested': return 'bg-red-500/20 text-red-400';
    default: return 'bg-[var(--bg-hover)] text-[var(--text-muted)]';
  }
}

function TimeAgo({ date }: { date: string }) {
  const now = new Date();
  const then = new Date(date);
  const diff = now.getTime() - then.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 30) return <span className="text-[10px] text-[var(--text-muted)]">{then.toLocaleDateString()}</span>;
  if (days > 0) return <span className="text-[10px] text-[var(--text-muted)]">{days}d ago</span>;
  if (hrs > 0) return <span className="text-[10px] text-[var(--text-muted)]">{hrs}h ago</span>;
  if (mins > 0) return <span className="text-[10px] text-[var(--text-muted)]">{mins}m ago</span>;
  return <span className="text-[10px] text-[var(--text-muted)]">Just now</span>;
}

function ReadField({ label, value }: { label: string; value?: string | null }) {
  return <div><p className="text-xs text-[var(--text-muted)]">{label}</p><p className="text-sm mt-0.5">{value || '—'}</p></div>;
}

function actionColor(action: string) {
  switch (action) {
    case 'create': return 'bg-green-500/20 text-green-400';
    case 'update': return 'bg-blue-500/20 text-blue-400';
    case 'view': return 'bg-[var(--bg-hover)] text-[var(--text-muted)]';
    default: return 'bg-[var(--bg-hover)] text-[var(--text-muted)]';
  }
}

function actionIcon(action: string) {
  switch (action) {
    case 'create': return <Plus size={12} />;
    case 'update': return <Pencil size={12} />;
    default: return <Clock size={12} />;
  }
}

export default function BDMDetailV3() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});

  // Notes
  const [notes, setNotes] = useState<ProspectNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Timeline
  const [timeline, setTimeline] = useState<AuditEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);

  // Workflow
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await api.get(`/api/landlords-bdm/${id}`);
        setProspect(p);
        setForm({ name: p.name || '', email: p.email || '', phone: p.phone || '', address: p.address || '', source: p.source || '', follow_up_date: p.follow_up_date || '', status: p.status || 'new' });
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [id]);

  // Load notes from prospect.notes (JSON array)
  useEffect(() => {
    if (prospect?.notes) {
      try {
        const parsed = JSON.parse(prospect.notes);
        if (Array.isArray(parsed)) { setNotes(parsed); return; }
      } catch {}
      if (prospect.notes.trim()) setNotes([{ id: '1', text: prospect.notes, author: 'System', created_at: prospect.created_at || new Date().toISOString() }]);
    }
  }, [prospect?.notes]);

  // Timeline
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const logs = await api.get(`/api/audit-log?entity_type=landlord_bdm&entity_id=${id}&limit=50`);
        setTimeline(Array.isArray(logs) ? logs : []);
      } catch { setTimeline([]); }
      setTimelineLoading(false);
    })();
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/api/landlords-bdm/${id}`, { ...form, notes: JSON.stringify(notes) });
      const p = await api.get(`/api/landlords-bdm/${id}`);
      setProspect(p);
      setForm({ name: p.name || '', email: p.email || '', phone: p.phone || '', address: p.address || '', source: p.source || '', follow_up_date: p.follow_up_date || '', status: p.status || 'new' });
      setEditing(false);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    setAddingNote(true);
    const note: ProspectNote = { id: Date.now().toString(), text: newNote.trim(), author: 'You', created_at: new Date().toISOString() };
    const updated = [...notes, note];
    try {
      await api.put(`/api/landlords-bdm/${id}`, { ...form, notes: JSON.stringify(updated) });
      setNotes(updated);
      setNewNote('');
    } catch (e) { console.error(e); }
    setAddingNote(false);
  };

  const updateStatus = async (newStatus: string, followUp?: string) => {
    try {
      await api.put(`/api/landlords-bdm/${id}`, { ...form, status: newStatus, follow_up_date: followUp || form.follow_up_date, notes: JSON.stringify(notes) });
      const p = await api.get(`/api/landlords-bdm/${id}`);
      setProspect(p);
      setForm({ name: p.name || '', email: p.email || '', phone: p.phone || '', address: p.address || '', source: p.source || '', follow_up_date: p.follow_up_date || '', status: p.status || 'new' });
      setShowWorkflow(false);
    } catch (e) { console.error(e); }
  };

  const convertToLandlord = async () => {
    setConverting(true);
    try {
      const result = await api.post(`/api/landlords-bdm/${id}/convert`, {});
      navigate(`/v3/landlords/${result.landlord_id}`);
    } catch (e) { console.error(e); }
    setConverting(false);
  };

  const cancelEdit = () => {
    setEditing(false);
    if (prospect) setForm({ name: prospect.name || '', email: prospect.email || '', phone: prospect.phone || '', address: prospect.address || '', source: prospect.source || '', follow_up_date: prospect.follow_up_date || '', status: prospect.status || 'new' });
  };

  if (loading) return <V3Layout title="Loading..."><div className="p-8 text-[var(--text-muted)] text-sm">Loading...</div></V3Layout>;
  if (!prospect) return <V3Layout title="Not Found"><div className="p-8 text-[var(--text-muted)]">Prospect not found</div></V3Layout>;

  const isOverdue = prospect.follow_up_date && new Date(prospect.follow_up_date) < new Date(new Date().toDateString());
  const isOnboarded = prospect.status === 'onboarded';

  return (
    <V3Layout breadcrumb={[{ label: 'Landlord Enquiries', to: '/v3/bdm' }, { label: prospect.name }]}>
      <div className="p-4 md:p-8 space-y-6 md:space-y-8">
        {/* Header */}
        <GlassCard className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
            <Avatar name={prospect.name} size="xl" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{prospect.name}</h1>
                <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-medium ${statusColor(prospect.status)}`}>
                  {STATUSES.find(s => s.value === prospect.status)?.label || prospect.status}
                </span>
              </div>
              {prospect.source && (
                <p className="text-xs text-[var(--text-muted)] mt-1">Source: {prospect.source}</p>
              )}
              {/* Follow-up warning */}
              {isOverdue && !isOnboarded && (
                <div className="flex items-center gap-2 mt-2 px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 w-fit">
                  <AlertTriangle size={14} className="text-orange-400" />
                  <span className="text-xs text-orange-400 font-medium">
                    Follow-up overdue — was {new Date(prospect.follow_up_date).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              {!isOnboarded && (
                <Button variant="outline" onClick={() => setShowWorkflow(true)}>
                  <ArrowRight size={14} className="mr-2" />Progress
                </Button>
              )}
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
          {/* LEFT */}
          <div className="lg:col-span-3 space-y-6">
            {/* Contact Info */}
            <GlassCard className="p-6">
              <SectionHeader title="Contact Information" icon={<User size={16} />} />
              {editing ? (
                <div className="space-y-3">
                  <Input label="Full Name" value={form.name} onChange={v => setForm({ ...form, name: v })} />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} type="email" />
                    <Input label="Phone" value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
                  </div>
                  <Input label="Address" value={form.address} onChange={v => setForm({ ...form, address: v })} />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input label="Source" value={form.source} onChange={v => setForm({ ...form, source: v })} placeholder="e.g. Referral, Rightmove" />
                    <Input label="Follow-up Date" value={form.follow_up_date} onChange={v => setForm({ ...form, follow_up_date: v })} placeholder="YYYY-MM-DD" />
                  </div>
                  <Select label="Status" value={form.status} onChange={v => setForm({ ...form, status: v })}
                    options={STATUSES} />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { icon: Mail, label: 'Email', value: prospect.email },
                      { icon: Phone, label: 'Phone', value: prospect.phone },
                      { icon: MapPin, label: 'Address', value: prospect.address },
                      { icon: Calendar, label: 'Follow-up', value: prospect.follow_up_date ? new Date(prospect.follow_up_date).toLocaleDateString() : null },
                    ].map(({ icon: Icon, label, value }) => (
                      <div key={label} className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[var(--bg-hover)] flex items-center justify-center">
                          <Icon size={16} className="text-[var(--text-muted)]" />
                        </div>
                        <div><p className="text-xs text-[var(--text-muted)]">{label}</p><p className="text-sm">{value || '—'}</p></div>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    Added {new Date(prospect.created_at).toLocaleDateString()} · Last updated {new Date(prospect.updated_at).toLocaleDateString()}
                  </div>
                </div>
              )}
            </GlassCard>

            {/* Documents */}
            <DocumentUpload entityType="landlord_bdm" entityId={prospect.id} />
          </div>

          {/* RIGHT */}
          <div className="lg:col-span-2 space-y-6">
            {/* Notes */}
            <GlassCard className="p-6">
              <SectionHeader title="Notes" icon={<MessageSquare size={16} />} />
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {notes.length === 0 && <p className="text-xs text-[var(--text-muted)]">No notes yet</p>}
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
                <input value={newNote} onChange={e => setNewNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addNote()}
                  placeholder="Add a note..."
                  className="flex-1 bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-orange)]/50 transition-colors" />
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
                  <div className="absolute left-[13px] top-2 bottom-2 w-px bg-[var(--border-input)]" />
                  {timeline.filter(e => e.action !== 'view').slice(0, 20).map(entry => {
                    let changes: Record<string, unknown> = {};
                    try { changes = JSON.parse(entry.changes || '{}'); } catch {}
                    const changedKeys = Object.keys(changes).filter(k => k !== 'id');
                    return (
                      <div key={entry.id} className="relative flex items-start gap-3 py-2">
                        <div className={`w-[26px] h-[26px] rounded-full flex items-center justify-center shrink-0 z-10 ${actionColor(entry.action)}`}>
                          {actionIcon(entry.action)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium capitalize">{entry.action}</span>
                          </div>
                          {changedKeys.length > 0 && (
                            <p className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">Changed: {changedKeys.join(', ')}</p>
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
          </div>
        </div>
      </div>

      {/* Workflow Modal */}
      {showWorkflow && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-[var(--overlay-bg)] backdrop-blur-sm" onClick={() => setShowWorkflow(false)}>
          <div className="bg-[var(--bg-card)] border border-[var(--border-input)] rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-md space-y-2" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold">{prospect.name}</h3>
                <p className="text-xs text-[var(--text-muted)]">Update status</p>
              </div>
              <button onClick={() => setShowWorkflow(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
            </div>

            <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-2">Progress</p>
            {[
              { status: 'contacted', label: 'Mark as Contacted', desc: 'Initial outreach made', color: 'from-purple-500 to-violet-500', icon: <Phone size={14} className="text-white" /> },
              { status: 'follow_up', label: 'Set Follow Up', desc: 'Schedule a follow-up date', color: 'from-amber-500 to-orange-500', icon: <Calendar size={14} className="text-white" /> },
              { status: 'interested', label: 'Mark as Interested', desc: 'Prospect is interested', color: 'from-green-500 to-emerald-500', icon: <UserPlus size={14} className="text-white" /> },
            ].map(opt => (
              <button key={opt.status} onClick={() => updateStatus(opt.status)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors text-left">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${opt.color} flex items-center justify-center`}>{opt.icon}</div>
                <div className="flex-1"><p className="text-sm font-medium">{opt.label}</p><p className="text-xs text-[var(--text-muted)]">{opt.desc}</p></div>
                <ArrowRight size={14} className="text-[var(--text-muted)]" />
              </button>
            ))}

            {/* Convert to Landlord */}
            {prospect.status === 'interested' && (
              <>
                <div className="h-px bg-[var(--border-subtle)] my-3" />
                <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-2">Convert</p>
                <button onClick={convertToLandlord} disabled={converting}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors text-left border border-emerald-500/20">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                    <UserPlus size={14} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-emerald-400">{converting ? 'Converting...' : 'Convert to Landlord'}</p>
                    <p className="text-xs text-[var(--text-muted)]">Move to Landlords module</p>
                  </div>
                  <ArrowRight size={14} className="text-[var(--text-muted)]" />
                </button>
              </>
            )}

            <div className="h-px bg-[var(--border-subtle)] my-3" />
            <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-2">Archive</p>
            <button onClick={() => updateStatus('not_interested')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 transition-colors text-left">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center">
                <XCircle size={14} className="text-white" />
              </div>
              <div className="flex-1"><p className="text-sm font-medium text-red-400">Not Interested</p><p className="text-xs text-[var(--text-muted)]">Archive this prospect</p></div>
              <ArrowRight size={14} className="text-[var(--text-muted)]" />
            </button>
          </div>
        </div>
      )}
    </V3Layout>
  );
}
