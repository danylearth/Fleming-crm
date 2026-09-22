import TenantSmsComposer from '../components/TenantSmsComposer';
import { usePermissions } from '../hooks/usePermissions';
import DeleteNoteButton from '../components/DeleteNoteButton';
import AdditionalGuarantors, {type AdditionalGuarantor} from '../components/AdditionalGuarantors';
import {formatPropertyAddress} from '../utils/propertyAddress';
import { useRecordAddress } from '../hooks/useRecordAddress';
import ContextualDocSlot from '../components/ui/ContextualDocSlot';
import RentReviewModal from '../components/ui/RentReviewModal';
import CompletionModal from '../components/ui/CompletionModal';
import { tenantCompletion, type CompletionOverride } from '../utils/tenantCompletion';
import CommunicationsHistory from '../components/ui/CommunicationsHistory';
import TenancyEndModal from '../components/ui/TenancyEndModal';
import { useNotifications } from '../context/NotificationContext';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { GlassCard, Button, Input, Select, Avatar, StatusDot, SectionHeader, DatePicker } from '../components/ui';
import DocumentUpload from '../components/ui/DocumentUpload';
import RentPayments from '../components/ui/RentPayments';
import ActivityTimeline from '../components/ui/ActivityTimeline';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { Users,
  Pencil, Mail, Phone, Building2, Calendar, MessageSquare, Clock,
  AlertTriangle, ChevronRight, Plus, User, CheckCircle,
  ChevronDown, BadgePoundSterling, ShieldCheck, UsersRound
} from 'lucide-react';

// ==================== TYPES ====================
interface Tenant {
  completion_overrides?: Record<string, CompletionOverride>;
  id: number; name: string; email: string; phone: string;
  title_1?: string; first_name_1?: string; last_name_1?: string; date_of_birth_1?: string;
  current_address?: string; previous_address?: string; address_before_previous?: string;
  is_joint_tenancy?: number;
  title_2?: string; first_name_2?: string; last_name_2?: string;
  email_2?: string; phone_2?: string; date_of_birth_2?: string;
  nok_name?: string; nok_relationship?: string; nok_phone?: string; nok_email?: string; nok_address?: string;
  nok_2_name?: string; nok_2_relationship?: string; nok_2_phone?: string; nok_2_email?: string; nok_2_address?: string;
  kyc_completed_1?: number; kyc_completed_2?: number;
  kyc_primary_id?: number; kyc_secondary_id?: number;
  kyc_address_verification?: number; kyc_personal_verification?: number;
  rent_last_reviewed?: string; guarantor_authority_to_contact?: number;
  additional_guarantors?: AdditionalGuarantor[];
  guarantor_required?: number; guarantor_name?: string; guarantor_address?: string;
  guarantor_phone?: string; guarantor_email?: string;
  guarantor_date_of_birth?: string; guarantor_employment_status?: string; guarantor_employer?: string; guarantor_annual_income?: string; guarantor_primary_id?: number; guarantor_secondary_id?: number;
  guarantor_kyc_completed?: number; guarantor_deed_received?: number;
  holding_deposit_received?: number; holding_deposit_amount?: number; holding_deposit_date?: string;
  security_deposit_amount?: number;
  application_forms_completed?: number;
  authority_to_contact?: number; proof_of_income?: string; deposit_scheme?: string;
  income_amount?: string; income_employer?: string; income_contract_type?: string;
  income_frequency?: string;
  property_id: number; property_address: string;
  property_landlord_id?: number; property_landlord_name?: string;
  tenancy_start_date?: string; tenancy_type?: string;
  has_end_date?: number; tenancy_end_date?: string; monthly_rent?: number;
  move_in_date: string; status: string; notes: string;
  linked_tenant_id?: number; linked_tenant_name?: string;
}

interface TenantNote {
  id: string; text: string; author: string; created_at: string;
}

interface MaintenanceRequest {
  id: number; tenant_id?: number; title: string; description: string;
  priority: string; status: string; created_at: string;
}

interface TenantCommunication {
  id: number; channel: 'email' | 'sms'; recipient: string; sender?: string;
  subject?: string; body: string; status: string; error_message?: string;
  opened_at?: string; clicked_at?: string; created_at: string;
}

function parseNotes(raw?: string | null): TenantNote[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (Array.isArray(parsed)) return parsed;
  } catch { /* legacy plain-text note */ }
  return raw?.trim() ? [{ id: 'legacy', text: raw, author: 'System', created_at: new Date().toISOString() }] : [];
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
export default function TenantDetail() {
  const {canAccessFinance}=usePermissions();

  const navigate = useNavigate();
  const api = useApi();
  const { user } = useAuth();
  const { confirmAction, notify } = useNotifications();
  const [showEndModal, setShowEndModal] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [showRentReview, setShowRentReview] = useState(false);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const id = useRecordAddress('tenants', tenant?.name);
  const [loading, setLoading] = useState(true);
  const editingRef = useRef<string | null>(null);
  const requestedTenantId = useRef(Number(id));
  const loadedTenantId = useRef<number | null>(null);
  requestedTenantId.current = Number(id);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [form, setForm] = useState<Record<string, any>>({});

  // Notes
  const [notes, setNotes] = useState<TenantNote[]>([]);
  const [propertyNotes, setPropertyNotes] = useState<TenantNote[]>([]);
  const [notesFilter, setNotesFilter] = useState<'tenant' | 'property'>('tenant');
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Guarantor expand
  const [guarantorExpanded, setGuarantorExpanded] = useState(false);

  // Properties list for selector
  const [allProperties, setAllProperties] = useState<{ id: number; address: string; postcode: string }[]>([]);
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
  const [communications, setCommunications] = useState<TenantCommunication[]>([]);
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);
  const [sendingMaintenanceLink, setSendingMaintenanceLink] = useState<'email' | 'sms' | null>(null);
  const [maintenanceForm, setMaintenanceForm] = useState({ title: '', description: '', category: 'other', priority: 'medium' });

  editingRef.current = editingSection;

  const tenantToForm = (t: Tenant) => {
    return {
      name: t.name || '', email: t.email || '', phone: t.phone || '',
      title_1: t.title_1 || '', first_name_1: t.first_name_1 || '', last_name_1: t.last_name_1 || '',
      date_of_birth_1: t.date_of_birth_1 || '',
      current_address: t.current_address || '', previous_address: t.previous_address || '',
      address_before_previous: t.address_before_previous || '',
      is_joint_tenancy: !!t.is_joint_tenancy,
      title_2: t.title_2 || '', first_name_2: t.first_name_2 || '', last_name_2: t.last_name_2 || '',
      email_2: t.email_2 || '', phone_2: t.phone_2 || '', date_of_birth_2: t.date_of_birth_2 || '',
      nok_name: t.nok_name || '', nok_relationship: t.nok_relationship || '',
      nok_phone: t.nok_phone || '', nok_email: t.nok_email || '', nok_address: t.nok_address || '',
      nok_2_name: t.nok_2_name || '', nok_2_relationship: t.nok_2_relationship || '',
      nok_2_phone: t.nok_2_phone || '', nok_2_email: t.nok_2_email || '', nok_2_address: t.nok_2_address || '',
      kyc_completed_1: !!t.kyc_completed_1, kyc_completed_2: !!t.kyc_completed_2,
      guarantor_date_of_birth: (t.guarantor_date_of_birth || '').slice(0, 10), guarantor_employment_status: t.guarantor_employment_status || '',
      guarantor_employer: t.guarantor_employer || '', guarantor_annual_income: t.guarantor_annual_income || '',
      guarantor_primary_id: !!t.guarantor_primary_id, guarantor_secondary_id: !!t.guarantor_secondary_id,
      guarantor_required: !!t.guarantor_required,
      guarantor_authority_to_contact: !!t.guarantor_authority_to_contact,
      rent_last_reviewed: (t.rent_last_reviewed || '').slice(0,10),
      guarantor_name: t.guarantor_name || '', guarantor_address: t.guarantor_address || '',
      guarantor_phone: t.guarantor_phone || '', guarantor_email: t.guarantor_email || '',
      guarantor_kyc_completed: !!t.guarantor_kyc_completed, guarantor_deed_received: !!t.guarantor_deed_received,
      holding_deposit_received: !!t.holding_deposit_received,
      holding_deposit_amount: t.holding_deposit_amount || '', holding_deposit_date: t.holding_deposit_date || '',
      security_deposit_amount: t.security_deposit_amount || '',
      application_forms_completed: !!t.application_forms_completed,
      authority_to_contact: !!t.authority_to_contact,
      kyc_primary_id: !!t.kyc_primary_id, kyc_secondary_id: !!t.kyc_secondary_id,
      kyc_address_verification: !!t.kyc_address_verification, kyc_personal_verification: !!t.kyc_personal_verification,
      proof_of_income: t.proof_of_income || '',
      income_amount: t.income_amount || '', income_employer: t.income_employer || '', income_contract_type: t.income_contract_type || '',
      income_frequency: t.income_frequency || 'monthly',
      deposit_scheme: t.deposit_scheme || '',
      property_id: t.property_id, tenancy_start_date: (t.tenancy_start_date || t.move_in_date || '').slice(0, 10),
      tenancy_type: t.tenancy_type || 'Assured Periodic Tenancy', has_end_date: !!t.has_end_date, tenancy_end_date: (t.tenancy_end_date || '').slice(0, 10),
      monthly_rent: t.monthly_rent || '', status: t.status || 'active',
    };
  };

  const loadDetail = async () => {
    try {
      const t = await api.get(`/api/tenants/${id}`);
      if (Number(t.id) !== requestedTenantId.current) return;
      if (loadedTenantId.current !== Number(t.id)) {
        editingRef.current = null;
        setEditingSection(null);
        loadedTenantId.current = Number(t.id);
      }
      setTenant(t);
      if (!editingRef.current) setForm(tenantToForm(t));
      if (t.property_id) {
        const linkedProperty = await api.get(`/api/properties/${t.property_id}`).catch(() => null);
        setPropertyNotes(parseNotes(linkedProperty?.notes));
      } else {
        setPropertyNotes([]);
      }
      const maintenance = await api.get('/api/maintenance').catch(() => []);
      setMaintenanceRequests(Array.isArray(maintenance) ? maintenance.filter((request: MaintenanceRequest) => Number(request.tenant_id) === Number(t.id)) : []);
      const communicationRows = await api.get(`/api/tenants/${t.id}/communications`).catch(() => []);
      setCommunications(Array.isArray(communicationRows) ? communicationRows : []);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'Failed to load tenant');
    }
  };

  useEffect(() => {
    (async () => {
      try { setAllProperties(await api.get('/api/properties')); } catch { /* Silently ignore */ }
    })();
  }, [api]);

  // Load tenant
  useEffect(() => {
    (async () => {
      await loadDetail();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, id]);

  // Load notes
  useEffect(() => {
    setNotes(parseNotes(tenant?.notes));
  }, [tenant?.notes]);

  const addMaintenance = async () => {
    if (!tenant?.property_id || !maintenanceForm.title.trim() || !maintenanceForm.description.trim()) return;
    await api.post('/api/maintenance', {
      ...maintenanceForm,
      property_id: tenant.property_id,
      tenant_id: tenant.id,
      landlord_id: tenant.property_landlord_id || null,
      reporter_type: 'agent',
      reporter_name: user?.name || user?.email,
    });
    setMaintenanceForm({ title: '', description: '', category: 'other', priority: 'medium' });
    setShowMaintenanceForm(false);
    await loadDetail();
  };

  const sendMaintenanceLink = async (channel: 'email' | 'sms') => {
    if (!tenant) return;
    if (!await confirmAction(`Send the maintenance reporting link to ${tenant.name} by ${channel === 'email' ? 'email' : 'SMS'}?`, 'Confirm Reporting Link')) return;
    setSendingMaintenanceLink(channel);
    try {
      await api.post(`/api/tenants/${tenant.id}/maintenance-report-link`, { channel });
      alert(`Maintenance reporting link sent by ${channel}.`);
      await loadDetail();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Maintenance reporting link could not be sent');
    }
    setSendingMaintenanceLink(null);
  };

  const checklistItems = tenantCompletion(form, tenant?.linked_tenant_id, tenant?.completion_overrides);
  const hasInlineJointApplicant = Boolean(form.is_joint_tenancy && !tenant?.linked_tenant_id && (form.first_name_2 || form.last_name_2 || form.email_2));
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        kyc_primary_id: form.kyc_primary_id ? 1 : 0,
        kyc_secondary_id: form.kyc_secondary_id ? 1 : 0,
        kyc_address_verification: form.kyc_address_verification ? 1 : 0,
        kyc_personal_verification: form.kyc_personal_verification ? 1 : 0,
        has_end_date: form.has_end_date ? 1 : 0,
        notes: JSON.stringify(notes),
      };
      await api.put(`/api/tenants/${id}`, payload);
      const t = await api.get(`/api/tenants/${id}`);
      setTenant(t);
      setForm(tenantToForm(t));
      setEditingSection(null);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'Failed to save tenant');
    }
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
    const noteText = newNote.trim();
    const note: TenantNote = { id: Date.now().toString(), text: noteText, author: user?.email || 'Unknown', created_at: new Date().toISOString() };
    const updated = [...notes, note];
    setNewNote('');
    try {
      if (notesFilter === 'property' && tenant?.property_id) {
        const updatedPropertyNotes = [...propertyNotes, note];
        await api.put(`/api/properties/${tenant.property_id}`, { notes: JSON.stringify(updatedPropertyNotes) });
        api.post('/api/activity', { action: 'note_added', entity_type: 'property', entity_id: tenant.property_id, changes: { text: noteText } }).catch(() => {});
      } else {
        await api.patch(`/api/tenants/${id}/notes`, { notes: JSON.stringify(updated) });
        api.post('/api/activity', { action: 'note_added', entity_type: 'tenant', entity_id: Number(id), changes: { text: noteText } }).catch(() => {});
      }
      // Reload the data to show the new note
      await loadDetail();
    } catch (e) { console.error(e); }
    setAddingNote(false);
  };

  if (loading) return <Layout title="Loading..."><div className="p-8 text-[var(--text-muted)] text-sm">Loading...</div></Layout>;
  if (!tenant) return <Layout title="Not Found"><div className="p-8 text-[var(--text-muted)]">Tenant not found</div></Layout>;

  const displayName = form.first_name_1 && form.last_name_1 ? `${form.first_name_1} ${form.last_name_1}` : tenant.name;
  const isEditing = (section: string) => editingSection === section;
  const displayedNotes = notesFilter === 'tenant' ? notes : propertyNotes;

  return (
    <Layout breadcrumb={[{ label: 'Tenants', to: '/tenants' }, { label: displayName }]}>
      <div className="p-4 md:p-8 space-y-6 md:space-y-8">
        {/* ==================== HEADER ==================== */}
        <GlassCard className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
            <Avatar name={displayName} size="xl" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{displayName}</h1>
                <StatusDot status={form.status === 'scheduled' ? 'warning' : (form.status || 'active') === 'active' ? 'active' : 'inactive'} size="md" />
                <span className="text-xs text-[var(--text-muted)] capitalize">{form.status || 'active'}</span>
                {isOnboarded && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg px-2 py-0.5">
                    <ShieldCheck size={12} /> Onboarded
                  </span>
                )}
                {!!tenant.is_joint_tenancy && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium bg-violet-500/10 text-violet-300 border border-violet-500/20 rounded-lg px-2 py-0.5">
                    <UsersRound size={12} /> Joint tenancy
                  </span>
                )}
              </div>
              {tenant.property_id ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <button onClick={() => navigate(`/properties/${tenant.property_id}`)}
                    className="flex items-center gap-2 mt-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors group">
                    <div className="w-7 h-7 rounded-lg bg-[var(--bg-hover)] flex items-center justify-center group-hover:bg-[var(--accent-orange)]/20 transition-colors">
                      <Building2 size={14} className="text-[var(--text-muted)] group-hover:text-[var(--accent-orange)] transition-colors" />
                    </div>
                    <span>{formatPropertyAddress(tenant.property_address || `Property #${tenant.property_id}`, allProperties.find(p => p.id === tenant.property_id)?.postcode)}</span>
                    <ChevronRight size={14} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                  {tenant.property_landlord_id && (
                    <button onClick={() => navigate(`/landlords/${tenant.property_landlord_id}`)}
                      className="flex items-center gap-2 mt-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors group">
                      <div className="w-7 h-7 rounded-lg bg-[var(--bg-hover)] flex items-center justify-center group-hover:bg-[var(--accent-orange)]/20 transition-colors">
                        <User size={14} className="text-[var(--text-muted)] group-hover:text-[var(--accent-orange)] transition-colors" />
                      </div>
                      <span>{tenant.property_landlord_name || `Landlord #${tenant.property_landlord_id}`}</span>
                      <ChevronRight size={14} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}
                  {tenant.linked_tenant_id && (
                    <button onClick={() => navigate(`/tenants/${tenant.linked_tenant_id}`)}
                      className="flex items-center gap-2 mt-2 text-sm text-violet-300 hover:text-violet-200 transition-colors group">
                      <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center"><UsersRound size={14} /></div>
                      <span>Joint tenant: {tenant.linked_tenant_name || `Tenant #${tenant.linked_tenant_id}`}</span>
                      <ChevronRight size={14} />
                    </button>
                  )}
                </div>
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
              {!form.nok_name && !form.nok_phone && (
                <div className="flex items-center gap-2 mt-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 w-fit">
                  <AlertTriangle size={14} className="text-amber-400" />
                  <span className="text-xs text-amber-400 font-medium">Next of kin details missing</span>
                </div>
              )}
            </div>
            <button onClick={() => setShowCompletion(true)} aria-label={`Open completion checklist, ${completionPercent}% complete`} className="rounded-full focus-visible:outline-2 focus-visible:outline-orange-400"><CompletionRing percent={completionPercent} /></button>
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
                    <DatePicker label="Date of Birth" value={form.date_of_birth_1} onChange={v => setForm({ ...form, date_of_birth_1: v })} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input label="Current Address" value={form.current_address} onChange={v => setForm({ ...form, current_address: v })} />
                    <Input label="Previous Address" value={form.previous_address} onChange={v => setForm({ ...form, previous_address: v })} />
                    <Input label="Address Before Previous" value={form.address_before_previous} onChange={v => setForm({ ...form, address_before_previous: v })} />
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <label className="text-xs text-[var(--text-muted)]">Joint Tenancy?</label>
                    <YesNo value={form.is_joint_tenancy} onChange={v => setForm({ ...form, is_joint_tenancy: v })} />
                  </div>
                  {hasInlineJointApplicant && (
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
                        <DatePicker label="Date of Birth" value={form.date_of_birth_2} onChange={v => setForm({ ...form, date_of_birth_2: v })} />
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
                  <div className="h-px bg-[var(--border-subtle)] my-2" />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <ReadField label="Current Address" value={tenant.current_address} />
                    <ReadField label="Previous Address" value={tenant.previous_address} />
                    <ReadField label="Address Before Previous" value={tenant.address_before_previous} />
                  </div>
                  {hasInlineJointApplicant && (
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
                <SectionHeader title="Next of Kin" icon={<Users size={16} />} />
                <SectionEditButton editing={isEditing('nok')} onEdit={() => setEditingSection('nok')} onSave={saveSection} onCancel={cancelSection} saving={saving} />
              </div>
              {isEditing('nok') ? (
                <div className="space-y-4">
                  <div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Input label="Name" value={form.nok_name} onChange={v => setForm({ ...form, nok_name: v })} />
                      <Input label="Relationship" value={form.nok_relationship} onChange={v => setForm({ ...form, nok_relationship: v })} />
                      <Input label="Phone" value={form.nok_phone} onChange={v => setForm({ ...form, nok_phone: v })} />
                      <Input label="Email" value={form.nok_email} onChange={v => setForm({ ...form, nok_email: v })} type="email" />
                      <Input label="Address" value={form.nok_address} onChange={v => setForm({ ...form, nok_address: v })} />
                    </div>
                  </div>
                  <div className="h-px bg-[var(--border-subtle)]" />
                  <div>
                    <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-2">Contact 2</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Input label="Name" value={form.nok_2_name} onChange={v => setForm({ ...form, nok_2_name: v })} />
                      <Input label="Relationship" value={form.nok_2_relationship} onChange={v => setForm({ ...form, nok_2_relationship: v })} />
                      <Input label="Phone" value={form.nok_2_phone} onChange={v => setForm({ ...form, nok_2_phone: v })} />
                      <Input label="Email" value={form.nok_2_email} onChange={v => setForm({ ...form, nok_2_email: v })} type="email" />
                      <Input label="Address" value={form.nok_2_address} onChange={v => setForm({ ...form, nok_2_address: v })} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {form.nok_name || form.nok_phone ? (
                    <div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <ReadField label="Name" value={form.nok_name} />
                        <ReadField label="Relationship" value={form.nok_relationship} />
                        <ReadField label="Phone" value={form.nok_phone} />
                        <ReadField label="Email" value={form.nok_email} />
                        <ReadField label="Address" value={form.nok_address} />
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--text-muted)]">No next of kin details recorded</p>
                  )}
                  {(form.nok_2_name || form.nok_2_phone) && (
                    <div>
                      <div className="h-px bg-[var(--border-subtle)] mb-3" />
                      <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-2">Contact 2</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <ReadField label="Name" value={form.nok_2_name} />
                        <ReadField label="Relationship" value={form.nok_2_relationship} />
                        <ReadField label="Phone" value={form.nok_2_phone} />
                        <ReadField label="Email" value={form.nok_2_email} />
                        <ReadField label="Address" value={form.nok_2_address} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </GlassCard>

            {/* Rent Payments */}
            {canAccessFinance() && <RentPayments tenantId={tenant.id} compact />}

            {/* Maintenance linked to this tenant */}
            <GlassCard className="p-6">
              <SectionHeader title={`Maintenance (${maintenanceRequests.length})`} icon={<AlertTriangle size={16} />}
                action={tenant.property_id ? () => setShowMaintenanceForm(value => !value) : undefined}
                actionLabel={showMaintenanceForm ? 'Cancel' : 'Add Request'} />
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={!tenant.email || sendingMaintenanceLink !== null} onClick={() => sendMaintenanceLink('email')}>
                  <Mail size={13} className="mr-1.5" /> {sendingMaintenanceLink === 'email' ? 'Sending…' : 'Email Reporting Link'}
                </Button>
                <Button variant="outline" size="sm" disabled={!tenant.phone || sendingMaintenanceLink !== null} onClick={() => sendMaintenanceLink('sms')}>
                  <MessageSquare size={13} className="mr-1.5" /> {sendingMaintenanceLink === 'sms' ? 'Sending…' : 'SMS Reporting Link'}
                </Button>
              </div>
              {showMaintenanceForm && (
                <div className="mt-4 space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3">
                  <Input label="Issue" value={maintenanceForm.title} onChange={title => setMaintenanceForm(current => ({ ...current, title }))} placeholder="e.g. Lost key" />
                  <textarea value={maintenanceForm.description} onChange={event => setMaintenanceForm(current => ({ ...current, description: event.target.value }))}
                    placeholder="Describe the maintenance request" rows={3}
                    className="w-full rounded-xl border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-orange)]" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Select label="Category" value={maintenanceForm.category} onChange={category => setMaintenanceForm(current => ({ ...current, category }))}
                      options={[{ value: 'plumbing', label: 'Plumbing' }, { value: 'electrical', label: 'Electrical' }, { value: 'heating', label: 'Heating' }, { value: 'structural', label: 'Structural' }, { value: 'appliance', label: 'Appliance' }, { value: 'pest', label: 'Pest Control' }, { value: 'garden', label: 'Garden' }, { value: 'other', label: 'Other / Request' }]} />
                    <Select label="Priority" value={maintenanceForm.priority} onChange={priority => setMaintenanceForm(current => ({ ...current, priority }))}
                      options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }]} />
                  </div>
                  <Button variant="gradient" size="sm" disabled={!maintenanceForm.title.trim() || !maintenanceForm.description.trim()} onClick={() => addMaintenance().catch(error => alert(error.message))}>Create Request</Button>
                </div>
              )}
              <div className="mt-4 space-y-2">
                {maintenanceRequests.length === 0 && <p className="text-xs text-[var(--text-muted)]">No maintenance requests linked to this tenant.</p>}
                {maintenanceRequests.map(request => (
                  <button key={request.id} onClick={() => navigate(`/maintenance/${request.id}`)} className="w-full text-left rounded-xl bg-[var(--bg-hover)]/50 p-3 hover:bg-[var(--bg-hover)] transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">{request.title}</p>
                      <span className="text-[10px] uppercase text-[var(--accent-orange)]">{request.status.replace(/_/g, ' ')}</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-muted)] line-clamp-2">{request.description}</p>
                    <p className="mt-1 text-[10px] text-[var(--text-muted)]">{request.priority} priority · {formatDateDMY(request.created_at)}</p>
                  </button>
                ))}
              </div>
            </GlassCard>

            {!!tenant.guarantor_required && <GlassCard className="p-6">
              <div className="flex justify-between items-center mb-4"><SectionHeader title="Primary Guarantor" icon={<BadgePoundSterling size={16} />} /><SectionEditButton editing={isEditing('guarantor')} onEdit={() => setEditingSection('guarantor')} onSave={saveSection} onCancel={cancelSection} saving={saving} /></div>
              {isEditing('guarantor') ? <div className="space-y-3">
                <label className="flex gap-2 text-sm"><input type="checkbox" checked={!!form.guarantor_required} onChange={e => setForm({ ...form, guarantor_required: e.target.checked })} />Guarantor required</label>
                {(['guarantor_name', 'guarantor_address', 'guarantor_email', 'guarantor_phone', 'guarantor_employment_status', 'guarantor_employer', 'guarantor_annual_income'] as const).map(key => <Input key={key} label={key.replace('guarantor_', '').split('_').map(word => word.charAt(0).toUpperCase()+word.slice(1)).join(' ')} value={String(form[key] || '')} type={key.includes('email') ? 'email' : key.includes('income') ? 'currency' : 'text'} onChange={v => setForm({ ...form, [key]: v })} />)}
                <DatePicker label="Date of Birth" value={form.guarantor_date_of_birth} onChange={v => setForm({ ...form, guarantor_date_of_birth: v })} />

              </div> : <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ReadField label="Guarantor required" value={tenant.guarantor_required ? 'Yes' : 'Not recorded'} /><ReadField label="Name" value={tenant.guarantor_name} />
                <ReadField label="Address" value={tenant.guarantor_address} /><ReadField label="Email" value={tenant.guarantor_email} /><ReadField label="Contact number" value={tenant.guarantor_phone} />
                <ReadField label="Date of Birth" value={tenant.guarantor_date_of_birth ? formatDateDMY(tenant.guarantor_date_of_birth) : null} /><ReadField label="Employment" value={tenant.guarantor_employment_status} /><ReadField label="Employer" value={tenant.guarantor_employer} /><ReadField label="Annual income" value={tenant.guarantor_annual_income ? `£${Number(tenant.guarantor_annual_income).toLocaleString()}` : null} />

              </div>}
              <div className="mt-4"><p className="text-xs font-medium mb-2">Authority to Contact</p><YesNo value={form.guarantor_authority_to_contact} onChange={v => setForm({ ...form, guarantor_authority_to_contact: v })} disabled={!isEditing('guarantor')} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4"><ContextualDocSlot entityType="tenant" entityId={tenant.id} docType="guarantor_primary_id" label="Primary ID" /><ContextualDocSlot entityType="tenant" entityId={tenant.id} docType="guarantor_secondary_id" label="Secondary ID" /></div>
              <AdditionalGuarantors key={tenant.id} tenantId={tenant.id} records={tenant.additional_guarantors||[]} onSaved={loadDetail} />
            </GlassCard>}

            {/* Documents */}
            <DocumentUpload entityType="tenant" entityId={tenant.id} group="tenant" />
            <DocumentUpload entityType="tenant" entityId={tenant.id} group="guarantor" title="Guarantor(s) Documentation" />
          </div>

          {/* ==================== RIGHT COLUMN ==================== */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tenancy Details */}
            <GlassCard className="p-6">
              <div className="flex flex-col items-start gap-3 mb-4">
                <SectionHeader title="Tenancy Details" icon={<Building2 size={16} />} />
                {isEditing('tenancy') ? (
                  <SectionEditButton editing onEdit={() => setEditingSection('tenancy')} onSave={saveSection} onCancel={cancelSection} saving={saving} />
                ) : (
                  <div className="flex flex-wrap justify-end gap-2">
                    {tenant.status==='inactive'&&<Button size="sm" disabled={saving} onClick={async()=>{if(!await confirmAction('Create a fresh enquiry for this returning tenant? Their previous tenancy history will be retained.','Reactivate Tenant'))return;setSaving(true);try{const result=await api.post(`/api/tenants/${tenant.id}/reactivate`,{});navigate(`/enquiries/${result.enquiry_id}`);}catch(e){notify(e instanceof Error?e.message:'Could not reactivate tenant','error');}finally{setSaving(false);}}}>Reactivate to Enquiry</Button>}
                    <Button variant="outline" className="!bg-yellow-400 !text-yellow-950 !border-yellow-400" size="sm" onClick={() => setEditingSection('tenancy')}>Update Tenancy</Button>
                    {tenant.status !== 'inactive' && <Button variant="outline" className="!bg-red-600 !text-white !border-red-600" size="sm" onClick={() => setShowEndModal(true)}>Schedule Tenancy End</Button>}
                    <Button variant="outline" className="!bg-emerald-600 !text-white !border-emerald-600" size="sm" onClick={() => setShowRentReview(true)}>£ Rent Review</Button>
                    {user?.role === 'admin' && <Button variant="outline" size="sm" className="!bg-red-600 !text-white !border-red-600" onClick={async () => {
                      if (!await confirmAction(`Remove ${tenant.name}? Records with issued agreements will be archived; otherwise the record and its linked files will be permanently deleted.`, 'Delete / Archive Tenant')) return;
                      try { const result = await api.post(`/api/tenants/${tenant.id}/remove`, {}); if (result.archived) { await loadDetail(); notify('Tenant archived; history retained','success'); } else navigate('/tenants'); }
                      catch (e) { notify(e instanceof Error ? e.message : 'Could not remove tenant','error'); }
                    }}>Delete / Archive</Button>}

                  </div>
                )}
              </div>
              {isEditing('tenancy') ? (
                <div className="space-y-3">
                  <Select label="Property" value={form.property_id || ''} onChange={v => setForm({ ...form, property_id: v ? Number(v) : null })}
                    options={[{ value: '', label: 'No property linked' }, ...allProperties.map((p) => ({ value: String(p.id), label: `${p.address}, ${p.postcode}` }))]} />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <DatePicker label="Last Rent Reviewed" value={form.rent_last_reviewed} onChange={v => setForm({ ...form, rent_last_reviewed: v })} />
                    <Select label="Guarantor Required" value={form.guarantor_required ? "yes" : "no"} onChange={v => setForm({ ...form, guarantor_required: v === "yes" })} options={[{value:"no",label:"No guarantor required"},{value:"yes",label:"Yes — guarantor required"}]} />
                    <DatePicker label="Tenancy Start Date" value={form.tenancy_start_date} onChange={v => setForm({ ...form, tenancy_start_date: v })} />
                    <Select label="Tenancy Type" value={form.tenancy_type} onChange={v => setForm({
                      ...form,
                      tenancy_type: v,
                    })}
                      options={[
                        { value: '', label: 'Select...' },
                        ...(!['', 'Fixed Term', 'Assured Periodic Tenancy'].includes(form.tenancy_type) ? [{ value: form.tenancy_type, label: `${form.tenancy_type} (legacy)` }] : []),
                        { value: 'Fixed Term', label: 'Fixed Term' },
                        { value: 'Assured Periodic Tenancy', label: 'Assured Periodic Tenancy' },
                      ]} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input label="Monthly Rent (£)" value={form.monthly_rent} onChange={v => setForm({ ...form, monthly_rent: v })} placeholder="0.00" />
                    <Input label="Deposit Held (£)" value={form.security_deposit_amount} onChange={v => setForm({ ...form, security_deposit_amount: v })} placeholder="0.00" />
                    <Select label="Deposit Scheme" value={form.deposit_scheme} onChange={v => setForm({ ...form, deposit_scheme: v })}
                      options={[{ value: '', label: 'Select...' }, { value: 'tds', label: 'Tenancy Deposit Scheme' }, { value: 'gov_back', label: 'Gov Back Scheme' }, { value: 'paid_to_landlord', label: 'Paid to Landlord' }, { value: 'other', label: 'Other/TBF' }]} />
                  </div>
                  <Select label="Status" value={form.status} onChange={v => setForm({ ...form, status: v })}
                    options={[{ value: 'active', label: 'Active' }, { value: 'scheduled', label: 'Scheduled' }, { value: 'inactive', label: 'Archived' }]} />
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-subtle)]">
                  {tenant?.property_id ? (
                    <div className="pb-3">
                      <p className="text-xs text-[var(--text-muted)]">Property</p>
                      <button onClick={() => navigate(`/properties/${tenant.property_id}`)}
                        className="text-sm mt-0.5 text-[var(--accent-orange)] hover:underline flex items-center gap-1">
                        <Building2 size={13} /> {formatPropertyAddress(tenant.property_address || `Property #${tenant.property_id}`, allProperties.find(p => p.id === tenant.property_id)?.postcode)}
                      </button>
                    </div>
                  ) : (
                    <ReadField label="Property" value="No property linked" />
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3">
                    <ReadField label="Tenancy Start" value={form.tenancy_start_date ? formatDateDMY(form.tenancy_start_date) : null} />
                    <ReadField label={form.tenancy_end_date && form.tenancy_end_date.slice(0,10) < new Date().toLocaleDateString('en-CA') ? 'End date' : 'Scheduled end date'} value={form.tenancy_end_date ? formatDateDMY(form.tenancy_end_date) : 'Not scheduled'} />
                    <ReadField label="Last Rent Reviewed" value={tenant.rent_last_reviewed ? formatDateDMY(tenant.rent_last_reviewed) : null} />
                    <ReadField label="Tenancy Type" value={form.tenancy_type} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-3">
                    <ReadField label="Monthly Rent" value={form.monthly_rent ? `£${Number(form.monthly_rent).toLocaleString()}` : null} />
                    <ReadField label="Deposit Held" value={form.security_deposit_amount ? `£${Number(form.security_deposit_amount).toLocaleString()}` : null} />
                    <ReadField label="Deposit Scheme" value={
                      form.deposit_scheme === 'tds' ? 'Tenancy Deposit Scheme' :
                        form.deposit_scheme === 'gov_back' ? 'Gov Back Scheme' :
                          form.deposit_scheme === 'paid_to_landlord' ? 'Paid to Landlord' :
                            form.deposit_scheme === 'other' ? 'Other/TBF' : null
                    } />
                  </div>

                </div>
              )}
            </GlassCard>

            {/* Onboarding Checklist */}
            {form.status === 'onboarding' && !isOnboarded && <GlassCard className="p-6">
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

                {/* KYC Breakdown */}
                <div className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs">Primary ID</span>
                  <YesNo value={!!form.kyc_primary_id} onChange={v => setForm({ ...form, kyc_primary_id: v })} disabled={!isEditing('checklist')} />
                </div>
                <div className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs">Secondary ID</span>
                  <YesNo value={!!form.kyc_secondary_id} onChange={v => setForm({ ...form, kyc_secondary_id: v })} disabled={!isEditing('checklist')} />
                </div>
                <div className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs">Address Verification</span>
                  <YesNo value={!!form.kyc_address_verification} onChange={v => setForm({ ...form, kyc_address_verification: v })} disabled={!isEditing('checklist')} />
                </div>
                {/* KYC — Applicant 2 */}
                {hasInlineJointApplicant && (
                  <div className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                    <span className="text-xs">KYC — {form.first_name_2 || 'Applicant 2'}</span>
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
                    <span className={`text-[10px] font-medium ${(form.income_amount || form.proof_of_income) ? 'text-green-400' : 'text-[var(--text-muted)]'}`}>
                      {(form.income_amount || form.proof_of_income) ? 'Provided' : '—'}
                    </span>
                  </div>
                  {isEditing('checklist') && (
                    <div className="mt-2 grid grid-cols-1 gap-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Input label="Income Amount (£)" value={form.income_amount || ''} onChange={v => setForm({ ...form, income_amount: v })} placeholder="e.g. 2500" />
                        <Select label="Frequency" value={form.income_frequency || 'monthly'} onChange={v => setForm({ ...form, income_frequency: v })}
                          options={[{ value: 'monthly', label: 'Monthly' }, { value: 'annual', label: 'Annually' }]} />
                      </div>
                      <Input label="Employer" value={form.income_employer || ''} onChange={v => setForm({ ...form, income_employer: v })} placeholder="e.g. ABC Ltd" />
                      <Select label="Contract Type" value={form.income_contract_type || ''} onChange={v => setForm({ ...form, income_contract_type: v })}
                        options={[{ value: '', label: 'Select' }, { value: 'Full-time', label: 'Full-time' }, { value: 'Part-time', label: 'Part-time' }, { value: 'Contract', label: 'Contract' }, { value: 'Self-employed', label: 'Self-employed' }, { value: 'Other', label: 'Other' }]} />
                    </div>
                  )}
                  {!isEditing('checklist') && (form.income_amount || form.income_employer) && (
                    <div className="mt-1 text-xs text-[var(--text-secondary)] space-y-0.5">
                      {form.income_amount && <p>£{Number(form.income_amount).toLocaleString()}/{form.income_frequency === 'annual' ? 'yr' : 'mo'}</p>}
                      {form.income_employer && <p>{form.income_employer}{form.income_contract_type ? ` · ${form.income_contract_type}` : ''}</p>}
                    </div>
                  )}
                </div>

                {/* Holding Deposit */}
                <div className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs">Holding Deposit</span>
                    <YesNo value={!!form.holding_deposit_received} onChange={v => setForm({ ...form, holding_deposit_received: v })} disabled={!isEditing('checklist')} />
                  </div>
                  {form.holding_deposit_received && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      {isEditing('checklist') ? (
                        <>
                          <Input label="Amount (£)" value={form.holding_deposit_amount} onChange={v => setForm({ ...form, holding_deposit_amount: v })} placeholder="0.00" />
                          <DatePicker label="Date" value={form.holding_deposit_date} onChange={v => setForm({ ...form, holding_deposit_date: v })} />
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
            </GlassCard>}

            {/* Notes */}
            <GlassCard className="p-6">
              <SectionHeader title="Notes" icon={<MessageSquare size={16} />} />
              <div className="flex flex-wrap gap-2 mb-4">
                <button onClick={() => setNotesFilter('tenant')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${notesFilter === 'tenant' ? 'bg-[var(--text-primary)] text-[var(--bg-page)]' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'}`}>
                  Tenant ({notes.length})
                </button>
                {tenant.property_id && <button onClick={() => setNotesFilter('property')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${notesFilter === 'property' ? 'bg-[var(--text-primary)] text-[var(--bg-page)]' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'}`}>
                  Property ({propertyNotes.length})
                </button>}
              </div>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {displayedNotes.length === 0 && <p className="text-xs text-[var(--text-muted)]">No notes yet</p>}
                {displayedNotes.map(note => (
                  <div key={note.id} className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5">
                    <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{note.text}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] text-[var(--text-muted)]">{note.author}</span>
                      <TimeAgo date={note.created_at} /><DeleteNoteButton entity={notesFilter} id={notesFilter==='property'?tenant.property_id!:tenant.id} note={note} onDeleted={loadDetail} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="relative mt-3">
                <textarea rows={2} value={newNote} onChange={e => { setNewNote(e.target.value); e.currentTarget.style.height="auto"; e.currentTarget.style.height=`${e.currentTarget.scrollHeight}px`; }}
                  aria-label="Add a note"
                  placeholder={`Add a note to ${notesFilter}...`}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl pl-3 pr-20 pt-3 pb-10 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-orange)]/50 transition-colors" />
                <Button variant="gradient" size="sm" className="absolute right-2 bottom-2" onClick={addNote} disabled={addingNote || !newNote.trim()}>
                  <Plus size={14} />
                </Button>
              </div>
            </GlassCard>

            <TenantSmsComposer tenantId={tenant.id} phone={tenant.phone} onSent={loadDetail}/>
            <CommunicationsHistory messages={communications} tenantId={Number(id)} onSent={()=>window.location.reload()} />

            {/* Activity Timeline */}
            <GlassCard className="p-6">
              <SectionHeader title="Activity Timeline" icon={<Clock size={16} />} />
              <ActivityTimeline entityType="tenant" entityId={Number(id)} />
            </GlassCard>
          </div>
        </div>
      </div>
      {showEndModal && <TenancyEndModal tenantId={tenant.id} linkedName={tenant.linked_tenant_name} initialDate={tenant.tenancy_end_date} onClose={() => setShowEndModal(false)} onSaved={loadDetail} />}
      {showCompletion && <CompletionModal tenantId={tenant.id} items={checklistItems} canEdit={['admin','manager','staff'].includes(user?.role || '')} onClose={() => setShowCompletion(false)} onSaved={loadDetail} />}
      {showRentReview && <RentReviewModal tenantId={tenant.id} currentRent={tenant.monthly_rent} linkedName={tenant.linked_tenant_name} canEdit={['admin','manager','staff'].includes(user?.role || '') && tenant.status !== 'inactive'} onClose={() => setShowRentReview(false)} onSaved={loadDetail} />}
    </Layout>
  );
}
