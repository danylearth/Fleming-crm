import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { GlassCard, Button, Input, Select, Avatar, StatusDot, SectionHeader, EmptyState } from '../components/v3';
import DocumentUpload from '../components/v3/DocumentUpload';
import RentPayments from '../components/v3/RentPayments';
import { useApi } from '../hooks/useApi';
import {
  Pencil, Save, X, Mail, Phone, Building2, Calendar, MessageSquare, Clock,
  Wrench, AlertTriangle, ChevronRight, Plus, User, Heart, CheckCircle,
  ChevronDown, ShieldCheck
} from 'lucide-react';

// ==================== TYPES ====================
interface Tenant {
  id: number; name: string; email: string; phone: string;
  title_1?: string; first_name_1?: string; last_name_1?: string; date_of_birth_1?: string;
  is_joint_tenancy?: number;
  title_2?: string; first_name_2?: string; last_name_2?: string;
  email_2?: string; phone_2?: string; date_of_birth_2?: string;
  nok_name?: string; nok_relationship?: string; nok_phone?: string; nok_email?: string;
  kyc_completed_1?: number; kyc_completed_2?: number;
  guarantor_required?: number; guarantor_name?: string; guarantor_address?: string;
  guarantor_phone?: string; guarantor_email?: string;
  guarantor_kyc_completed?: number; guarantor_deed_received?: number;
  holding_deposit_received?: number; holding_deposit_amount?: number; holding_deposit_date?: string;
  application_forms_completed?: number;
  authority_to_contact?: number; proof_of_income?: string; deposit_scheme?: string;
  property_id: number; property_address: string;
  tenancy_start_date?: string; tenancy_type?: string;
  has_end_date?: number; tenancy_end_date?: string; monthly_rent?: number;
  move_in_date: string; status: string; notes: string;
}

interface AuditEntry {
  id: number; user_email: string; action: string; entity_type: string;
  entity_id: number; changes: string; created_at: string;
}

interface TenantNote {
  id: string; text: string; author: string; created_at: string;
}

// ==================== HELPERS ====================
function formatDateDMY(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}
function TimeAgo({ date }: { date: string }) {
  const now = new Date();
  const then = new Date(date);
  const diff = now.getTime() - then.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  let label = '';
  if (days > 30) label = formatDateDMY(date);
  else if (days > 0) label = `${days}d ago`;
  else if (hrs > 0) label = `${hrs}h ago`;
  else if (mins > 0) label = `${mins}m ago`;
  else label = 'Just now';
  return <span className="text-[10px] text-[var(--text-muted)]">{label}</span>;
}

function actionColor(action: string) {
  switch (action) {
    case 'create': return 'bg-green-500/20 text-green-400';
    case 'update': return 'bg-blue-500/20 text-blue-400';
    case 'delete': return 'bg-red-500/20 text-red-400';
    default: return 'bg-[var(--bg-hover)] text-[var(--text-muted)]';
  }
}

function actionIcon(action: string) {
  switch (action) {
    case 'create': return <Plus size={12} />;
    case 'update': return <Pencil size={12} />;
    case 'delete': return <X size={12} />;
    default: return <Clock size={12} />;
  }
}

function statusLabel(s: string) {
  return s?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '';
}

function YesNo({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-1">
      <button disabled={disabled} onClick={() => onChange(true)}
        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${value ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-[var(--bg-hover)] text-[var(--text-muted)] border border-transparent'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
        Yes
      </button>
      <button disabled={disabled} onClick={() => onChange(false)}
        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${!value ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-[var(--bg-hover)] text-[var(--text-muted)] border border-transparent'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
        No
      </button>
    </div>
  );
}

function ReadField({ label, value }: { label: string; value?: string | React.ReactNode | null }) {
  return (
    <div>
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="text-sm mt-0.5">{value || '—'}</p>
    </div>
  );
}

function CompletionRing({ percent, size = 48 }: { percent: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  const color = percent === 100 ? '#22c55e' : percent >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-hover)" strokeWidth={4} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} className="transition-all duration-500" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color }}>
        {percent}%
      </span>
    </div>
  );
}

function SectionEditButton({ editing, onEdit, onSave, onCancel, saving }: {
  editing: boolean; onEdit: () => void; onSave: () => void; onCancel: () => void; saving?: boolean;
}) {
  if (editing) {
    return (
      <div className="flex gap-2">
        <button onClick={onCancel} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors px-2 py-1 rounded-lg hover:bg-[var(--bg-hover)]">Cancel</button>
        <button onClick={onSave} disabled={saving} className="text-xs text-[var(--accent-orange)] hover:text-[var(--accent-orange)] font-medium transition-colors px-2 py-1 rounded-lg hover:bg-[var(--accent-orange)]/10">
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    );
  }
  return (
    <button onClick={onEdit} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors px-2 py-1 rounded-lg hover:bg-[var(--bg-hover)]">
      <Pencil size={12} />
    </button>
  );
}

// ==================== COMPONENT ====================
export default function TenantDetailV3() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});

  // Timeline
  const [timeline, setTimeline] = useState<AuditEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);

  // Notes
  const [notes, setNotes] = useState<TenantNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Guarantor expand
  const [guarantorExpanded, setGuarantorExpanded] = useState(false);

  // Load tenant
  useEffect(() => {
    (async () => {
      try {
        const t = await api.get(`/api/tenants/${id}`);
        setTenant(t);
        setForm(tenantToForm(t));
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
      } catch { setTimeline([]); }
      setTimelineLoading(false);
    })();
  }, [id]);

  // Load notes
  useEffect(() => {
    if (tenant?.notes) {
      try {
        const parsed = JSON.parse(tenant.notes);
        if (Array.isArray(parsed)) { setNotes(parsed); return; }
      } catch { }
      if (tenant.notes.trim()) setNotes([{ id: '1', text: tenant.notes, author: 'System', created_at: new Date().toISOString() }]);
    }
  }, [tenant?.notes]);

  function tenantToForm(t: Tenant) {
    return {
      name: t.name || '', email: t.email || '', phone: t.phone || '',
      title_1: t.title_1 || '', first_name_1: t.first_name_1 || '', last_name_1: t.last_name_1 || '',
      date_of_birth_1: t.date_of_birth_1 || '',
      is_joint_tenancy: !!t.is_joint_tenancy,
      title_2: t.title_2 || '', first_name_2: t.first_name_2 || '', last_name_2: t.last_name_2 || '',
      email_2: t.email_2 || '', phone_2: t.phone_2 || '', date_of_birth_2: t.date_of_birth_2 || '',
      nok_name: t.nok_name || '', nok_relationship: t.nok_relationship || '',
      nok_phone: t.nok_phone || '', nok_email: t.nok_email || '',
      kyc_completed_1: !!t.kyc_completed_1, kyc_completed_2: !!t.kyc_completed_2,
      guarantor_required: !!t.guarantor_required,
      guarantor_name: t.guarantor_name || '', guarantor_address: t.guarantor_address || '',
      guarantor_phone: t.guarantor_phone || '', guarantor_email: t.guarantor_email || '',
      guarantor_kyc_completed: !!t.guarantor_kyc_completed, guarantor_deed_received: !!t.guarantor_deed_received,
      holding_deposit_received: !!t.holding_deposit_received,
      holding_deposit_amount: t.holding_deposit_amount || '', holding_deposit_date: t.holding_deposit_date || '',
      application_forms_completed: !!t.application_forms_completed,
      authority_to_contact: !!t.authority_to_contact,
      proof_of_income: t.proof_of_income || '',
      deposit_scheme: t.deposit_scheme || '',
      property_id: t.property_id, tenancy_start_date: t.tenancy_start_date || t.move_in_date || '',
      tenancy_type: t.tenancy_type || '', has_end_date: !!t.has_end_date, tenancy_end_date: t.tenancy_end_date || '',
      monthly_rent: t.monthly_rent || '', status: t.status || 'active',
    };
  }

  // Restructured checklist: Authority → KYC → Application Forms → Proof of Income
  function getChecklistItems() {
    const items: { label: string; done: boolean }[] = [
      { label: 'Authority to Contact', done: !!form.authority_to_contact },
      { label: 'KYC — Primary ID', done: !!form.kyc_completed_1 },
    ];
    if (form.is_joint_tenancy) {
      items.push({ label: 'KYC — Applicant 2', done: !!form.kyc_completed_2 });
    }
    items.push({ label: 'Application Forms', done: !!form.application_forms_completed });
    items.push({ label: 'Proof of Income', done: !!form.proof_of_income });
    if (form.guarantor_required) {
      items.push({ label: 'Guarantor KYC', done: !!form.guarantor_kyc_completed });
      items.push({ label: 'Deed of Guarantee', done: !!form.guarantor_deed_received });
    }
    return items;
  }

  const checklistItems = getChecklistItems();
  const completedCount = checklistItems.filter(i => i.done).length;
  const completionPercent = checklistItems.length ? Math.round((completedCount / checklistItems.length) * 100) : 0;
  const isOnboarded = completionPercent === 100;

  // Tenancy end date warning
  const endDateWarning = form.has_end_date && form.tenancy_end_date
    ? (() => {
      const end = new Date(form.tenancy_end_date);
      const now = new Date();
      const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86400000);
      return daysLeft <= 30 && daysLeft > 0 ? daysLeft : daysLeft <= 0 ? 0 : null;
    })()
    : null;

  // Per-section save: sends partial update to backend
  const saveSection = async () => {
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        ...form,
        name: form.first_name_1 && form.last_name_1 ? `${form.first_name_1} ${form.last_name_1}` : form.name,
        is_joint_tenancy: form.is_joint_tenancy ? 1 : 0,
        kyc_completed_1: form.kyc_completed_1 ? 1 : 0,
        kyc_completed_2: form.kyc_completed_2 ? 1 : 0,
        guarantor_required: form.guarantor_required ? 1 : 0,
        guarantor_kyc_completed: form.guarantor_kyc_completed ? 1 : 0,
        guarantor_deed_received: form.guarantor_deed_received ? 1 : 0,
        holding_deposit_received: form.holding_deposit_received ? 1 : 0,
        application_forms_completed: form.application_forms_completed ? 1 : 0,
        authority_to_contact: form.authority_to_contact ? 1 : 0,
        has_end_date: form.has_end_date ? 1 : 0,
        notes: JSON.stringify(notes),
      };
      await api.put(`/api/tenants/${id}`, payload);
      const t = await api.get(`/api/tenants/${id}`);
      setTenant(t);
      setForm(tenantToForm(t));
      setEditingSection(null);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const cancelSection = () => {
    setEditingSection(null);
    if (tenant) setForm(tenantToForm(tenant));
    setGuarantorExpanded(false);
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    setAddingNote(true);
    const note: TenantNote = { id: Date.now().toString(), text: newNote.trim(), author: 'You', created_at: new Date().toISOString() };
    const updated = [...notes, note];
    try {
      await api.put(`/api/tenants/${id}`, { notes: JSON.stringify(updated) });
      setNotes(updated);
      setNewNote('');
    } catch (e) { console.error(e); }
    setAddingNote(false);
  };

  if (loading) return <V3Layout title="Loading..."><div className="p-8 text-[var(--text-muted)] text-sm">Loading...</div></V3Layout>;
  if (!tenant) return <V3Layout title="Not Found"><div className="p-8 text-[var(--text-muted)]">Tenant not found</div></V3Layout>;

  const displayName = form.first_name_1 && form.last_name_1 ? `${form.first_name_1} ${form.last_name_1}` : tenant.name;
  const isEditing = (section: string) => editingSection === section;

  return (
    <V3Layout breadcrumb={[{ label: 'Tenants', to: '/v3/tenants' }, { label: displayName }]}>
      <div className="p-4 md:p-8 space-y-6 md:space-y-8">
        {/* ==================== HEADER ==================== */}
        <GlassCard className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
            <Avatar name={displayName} size="xl" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{displayName}</h1>
                <StatusDot status={(form.status || 'active') === 'active' ? 'active' : 'inactive'} size="md" />
                <span className="text-xs text-[var(--text-muted)] capitalize">{form.status || 'active'}</span>
                {isOnboarded && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg px-2 py-0.5">
                    <ShieldCheck size={12} /> Onboarded
                  </span>
                )}
              </div>
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
              {endDateWarning !== null && (
                <div className="flex items-center gap-2 mt-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 w-fit">
                  <AlertTriangle size={14} className="text-red-400" />
                  <span className="text-xs text-red-400 font-medium">
                    {endDateWarning === 0 ? 'Tenancy has expired!' : `Tenancy ends in ${endDateWarning} days`}
                  </span>
                </div>
              )}
            </div>
            <CompletionRing percent={completionPercent} />
          </div>
        </GlassCard>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* ==================== LEFT COLUMN ==================== */}
          <div className="lg:col-span-3 space-y-6">
            {/* Personal Information */}
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <SectionHeader title="Personal Information" icon={<User size={16} />} />
                <SectionEditButton editing={isEditing('personal')} onEdit={() => setEditingSection('personal')} onSave={saveSection} onCancel={cancelSection} saving={saving} />
              </div>
              {isEditing('personal') ? (
                <div className="space-y-4">
                  <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider">Applicant 1</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Select label="Title" value={form.title_1} onChange={v => setForm({ ...form, title_1: v })}
                      options={[{ value: '', label: 'Select' }, { value: 'Mr', label: 'Mr' }, { value: 'Mrs', label: 'Mrs' }, { value: 'Ms', label: 'Ms' }, { value: 'Miss', label: 'Miss' }, { value: 'Dr', label: 'Dr' }]} />
                    <Input label="First Name" value={form.first_name_1} onChange={v => setForm({ ...form, first_name_1: v })} />
                    <Input label="Last Name" value={form.last_name_1} onChange={v => setForm({ ...form, last_name_1: v })} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} type="email" />
                    <Input label="Phone" value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
                    <Input label="Date of Birth" value={form.date_of_birth_1} onChange={v => setForm({ ...form, date_of_birth_1: v })} type="date" />
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <label className="text-xs text-[var(--text-muted)]">Joint Tenancy?</label>
                    <YesNo value={form.is_joint_tenancy} onChange={v => setForm({ ...form, is_joint_tenancy: v })} />
                  </div>
                  {form.is_joint_tenancy && (
                    <>
                      <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mt-4">Applicant 2</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Select label="Title" value={form.title_2} onChange={v => setForm({ ...form, title_2: v })}
                          options={[{ value: '', label: 'Select' }, { value: 'Mr', label: 'Mr' }, { value: 'Mrs', label: 'Mrs' }, { value: 'Ms', label: 'Ms' }, { value: 'Miss', label: 'Miss' }, { value: 'Dr', label: 'Dr' }]} />
                        <Input label="First Name" value={form.first_name_2} onChange={v => setForm({ ...form, first_name_2: v })} />
                        <Input label="Last Name" value={form.last_name_2} onChange={v => setForm({ ...form, last_name_2: v })} />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Input label="Email" value={form.email_2} onChange={v => setForm({ ...form, email_2: v })} type="email" />
                        <Input label="Phone" value={form.phone_2} onChange={v => setForm({ ...form, phone_2: v })} />
                        <Input label="Date of Birth" value={form.date_of_birth_2} onChange={v => setForm({ ...form, date_of_birth_2: v })} type="date" />
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { icon: Mail, label: 'Email', value: tenant.email },
                      { icon: Phone, label: 'Phone', value: tenant.phone },
                      { icon: Calendar, label: 'Date of Birth', value: tenant.date_of_birth_1 ? formatDateDMY(tenant.date_of_birth_1) : null },
                    ].map(({ icon: Icon, label, value }) => (
                      <div key={label} className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[var(--bg-hover)] flex items-center justify-center">
                          <Icon size={16} className="text-[var(--text-muted)]" />
                        </div>
                        <div><p className="text-xs text-[var(--text-muted)]">{label}</p><p className="text-sm">{value || '—'}</p></div>
                      </div>
                    ))}
                  </div>
                  {!!tenant.is_joint_tenancy && (
                    <>
                      <div className="h-px bg-[var(--border-subtle)] my-2" />
                      <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider">Applicant 2</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <ReadField label="Name" value={[tenant.title_2, tenant.first_name_2, tenant.last_name_2].filter(Boolean).join(' ') || null} />
                        <ReadField label="Email" value={tenant.email_2} />
                        <ReadField label="Phone" value={tenant.phone_2} />
                        <ReadField label="Date of Birth" value={tenant.date_of_birth_2 ? formatDateDMY(tenant.date_of_birth_2) : null} />
                      </div>
                    </>
                  )}
                </div>
              )}
            </GlassCard>

            {/* Next of Kin */}
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold flex items-center gap-2"><Heart size={16} />Next of Kin</h3>
                  {!form.nok_name && !isEditing('nok') && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 font-medium">Missing</span>
                  )}
                </div>
                <SectionEditButton editing={isEditing('nok')} onEdit={() => setEditingSection('nok')} onSave={saveSection} onCancel={cancelSection} saving={saving} />
              </div>
              {isEditing('nok') ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input label="Full Name" value={form.nok_name} onChange={v => setForm({ ...form, nok_name: v })} placeholder="Next of kin name" />
                  <Select label="Relationship" value={form.nok_relationship} onChange={v => setForm({ ...form, nok_relationship: v })}
                    options={[{ value: '', label: 'Select' }, { value: 'Parent', label: 'Parent' }, { value: 'Spouse', label: 'Spouse' }, { value: 'Sibling', label: 'Sibling' }, { value: 'Child', label: 'Child' }, { value: 'Friend', label: 'Friend' }, { value: 'Other', label: 'Other' }]} />
                  <Input label="Phone" value={form.nok_phone} onChange={v => setForm({ ...form, nok_phone: v })} placeholder="+44..." />
                  <Input label="Email" value={form.nok_email} onChange={v => setForm({ ...form, nok_email: v })} type="email" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <ReadField label="Name" value={tenant.nok_name} />
                  <ReadField label="Relationship" value={tenant.nok_relationship} />
                  <ReadField label="Phone" value={tenant.nok_phone} />
                  <ReadField label="Email" value={tenant.nok_email} />
                </div>
              )}
            </GlassCard>

            {/* Rent Payments */}
            <RentPayments tenantId={tenant.id} compact />

            {/* Documents */}
            <DocumentUpload entityType="tenant" entityId={tenant.id} />
          </div>

          {/* ==================== RIGHT COLUMN ==================== */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tenancy Details */}
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <SectionHeader title="Tenancy Details" icon={<Building2 size={16} />} />
                <SectionEditButton editing={isEditing('tenancy')} onEdit={() => setEditingSection('tenancy')} onSave={saveSection} onCancel={cancelSection} saving={saving} />
              </div>
              {isEditing('tenancy') ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input label="Start Date" value={form.tenancy_start_date} onChange={v => setForm({ ...form, tenancy_start_date: v })} type="date" />
                    <Select label="Tenancy Type" value={form.tenancy_type} onChange={v => setForm({ ...form, tenancy_type: v })}
                      options={[{ value: '', label: 'Select' }, { value: 'AST', label: 'AST' }, { value: 'HMO', label: 'HMO' }, { value: 'Rolling', label: 'Rolling' }, { value: 'Other', label: 'Other' }]} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input label="Monthly Rent (£)" value={form.monthly_rent} onChange={v => setForm({ ...form, monthly_rent: v })} placeholder="0.00" />
                    <Select label="Deposit Scheme" value={form.deposit_scheme} onChange={v => setForm({ ...form, deposit_scheme: v })}
                      options={[{ value: '', label: 'Select...' }, { value: 'tds', label: 'Tenancy Deposit Scheme' }, { value: 'gov_back', label: 'Gov Back Scheme' }, { value: 'paid_to_landlord', label: 'Paid to Landlord' }, { value: 'other', label: 'Other/TBF' }]} />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[var(--text-muted)]">Has End Date?</span>
                    <YesNo value={!!form.has_end_date} onChange={v => setForm({ ...form, has_end_date: v })} />
                  </div>
                  {form.has_end_date && (
                    <Input label="End Date" value={form.tenancy_end_date} onChange={v => setForm({ ...form, tenancy_end_date: v })} type="date" />
                  )}
                  <Select label="Status" value={form.status} onChange={v => setForm({ ...form, status: v })}
                    options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <ReadField label="Start Date" value={form.tenancy_start_date ? formatDateDMY(form.tenancy_start_date) : null} />
                    <ReadField label="Tenancy Type" value={form.tenancy_type} />
                    <ReadField label="Monthly Rent" value={form.monthly_rent ? `£${Number(form.monthly_rent).toLocaleString()}` : null} />
                    <ReadField label="Deposit Scheme" value={
                      form.deposit_scheme === 'tds' ? 'Tenancy Deposit Scheme' :
                        form.deposit_scheme === 'gov_back' ? 'Gov Back Scheme' :
                          form.deposit_scheme === 'paid_to_landlord' ? 'Paid to Landlord' :
                            form.deposit_scheme === 'other' ? 'Other/TBF' : null
                    } />
                  </div>
                  {form.has_end_date && (
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">End Date</p>
                      <p className={`text-sm mt-0.5 ${endDateWarning !== null ? 'text-red-400 font-medium' : ''}`}>
                        {form.tenancy_end_date ? formatDateDMY(form.tenancy_end_date) : '—'}
                        {endDateWarning !== null && endDateWarning > 0 && ` (${endDateWarning} days left)`}
                        {endDateWarning === 0 && ' (Expired)'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </GlassCard>

            {/* Onboarding Checklist */}
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <SectionHeader title="Onboarding Checklist" icon={<CheckCircle size={16} />} />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-muted)]">{completedCount}/{checklistItems.length}</span>
                  <CompletionRing percent={completionPercent} size={36} />
                  <SectionEditButton editing={isEditing('checklist')} onEdit={() => setEditingSection('checklist')} onSave={saveSection} onCancel={cancelSection} saving={saving} />
                </div>
              </div>

              <div className="space-y-2">
                {/* Authority to Contact */}
                <div className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs">Authority to Contact</span>
                  <YesNo value={!!form.authority_to_contact} onChange={v => setForm({ ...form, authority_to_contact: v })} disabled={!isEditing('checklist')} />
                </div>

                {/* KYC — Applicant 1 */}
                <div className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs">KYC — {form.first_name_1 || 'Applicant 1'} (Address + Personal ID)</span>
                  <YesNo value={!!form.kyc_completed_1} onChange={v => setForm({ ...form, kyc_completed_1: v })} disabled={!isEditing('checklist')} />
                </div>

                {/* KYC — Applicant 2 */}
                {form.is_joint_tenancy && (
                  <div className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                    <span className="text-xs">KYC — {form.first_name_2 || 'Applicant 2'} (Address + Personal ID)</span>
                    <YesNo value={!!form.kyc_completed_2} onChange={v => setForm({ ...form, kyc_completed_2: v })} disabled={!isEditing('checklist')} />
                  </div>
                )}

                {/* Application Forms */}
                <div className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs">Application Forms Completed</span>
                  <YesNo value={!!form.application_forms_completed} onChange={v => setForm({ ...form, application_forms_completed: v })} disabled={!isEditing('checklist')} />
                </div>

                {/* Proof of Income */}
                <div className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs">Proof of Income</span>
                    <span className={`text-[10px] font-medium ${form.proof_of_income ? 'text-green-400' : 'text-[var(--text-muted)]'}`}>
                      {form.proof_of_income ? 'Provided' : '—'}
                    </span>
                  </div>
                  {isEditing('checklist') && (
                    <div className="mt-2">
                      <Input label="" value={form.proof_of_income} onChange={v => setForm({ ...form, proof_of_income: v })} placeholder="e.g. £2,500/mo, Employed at ABC Ltd, Full-time" />
                    </div>
                  )}
                  {!isEditing('checklist') && form.proof_of_income && (
                    <p className="text-xs text-[var(--text-secondary)] mt-1">{form.proof_of_income}</p>
                  )}
                </div>

                {/* Holding Deposit */}
                <div className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs">Holding Deposit</span>
                    <YesNo value={!!form.holding_deposit_received} onChange={v => setForm({ ...form, holding_deposit_received: v })} disabled={!isEditing('checklist')} />
                  </div>
                  {form.holding_deposit_received && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {isEditing('checklist') ? (
                        <>
                          <Input label="Amount (£)" value={form.holding_deposit_amount} onChange={v => setForm({ ...form, holding_deposit_amount: v })} placeholder="0.00" />
                          <Input label="Date" value={form.holding_deposit_date} onChange={v => setForm({ ...form, holding_deposit_date: v })} type="date" />
                        </>
                      ) : (
                        <>
                          <ReadField label="Amount" value={form.holding_deposit_amount ? `£${form.holding_deposit_amount}` : null} />
                          <ReadField label="Date" value={form.holding_deposit_date ? formatDateDMY(form.holding_deposit_date) : null} />
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Guarantor */}
                <div className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs">Guarantor Required</span>
                    <YesNo value={!!form.guarantor_required} onChange={v => {
                      setForm({ ...form, guarantor_required: v });
                      if (v) setGuarantorExpanded(true);
                    }} disabled={!isEditing('checklist')} />
                  </div>
                  {form.guarantor_required && (
                    <div className="mt-2 space-y-2">
                      <button onClick={() => setGuarantorExpanded(!guarantorExpanded)}
                        className="flex items-center gap-1.5 text-[10px] text-[var(--accent-orange)] hover:underline">
                        <ChevronDown size={10} className={`transition-transform ${guarantorExpanded ? 'rotate-180' : ''}`} />
                        {guarantorExpanded ? 'Hide' : 'Show'} details
                      </button>
                      {guarantorExpanded && (
                        <div className="space-y-2 pl-2 border-l-2 border-[var(--accent-orange)]/30">
                          {isEditing('checklist') ? (
                            <div className="grid grid-cols-1 gap-2">
                              <Input label="Name" value={form.guarantor_name} onChange={v => setForm({ ...form, guarantor_name: v })} />
                              <Input label="Address" value={form.guarantor_address} onChange={v => setForm({ ...form, guarantor_address: v })} />
                              <Input label="Phone" value={form.guarantor_phone} onChange={v => setForm({ ...form, guarantor_phone: v })} />
                              <Input label="Email" value={form.guarantor_email} onChange={v => setForm({ ...form, guarantor_email: v })} type="email" />
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 gap-1.5">
                              <ReadField label="Name" value={form.guarantor_name} />
                              <ReadField label="Address" value={form.guarantor_address} />
                              <ReadField label="Phone" value={form.guarantor_phone} />
                              <ReadField label="Email" value={form.guarantor_email} />
                            </div>
                          )}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-[var(--text-muted)]">KYC Completed?</span>
                              <YesNo value={!!form.guarantor_kyc_completed} onChange={v => setForm({ ...form, guarantor_kyc_completed: v })} disabled={!isEditing('checklist')} />
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-[var(--text-muted)]">Deed of Guarantee?</span>
                              <YesNo value={!!form.guarantor_deed_received} onChange={v => setForm({ ...form, guarantor_deed_received: v })} disabled={!isEditing('checklist')} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </GlassCard>

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
                  {timeline.slice(0, 20).map(entry => {
                    let changes: Record<string, unknown> = {};
                    try { changes = JSON.parse(entry.changes || '{}'); } catch { }
                    const changedKeys = Object.keys(changes).filter(k => k !== 'id');
                    return (
                      <div key={entry.id} className="relative flex items-start gap-3 py-2">
                        <div className={`w-[26px] h-[26px] rounded-full flex items-center justify-center shrink-0 z-10 ${actionColor(entry.action)}`}>
                          {actionIcon(entry.action)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium capitalize">{entry.action}</span>
                            <span className="text-[10px] text-[var(--text-muted)]">{entry.entity_type}</span>
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
    </V3Layout>
  );
}
