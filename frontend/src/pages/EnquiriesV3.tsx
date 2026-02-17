import React, { useState, useEffect, useCallback } from 'react';
import V3Layout from '../components/V3Layout';
import { GlassCard, Button, Avatar, SearchBar, Input, Select, EmptyState } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { Plus, X, Clock, ArrowLeft, Calendar, CheckCircle, Upload, FileText, ExternalLink, Save, User, Users, Briefcase, Home, LayoutGrid, List, Building2, ChevronDown, Archive, Pencil, ArrowRight, Eye, UserPlus, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface EnquiryRaw {
  id: number;
  [key: string]: any;
}

interface Property {
  id: number;
  address: string;
  postcode: string;
  rent: number;
  [key: string]: any;
}

interface Enquiry {
  id: number;
  name: string;
  email: string;
  phone: string;
  status: string;
  created_at: string;
}

function mapEnquiry(raw: EnquiryRaw): Enquiry {
  return {
    id: raw.id,
    name: [raw.first_name_1, raw.last_name_1].filter(Boolean).join(' ') || 'Unknown',
    email: raw.email_1 || '',
    phone: raw.phone_1 || '',
    status: raw.status || 'new',
    created_at: raw.created_at,
  };
}

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500/20 text-blue-400',
  viewing_booked: 'bg-purple-500/20 text-purple-400',
  awaiting_response: 'bg-amber-500/20 text-amber-400',
  onboarding: 'bg-green-500/20 text-green-400',
  converted: 'bg-emerald-500/20 text-emerald-400',
  rejected: 'bg-red-500/20 text-red-400',
};

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  viewing_booked: 'Viewing Booked',
  awaiting_response: 'Awaiting Response',
  onboarding: 'Onboarding',
  converted: 'Converted',
  rejected: 'Rejected',
};

const TITLE_OPTIONS = [
  { value: '', label: '-' }, { value: 'Mr', label: 'Mr' }, { value: 'Mrs', label: 'Mrs' },
  { value: 'Ms', label: 'Ms' }, { value: 'Miss', label: 'Miss' }, { value: 'Dr', label: 'Dr' },
];

const EMPLOYMENT_OPTIONS = [
  { value: '', label: '-' }, { value: 'Employed', label: 'Employed' }, { value: 'Self-Employed', label: 'Self-Employed' },
  { value: 'Unemployed', label: 'Unemployed' }, { value: 'Student', label: 'Student' }, { value: 'Retired', label: 'Retired' },
];

const NATIONALITY_OPTIONS = [
  { value: '', label: '-' }, { value: 'British', label: 'British' }, { value: 'Irish', label: 'Irish' },
  { value: 'Polish', label: 'Polish' }, { value: 'Romanian', label: 'Romanian' }, { value: 'Indian', label: 'Indian' },
  { value: 'Pakistani', label: 'Pakistani' }, { value: 'Bangladeshi', label: 'Bangladeshi' }, { value: 'Nigerian', label: 'Nigerian' },
  { value: 'Chinese', label: 'Chinese' }, { value: 'Italian', label: 'Italian' }, { value: 'Portuguese', label: 'Portuguese' },
  { value: 'Spanish', label: 'Spanish' }, { value: 'French', label: 'French' }, { value: 'German', label: 'German' },
  { value: 'American', label: 'American' }, { value: 'Other', label: 'Other' },
];

const INDUSTRY_OPTIONS = [
  { value: '', label: '-' }, { value: 'Accounting & Finance', label: 'Accounting & Finance' },
  { value: 'Construction', label: 'Construction' }, { value: 'Education', label: 'Education' },
  { value: 'Engineering', label: 'Engineering' }, { value: 'Healthcare', label: 'Healthcare' },
  { value: 'Hospitality', label: 'Hospitality' }, { value: 'IT & Technology', label: 'IT & Technology' },
  { value: 'Legal', label: 'Legal' }, { value: 'Manufacturing', label: 'Manufacturing' },
  { value: 'Marketing & Media', label: 'Marketing & Media' }, { value: 'Public Sector', label: 'Public Sector' },
  { value: 'Retail', label: 'Retail' }, { value: 'Transport & Logistics', label: 'Transport & Logistics' },
  { value: 'Other', label: 'Other' },
];

const BEDROOMS_OPTIONS = [
  { value: '', label: '-' }, ...Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
];

function formatTime(d: string) {
  const date = new Date(d);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ─── Radio Group Component ───
function RadioGroup({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs text-[var(--text-secondary)] mb-2 font-medium">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(o => (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              value === o.value
                ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                : 'bg-[var(--bg-input)] border-[var(--border-input)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
            }`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Section Divider ───
function SectionDivider({ icon, title, color = 'text-orange-400', children }: {
  icon: React.ReactNode; title: string; color?: string; children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 mb-4 mt-2">
      <span className={color}>{icon}</span>
      <h4 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">{title}</h4>
      <div className="flex-1 h-px bg-[var(--border-subtle)]" />
      {children}
    </div>
  );
}

// ─── Read-only Field ───
function ReadField({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-[11px] text-[var(--text-muted)] font-medium mb-1">{label}</p>
      <p className="text-sm text-[var(--text-primary)]">{value || '—'}</p>
    </div>
  );
}

// ─── Applicant Fields Block ───
function ApplicantFields({ form, setField, suffix, editing }: {
  form: Record<string, any>; setField: (k: string, v: any) => void; suffix: string; editing?: boolean;
}) {
  const f = (name: string) => `${name}${suffix}`;
  if (!editing) {
    return (
      <>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <ReadField label="First Name" value={form[f('first_name_')]} />
          <ReadField label="Surname" value={form[f('last_name_')]} />
          <ReadField label="Date of Birth" value={form[f('date_of_birth_')] ? new Date(form[f('date_of_birth_')]).toLocaleDateString('en-GB') : null} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <ReadField label="Email" value={form[f('email_')]} />
          <ReadField label="Contact Number" value={form[f('phone_')]} />
          <ReadField label="Nationality" value={form[f('nationality_')]} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <ReadField label="Home Address" value={form[f('current_address_')]} />
          <ReadField label="Postcode" value={form[f('postcode_')]} />
          <ReadField label="Years at Address" value={form[f('years_at_address_')]} />
        </div>
      </>
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
        <Input label="First Name" value={form[f('first_name_')] || ''} onChange={v => setField(f('first_name_'), v)} placeholder="First name" />
        <Input label="Surname" value={form[f('last_name_')] || ''} onChange={v => setField(f('last_name_'), v)} placeholder="Surname" />
        <Input label="Date of Birth" value={form[f('date_of_birth_')] || ''} onChange={v => setField(f('date_of_birth_'), v)} type="date" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
        <Input label="Email" value={form[f('email_')] || ''} onChange={v => setField(f('email_'), v)} placeholder="Email" type="email" />
        <Input label="Contact Number" value={form[f('phone_')] || ''} onChange={v => setField(f('phone_'), v)} placeholder="Phone" />
        <Select label="Nationality" value={form[f('nationality_')] || ''} onChange={v => setField(f('nationality_'), v)} options={NATIONALITY_OPTIONS} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <Input label="Home Address" value={form[f('current_address_')] || ''} onChange={v => setField(f('current_address_'), v)} placeholder="Full address" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Postcode" value={form[f('postcode_')] || ''} onChange={v => setField(f('postcode_'), v)} placeholder="AB1 2CD" />
          <Input label="Years at Address" value={form[f('years_at_address_')]?.toString() || ''} onChange={v => setField(f('years_at_address_'), v ? Number(v) : null)} placeholder="0" type="number" />
        </div>
      </div>
    </>
  );
}

// ─── Employment Fields Block ───
function EmploymentFields({ form, setField, suffix, editing }: {
  form: Record<string, any>; setField: (k: string, v: any) => void; suffix: string; editing?: boolean;
}) {
  const f = (name: string) => `${name}${suffix}`;
  if (!editing) {
    return (
      <>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <ReadField label="Employment Status" value={form[f('employment_status_')]} />
          <ReadField label="Industry" value={form[f('industry_')]} />
          <ReadField label="Job Title" value={form[f('job_title_')]} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <ReadField label="Years in Employment" value={form[f('years_employed_')]} />
          <ReadField label="Annual Salary" value={form[f('income_')] ? `£${Number(form[f('income_')]).toLocaleString()}` : null} />
          <ReadField label="Employer" value={form[f('employer_')]} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <ReadField label="Contract Type" value={form[f('contract_type_')]} />
          <ReadField label="Happy to provide further info?" value={form[f('provide_further_info_')]} />
        </div>
      </>
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
        <Select label="Employment Status" value={form[f('employment_status_')] || ''} onChange={v => setField(f('employment_status_'), v)} options={EMPLOYMENT_OPTIONS} />
        <Select label="Industry" value={form[f('industry_')] || ''} onChange={v => setField(f('industry_'), v)} options={INDUSTRY_OPTIONS} />
        <Input label="Job Title" value={form[f('job_title_')] || ''} onChange={v => setField(f('job_title_'), v)} placeholder="Job title" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
        <Input label="Years in Employment" value={form[f('years_employed_')]?.toString() || ''} onChange={v => setField(f('years_employed_'), v ? Number(v) : null)} placeholder="0" type="number" />
        <Input label="Annual Salary £" value={form[f('income_')]?.toString() || ''} onChange={v => setField(f('income_'), v ? Number(v) : null)} placeholder="0" type="number" />
        <Input label="Employer" value={form[f('employer_')] || ''} onChange={v => setField(f('employer_'), v)} placeholder="Employer name" />
      </div>
      <div className="space-y-3">
        <RadioGroup label="Contract Type" value={form[f('contract_type_')] || ''} onChange={v => setField(f('contract_type_'), v)}
          options={[
            { value: 'Permanent', label: 'Permanent' },
            { value: 'Fixed position', label: 'Fixed position' },
            { value: 'Contract role', label: 'Contract role' },
            { value: 'Temporary or agency', label: 'Temporary or agency' },
          ]} />
        <RadioGroup label="Happy to provide further info?" value={form[f('provide_further_info_')] || ''} onChange={v => setField(f('provide_further_info_'), v)}
          options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
      </div>
    </>
  );
}

// ─── Detail Panel ───
function EnquiryDetail({ enquiryId, api, onBack, onUpdated }: {
  enquiryId: number; api: any; onBack: () => void; onUpdated: () => void;
}) {
  const [data, setData] = useState<EnquiryRaw | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [tab, setTab] = useState<'applicant' | 'activity' | 'notes'>('applicant');
  const [jointApp, setJointApp] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [docs] = useState<string[]>([]);
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [workflowMode, setWorkflowMode] = useState<'choose'|'viewing'|'awaiting'|'onboarding'|'reject'>('choose');
  const [wfDate, setWfDate] = useState('');
  const [wfTime, setWfTime] = useState('10:00');
  const [wfPropId, setWfPropId] = useState('');
  const [wfReason, setWfReason] = useState('');
  const [wfLoading, setWfLoading] = useState(false);

  const loadDetail = useCallback(async () => {
    try {
      const d = await api.get(`/api/tenant-enquiries/${enquiryId}`);
      setData(d);
      setForm({ ...d });
      if (d.is_joint_application || d.first_name_2 || d.last_name_2 || d.email_2) setJointApp(true);
    } catch {}
  }, [enquiryId, api]);

  useEffect(() => { loadDetail(); }, [loadDetail]);
  useEffect(() => {
    (async () => {
      try {
        const p = await api.get('/api/properties');
        setProperties(Array.isArray(p) ? p : p.properties || []);
      } catch {}
    })();
  }, [api]);

  const setField = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async (extra?: Record<string, any>) => {
    setSaving(true);
    try {
      const payload = { ...form, is_joint_application: jointApp, ...extra };
      await api.put(`/api/tenant-enquiries/${enquiryId}`, payload);
      await loadDetail();
      onUpdated();
    } catch {}
    setSaving(false);
  };

  const updateStatus = async (status: string) => {
    setField('status', status);
    await save({ status });
  };

  const handleWorkflow = async () => {
    setWfLoading(true);
    try {
      const name = [form.first_name_1, form.last_name_1].filter(Boolean).join(' ');
      switch (workflowMode) {
        case 'viewing':
          if (wfPropId && wfDate) {
            await api.post('/api/property-viewings', {
              property_id: Number(wfPropId), enquiry_id: enquiryId,
              viewer_name: name, viewer_email: form.email_1 || '',
              viewer_phone: form.phone_1 || '', viewing_date: wfDate, viewing_time: wfTime,
            });
            await save({ status: 'viewing_booked', linked_property_id: Number(wfPropId), viewing_date: wfDate });
          }
          break;
        case 'awaiting':
          if (wfDate) await save({ status: 'awaiting_response', follow_up_date: wfDate });
          break;
        case 'onboarding':
          await save({ status: 'onboarding', follow_up_date: wfDate || null });
          break;
        case 'reject':
          await save({ status: 'rejected', rejection_reason: wfReason });
          break;
      }
      setShowWorkflow(false);
      setWorkflowMode('choose');
      setWfDate(''); setWfTime('10:00'); setWfPropId(''); setWfReason('');
    } catch {}
    setWfLoading(false);
  };

  const openWorkflow = () => {
    setWorkflowMode('choose');
    setWfDate(''); setWfTime('10:00'); setWfReason('');
    setWfPropId(form.linked_property_id?.toString() || '');
    setShowWorkflow(true);
  };

  const saveNote = async () => {
    if (!noteDraft.trim()) return;
    const existing = form.notes || '';
    const timestamp = new Date().toLocaleString('en-GB');
    const newNotes = existing ? `${existing}\n\n[${timestamp}]\n${noteDraft.trim()}` : `[${timestamp}]\n${noteDraft.trim()}`;
    setField('notes', newNotes);
    await save({ notes: newNotes });
    setNoteDraft('');
  };

  if (!data) return <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-sm">Loading...</div>;

  const name = [data.first_name_1, data.last_name_1].filter(Boolean).join(' ') || 'Unknown';
  const kycDone = !!form.kyc_completed_1;
  const propertyLinked = !!form.linked_property_id;
  const hasDocs = docs.length > 0;
  const completionItems = [kycDone, propertyLinked, hasDocs];
  const completionPct = Math.round((completionItems.filter(Boolean).length / completionItems.length) * 100);

  const selectedProp = properties.find(p => p.id === Number(form.linked_property_id));

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 md:px-6 h-16 border-b border-[var(--border-subtle)] shrink-0">
        <button onClick={onBack} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] md:hidden mr-1">
          <ArrowLeft size={20} />
        </button>
        <Avatar name={name} size="md" />
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold truncate">{name}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[form.status] || ''}`}>
            {STATUS_LABELS[form.status] || form.status}
          </span>
        </div>
        {editing ? (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              <X size={14} className="mr-1" />Cancel
            </Button>
            <Button variant="gradient" size="sm" onClick={() => { save(); setEditing(false); }} disabled={saving}>
              <Save size={14} className="mr-1.5" />{saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil size={14} className="mr-1.5" />Edit
          </Button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left: tabs */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex border-b border-[var(--border-subtle)] px-4 md:px-6">
            {(['applicant', 'activity', 'notes'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t ? 'border-orange-500 text-[var(--text-primary)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}>
                {t === 'applicant' ? 'Applicant Info' : t === 'activity' ? 'Activity' : 'Notes'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            {/* ═══ APPLICANT TAB ═══ */}
            {tab === 'applicant' && (
              <div className="space-y-6 max-w-4xl">

                {/* ── Applicant 1 ── */}
                <div>
                  <SectionDivider icon={<User size={16} />} title="Applicant 1">
                    {editing ? (
                      <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                        <input type="checkbox" checked={!!form.kyc_completed_1}
                          onChange={e => setField('kyc_completed_1', e.target.checked)}
                          className="w-4 h-4 rounded accent-orange-500" />
                        KYC Complete
                      </label>
                    ) : form.kyc_completed_1 ? (
                      <span className="text-xs text-emerald-400 font-medium">KYC ✓</span>
                    ) : (
                      <span className="text-xs text-[var(--text-muted)]">KYC Pending</span>
                    )}
                  </SectionDivider>
                  <ApplicantFields form={form} setField={setField} suffix="1" editing={editing} />
                </div>

                {/* ── Employment History 1 ── */}
                <div>
                  <SectionDivider icon={<Briefcase size={16} />} title="Employment History" />
                  <EmploymentFields form={form} setField={setField} suffix="1" editing={editing} />
                </div>

                {/* ── Renting Requirements ── */}
                <div>
                  <SectionDivider icon={<Home size={16} />} title="Renting Requirements" color="text-pink-400" />
                  {editing ? (
                    <div className="space-y-4">
                      <RadioGroup label="Tenancy Type Wanted" value={form.tenancy_type_wanted || ''} onChange={v => setField('tenancy_type_wanted', v)}
                        options={[
                          { value: 'Long-term', label: 'Long-term' },
                          { value: 'Short-term', label: 'Short-term' },
                          { value: 'Interim', label: 'Interim' },
                        ]} />
                      <RadioGroup label="Reason for Renting" value={form.renting_reason || ''} onChange={v => setField('renting_reason', v)}
                        options={[
                          { value: 'First time tenant', label: 'First time tenant' },
                          { value: 'Family move', label: 'Family move' },
                          { value: 'Workplace relocation', label: 'Workplace relocation' },
                          { value: 'Studying', label: 'Studying' },
                          { value: 'Other', label: 'Other' },
                        ]} />
                      <RadioGroup label="Property Type Wanted" value={form.property_type_wanted || ''} onChange={v => setField('property_type_wanted', v)}
                        options={[
                          { value: 'House', label: 'House' },
                          { value: 'Bungalow', label: 'Bungalow' },
                          { value: 'Flat', label: 'Flat' },
                          { value: 'Studio apartment', label: 'Studio apartment' },
                          { value: 'Shared', label: 'Shared' },
                          { value: 'Sheltered', label: 'Sheltered' },
                          { value: 'Other', label: 'Other' },
                        ]} />
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Select label="Bedrooms Required" value={form.bedrooms_required?.toString() || ''} onChange={v => setField('bedrooms_required', v ? Number(v) : null)} options={BEDROOMS_OPTIONS} />
                        <RadioGroup label="Off Road Parking" value={form.parking_required || ''} onChange={v => setField('parking_required', v)}
                          options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }, { value: 'Preferred', label: 'Preferred' }]} />
                        <Input label="Rent Min £" value={form.rent_min?.toString() || ''} onChange={v => setField('rent_min', v ? Number(v) : null)} placeholder="250" type="number" />
                        <Input label="Rent Max £" value={form.rent_max?.toString() || ''} onChange={v => setField('rent_max', v ? Number(v) : null)} placeholder="2500" type="number" />
                      </div>
                      <Input label="Desired Locations (up to 5)" value={form.desired_locations || ''} onChange={v => setField('desired_locations', v)} placeholder="e.g. Manchester, Salford, Didsbury" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <ReadField label="Tenancy Type" value={form.tenancy_type_wanted} />
                      <ReadField label="Reason for Renting" value={form.renting_reason} />
                      <ReadField label="Property Type" value={form.property_type_wanted} />
                      <ReadField label="Bedrooms Required" value={form.bedrooms_required} />
                      <ReadField label="Off Road Parking" value={form.parking_required} />
                      <ReadField label="Rent Range" value={form.rent_min || form.rent_max ? `£${form.rent_min || 0} — £${form.rent_max || '∞'}` : null} />
                      <div className="md:col-span-3">
                        <ReadField label="Desired Locations" value={form.desired_locations} />
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Joint Application Toggle ── */}
                {editing ? (
                  <label className="flex items-center gap-3 cursor-pointer py-3 px-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] w-fit">
                    <input type="checkbox" checked={jointApp} onChange={e => { setJointApp(e.target.checked); setField('is_joint_application', e.target.checked); }}
                      className="w-4 h-4 rounded accent-orange-500" />
                    <Users size={16} className="text-pink-400" />
                    <span className="text-sm text-[var(--text-primary)] font-medium">Joint Application</span>
                  </label>
                ) : jointApp ? (
                  <div className="flex items-center gap-2 py-2">
                    <Users size={16} className="text-pink-400" />
                    <span className="text-sm font-medium">Joint Application</span>
                  </div>
                ) : null}

                {/* ── Applicant 2 ── */}
                {jointApp && (
                  <>
                    <div>
                      <SectionDivider icon={<User size={16} />} title="Applicant 2" color="text-pink-400">
                        {editing ? (
                          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                            <input type="checkbox" checked={!!form.kyc_completed_2}
                              onChange={e => setField('kyc_completed_2', e.target.checked)}
                              className="w-4 h-4 rounded accent-orange-500" />
                            KYC Complete
                          </label>
                        ) : form.kyc_completed_2 ? (
                          <span className="text-xs text-emerald-400 font-medium">KYC ✓</span>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">KYC Pending</span>
                        )}
                      </SectionDivider>
                      <ApplicantFields form={form} setField={setField} suffix="2" editing={editing} />
                    </div>

                    <div>
                      <SectionDivider icon={<Briefcase size={16} />} title="Employment History 2" color="text-pink-400" />
                      <EmploymentFields form={form} setField={setField} suffix="2" editing={editing} />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ═══ ACTIVITY TAB ═══ */}
            {tab === 'activity' && (
              <div className="space-y-4">
                <h4 className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider">Timeline</h4>
                <div className="relative pl-6 border-l-2 border-[var(--border-subtle)] space-y-6">
                  <div className="relative">
                    <div className="absolute -left-[25px] w-3 h-3 rounded-full bg-orange-500" />
                    <p className="text-sm font-medium">Current Status: {STATUS_LABELS[data.status] || data.status}</p>
                    <p className="text-xs text-[var(--text-muted)]">{data.updated_at ? new Date(data.updated_at).toLocaleString('en-GB') : 'N/A'}</p>
                  </div>
                  {data.viewing_date && (
                    <div className="relative">
                      <div className="absolute -left-[25px] w-3 h-3 rounded-full bg-purple-500" />
                      <p className="text-sm font-medium">Viewing Scheduled</p>
                      <p className="text-xs text-[var(--text-muted)]">{new Date(data.viewing_date).toLocaleString('en-GB')}</p>
                    </div>
                  )}
                  <div className="relative">
                    <div className="absolute -left-[25px] w-3 h-3 rounded-full bg-blue-500" />
                    <p className="text-sm font-medium">Enquiry Created</p>
                    <p className="text-xs text-[var(--text-muted)]">{new Date(data.created_at).toLocaleString('en-GB')}</p>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ NOTES TAB ═══ */}
            {tab === 'notes' && (
              <div className="space-y-4">
                <h4 className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider">Notes</h4>
                {form.notes ? (
                  <div className="bg-[var(--bg-subtle)] rounded-xl p-4 whitespace-pre-wrap text-sm text-[var(--text-primary)]">
                    {form.notes}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">No notes yet.</p>
                )}
                <div>
                  <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="Add a note..."
                    rows={3}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none resize-none" />
                  <Button variant="gradient" size="sm" onClick={saveNote} disabled={!noteDraft.trim()} className="mt-2">
                    <Save size={14} className="mr-1.5" /> Add Note
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══ Right Sidebar ═══ */}
        <div className="hidden lg:flex w-[300px] shrink-0 border-l border-[var(--border-subtle)] flex-col overflow-y-auto p-4 space-y-5">
          {/* ACTIONS */}
          <div>
            <h4 className="text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wider mb-3">Actions</h4>
            <button onClick={openWorkflow}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-gradient-to-r from-orange-500 to-pink-500 text-white hover:opacity-90 transition-opacity">
              <ArrowRight size={14} /> Progress / Reject
            </button>
          </div>

          {/* PROPERTY */}
          <div>
            <h4 className="text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wider mb-3">Property</h4>
            <select value={form.linked_property_id || ''} onChange={e => setField('linked_property_id', e.target.value ? Number(e.target.value) : null)}
              className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] appearance-none focus:outline-none mb-2">
              <option value="">No property linked</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>
                  {p.address}{p.postcode ? `, ${p.postcode}` : ''}{p.rent ? ` - £${p.rent}/mo` : ''}
                </option>
              ))}
            </select>
            {selectedProp && (
              <a href="/properties" className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1">
                View property <ExternalLink size={12} />
              </a>
            )}
          </div>

          {/* DOCUMENTS */}
          <div>
            <h4 className="text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wider mb-3">Documents</h4>
            <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-dashed border-[var(--border-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors mb-2">
              <Upload size={14} /> Upload
            </button>
            {docs.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] text-center py-2">No documents uploaded yet</p>
            ) : (
              docs.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-sm py-1">
                  <FileText size={14} className="text-[var(--text-muted)]" /> {d}
                </div>
              ))
            )}
          </div>

          {/* APPLICATION STATUS */}
          <div>
            <h4 className="text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wider mb-3">Application Status</h4>
            <div className="space-y-2 mb-3">
              {[
                { label: 'KYC (Applicant 1)', done: kycDone },
                { label: 'Property Linked', done: propertyLinked },
                { label: 'Documents', done: hasDocs },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2 text-sm">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${item.done ? 'bg-green-500' : 'bg-[var(--bg-input)] border border-[var(--border-input)]'}`}>
                    {item.done && <CheckCircle size={12} className="text-white" />}
                  </div>
                  <span className={item.done ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>{item.label}</span>
                </div>
              ))}
            </div>
            <div className="w-full bg-[var(--bg-input)] rounded-full h-2 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-orange-500 to-pink-500 rounded-full transition-all duration-500"
                style={{ width: `${completionPct}%` }} />
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1.5 text-center">{completionPct}% complete</p>
          </div>
        </div>
      </div>

      {/* ═══ Workflow Modal ═══ */}
      {showWorkflow && (
        <div className="fixed inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowWorkflow(false)}>
          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-input)] w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
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
                <button onClick={() => setWorkflowMode('viewing')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center"><Eye size={14} className="text-white" /></div>
                  <div className="flex-1"><p className="text-sm font-medium">Book Viewing</p><p className="text-xs text-[var(--text-muted)]">Select date, time & property</p></div>
                  <ArrowRight size={14} className="text-[var(--text-muted)]" />
                </button>
                <button onClick={() => setWorkflowMode('awaiting')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center"><Clock size={14} className="text-white" /></div>
                  <div className="flex-1"><p className="text-sm font-medium">Awaiting Client Response</p><p className="text-xs text-[var(--text-muted)]">Set follow-up date</p></div>
                  <ArrowRight size={14} className="text-[var(--text-muted)]" />
                </button>
                <button onClick={() => setWorkflowMode('onboarding')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center"><UserPlus size={14} className="text-white" /></div>
                  <div className="flex-1"><p className="text-sm font-medium">Start Onboarding</p><p className="text-xs text-[var(--text-muted)]">Optional follow-up date</p></div>
                  <ArrowRight size={14} className="text-[var(--text-muted)]" />
                </button>
                <div className="h-px bg-[var(--border-subtle)] my-3" />
                <button onClick={() => setWorkflowMode('reject')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center"><XCircle size={14} className="text-white" /></div>
                  <div className="flex-1"><p className="text-sm font-medium text-red-400">Reject & Archive</p><p className="text-xs text-[var(--text-muted)]">Removes from queue, stays searchable</p></div>
                  <ArrowRight size={14} className="text-[var(--text-muted)]" />
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <button onClick={() => setWorkflowMode('choose')} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">← Back</button>
                {workflowMode === 'viewing' && (
                  <>
                    <Select label="Link to Property" value={wfPropId} onChange={setWfPropId}
                      options={[{ value: '', label: 'Select property...' }, ...properties.map(p => ({ value: String(p.id), label: `${p.address}${p.postcode ? `, ${p.postcode}` : ''}` }))]} />
                    <Input label="Viewing Date" value={wfDate} onChange={setWfDate} type="date" />
                    <Input label="Viewing Time" value={wfTime} onChange={setWfTime} type="time" />
                    <p className="text-xs text-[var(--text-muted)]">Creates a Property Viewing. Card disappears from queue and reappears on the viewing date.</p>
                  </>
                )}
                {workflowMode === 'awaiting' && (
                  <>
                    <Input label="Follow-up Date" value={wfDate} onChange={setWfDate} type="date" />
                    <p className="text-xs text-[var(--text-muted)]">Card disappears from the queue and reappears on this date.</p>
                  </>
                )}
                {workflowMode === 'onboarding' && (
                  <>
                    <Input label="Follow-up Date (optional)" value={wfDate} onChange={setWfDate} type="date" />
                    <p className="text-xs text-[var(--text-muted)]">{wfDate ? 'Card will disappear and reappear on this date.' : 'Card stays visible in the Onboarding column.'}</p>
                  </>
                )}
                {workflowMode === 'reject' && (
                  <>
                    <div>
                      <label className="block text-xs text-[var(--text-secondary)] mb-1.5 font-medium">Reason (optional)</label>
                      <textarea value={wfReason} onChange={e => setWfReason(e.target.value)} rows={3}
                        className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none resize-none"
                        placeholder="Reason for rejection..." />
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">Record will be archived but kept on file for future reference.</p>
                  </>
                )}
                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setShowWorkflow(false)}>Cancel</Button>
                  <Button
                    variant={workflowMode === 'reject' ? 'outline' : 'gradient'}
                    onClick={handleWorkflow}
                    disabled={wfLoading || (workflowMode === 'viewing' && (!wfDate || !wfPropId)) || (workflowMode === 'awaiting' && !wfDate)}
                    className={workflowMode === 'reject' ? 'border-red-500/50 text-red-400 hover:bg-red-500/10' : ''}
                  >
                    {wfLoading ? 'Saving...' : workflowMode === 'reject' ? 'Reject & Archive' : 'Confirm'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───
export default function EnquiriesV3() {
  const api = useApi();
  const nav = useNavigate();
  const [rawEnquiries, setRawEnquiries] = useState<EnquiryRaw[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [properties, setProperties] = useState<{ id: number; address: string; postcode?: string; rent_amount?: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filterPropId, setFilterPropId] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', status: 'new', notes: '' });
  const [propDropOpen, setPropDropOpen] = useState(false);
  const [propSearch, setPropSearch] = useState('');
  const propDropRef = React.useRef<HTMLDivElement>(null);

  // Close property dropdown on outside click
  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (propDropRef.current && !propDropRef.current.contains(e.target as Node)) setPropDropOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const load = async () => {
    try {
      const [data, props] = await Promise.all([
        api.get('/api/tenant-enquiries'),
        api.get('/api/properties').catch(() => []),
      ]);
      const raw = Array.isArray(data) ? data : data.enquiries || [];
      setRawEnquiries(raw);
      setEnquiries(raw.map(mapEnquiry));
      setProperties(Array.isArray(props) ? props : []);
    } catch { setEnquiries([]); setRawEnquiries([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Same visibility logic as kanban
  const isFuture = (d?: string | null) => {
    if (!d) return false;
    const date = new Date(d);
    const today = new Date(); today.setHours(0,0,0,0);
    return date > today;
  };

  const visibleRawIds = new Set(
    rawEnquiries.filter(e => {
      if (filterPropId && e.linked_property_id !== Number(filterPropId)) return false;
      if (e.status === 'rejected') return showArchive;
      if (showArchive) return e.status === 'rejected';
      if (e.status === 'awaiting_response' && isFuture(e.follow_up_date)) return false;
      if (e.status === 'viewing_booked' && isFuture(e.viewing_date)) return false;
      if (e.status === 'onboarding' && e.follow_up_date && isFuture(e.follow_up_date)) return false;
      return true;
    }).map(e => e.id)
  );

  const filtered = enquiries.filter(e => {
    if (!visibleRawIds.has(e.id)) return false;
    if (!search) return true;
    return e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.email.toLowerCase().includes(search.toLowerCase());
  });

  const archivedCount = rawEnquiries.filter(e => e.status === 'rejected').length;

  const addEnquiry = async () => {
    try {
      const [firstName, ...lastParts] = form.name.trim().split(' ');
      await api.post('/api/tenant-enquiries', {
        first_name_1: firstName || '',
        last_name_1: lastParts.join(' ') || '',
        email_1: form.email,
        phone_1: form.phone,
        status: form.status,
        notes: form.notes,
      });
      setShowAdd(false);
      setForm({ name: '', email: '', phone: '', status: 'new', notes: '' });
      await load();
    } catch {}
  };

  const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }));

  const selectedPropObj = filterPropId ? properties.find(p => p.id === Number(filterPropId)) : null;
  const filteredProps = properties.filter(p =>
    !propSearch || p.address.toLowerCase().includes(propSearch.toLowerCase()) || (p.postcode || '').toLowerCase().includes(propSearch.toLowerCase())
  );

  return (
    <V3Layout hideTopBar>
      <div className="flex h-full">
        {/* Left Panel */}
        <div className={`w-full md:w-[350px] shrink-0 border-r border-[var(--border-subtle)] flex flex-col ${selectedId != null ? 'hidden md:flex' : 'flex'}`}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 h-14 border-b border-[var(--border-subtle)]">
            <h2 className="text-lg font-bold">Enquiries</h2>
            <div className="flex items-center gap-1">
              <button onClick={() => nav('/v3/enquiries/kanban')} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors" title="Kanban view">
                <LayoutGrid size={16} />
              </button>
              <Button variant="ghost" size="sm" onClick={() => setShowAdd(true)}>
                <Plus size={16} />
              </Button>
            </div>
          </div>

          {/* Property Selector */}
          <div className="px-4 py-2.5 border-b border-[var(--border-subtle)]" ref={propDropRef}>
            <div className="relative">
              <button onClick={() => setPropDropOpen(!propDropOpen)}
                className="w-full flex items-center gap-2.5 pl-3 pr-3 py-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-sm text-[var(--text-primary)] hover:border-[var(--border-input)] transition-colors">
                <Building2 size={14} className="text-[var(--text-muted)] shrink-0" />
                <span className="flex-1 text-left truncate text-sm">
                  {selectedPropObj ? selectedPropObj.address : 'All Properties'}
                </span>
                {filterPropId && (
                  <span className="text-[10px] bg-gradient-to-r from-orange-500 to-pink-500 text-white px-1.5 py-0.5 rounded-full font-medium shrink-0">
                    {rawEnquiries.filter(e => e.linked_property_id === Number(filterPropId) && e.status !== 'rejected').length}
                  </span>
                )}
                <ChevronDown size={14} className={`text-[var(--text-muted)] shrink-0 transition-transform ${propDropOpen ? 'rotate-180' : ''}`} />
              </button>

              {propDropOpen && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl shadow-2xl shadow-black/30 z-50 overflow-hidden">
                  <div className="p-2.5 border-b border-[var(--border-subtle)]">
                    <input value={propSearch} onChange={e => setPropSearch(e.target.value)} placeholder="Search properties..."
                      autoFocus
                      className="w-full pl-3 pr-3 py-2 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-input)] transition-colors" />
                  </div>
                  <div className="max-h-[240px] overflow-y-auto py-1">
                    <button onClick={() => { setFilterPropId(''); setPropDropOpen(false); setPropSearch(''); }}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors ${!filterPropId ? 'bg-[var(--bg-subtle)]' : ''}`}>
                      <div className="w-7 h-7 rounded-lg bg-[var(--bg-hover)] flex items-center justify-center shrink-0">
                        <Building2 size={13} className="text-[var(--text-muted)]" />
                      </div>
                      <span className="text-sm font-medium flex-1">All Properties</span>
                      {!filterPropId && <div className="w-2 h-2 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 shrink-0" />}
                    </button>
                    {filteredProps.map(p => {
                      const count = rawEnquiries.filter(e => e.linked_property_id === p.id && e.status !== 'rejected').length;
                      const isSelected = filterPropId === String(p.id);
                      return (
                        <button key={p.id} onClick={() => { setFilterPropId(String(p.id)); setPropDropOpen(false); setPropSearch(''); }}
                          className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors ${isSelected ? 'bg-[var(--bg-subtle)]' : ''}`}>
                          <div className="w-7 h-7 rounded-lg bg-[var(--bg-hover)] flex items-center justify-center shrink-0 text-[10px] font-bold text-[var(--text-muted)]">
                            {p.address[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{p.address}</p>
                            <p className="text-[10px] text-[var(--text-muted)]">{p.postcode || ''}{p.rent_amount ? ` · £${p.rent_amount}/mo` : ''}</p>
                          </div>
                          {count > 0 && <span className="text-[10px] bg-[var(--bg-hover)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded-full">{count}</span>}
                          {isSelected && <div className="w-2 h-2 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Archive toggle */}
            <div className="flex items-center gap-2 mt-2">
              <button onClick={() => setShowArchive(!showArchive)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium border transition-colors ${
                  showArchive ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-transparent border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}>
                <Archive size={11} />
                {showArchive ? 'Showing Archived' : 'Archive'}
                {!showArchive && archivedCount > 0 && (
                  <span className="bg-[var(--bg-hover)] px-1 py-0.5 rounded-full">{archivedCount}</span>
                )}
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="px-4 py-2.5">
            <SearchBar value={search} onChange={setSearch} placeholder="Search enquiries..." />
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-[var(--text-muted)] text-sm">Loading...</div>
            ) : filtered.length === 0 ? (
              <EmptyState message={showArchive ? 'No archived enquiries' : 'No enquiries found'} />
            ) : (
              filtered.map(e => (
                <div key={e.id} onClick={() => setSelectedId(e.id)}
                  className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors border-b border-[var(--border-subtle)] ${
                    selectedId === e.id ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-subtle)]'
                  }`}>
                  <Avatar name={e.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{e.name}</p>
                      <span className="text-[10px] text-[var(--text-muted)] shrink-0 ml-2">{formatTime(e.created_at)}</span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[e.status] || 'bg-[var(--bg-input)] text-[var(--text-secondary)]'}`}>
                      {STATUS_LABELS[e.status] || e.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel */}
        <div className={`flex-1 flex flex-col min-w-0 ${selectedId != null ? 'flex' : 'hidden md:flex'}`}>
          {selectedId != null ? (
            <EnquiryDetail key={selectedId} enquiryId={selectedId} api={api} onBack={() => setSelectedId(null)} onUpdated={load} />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState message="Select an enquiry to view details" />
            </div>
          )}
        </div>

        {/* Add Modal */}
        {showAdd && (
          <div className="fixed inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAdd(false)}>
            <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-input)] w-full max-w-[480px] max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold">Add Enquiry</h3>
                <button onClick={() => setShowAdd(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <Input label="Name" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="Full name" />
                <Input label="Email" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} placeholder="email@example.com" type="email" />
                <Input label="Phone" value={form.phone} onChange={v => setForm(p => ({ ...p, phone: v }))} placeholder="Phone number" />
                <Select label="Status" value={form.status} onChange={v => setForm(p => ({ ...p, status: v }))} options={STATUS_OPTIONS} />
                <Input label="Notes" value={form.notes} onChange={v => setForm(p => ({ ...p, notes: v }))} placeholder="Initial notes..." />
                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
                  <Button variant="gradient" onClick={addEnquiry} disabled={!form.name || !form.email}>Add Enquiry</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </V3Layout>
  );
}
