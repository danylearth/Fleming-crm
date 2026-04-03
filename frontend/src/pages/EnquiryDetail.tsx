import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { GlassCard, Button, Avatar, Input, Select, EmptyState, DatePicker, StatusDot, SectionHeader } from '../components/v3';
import DocumentUpload from '../components/v3/DocumentUpload';
import ActivityTimeline from '../components/v3/ActivityTimeline';
import AddressAutocomplete from '../components/v3/AddressAutocomplete';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import {
  Save, Pencil, X, User, Users, Briefcase, Home, Building2, ArrowRight, XCircle,
  Calendar, ExternalLink, CheckCircle, Clock, Mail, Phone, ChevronRight,
  ChevronDown, MessageSquare, Plus, ShieldCheck, AlertTriangle, Send
} from 'lucide-react';
import { BookingIcon, AwaitingIcon, OnboardingIcon, ConvertedIcon } from '../components/v3/icons/FlemingIcons';
import OnboardingWizard from '../components/v3/OnboardingWizard';
import EmailPreviewModal from '../components/v3/EmailPreviewModal';

// ==================== CONSTANTS ====================
const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500/20 text-blue-400',
  viewing_booked: 'bg-purple-500/20 text-purple-400',
  awaiting_response: 'bg-amber-500/20 text-amber-400',
  onboarding: 'bg-green-500/20 text-green-400',
  converted: 'bg-emerald-500/20 text-emerald-400',
  rejected: 'bg-red-500/20 text-red-400',
};
const STATUS_LABELS: Record<string, string> = {
  new: 'New', viewing_booked: 'Viewing Booked', awaiting_response: 'Follow Up',
  onboarding: 'Onboarding', converted: 'Converted', rejected: 'Rejected',
};

const RENTING_REQUIREMENT_OPTIONS = [
  'Pet-Friendly', 'Parking', 'Garden', 'Furnished', 'Unfurnished',
  'Close to Transport', 'Short-term Let', 'Long-term Let', 'Ground Floor',
  'Disabled Access', 'Bills Included', 'No Stairs',
];

const EMPLOYMENT_OPTIONS = [
  { value: '', label: '-' }, { value: 'Employed', label: 'Employed' }, { value: 'Self-Employed', label: 'Self-Employed' },
  { value: 'Unemployed', label: 'Unemployed' }, { value: 'Student', label: 'Student' }, { value: 'Retired', label: 'Retired' },
];

// ==================== EMAIL TEMPLATES ====================
function buildHoldingDepositEmailHtml(
  name: string, address: string, monthlyRent: number, securityDeposit: number, holdingDeposit: number
): string {
  return `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <div style="background: linear-gradient(135deg, #25073B, #DC006D); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 22px;">Fleming Lettings</h1>
      <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 13px;">Holding Deposit Request</p>
    </div>
    <div style="background: #fff; padding: 32px; border: 1px solid #eee; border-top: none;">
      <p style="font-size: 15px; color: #333;">Dear ${name},</p>
      <p style="font-size: 14px; color: #555; line-height: 1.6;">
        Thank you for your interest in <strong>${address}</strong>. We are pleased to confirm that we would like to proceed with your application.
      </p>
      <p style="font-size: 14px; color: #555; line-height: 1.6;">
        To secure this property, we require an initial holding deposit. Please see the financial summary below:
      </p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr style="background: #f8f8f8;">
          <td style="padding: 12px 16px; font-size: 14px; color: #666; border-bottom: 1px solid #eee;">Monthly Rent</td>
          <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #333; text-align: right; border-bottom: 1px solid #eee;">&pound;${monthlyRent.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-size: 14px; color: #666; border-bottom: 1px solid #eee;">Security Deposit</td>
          <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #333; text-align: right; border-bottom: 1px solid #eee;">&pound;${securityDeposit.toLocaleString()}</td>
        </tr>
        <tr style="background: #f0f8ff;">
          <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #DC006D; border-bottom: 2px solid #DC006D;">Holding Deposit (due now)</td>
          <td style="padding: 12px 16px; font-size: 16px; font-weight: 700; color: #DC006D; text-align: right; border-bottom: 2px solid #DC006D;">&pound;${holdingDeposit.toLocaleString()}</td>
        </tr>
      </table>
      <p style="font-size: 14px; color: #555; line-height: 1.6;">
        Please complete your application and review the holding deposit terms by clicking the button below:
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="#" style="display: inline-block; background: linear-gradient(135deg, #DC006D, #a5004f); color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600;">
          Complete Application &amp; Review Terms
        </a>
      </div>
      <p style="font-size: 13px; color: #888; line-height: 1.6;">
        The Holding Deposit Information Sheet is attached to this email for your records. Please read it carefully before making any payment.
      </p>
      <p style="font-size: 14px; color: #555; line-height: 1.6;">
        If you have any questions, please don't hesitate to contact our accounts team.
      </p>
      <p style="font-size: 14px; color: #555;">
        Kind regards,<br/><strong>Fleming Lettings</strong><br/>
        <span style="font-size: 12px; color: #888;">01902 212 415 | accounts@fleminglettings.co.uk</span>
      </p>
    </div>
    <div style="background: #f5f5f5; padding: 16px; border-radius: 0 0 12px 12px; text-align: center; border: 1px solid #eee; border-top: none;">
      <p style="font-size: 11px; color: #999; margin: 0;">
        Creative Industries Centre, Wolverhampton Science Park, Wolverhampton, WV10 9TG
      </p>
    </div>
  </div>`;
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

function ReadField({ label, value }: { label: string; value?: string | number | React.ReactNode | null }) {
  return (
    <div>
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="text-sm mt-0.5">{value || '—'}</p>
    </div>
  );
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
export default function EnquiryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const { user } = useAuth();
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [properties, setProperties] = useState<{ id: number; address: string; postcode?: string; rent_amount?: number }[]>([]);
  const [users, setUsers] = useState<{ id: number; name: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Notes
  const [notes, setNotes] = useState<{ id: string; text: string; author: string; created_at: string }[]>([]);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Workflow
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [workflowMode, setWorkflowMode] = useState<'choose' | 'viewing' | 'follow_up' | 'onboarding' | 'reject' | 'convert'>('choose');
  const [wfDate, setWfDate] = useState('');
  const [wfTime, setWfTime] = useState('10:00');
  const [wfPropId, setWfPropId] = useState('');
  const [wfReason, setWfReason] = useState('');
  const [wfViewingWith, setWfViewingWith] = useState('');
  const [wfAssignedTo, setWfAssignedTo] = useState('');
  const [wfLoading, setWfLoading] = useState(false);

  // SMS
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [smsBody, setSmsBody] = useState('');
  const [smsHistory, setSmsHistory] = useState<any[]>([]);
  const [smsCompose, setSmsCompose] = useState('');
  const [smsSending, setSmsSending] = useState(false);

  // Onboarding wizard
  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);

  // Holding Deposit modal
  const [showHoldingDeposit, setShowHoldingDeposit] = useState(false);
  const [hdMonthlyRent, setHdMonthlyRent] = useState('');
  const [hdSecurityDeposit, setHdSecurityDeposit] = useState('');
  const [hdHoldingDeposit, setHdHoldingDeposit] = useState('');
  const [hdFollowUpDate, setHdFollowUpDate] = useState('');
  const [hdSending, setHdSending] = useState(false);

  const loadDetail = useCallback(async () => {
    try {
      const [d, props, usersList] = await Promise.all([
        api.get(`/api/tenant-enquiries/${id}`),
        api.get('/api/properties').catch(() => []),
        api.get('/api/users').catch(() => []),
      ]);
      setData(d);
      setForm({ ...d });
      setProperties(Array.isArray(props) ? props : []);
      setUsers(Array.isArray(usersList) ? usersList : []);
      // Parse notes
      if (d.notes) {
        try {
          const parsed = JSON.parse(d.notes);
          if (Array.isArray(parsed)) { setNotes(parsed); return; }
        } catch {}
        if (d.notes.trim()) setNotes([{ id: '1', text: d.notes, author: 'System', created_at: new Date().toISOString() }]);
      } else {
        setNotes([]);
      }
    } catch {}
    setLoading(false);
  }, [id, api]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  // Load SMS history
  const loadSmsHistory = useCallback(async () => {
    try {
      const msgs = await api.get(`/api/sms/enquiry/${id}`);
      setSmsHistory(Array.isArray(msgs) ? msgs : []);
    } catch {}
  }, [id, api]);
  useEffect(() => { loadSmsHistory(); }, [loadSmsHistory]);

  const sendStandaloneSms = async () => {
    if (!smsCompose.trim() || !data?.phone_1) return;
    setSmsSending(true);
    try {
      await api.post('/api/sms/send', { enquiry_id: Number(id), to_phone: data.phone_1, message_body: smsCompose.trim() });
      setSmsCompose('');
      await loadSmsHistory();
      await loadDetail();
    } catch {}
    setSmsSending(false);
  };

  const setField = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));
  const isEditing = (section: string) => editingSection === section;

  const saveSection = async (extra?: Record<string, any>) => {
    setSaving(true);
    try {
      await api.put(`/api/tenant-enquiries/${id}`, {
        ...form,
        is_joint_application: form.is_joint_application ? 1 : 0,
        kyc_completed_1: form.kyc_completed_1 ? 1 : 0,
        kyc_completed_2: form.kyc_completed_2 ? 1 : 0,
        is_permanent_address: form.is_permanent_address ? 1 : 0,
        ...extra,
      });
      await loadDetail();
      setEditingSection(null);
    } catch {}
    setSaving(false);
  };

  const cancelSection = () => {
    setEditingSection(null);
    if (data) setForm({ ...data });
  };

  const handleWorkflow = async () => {
    setWfLoading(true);
    try {
      const name = [form.first_name_1, form.last_name_1].filter(Boolean).join(' ');
      switch (workflowMode) {
        case 'viewing':
          if (wfPropId && wfDate) {
            await api.post('/api/property-viewings', {
              property_id: Number(wfPropId), enquiry_id: Number(id),
              viewer_name: name, viewer_email: form.email_1 || '',
              viewer_phone: form.phone_1 || '', viewing_date: wfDate, viewing_time: wfTime,
              assigned_to: wfAssignedTo || null,
              send_sms: smsEnabled, sms_message: smsBody || null,
            });
            await saveSection({ status: 'viewing_booked', linked_property_id: Number(wfPropId), viewing_date: wfDate, viewing_with: wfViewingWith || null });
            if (smsEnabled) await loadSmsHistory();
          }
          break;
        case 'follow_up':
          if (wfDate) await saveSection({ status: 'awaiting_response', follow_up_date: wfDate });
          break;
        case 'onboarding':
          await saveSection({ status: 'onboarding', follow_up_date: wfDate || null });
          break;
        case 'reject':
          await saveSection({ status: 'rejected', rejection_reason: wfReason });
          break;
        case 'convert':
          await api.post(`/api/tenant-enquiries/${id}/convert`, {
            property_id: form.linked_property_id,
            tenancy_start_date: wfDate || new Date().toISOString().split('T')[0],
          });
          await loadDetail();
          break;
      }
      setShowWorkflow(false);
    } catch {}
    setWfLoading(false);
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    setAddingNote(true);
    const noteText = newNote.trim();
    const note = { id: Date.now().toString(), text: noteText, author: user?.email || 'Unknown', created_at: new Date().toISOString() };
    const updated = [...notes, note];
    setNewNote('');
    try {
      await api.put(`/api/tenant-enquiries/${id}`, { ...form, notes: JSON.stringify(updated) });
      api.post('/api/activity', { action: 'note_added', entity_type: 'tenant_enquiry', entity_id: Number(id), changes: { text: noteText } }).catch(() => {});
      await loadDetail();
    } catch {}
    setAddingNote(false);
  };

  // Checklist items
  function getChecklistItems() {
    const items: { label: string; done: boolean }[] = [
      { label: 'KYC — Applicant 1', done: !!form.kyc_completed_1 },
    ];
    if (form.is_joint_application) {
      items.push({ label: 'KYC — Applicant 2', done: !!form.kyc_completed_2 });
    }
    items.push({ label: 'Employment Verified', done: !!(form.employment_status_1 && form.employer_1) });
    items.push({ label: 'Income Provided', done: !!form.income_1 });
    items.push({ label: 'Address Provided', done: !!form.current_address_1 });
    items.push({ label: 'Property Linked', done: !!form.linked_property_id });
    items.push({ label: 'Holding Deposit Requested', done: !!form.holding_deposit_requested });
    items.push({ label: 'Application Form Sent', done: !!form.application_form_sent });
    items.push({ label: 'Application Form Completed', done: !!form.application_form_completed });
    items.push({ label: 'Holding Deposit Received', done: !!form.holding_deposit_received });
    return items;
  }

  const checklistItems = getChecklistItems();
  const completedCount = checklistItems.filter(i => i.done).length;
  const completionPercent = checklistItems.length ? Math.round((completedCount / checklistItems.length) * 100) : 0;

  if (loading) {
    return (
      <Layout title="Enquiry" breadcrumb={[{ label: 'Tenant Enquiries', to: '/v3/enquiries' }, { label: 'Loading...' }]}>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-[var(--border-input)] border-t-orange-500 rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout title="Enquiry" breadcrumb={[{ label: 'Tenant Enquiries', to: '/v3/enquiries' }, { label: 'Not Found' }]}>
        <EmptyState message="Enquiry not found" />
      </Layout>
    );
  }

  const name = [data.first_name_1, data.last_name_1].filter(Boolean).join(' ') || 'Unknown';
  const canConvert = form.status === 'onboarding' && form.linked_property_id && form.first_name_1 && form.last_name_1 && form.email_1;
  const selectedProp = properties.find(p => p.id === Number(form.linked_property_id));
  const hasLinkedPartner = !!data.joint_partner_id;
  const jointApp = hasLinkedPartner || !!form.is_joint_application || !!form.first_name_2 || !!form.last_name_2;
  const partnerName = hasLinkedPartner ? [data.partner_first_name, data.partner_last_name].filter(Boolean).join(' ') : null;

  // Renting requirements
  let rentingReqs: string[] = [];
  try { rentingReqs = form.renting_requirements ? JSON.parse(form.renting_requirements) : []; } catch {}

  return (
    <Layout
      title=""
      breadcrumb={[{ label: 'Tenant Enquiries', to: '/v3/enquiries' }, { label: name }]}
    >
      <div className="p-4 md:p-8 space-y-6 md:space-y-8">
        {/* ==================== HEADER ==================== */}
        <GlassCard className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
            <Avatar name={name} size="xl" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold">{name}</h1>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[form.status] || ''}`}>
                  {STATUS_LABELS[form.status] || form.status}
                </span>
                {form.status === 'converted' && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg px-2 py-0.5">
                    <ShieldCheck size={12} /> Converted
                  </span>
                )}
              </div>
              {hasLinkedPartner && partnerName && (
                <button onClick={() => navigate(`/v3/enquiries/${data.joint_partner_id}`)}
                  className="flex items-center gap-2 mt-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors group">
                  <div className="w-7 h-7 rounded-lg bg-pink-500/15 flex items-center justify-center group-hover:bg-pink-500/25 transition-colors">
                    <Users size={14} className="text-pink-400" />
                  </div>
                  <span>Joint applicant: <span className="font-medium">{partnerName}</span></span>
                  <ChevronRight size={14} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}
              {selectedProp ? (
                <button onClick={() => navigate(`/v3/properties/${selectedProp.id}`)}
                  className="flex items-center gap-2 mt-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors group">
                  <div className="w-7 h-7 rounded-lg bg-[var(--bg-hover)] flex items-center justify-center group-hover:bg-[var(--accent-orange)]/20 transition-colors">
                    <Building2 size={14} className="text-[var(--text-muted)] group-hover:text-[var(--accent-orange)] transition-colors" />
                  </div>
                  <span>{selectedProp.address}{selectedProp.postcode ? `, ${selectedProp.postcode}` : ''}</span>
                  <ChevronRight size={14} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ) : (
                <p className="text-xs text-[var(--text-muted)] mt-2">No property linked</p>
              )}
              {form.follow_up_date && form.status === 'awaiting_response' && (
                <div className="flex items-center gap-2 mt-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 w-fit">
                  <AlertTriangle size={14} className="text-amber-400" />
                  <span className="text-xs text-amber-400 font-medium">Follow-up: {formatDateDMY(form.follow_up_date)}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <CompletionRing percent={completionPercent} />
              {form.status === 'onboarding' && (
                <Button variant="gradient" size="sm" onClick={() => setShowOnboardingWizard(true)}>
                  <CheckCircle size={14} className="mr-1.5" /> Onboarding
                </Button>
              )}
              {!['converted', 'rejected'].includes(form.status) && (
                <Button variant={form.status === 'onboarding' ? 'outline' : 'gradient'} size="sm" onClick={() => { setShowWorkflow(true); setWorkflowMode('choose'); setWfDate(''); setWfTime('10:00'); setWfPropId(form.linked_property_id?.toString() || ''); setWfReason(''); setWfViewingWith(''); setWfAssignedTo(''); setSmsEnabled(!!form.phone_1); setSmsBody(''); }}>
                  <ArrowRight size={14} className="mr-1.5" /> Progress
                </Button>
              )}
            </div>
          </div>
        </GlassCard>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* ==================== LEFT COLUMN ==================== */}
          <div className="lg:col-span-3 space-y-6">
            {/* Personal Information */}
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <SectionHeader title="Personal Information" icon={<User size={16} />} />
                <SectionEditButton editing={isEditing('personal')} onEdit={() => setEditingSection('personal')} onSave={() => saveSection()} onCancel={cancelSection} saving={saving} />
              </div>
              {isEditing('personal') ? (
                <div className="space-y-4">
                  <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider">Applicant 1</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input label="First Name" value={form.first_name_1 || ''} onChange={v => setField('first_name_1', v)} />
                    <Input label="Surname" value={form.last_name_1 || ''} onChange={v => setField('last_name_1', v)} />
                    <DatePicker label="Date of Birth" value={form.date_of_birth_1 || ''} onChange={v => setField('date_of_birth_1', v)} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input label="Email" value={form.email_1 || ''} onChange={v => setField('email_1', v)} type="email" />
                    <Input label="Phone" value={form.phone_1 || ''} onChange={v => setField('phone_1', v)} />
                    <AddressAutocomplete label="Address" value={form.current_address_1 || ''} onChange={v => setField('current_address_1', v)} />
                  </div>
                  {!hasLinkedPartner && (
                    <div className="flex items-center gap-3 mt-2">
                      <label className="text-xs text-[var(--text-muted)]">Joint Application?</label>
                      <YesNo value={!!form.is_joint_application} onChange={v => setField('is_joint_application', v)} />
                    </div>
                  )}
                  {hasLinkedPartner && (
                    <button onClick={() => navigate(`/v3/enquiries/${data.joint_partner_id}`)}
                      className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-pink-500/10 border border-pink-500/20 hover:bg-pink-500/20 transition-colors w-fit text-sm">
                      <Users size={14} className="text-pink-400" />
                      <span className="text-pink-400">View joint applicant: <span className="font-medium">{partnerName}</span></span>
                      <ChevronRight size={14} className="text-pink-400" />
                    </button>
                  )}
                  {!hasLinkedPartner && form.is_joint_application && (
                    <>
                      <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mt-4">Applicant 2</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Input label="First Name" value={form.first_name_2 || ''} onChange={v => setField('first_name_2', v)} />
                        <Input label="Surname" value={form.last_name_2 || ''} onChange={v => setField('last_name_2', v)} />
                        <DatePicker label="Date of Birth" value={form.date_of_birth_2 || ''} onChange={v => setField('date_of_birth_2', v)} />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Input label="Email" value={form.email_2 || ''} onChange={v => setField('email_2', v)} type="email" />
                        <Input label="Phone" value={form.phone_2 || ''} onChange={v => setField('phone_2', v)} />
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { icon: Mail, label: 'Email', value: data.email_1 },
                      { icon: Phone, label: 'Phone', value: data.phone_1 },
                      { icon: Calendar, label: 'Date of Birth', value: data.date_of_birth_1 ? formatDateDMY(data.date_of_birth_1) : null },
                      { icon: Home, label: 'Address', value: data.current_address_1 },
                    ].map(({ icon: Icon, label, value }) => (
                      <div key={label} className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[var(--bg-hover)] flex items-center justify-center">
                          <Icon size={16} className="text-[var(--text-muted)]" />
                        </div>
                        <div><p className="text-xs text-[var(--text-muted)]">{label}</p><p className="text-sm">{value || '—'}</p></div>
                      </div>
                    ))}
                  </div>
                  {hasLinkedPartner && partnerName && (
                    <>
                      <div className="h-px bg-[var(--border-subtle)] my-2" />
                      <button onClick={() => navigate(`/v3/enquiries/${data.joint_partner_id}`)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-pink-500/10 border border-pink-500/20 hover:bg-pink-500/20 transition-colors w-fit text-sm">
                        <Users size={14} className="text-pink-400" />
                        <span className="text-pink-400">Joint applicant: <span className="font-medium">{partnerName}</span></span>
                        <ChevronRight size={14} className="text-pink-400" />
                      </button>
                    </>
                  )}
                  {!hasLinkedPartner && jointApp && (
                    <>
                      <div className="h-px bg-[var(--border-subtle)] my-2" />
                      <div className="flex items-center gap-2 mb-2">
                        <Users size={14} className="text-pink-400" />
                        <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider">Applicant 2</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <ReadField label="Name" value={[form.first_name_2, form.last_name_2].filter(Boolean).join(' ') || null} />
                        <ReadField label="Email" value={form.email_2} />
                        <ReadField label="Phone" value={form.phone_2} />
                        <ReadField label="Date of Birth" value={form.date_of_birth_2 ? formatDateDMY(form.date_of_birth_2) : null} />
                      </div>
                    </>
                  )}
                </div>
              )}
            </GlassCard>

            {/* Employment & Address */}
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <SectionHeader title="Employment & Address" icon={<Briefcase size={16} />} />
                <SectionEditButton editing={isEditing('employment')} onEdit={() => setEditingSection('employment')} onSave={() => saveSection()} onCancel={cancelSection} saving={saving} />
              </div>
              {isEditing('employment') ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Select label="Employment Status" value={form.employment_status_1 || ''} onChange={v => setField('employment_status_1', v)} options={EMPLOYMENT_OPTIONS} />
                    <Input label="Employer" value={form.employer_1 || ''} onChange={v => setField('employer_1', v)} />
                    <Input label="Annual Salary (£)" value={form.income_1?.toString() || ''} onChange={v => setField('income_1', v ? Number(v) : null)} type="number" />
                  </div>
                  <div className="h-px bg-[var(--border-subtle)]" />
                  <AddressAutocomplete label="Current Address" value={form.current_address_1 || ''} onChange={v => setField('current_address_1', v)} />
                  <label className="flex items-center gap-3 cursor-pointer py-2 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] w-fit">
                    <input type="checkbox" checked={!!form.is_permanent_address} onChange={e => setField('is_permanent_address', e.target.checked)} className="w-4 h-4 rounded accent-orange-500" />
                    <span className="text-sm text-[var(--text-primary)] font-medium">This is a permanent address</span>
                  </label>
                  {!form.is_permanent_address && (
                    <AddressAutocomplete label="Secondary / Previous Address" value={form.current_address_2 || ''} onChange={v => setField('current_address_2', v)} placeholder="Required if not permanent" />
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ReadField label="Employment Status" value={form.employment_status_1} />
                    <ReadField label="Employer" value={form.employer_1} />
                    <ReadField label="Annual Salary" value={form.income_1 ? `£${Number(form.income_1).toLocaleString()}` : null} />
                  </div>
                  <div className="h-px bg-[var(--border-subtle)]" />
                  <ReadField label="Current Address" value={form.current_address_1} />
                  {form.is_permanent_address ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                      <CheckCircle size={12} /> Permanent Address
                    </span>
                  ) : (
                    <ReadField label="Secondary / Previous Address" value={form.current_address_2} />
                  )}
                </div>
              )}
            </GlassCard>

            {/* Renting Requirements */}
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <SectionHeader title="Renting Requirements" icon={<Home size={16} />} />
                <SectionEditButton editing={isEditing('requirements')} onEdit={() => setEditingSection('requirements')} onSave={() => saveSection()} onCancel={cancelSection} saving={saving} />
              </div>
              {isEditing('requirements') ? (
                <div className="flex flex-wrap gap-2">
                  {RENTING_REQUIREMENT_OPTIONS.map(opt => {
                    const isActive = rentingReqs.includes(opt);
                    return (
                      <button key={opt} type="button"
                        onClick={() => {
                          const next = isActive ? rentingReqs.filter(s => s !== opt) : [...rentingReqs, opt];
                          setField('renting_requirements', JSON.stringify(next));
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                          isActive
                            ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                            : 'bg-[var(--bg-input)] border-[var(--border-input)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
                        }`}>
                        {isActive && <span className="mr-1">✓</span>}{opt}
                      </button>
                    );
                  })}
                </div>
              ) : rentingReqs.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {rentingReqs.map(s => (
                    <span key={s} className="px-3 py-1.5 rounded-full text-xs font-medium bg-orange-500/15 text-orange-400 border border-orange-500/30">
                      {s}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">No requirements specified</p>
              )}
            </GlassCard>

            {/* Documents */}
            <DocumentUpload entityType="tenant_enquiry" entityId={Number(id)} applicantNumber={1} title={(!hasLinkedPartner && jointApp) ? "Documents — Applicant 1" : "Documents"} />

            {/* Documents — Applicant 2 (only for legacy records without linked partner) */}
            {!hasLinkedPartner && jointApp && (
              <DocumentUpload entityType="tenant_enquiry" entityId={Number(id)} applicantNumber={2} title="Documents — Applicant 2" />
            )}
          </div>

          {/* ==================== RIGHT COLUMN ==================== */}
          <div className="lg:col-span-2 space-y-6">
            {/* Linked Property */}
            <GlassCard className="p-6 overflow-visible relative z-10">
              <div className="flex items-center justify-between mb-4">
                <SectionHeader title="Linked Property" icon={<Building2 size={16} />} />
                <SectionEditButton editing={isEditing('property')} onEdit={() => setEditingSection('property')} onSave={() => saveSection()} onCancel={cancelSection} saving={saving} />
              </div>
              {isEditing('property') ? (
                <Select
                  searchable
                  value={String(form.linked_property_id || '')}
                  onChange={v => setField('linked_property_id', v ? Number(v) : null)}
                  options={[
                    { value: '', label: 'No property linked' },
                    ...properties.map(p => ({ value: String(p.id), label: `${p.address}${p.postcode ? `, ${p.postcode}` : ''}` })),
                  ]}
                />
              ) : selectedProp ? (
                <div onClick={() => navigate(`/v3/properties/${selectedProp.id}`)}
                  className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors">
                  <Building2 size={14} className="text-[var(--text-muted)]" />
                  <span className="text-sm font-medium flex-1">{selectedProp.address}{selectedProp.postcode ? `, ${selectedProp.postcode}` : ''}</span>
                  <ExternalLink size={12} className="text-[var(--text-muted)]" />
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">No property linked</p>
              )}
              {form.viewing_date && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <ReadField label="Viewing Date" value={formatDateDMY(form.viewing_date)} />
                  {form.viewing_with && <ReadField label="Viewing Notes" value={form.viewing_with} />}
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
                  <SectionEditButton editing={isEditing('checklist')} onEdit={() => setEditingSection('checklist')} onSave={() => saveSection()} onCancel={cancelSection} saving={saving} />
                </div>
              </div>

              <div className="space-y-2">
                {/* KYC — Applicant 1 */}
                <div className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs">KYC — {form.first_name_1 || 'Applicant 1'}</span>
                  <YesNo value={!!form.kyc_completed_1} onChange={v => setField('kyc_completed_1', v)} disabled={!isEditing('checklist')} />
                </div>

                {/* KYC — Applicant 2 (only for legacy records without linked partner) */}
                {!hasLinkedPartner && jointApp && (
                  <div className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                    <span className="text-xs">KYC — {form.first_name_2 || 'Applicant 2'}</span>
                    <YesNo value={!!form.kyc_completed_2} onChange={v => setField('kyc_completed_2', v)} disabled={!isEditing('checklist')} />
                  </div>
                )}

                {/* Employment Verified */}
                <div className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs">Employment Verified</span>
                  <span className={`text-[10px] font-medium ${form.employment_status_1 && form.employer_1 ? 'text-green-400' : 'text-[var(--text-muted)]'}`}>
                    {form.employment_status_1 && form.employer_1 ? 'Yes' : 'No'}
                  </span>
                </div>

                {/* Income Provided */}
                <div className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs">Income Provided</span>
                    <span className={`text-[10px] font-medium ${form.income_1 ? 'text-green-400' : 'text-[var(--text-muted)]'}`}>
                      {form.income_1 ? `£${Number(form.income_1).toLocaleString()}` : '—'}
                    </span>
                  </div>
                </div>

                {/* Address Provided */}
                <div className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs">Address Provided</span>
                  <span className={`text-[10px] font-medium ${form.current_address_1 ? 'text-green-400' : 'text-[var(--text-muted)]'}`}>
                    {form.current_address_1 ? 'Yes' : 'No'}
                  </span>
                </div>

                {/* Property Linked */}
                <div className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs">Property Linked</span>
                  <span className={`text-[10px] font-medium ${form.linked_property_id ? 'text-green-400' : 'text-[var(--text-muted)]'}`}>
                    {form.linked_property_id ? 'Yes' : 'No'}
                  </span>
                </div>

                {/* Onboarding items */}
                <div className="h-px bg-[var(--border-subtle)] my-2" />
                <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider px-1 mb-2">Onboarding</p>

                <div className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs">Holding Deposit Requested</span>
                  <span className={`text-[10px] font-medium ${form.holding_deposit_requested ? 'text-green-400' : 'text-[var(--text-muted)]'}`}>
                    {form.holding_deposit_requested ? `Yes${form.holding_deposit_amount ? ` (£${Number(form.holding_deposit_amount).toLocaleString()})` : ''}` : 'No'}
                  </span>
                </div>

                <div className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs">Application Form Sent</span>
                  <span className={`text-[10px] font-medium ${form.application_form_sent ? 'text-green-400' : 'text-[var(--text-muted)]'}`}>
                    {form.application_form_sent ? 'Yes' : 'No'}
                  </span>
                </div>

                <div className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs">Application Form Completed</span>
                  <span className={`text-[10px] font-medium ${form.application_form_completed ? 'text-green-400' : 'text-[var(--text-muted)]'}`}>
                    {form.application_form_completed ? 'Yes' : 'No'}
                  </span>
                </div>

                <div className="bg-[var(--bg-hover)]/50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs">Holding Deposit Received</span>
                  <YesNo value={!!form.holding_deposit_received} onChange={v => setField('holding_deposit_received', v)} disabled={!isEditing('checklist')} />
                </div>

                {/* Request Holding Deposit button */}
                {!form.holding_deposit_requested && form.linked_property_id && (
                  <button onClick={() => {
                    const prop = properties.find(p => p.id === Number(form.linked_property_id));
                    const rent = prop?.rent_amount || 0;
                    setHdMonthlyRent(String(rent));
                    setHdHoldingDeposit(String(Math.round(rent * 12 / 52)));
                    setHdFollowUpDate('');
                    setShowHoldingDeposit(true);
                  }} className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#DC006D] to-[#a5004f] text-white text-xs font-semibold hover:opacity-90 transition-opacity">
                    <Mail size={14} /> Request Holding Deposit
                  </button>
                )}
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

            {/* SMS History */}
            <GlassCard className="p-6">
              <SectionHeader title="SMS History" icon={<Phone size={16} />} action={loadSmsHistory} actionLabel="Refresh" />
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {smsHistory.length === 0 && <p className="text-xs text-[var(--text-muted)]">No messages sent yet</p>}
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
              {data?.phone_1 && (
                <div className="mt-3">
                  <div className="flex gap-2">
                    <textarea value={smsCompose} onChange={e => setSmsCompose(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendStandaloneSms(); } }}
                      placeholder={`Send SMS to ${data.phone_1}...`}
                      rows={1}
                      className="flex-1 bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-orange)]/50 transition-colors resize-none [field-sizing:content]" />
                    <Button variant="gradient" onClick={sendStandaloneSms} disabled={smsSending || !smsCompose.trim()} className="gap-1.5">
                      <Send size={14} />
                      <span>Send</span>
                    </Button>
                  </div>
                </div>
              )}
            </GlassCard>

            {/* Activity Timeline */}
            <GlassCard className="p-6">
              <SectionHeader title="Activity Timeline" icon={<Clock size={16} />} />
              <ActivityTimeline entityType="tenant_enquiry" entityId={Number(id)} />
            </GlassCard>
          </div>
        </div>
      </div>

      {/* ==================== WORKFLOW MODAL ==================== */}
      {showWorkflow && (
        <div className="fixed inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowWorkflow(false)}>
          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-input)] w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <Avatar name={name} size="md" />
                <div>
                  <h3 className="text-lg font-bold">{name}</h3>
                  <p className="text-xs text-[var(--text-muted)]">Update workflow</p>
                </div>
              </div>
              <button onClick={() => setShowWorkflow(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
            </div>

            {workflowMode === 'choose' ? (
              <div className="space-y-2">
                <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-3">Progress</p>
                <button onClick={() => setWorkflowMode('viewing')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center"><BookingIcon size={14} className="text-white" /></div>
                  <div className="flex-1"><p className="text-sm font-medium">Book Viewing</p></div>
                  <ArrowRight size={14} className="text-[var(--text-muted)]" />
                </button>
                <button onClick={() => setWorkflowMode('follow_up')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center"><AwaitingIcon size={14} className="text-white" /></div>
                  <div className="flex-1"><p className="text-sm font-medium">Set Follow Up</p></div>
                  <ArrowRight size={14} className="text-[var(--text-muted)]" />
                </button>
                <button onClick={() => setWorkflowMode('onboarding')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center"><OnboardingIcon size={14} className="text-white" /></div>
                  <div className="flex-1"><p className="text-sm font-medium">Start Onboarding</p></div>
                  <ArrowRight size={14} className="text-[var(--text-muted)]" />
                </button>
                {canConvert && (
                  <>
                    <div className="h-px bg-[var(--border-subtle)] my-3" />
                    <button onClick={() => setWorkflowMode('convert')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors text-left border border-emerald-500/20">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center"><ConvertedIcon size={14} className="text-white" /></div>
                      <div className="flex-1"><p className="text-sm font-medium text-emerald-400">Convert to Tenant</p></div>
                      <ArrowRight size={14} className="text-[var(--text-muted)]" />
                    </button>
                  </>
                )}
                <div className="h-px bg-[var(--border-subtle)] my-3" />
                <button onClick={() => setWorkflowMode('reject')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center"><XCircle size={14} className="text-white" /></div>
                  <div className="flex-1"><p className="text-sm font-medium text-red-400">Reject & Archive</p></div>
                  <ArrowRight size={14} className="text-[var(--text-muted)]" />
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <button onClick={() => setWorkflowMode('choose')} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">← Back</button>
                {workflowMode === 'viewing' && (() => {
                  const firstName = form.first_name_1 || '';
                  const genSms = (propId: string, date: string, time: string) => {
                    const prop = properties.find(p => p.id === Number(propId));
                    const addr = prop?.address || '[property address]';
                    let d = '[date]';
                    if (date) { const parts = date.split('-'); if (parts.length === 3) d = `${parts[2]}/${parts[1]}/${parts[0]}`; }
                    const t = time ? ' at ' + time : '';
                    return `Hi ${firstName || '[name]'}, your appointment has been booked to view ${addr} on ${d}${t}. If you are running late or need to reschedule then please call our offices on 01902 212 415. See you soon!`;
                  };
                  return (
                    <>
                      <Select label="Assign To (Agent)" value={wfAssignedTo} onChange={setWfAssignedTo} searchable
                        options={[{ value: '', label: 'Unassigned' }, ...users.map(u => ({ value: u.name, label: u.name }))]} />
                      <Select label="Property *" searchable value={wfPropId} onChange={(v) => {
                        setWfPropId(v);
                        setSmsBody(genSms(v, wfDate, wfTime));
                      }}
                        options={[{ value: '', label: 'Select property...' }, ...properties.map(p => ({ value: String(p.id), label: `${p.address}${p.postcode ? `, ${p.postcode}` : ''}` }))]} />
                      <div className="grid grid-cols-2 gap-3">
                        <DatePicker label="Viewing Date *" value={wfDate} onChange={(v) => {
                          setWfDate(v);
                          setSmsBody(genSms(wfPropId, v, wfTime));
                        }} />
                        <div>
                          <label className="block text-xs text-[var(--text-secondary)] mb-1.5 font-medium">Viewing Time</label>
                          <input type="time" value={wfTime} onChange={e => { setWfTime(e.target.value); setSmsBody(genSms(wfPropId, wfDate, e.target.value)); }}
                            className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-input)] transition-colors [&::-webkit-calendar-picker-indicator]:invert" />
                        </div>
                      </div>
                      <Input label="Additional Notes" value={wfViewingWith} onChange={setWfViewingWith} placeholder="e.g. Key collection instructions" />

                      {/* SMS Confirmation */}
                      <div className="h-px bg-[var(--border-subtle)] my-1" />
                      {form.phone_1 ? (
                        <div className="space-y-3">
                          <label className="flex items-center gap-3 cursor-pointer py-2 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                            <input type="checkbox" checked={smsEnabled} onChange={e => setSmsEnabled(e.target.checked)} className="w-4 h-4 rounded accent-orange-500" />
                            <Phone size={14} className="text-teal-400" />
                            <div className="flex-1">
                              <span className="text-sm font-medium text-[var(--text-primary)]">Send SMS confirmation</span>
                              <p className="text-[10px] text-[var(--text-muted)]">{form.phone_1}</p>
                            </div>
                          </label>
                          {smsEnabled && (
                            <div>
                              <label className="block text-[11px] text-[var(--text-muted)] font-medium mb-1.5 uppercase tracking-wider">Message Preview</label>
                              <textarea value={smsBody} onChange={e => setSmsBody(e.target.value)} rows={4}
                                className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-orange)]/50 resize-none transition-colors" />
                              <p className="text-[10px] text-[var(--text-muted)] mt-1">{smsBody.length} characters</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                          <p className="text-xs text-amber-400">No phone number on record — SMS cannot be sent</p>
                        </div>
                      )}
                    </>
                  );
                })()}
                {workflowMode === 'follow_up' && <DatePicker label="Follow-up Date" value={wfDate} onChange={setWfDate} />}
                {workflowMode === 'onboarding' && (
                  <div className="space-y-3">
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <p className="text-sm font-medium text-amber-400">Are you sure you want to begin onboarding?</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">This will move the enquiry to the onboarding stage.</p>
                    </div>
                  </div>
                )}
                {workflowMode === 'reject' && (
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1.5">Reason (optional)</label>
                    <textarea value={wfReason} onChange={e => setWfReason(e.target.value)} rows={3}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none resize-none" />
                  </div>
                )}
                {workflowMode === 'convert' && <DatePicker label="Tenancy Start Date" value={wfDate} onChange={setWfDate} />}
                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setShowWorkflow(false)}>Cancel</Button>
                  <Button variant={workflowMode === 'reject' ? 'outline' : 'gradient'} onClick={handleWorkflow}
                    disabled={wfLoading || (workflowMode === 'viewing' && (!wfDate || !wfPropId)) || (workflowMode === 'follow_up' && !wfDate) || (workflowMode === 'convert' && !wfDate)}
                    className={workflowMode === 'reject' ? 'border-red-500/50 text-red-400' : ''}>
                    {wfLoading ? 'Saving...' : workflowMode === 'reject' ? 'Reject' : workflowMode === 'convert' ? 'Convert' : 'Confirm'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== HOLDING DEPOSIT MODAL ==================== */}
      <EmailPreviewModal
        open={showHoldingDeposit}
        onClose={() => setShowHoldingDeposit(false)}
        to={data?.email_1 || ''}
        from="accounts@fleminglettings.co.uk"
        initialSubject={`Holding Deposit Request - ${selectedProp?.address || 'Property'}`}
        initialBodyHtml={buildHoldingDepositEmailHtml(
          [data?.first_name_1, data?.last_name_1].filter(Boolean).join(' ') || 'Applicant',
          selectedProp?.address || 'the property',
          Number(hdMonthlyRent || 0),
          Number(hdSecurityDeposit || 0),
          Number(hdHoldingDeposit || 0),
        )}
        sending={hdSending}
        sendLabel="Send Email & Create Form Link"
        onSend={async () => {
          if (!hdMonthlyRent || !hdHoldingDeposit) return;
          setHdSending(true);
          try {
            await api.post(`/api/tenant-enquiries/${id}/request-holding-deposit`, {
              monthly_rent: Number(hdMonthlyRent),
              security_deposit: Number(hdSecurityDeposit),
              holding_deposit: Number(hdHoldingDeposit),
              follow_up_date: hdFollowUpDate || null,
            });
            setShowHoldingDeposit(false);
            await loadDetail();
          } catch (err) {
            console.error('Failed to send holding deposit request:', err);
          }
          setHdSending(false);
        }}
      >
        {/* Financial inputs above the email preview */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1.5 font-medium">Monthly Rent (£) *</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" value={hdMonthlyRent} onChange={e => {
              const v = e.target.value.replace(/[^0-9.]/g, '');
              setHdMonthlyRent(v);
              const r = Number(v);
              if (r > 0) {
                setHdHoldingDeposit(String(Math.round(r * 12 / 52)));
              }
            }}
              className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-orange)]/50 transition-colors" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1.5 font-medium">Security Deposit (£)</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" value={hdSecurityDeposit} onChange={e => setHdSecurityDeposit(e.target.value.replace(/[^0-9.]/g, ''))}
              className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-orange)]/50 transition-colors" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1.5 font-medium">Holding Deposit (£) *</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" value={hdHoldingDeposit} onChange={e => setHdHoldingDeposit(e.target.value.replace(/[^0-9.]/g, ''))}
              className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-orange)]/50 transition-colors" />
            <p className="text-[10px] text-[var(--text-muted)] mt-1">1 week's rent (annual / 52)</p>
          </div>
        </div>
        <DatePicker label="Follow-up Date" value={hdFollowUpDate} onChange={setHdFollowUpDate} />
      </EmailPreviewModal>

      {/* Onboarding Wizard */}
      {showOnboardingWizard && data && (
        <OnboardingWizard
          enquiryId={Number(id)}
          enquiry={data}
          properties={properties}
          users={users}
          onClose={() => setShowOnboardingWizard(false)}
          onUpdate={async () => { await loadDetail(); }}
        />
      )}
    </Layout>
  );
}
