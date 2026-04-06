import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { GlassCard, Button, Input, Select, Avatar, SectionHeader, DatePicker } from '../components/ui';
import DocumentUpload from '../components/ui/DocumentUpload';
import ActivityTimeline from '../components/ui/ActivityTimeline';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { calculateSmsSegments } from '../utils/sms';
import {
  Pencil, Save, X, Mail, Phone, MapPin, Calendar, MessageSquare, Clock,
  Plus, User, ArrowRight, UserPlus, XCircle, AlertTriangle, Send
} from 'lucide-react';

interface Prospect {
  id: number; name: string; email: string; phone: string; address: string;
  status: string; follow_up_date: string; source: string; notes: string;
  created_at: string; updated_at: string;
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

export default function BDMDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const { user } = useAuth();
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  // Notes
  const [notes, setNotes] = useState<ProspectNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Workflow
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [workflowMode, setWorkflowMode] = useState<'choose' | 'follow_up' | 'not_interested'>('choose');
  const [wfDate, setWfDate] = useState('');
  const [wfLoading, setWfLoading] = useState(false);
  const [converting, setConverting] = useState(false);

  // SMS
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [smsBody, setSmsBody] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [smsHistory, setSmsHistory] = useState<any[]>([]);
  const [smsCompose, setSmsCompose] = useState('');
  const [smsSending, setSmsSending] = useState(false);

  // Email History
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [emailHistory, setEmailHistory] = useState<any[]>([]);

  const loadDetail = useCallback(async () => {
    try {
      const p = await api.get(`/api/landlords-bdm/${id}`);
      setProspect(p);
      setForm({ name: p.name || '', email: p.email || '', phone: p.phone || '', address: p.address || '', source: p.source || '', follow_up_date: p.follow_up_date || '', status: p.status || 'new' });
      if (p.notes) {
        try {
          const parsed = JSON.parse(p.notes);
          if (Array.isArray(parsed)) { setNotes(parsed); }
          else if (p.notes.trim()) { setNotes([{ id: '1', text: p.notes, author: 'System', created_at: p.created_at || new Date().toISOString() }]); }
        } catch {
          if (p.notes.trim()) setNotes([{ id: '1', text: p.notes, author: 'System', created_at: p.created_at || new Date().toISOString() }]);
        }
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [id, api]);

  const loadSmsHistory = useCallback(async () => {
    try {
      const msgs = await api.get(`/api/sms/landlord_bdm/${id}`);
      setSmsHistory(Array.isArray(msgs) ? msgs : []);
    } catch { /* SMS history fetch failed */ }
  }, [id, api]);

  const loadEmailHistory = useCallback(async () => {
    try {
      const msgs = await api.get(`/api/email-history/landlord_bdm/${id}`);
      setEmailHistory(Array.isArray(msgs) ? msgs : []);
    } catch { /* Email history fetch failed */ }
  }, [id, api]);

  useEffect(() => { loadDetail(); loadSmsHistory(); loadEmailHistory(); }, [loadDetail, loadSmsHistory, loadEmailHistory]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/api/landlords-bdm/${id}`, { ...form, notes: JSON.stringify(notes) });
      await loadDetail();
      setEditing(false);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    setAddingNote(true);
    const note: ProspectNote = { id: Date.now().toString(), text: newNote.trim(), author: user?.email || 'You', created_at: new Date().toISOString() };
    const updated = [...notes, note];
    try {
      await api.put(`/api/landlords-bdm/${id}`, { ...form, notes: JSON.stringify(updated) });
      api.post('/api/activity', { action: 'note_added', entity_type: 'landlord_bdm', entity_id: Number(id), changes: { text: newNote.trim() } }).catch(() => {});
      setNotes(updated);
      setNewNote('');
    } catch (e) { console.error(e); }
    setAddingNote(false);
  };

  const handleWorkflow = async () => {
    setWfLoading(true);
    try {
      switch (workflowMode) {
        case 'follow_up':
          if (wfDate) {
            await api.put(`/api/landlords-bdm/${id}`, { ...form, status: 'follow_up', follow_up_date: wfDate, notes: JSON.stringify(notes) });
            if (smsEnabled && prospect?.phone && smsBody) {
              await api.post('/api/sms/send', { entity_type: 'landlord_bdm', entity_id: Number(id), to_phone: prospect.phone, message_body: smsBody }).catch(() => {});
              await loadSmsHistory();
            }
            await loadDetail();
          }
          break;
        case 'not_interested':
          await api.put(`/api/landlords-bdm/${id}`, { ...form, status: 'not_interested', notes: JSON.stringify(notes) });
          await loadDetail();
          break;
      }
      setShowWorkflow(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) { alert(err?.response?.data?.error || err?.message || 'Workflow action failed'); }
    setWfLoading(false);
  };

  const updateStatus = async (newStatus: string) => {
    try {
      await api.put(`/api/landlords-bdm/${id}`, { ...form, status: newStatus, notes: JSON.stringify(notes) });
      await loadDetail();
      setShowWorkflow(false);
    } catch (e) { console.error(e); }
  };

  const convertToLandlord = async () => {
    setConverting(true);
    try {
      const result = await api.post(`/api/landlords-bdm/${id}/convert`, {});
      navigate(`/landlords/${result.landlord_id}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) { alert(err?.response?.data?.error || err?.message || 'Failed to convert prospect'); }
    setConverting(false);
  };

  const sendStandaloneSms = async () => {
    if (!smsCompose.trim() || !prospect?.phone) return;
    setSmsSending(true);
    try {
      await api.post('/api/sms/send', { entity_type: 'landlord_bdm', entity_id: Number(id), to_phone: prospect.phone, message_body: smsCompose.trim() });
      setSmsCompose('');
      await loadSmsHistory();
    } catch { /* SMS send failed */ }
    setSmsSending(false);
  };

  const cancelEdit = () => {
    setEditing(false);
    if (prospect) setForm({ name: prospect.name || '', email: prospect.email || '', phone: prospect.phone || '', address: prospect.address || '', source: prospect.source || '', follow_up_date: prospect.follow_up_date || '', status: prospect.status || 'new' });
  };

  if (loading) return <Layout title="Loading..."><div className="p-8 text-[var(--text-muted)] text-sm">Loading...</div></Layout>;
  if (!prospect) return <Layout title="Not Found"><div className="p-8 text-[var(--text-muted)]">Prospect not found</div></Layout>;

  const isOverdue = prospect.follow_up_date && new Date(prospect.follow_up_date) < new Date(new Date().toDateString());
  const isOnboarded = prospect.status === 'onboarded';

  return (
    <Layout breadcrumb={[{ label: 'Landlord Enquiries', to: '/bdm' }, { label: prospect.name }]}>
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
              {!isOnboarded && prospect.status !== 'not_interested' && (
                <Button variant="outline" onClick={() => { setShowWorkflow(true); setWorkflowMode('choose'); setWfDate(''); setSmsEnabled(false); setSmsBody(''); }}>
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
                    <DatePicker label="Follow-up Date" value={form.follow_up_date} onChange={v => setForm({ ...form, follow_up_date: v })} />
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

            {/* SMS History */}
            <GlassCard className="p-6">
              <SectionHeader title="SMS History" icon={<Phone size={16} />} action={loadSmsHistory} actionLabel="Refresh" />
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {smsHistory.length === 0 && <p className="text-xs text-[var(--text-muted)]">No messages sent yet</p>}
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {smsHistory.map((sms: any) => (
                  <div key={sms.id} className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        sms.status === 'delivered'   ? 'bg-green-500/20 text-green-400' :
                        sms.status === 'sent'        ? 'bg-blue-500/20 text-blue-400' :
                        sms.status === 'queued' || sms.status === 'sending' ? 'bg-amber-500/20 text-amber-400' :
                        sms.status === 'failed' || sms.status === 'undelivered' ? 'bg-red-500/20 text-red-400' :
                                                       'bg-gray-500/20 text-gray-400'
                      }`}>
                        {sms.status}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)]">{sms.to_phone}</span>
                    </div>
                    <p className="text-xs text-[var(--text-primary)] whitespace-pre-wrap">{sms.message_body}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] text-[var(--text-muted)]">{sms.sent_by_email || 'System'}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">{new Date(sms.created_at).toLocaleString('en-GB')}</span>
                    </div>
                  </div>
                ))}
              </div>
              {prospect?.phone && (
                <div className="mt-3">
                  <div className="flex gap-2">
                    <textarea value={smsCompose} onChange={e => setSmsCompose(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendStandaloneSms(); } }}
                      placeholder={`Send SMS to ${prospect.phone}...`}
                      rows={1}
                      className="flex-1 bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-orange)]/50 transition-colors resize-none [field-sizing:content]" />
                    <Button variant="gradient" onClick={sendStandaloneSms} disabled={smsSending || !smsCompose.trim()} className="gap-1.5">
                      <Send size={14} />
                      <span>Send</span>
                    </Button>
                  </div>
                  {smsCompose.trim() && (
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">{(() => { const s = calculateSmsSegments(smsCompose); return `${s.charCount} chars · ${s.segments} segment${s.segments !== 1 ? 's' : ''} · ${s.encoding}`; })()}</p>
                  )}
                </div>
              )}
            </GlassCard>

            {/* Email History */}
            <GlassCard className="p-6">
              <SectionHeader title="Email History" icon={<Mail size={16} />} action={loadEmailHistory} actionLabel="Refresh" />
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {emailHistory.length === 0 && <p className="text-xs text-[var(--text-muted)]">No emails sent yet</p>}
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {emailHistory.map((email: any) => (
                  <div key={email.id} className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        email.status === 'delivered' ? 'bg-green-500/20 text-green-400' :
                        email.status === 'sent'      ? 'bg-blue-500/20 text-blue-400' :
                        email.status === 'opened'    ? 'bg-emerald-500/20 text-emerald-400' :
                        email.status === 'bounced' || email.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                                                       'bg-gray-500/20 text-gray-400'
                      }`}>
                        {email.status}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)]">{email.to_email}</span>
                    </div>
                    <p className="text-xs text-[var(--text-primary)] font-medium">{email.subject}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] text-[var(--text-muted)]">{email.sent_by_email || 'System'}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">{new Date(email.created_at).toLocaleString('en-GB')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Activity Timeline */}
            <GlassCard className="p-6">
              <SectionHeader title="Activity Timeline" icon={<Clock size={16} />} />
              <ActivityTimeline entityType="landlord_bdm" entityId={Number(id)} />
            </GlassCard>
          </div>
        </div>
      </div>

      {/* Workflow Modal */}
      {showWorkflow && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-[var(--overlay-bg)] backdrop-blur-sm" onClick={() => setShowWorkflow(false)}>
          <div className="bg-[var(--bg-card)] border border-[var(--border-input)] rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold">{prospect.name}</h3>
                <p className="text-xs text-[var(--text-muted)]">Update status</p>
              </div>
              <button onClick={() => setShowWorkflow(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
            </div>

            {workflowMode === 'choose' ? (
              <div className="space-y-2">
                <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-2">Progress</p>
                <button onClick={() => updateStatus('contacted')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center"><Phone size={14} className="text-white" /></div>
                  <div className="flex-1"><p className="text-sm font-medium">Mark as Contacted</p><p className="text-xs text-[var(--text-muted)]">Initial outreach made</p></div>
                  <ArrowRight size={14} className="text-[var(--text-muted)]" />
                </button>
                <button onClick={() => { setWorkflowMode('follow_up'); setSmsEnabled(false); setSmsBody(`Hi there! Just following up on your recent property enquiry with Fleming Lettings. When you get five, please call our team back on 01902 212 415. Speak soon, the team at Fleming's.`); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center"><Calendar size={14} className="text-white" /></div>
                  <div className="flex-1"><p className="text-sm font-medium">Set Follow Up</p><p className="text-xs text-[var(--text-muted)]">Schedule a follow-up date with optional SMS</p></div>
                  <ArrowRight size={14} className="text-[var(--text-muted)]" />
                </button>
                <button onClick={() => updateStatus('interested')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center"><UserPlus size={14} className="text-white" /></div>
                  <div className="flex-1"><p className="text-sm font-medium">Mark as Interested</p><p className="text-xs text-[var(--text-muted)]">Prospect is interested</p></div>
                  <ArrowRight size={14} className="text-[var(--text-muted)]" />
                </button>

                {/* Convert to Landlord */}
                {['follow_up', 'interested', 'contacted'].includes(prospect.status) && (
                  <>
                    <div className="h-px bg-[var(--border-subtle)] my-3" />
                    <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-2">Onboard</p>
                    <button onClick={convertToLandlord} disabled={converting}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors text-left border border-emerald-500/20">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                        <UserPlus size={14} className="text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-emerald-400">{converting ? 'Converting...' : 'Onboard — Convert to Landlord'}</p>
                        <p className="text-xs text-[var(--text-muted)]">Copy all data, records, logs & activities to Landlord module</p>
                      </div>
                      <ArrowRight size={14} className="text-[var(--text-muted)]" />
                    </button>
                  </>
                )}

                <div className="h-px bg-[var(--border-subtle)] my-3" />
                <button onClick={() => setWorkflowMode('not_interested')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center">
                    <XCircle size={14} className="text-white" />
                  </div>
                  <div className="flex-1"><p className="text-sm font-medium text-red-400">Not Interested</p><p className="text-xs text-[var(--text-muted)]">Close and archive this record</p></div>
                  <ArrowRight size={14} className="text-[var(--text-muted)]" />
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <button onClick={() => setWorkflowMode('choose')} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">← Back</button>

                {workflowMode === 'follow_up' && (
                  <>
                    <DatePicker label="Follow-up Date *" value={wfDate} onChange={setWfDate} />
                    {/* SMS */}
                    <div className="h-px bg-[var(--border-subtle)] my-1" />
                    {prospect.phone ? (
                      <div className="space-y-3">
                        <label className="flex items-center gap-3 cursor-pointer py-2 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                          <input type="checkbox" checked={smsEnabled} onChange={e => setSmsEnabled(e.target.checked)} className="w-4 h-4 rounded accent-orange-500" />
                          <Phone size={14} className="text-teal-400" />
                          <div className="flex-1">
                            <span className="text-sm font-medium text-[var(--text-primary)]">Send follow-up SMS</span>
                            <p className="text-[10px] text-[var(--text-muted)]">{prospect.phone}</p>
                          </div>
                        </label>
                        {smsEnabled && (
                          <div>
                            <label className="block text-[11px] text-[var(--text-muted)] font-medium mb-1.5 uppercase tracking-wider">Message Preview</label>
                            <textarea value={smsBody} onChange={e => setSmsBody(e.target.value)} rows={4}
                              className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-orange)]/50 resize-none transition-colors" />
                            <p className="text-[10px] text-[var(--text-muted)] mt-1">{(() => { const s = calculateSmsSegments(smsBody); return `${s.charCount} chars · ${s.segments} segment${s.segments !== 1 ? 's' : ''} · ${s.encoding}`; })()}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <p className="text-xs text-amber-400">No phone number on record — SMS cannot be sent</p>
                      </div>
                    )}
                  </>
                )}

                {workflowMode === 'not_interested' && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                    <p className="text-sm font-medium text-red-400">Are you sure?</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">This will close and archive this record, removing it from the active view.</p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setShowWorkflow(false)}>Cancel</Button>
                  <Button
                    variant={workflowMode === 'not_interested' ? 'outline' : 'gradient'}
                    onClick={handleWorkflow}
                    disabled={wfLoading || (workflowMode === 'follow_up' && !wfDate)}
                    className={workflowMode === 'not_interested' ? 'border-red-500/50 text-red-400' : ''}>
                    {wfLoading ? 'Saving...' : workflowMode === 'not_interested' ? 'Archive' : 'Confirm'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
