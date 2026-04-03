import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { GlassCard, Button, Avatar, SearchBar, Input, Select, Tag, EmptyState, DataTable, DatePicker } from '../components/v3';
import BulkActions from '../components/v3/BulkActions';
import { useApi } from '../hooks/useApi';
import { Plus, X, Calendar, LayoutGrid, List, Building2, ArrowRight, XCircle, Mail, Phone } from 'lucide-react';
import { BookingIcon, AwaitingIcon, OnboardingIcon } from '../components/v3/icons/FlemingIcons';
import { useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { usePortfolio, filterByPortfolio } from '../context/PortfolioContext';
import { SearchDropdown } from '../components/v3/SearchDropdown';
import OnboardingWizard from '../components/v3/OnboardingWizard';
import { calculateSmsSegments } from '../utils/sms';

interface EnquiryRaw {
  id: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface Property {
  id: number;
  address: string;
  postcode: string;
  rent: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface Enquiry {
  id: number;
  name: string;
  email: string;
  phone: string;
  status: string;
  follow_up_date: string;
  linked_property_id: number | null;
  created_at: string;
  landlord_type?: string;
}

function mapEnquiry(raw: EnquiryRaw): Enquiry {
  return {
    id: raw.id,
    name: [raw.first_name_1, raw.last_name_1].filter(Boolean).join(' ') || 'Unknown',
    email: raw.email_1 || '',
    phone: raw.phone_1 || '',
    status: raw.status || 'new',
    follow_up_date: raw.follow_up_date || '',
    linked_property_id: raw.linked_property_id || null,
    created_at: raw.created_at,
    landlord_type: raw.landlord_type || undefined,
  };
}

const STATUSES = [
  { key: 'new', label: 'New', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { key: 'viewing_booked', label: 'Viewing Booked', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  { key: 'awaiting_response', label: 'Follow Up', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { key: 'onboarding', label: 'Onboarding', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  { key: 'converted', label: 'Converted', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { key: 'rejected', label: 'Rejected', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
];

function statusStyle(s: string) {
  return STATUSES.find(st => st.key === s)?.color || 'bg-[var(--bg-hover)] text-[var(--text-muted)]';
}
function statusLabel(s: string) {
  return STATUSES.find(st => st.key === s)?.label || s;
}

function formatDate(d: string) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isOverdue(d: string) {
  if (!d) return false;
  return new Date(d) < new Date(new Date().toDateString());
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
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${value === o.value
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

const NATIONALITY_OPTIONS = [
  { value: '', label: '-' }, { value: 'British', label: 'British' }, { value: 'Irish', label: 'Irish' },
  { value: 'Polish', label: 'Polish' }, { value: 'Romanian', label: 'Romanian' }, { value: 'Indian', label: 'Indian' },
  { value: 'Pakistani', label: 'Pakistani' }, { value: 'Other', label: 'Other' },
];

const EMPLOYMENT_OPTIONS = [
  { value: '', label: '-' }, { value: 'Employed', label: 'Employed' }, { value: 'Self-Employed', label: 'Self-Employed' },
  { value: 'Unemployed', label: 'Unemployed' }, { value: 'Student', label: 'Student' }, { value: 'Retired', label: 'Retired' },
];

const INDUSTRY_OPTIONS = [
  { value: '', label: '-' }, { value: 'Accounting & Finance', label: 'Accounting & Finance' },
  { value: 'Construction', label: 'Construction' }, { value: 'Education', label: 'Education' },
  { value: 'Healthcare', label: 'Healthcare' }, { value: 'IT & Technology', label: 'IT & Technology' },
  { value: 'Retail', label: 'Retail' }, { value: 'Other', label: 'Other' },
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const BEDROOMS_OPTIONS = [
  { value: '', label: '-' }, ...Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
];

// ─── Applicant Fields Block ───
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ApplicantFields({ form, setField, suffix, editing }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: Record<string, any>; setField: (k: string, v: string | number | null) => void; suffix: string; editing?: boolean;
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
        <DatePicker label="Date of Birth" value={form[f('date_of_birth_')] || ''} onChange={v => setField(f('date_of_birth_'), v)} />
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function EmploymentFields({ form, setField, suffix, editing }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: Record<string, any>; setField: (k: string, v: string | number | null) => void; suffix: string; editing?: boolean;
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
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <ReadField label="Annual Salary" value={form[f('income_')] ? `£${Number(form[f('income_')]).toLocaleString()}` : null} />
          <ReadField label="Employer" value={form[f('employer_')]} />
          <ReadField label="Contract Type" value={form[f('contract_type_')]} />
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
        <Input label="Annual Salary £" value={form[f('income_')]?.toString() || ''} onChange={v => setField(f('income_'), v ? Number(v) : null)} placeholder="0" type="number" />
        <Input label="Employer" value={form[f('employer_')] || ''} onChange={v => setField(f('employer_'), v)} placeholder="Employer name" />
      </div>
      <RadioGroup label="Contract Type" value={form[f('contract_type_')] || ''} onChange={v => setField(f('contract_type_'), v)}
        options={[
          { value: 'Permanent', label: 'Permanent' },
          { value: 'Fixed position', label: 'Fixed position' },
          { value: 'Contract role', label: 'Contract role' },
          { value: 'Temporary or agency', label: 'Temporary or agency' },
        ]} />
    </>
  );
}

// ─── Main Page ───
export default function Enquiries() {
  const api = useApi();
  const navigate = useNavigate();
  const [rawEnquiries, setRawEnquiries] = useState<EnquiryRaw[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [propertyFilter, setPropertyFilter] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '', property_id: '' });
  const [saving, setSaving] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { portfolioFilter } = usePortfolio();

  // Workflow state
  const [workflowEnquiry, setWorkflowEnquiry] = useState<Enquiry | null>(null);
  const [workflowMode, setWorkflowMode] = useState<'choose' | 'viewing' | 'follow_up' | 'onboarding' | 'reject'>('choose');
  const [wfDate, setWfDate] = useState('');
  const [wfTime, setWfTime] = useState('10:00');
  const [wfPropId, setWfPropId] = useState('');
  const [wfReason, setWfReason] = useState('');
  const [wfLoading, setWfLoading] = useState(false);
  const [wfAssignedTo, setWfAssignedTo] = useState('');
  const [wfViewingWith, setWfViewingWith] = useState('');
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [smsBody, setSmsBody] = useState('');
  const [allUsers, setAllUsers] = useState<{ id: number; name: string; email: string }[]>([]);
  // Onboarding wizard
  const [onboardingEnquiryId, setOnboardingEnquiryId] = useState<number | null>(null);
  const [onboardingData, setOnboardingData] = useState<Record<string, string | number | boolean | null> | null>(null);
  // Bulk actions state
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const load = async () => {
    try {
      const [data, props, usersList] = await Promise.all([
        api.get('/api/tenant-enquiries'),
        api.get('/api/properties').catch(() => []),
        api.get('/api/users').catch(() => []),
      ]);
      setAllUsers(Array.isArray(usersList) ? usersList : []);
      const raw = Array.isArray(data) ? data : data.enquiries || [];
      setRawEnquiries(raw);
      setEnquiries(raw.map(mapEnquiry));
      setProperties(Array.isArray(props) ? props : []);
    } catch { /* fetch failed, reset state */ setEnquiries([]); setRawEnquiries([]); }
    setLoading(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const portfolioFiltered = filterByPortfolio(enquiries, portfolioFilter);
  const filtered = portfolioFiltered.filter(e => {
    const matchSearch = !search || [e.name, e.email, e.phone]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()));
    if (propertyFilter && e.linked_property_id !== propertyFilter) return false;
    if (statusFilter === 'active') return matchSearch && !['converted', 'rejected'].includes(e.status);
    if (statusFilter !== 'all') return matchSearch && e.status === statusFilter;
    return matchSearch;
  });

  const statusCounts = enquiries.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const activeCount = enquiries.filter(e => !['converted', 'rejected'].includes(e.status)).length;

  const followUpDue = enquiries.filter(e => e.follow_up_date && isOverdue(e.follow_up_date) && !['converted', 'rejected'].includes(e.status)).length;

  const addEnquiry = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const [firstName, ...lastParts] = form.name.trim().split(' ');
      await api.post('/api/tenant-enquiries', {
        first_name_1: firstName || '',
        last_name_1: lastParts.join(' ') || '',
        email_1: form.email,
        phone_1: form.phone,
        notes: form.notes,
        linked_property_id: form.property_id ? Number(form.property_id) : null,
        status: 'new',
      });
      setShowAdd(false);
      setForm({ name: '', email: '', phone: '', notes: '', property_id: '' });
      await load();
    } catch (error) {
      console.error('Failed to add enquiry:', error);
      alert('Failed to add enquiry. Please try again.');
    }
    setSaving(false);
  };

  const generateViewingSms = (firstName: string, propId: string, date: string, time: string) => {
    const prop = properties.find(p => p.id === Number(propId));
    const addr = prop?.address || '[property address]';
    let d = '[date]';
    if (date) { const parts = date.split('-'); if (parts.length === 3) d = `${parts[2]}/${parts[1]}/${parts[0]}`; }
    const t = time ? ' at ' + time : '';
    return `Hi ${firstName || '[name]'}, your appointment has been booked to view ${addr} on ${d}${t}. If you are running late or need to reschedule then please call our offices on 01902 212 415. See you soon!`;
  };

  const openWorkflow = (e: Enquiry, ev: React.MouseEvent) => {
    ev.stopPropagation();
    setWorkflowEnquiry(e);
    setWorkflowMode('choose');
    const propId = e.linked_property_id ? String(e.linked_property_id) : '';
    setWfDate(''); setWfTime('10:00'); setWfPropId(propId); setWfReason('');
    setWfAssignedTo(''); setWfViewingWith(''); setSmsEnabled(!!e.phone);
    const fn = e.name?.split(' ')[0] || '';
    setSmsBody(generateViewingSms(fn, propId, '', '10:00'));
  };

  const doWorkflowAction = async () => {
    if (!workflowEnquiry) return;
    setWfLoading(true);
    try {
      const raw = rawEnquiries.find(r => r.id === workflowEnquiry.id);
      if (!raw) return;

      switch (workflowMode) {
        case 'viewing':
          if (wfPropId && wfDate) {
            const name = workflowEnquiry.name;
            await api.post('/api/property-viewings', {
              property_id: Number(wfPropId), enquiry_id: workflowEnquiry.id,
              viewer_name: name, viewer_email: workflowEnquiry.email,
              viewer_phone: workflowEnquiry.phone, viewing_date: wfDate, viewing_time: wfTime,
              assigned_to: wfAssignedTo || null,
              send_sms: smsEnabled, sms_message: smsBody || null,
            });
            await api.put(`/api/tenant-enquiries/${workflowEnquiry.id}`, {
              ...raw, status: 'viewing_booked', linked_property_id: Number(wfPropId), viewing_date: wfDate, viewing_with: wfViewingWith || null,
            });
          }
          break;
        case 'follow_up':
          if (wfDate) {
            await api.put(`/api/tenant-enquiries/${workflowEnquiry.id}`, {
              ...raw, status: 'awaiting_response', follow_up_date: wfDate,
            });
            // Create follow-up task on agent's calendar
            await api.post('/api/tasks', {
              title: `Follow up: ${workflowEnquiry.name}`,
              description: wfViewingWith || `Follow up with ${workflowEnquiry.name} (${workflowEnquiry.phone || workflowEnquiry.email})`,
              priority: 'medium', status: 'pending', entity_type: 'tenant_enquiry',
              entity_id: workflowEnquiry.id, task_type: 'follow_up', due_date: wfDate,
              assigned_to: wfAssignedTo || null,
            }).catch(() => {});
            // Send SMS if enabled
            if (smsEnabled && workflowEnquiry.phone && smsBody) {
              await api.post('/api/sms/send', {
                enquiry_id: workflowEnquiry.id, to_phone: workflowEnquiry.phone, message_body: smsBody,
              }).catch(() => {});
            }
          }
          break;
        case 'onboarding':
          await api.put(`/api/tenant-enquiries/${workflowEnquiry.id}`, {
            ...raw, status: 'onboarding', follow_up_date: wfDate || null,
          });
          break;
        case 'reject':
          await api.put(`/api/tenant-enquiries/${workflowEnquiry.id}`, {
            ...raw, status: 'rejected', rejection_reason: wfReason,
          });
          // Send rejection SMS if enabled
          if (smsEnabled && workflowEnquiry.phone && smsBody) {
            await api.post('/api/sms/send', {
              enquiry_id: workflowEnquiry.id, to_phone: workflowEnquiry.phone, message_body: smsBody,
            }).catch(() => {});
          }
          break;
      }
      setWorkflowEnquiry(null);
      await load();
    } catch (error) {
      console.error('Failed to update enquiry workflow:', error);
      alert('Failed to update enquiry. Please try again.');
    }
    setWfLoading(false);
  };

  const propertyMap = properties.reduce((acc, p) => { acc[p.id] = p; return acc; }, {} as Record<number, Property>);

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedIds.length} enquir${selectedIds.length !== 1 ? 'ies' : 'y'}? This action cannot be undone.`
    );

    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await api.post('/api/tenant-enquiries/bulk-delete', { ids: selectedIds });
      setSelectedIds([]);
      await load();
    } catch (e) {
      console.error('Bulk delete error:', e);
      alert('Failed to delete enquiries. Please try again.');
    }
    setIsDeleting(false);
  };

  const toggleSelectEnquiry = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(e => e.id));
    }
  };

  // Kanban columns — reuse STATUSES minus converted/rejected
  const kanbanStatuses = STATUSES.filter(s => !['converted', 'rejected'].includes(s.key));

  const onDragEnd = async (result: DropResult) => {
    const { draggableId, destination, source } = result;
    if (!destination || destination.droppableId === source.droppableId) return;
    const enquiryId = parseInt(draggableId);
    const newStatus = destination.droppableId;
    const e = enquiries.find(eq => eq.id === enquiryId);
    if (!e) return;
    setWorkflowEnquiry(e);
    if (newStatus === 'awaiting_response') {
      setWorkflowMode('follow_up');
    } else if (newStatus === 'viewing_booked') {
      setWorkflowMode('viewing');
    } else if (newStatus === 'onboarding') {
      setWorkflowMode('onboarding');
    } else {
      // Direct status change
      const raw = rawEnquiries.find(r => r.id === enquiryId);
      if (raw) {
        try {
          await api.put(`/api/tenant-enquiries/${enquiryId}`, { ...raw, status: newStatus });
          await load();
        } catch (error) {
          console.error('Failed to update enquiry status:', error);
          alert('Failed to update enquiry status. Please try again.');
        }
      }
    }
  };

  return (
    <Layout title="Tenant Enquiries" breadcrumb={[{ label: 'Tenant Enquiries' }]}>
      <div className="p-4 md:p-8 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Active Enquiries', value: activeCount, accent: true },
            { label: 'Follow-ups Due', value: followUpDue, warn: followUpDue > 0 },
            { label: 'Viewing Booked', value: statusCounts['viewing_booked'] || 0 },
            { label: 'Onboarding', value: statusCounts['onboarding'] || 0 },
          ].map(s => (
            <GlassCard key={s.label} className="p-4">
              <p className="text-xs text-[var(--text-muted)]">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.warn ? 'text-orange-400' : s.accent ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                {s.value}
              </p>
            </GlassCard>
          ))}
        </div>

        {/* Search + View Toggle + Add */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1"><SearchBar value={search} onChange={setSearch} placeholder="Search enquiries..." /></div>
          <div className="flex items-center gap-1 bg-[var(--bg-input)] rounded-xl p-1 border border-[var(--border-input)]">
            <button onClick={() => setViewMode('kanban')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'kanban' ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
              <LayoutGrid size={16} />
            </button>
            <button onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
              <List size={16} />
            </button>
          </div>
          <Button
            variant={editMode ? "outline" : "ghost"}
            onClick={() => {
              setEditMode(!editMode);
              if (editMode) setSelectedIds([]);
            }}
          >
            {editMode ? 'Cancel' : 'Edit'}
          </Button>
          <Button variant="gradient" onClick={() => setShowAdd(true)}>
            <Plus size={16} className="mr-2" /> Add Enquiry
          </Button>
        </div>

        {/* Property filter */}
        <div className="flex flex-wrap items-center gap-3">
          <SearchDropdown
            icon={<Building2 size={14} />}
            placeholder="Property"
            searchPlaceholder="Search properties..."
            options={properties.map(p => ({ id: p.id, label: p.address, subtitle: p.postcode }))}
            value={propertyFilter}
            onChange={setPropertyFilter}
          />

          {/* Status filter */}
          {[
            { key: 'active', label: `Active (${activeCount})` },
            { key: 'all', label: `All (${enquiries.length})` },
            ...STATUSES.map(s => ({ key: s.key, label: `${s.label} (${statusCounts[s.key] || 0})` })),
          ].map(f => (
            <Tag key={f.key} active={statusFilter === f.key} onClick={() => setStatusFilter(f.key)}>
              {f.label}
            </Tag>
          ))}
        </div>

        {/* Bulk Actions */}
        {editMode && (
          <BulkActions
            selectedIds={selectedIds}
            onClearSelection={() => setSelectedIds([])}
            onBulkDelete={handleBulkDelete}
            entityName="enquiry"
            isDeleting={isDeleting}
          />
        )}

        {/* Content */}
        {loading ? (
          <div className="text-center py-16 text-[var(--text-muted)] text-sm">Loading...</div>
        ) : viewMode === 'kanban' ? (
          /* ==================== KANBAN VIEW ==================== */
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {kanbanStatuses.filter(s => {
                if (statusFilter === 'active') return true;
                if (statusFilter === 'all') return true;
                return s.key === statusFilter;
              }).map(col => {
                const colEnquiries = enquiries.filter(e => {
                  const matchSearch = !search || [e.name, e.email, e.phone]
                    .some(v => v?.toLowerCase().includes(search.toLowerCase()));
                  if (propertyFilter && e.linked_property_id !== propertyFilter) return false;
                  return e.status === col.key && matchSearch;
                });
                return (
                  <div key={col.key} className="min-w-[280px] flex-1">
                    <div className={`rounded-xl border px-4 py-3 mb-3 ${col.color}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{col.label}</span>
                        <span className="text-xs bg-[var(--bg-input)] px-2 py-0.5 rounded-full">{colEnquiries.length}</span>
                      </div>
                    </div>
                    <Droppable droppableId={col.key}>
                      {(provided, snapshot) => (
                        <div ref={provided.innerRef} {...provided.droppableProps}
                          className={`space-y-3 min-h-[100px] rounded-xl transition-colors ${snapshot.isDraggingOver ? 'bg-[var(--accent-orange)]/5 ring-1 ring-[var(--accent-orange)]/20' : ''}`}>
                          {colEnquiries.length === 0 && !snapshot.isDraggingOver ? (
                            <p className="text-xs text-[var(--text-muted)] text-center py-8">No enquiries</p>
                          ) : colEnquiries.map((e, index) => (
                            <Draggable key={e.id} draggableId={String(e.id)} index={index}>
                              {(provided, snapshot) => (
                                <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
                                  style={provided.draggableProps.style}>
                                  <GlassCard className={`p-4 cursor-grab active:cursor-grabbing hover:border-[var(--accent-orange)]/30 transition-colors ${snapshot.isDragging ? 'ring-2 ring-[var(--accent-orange)]/40 shadow-lg' : ''}`}
                                    onClick={() => !snapshot.isDragging && navigate(`/enquiries/${e.id}`)}>
                                    <div className="flex items-start gap-3">
                                      <Avatar name={e.name} size="sm" />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{e.name}</p>
                                        {e.email && <p className="text-xs text-[var(--text-muted)] truncate flex items-center gap-1 mt-0.5"><Mail size={10} />{e.email}</p>}
                                        {e.phone && <p className="text-xs text-[var(--text-muted)] truncate flex items-center gap-1 mt-0.5"><Phone size={10} />{e.phone}</p>}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 mt-3 pt-2 border-t border-[var(--border-subtle)]">
                                      {e.follow_up_date && (
                                        <span className={`text-[10px] flex items-center gap-1 ${isOverdue(e.follow_up_date) ? 'text-orange-400 font-medium' : 'text-[var(--text-muted)]'}`}>
                                          <Calendar size={10} />{formatDate(e.follow_up_date)}
                                        </span>
                                      )}
                                      {e.linked_property_id && propertyMap[e.linked_property_id] && (
                                        <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                                          <Building2 size={10} />{propertyMap[e.linked_property_id].address.substring(0, 20)}...
                                        </span>
                                      )}
                                      <button onClick={(ev) => openWorkflow(e, ev)}
                                        className="ml-auto text-[10px] px-2.5 py-1 rounded-lg bg-gradient-to-r from-orange-500/20 to-pink-500/20 text-[var(--text-primary)] hover:from-orange-500/30 hover:to-pink-500/30 transition-colors font-medium">
                                        Progress / Reject
                                      </button>
                                    </div>
                                  </GlassCard>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                );
              })}
            </div>
          </DragDropContext>
        ) : filtered.length === 0 ? (
          <EmptyState message={search || statusFilter !== 'active' ? 'No enquiries match your filters' : 'No enquiries yet — add your first one'} />
        ) : (
          /* ==================== LIST VIEW ==================== */
          <>
            {editMode && (
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={selectedIds.length === filtered.length && filtered.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                />
                <span className="text-sm text-gray-400">
                  {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Select all'}
                </span>
              </div>
            )}
            <DataTable<Enquiry>
              columns={[
                ...(editMode ? [{
                  key: '_select' as const, header: '', width: 'w-12',
                  render: (e: Enquiry) => (
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(e.id)}
                      onChange={(ev) => {
                        ev.stopPropagation();
                        toggleSelectEnquiry(e.id);
                      }}
                      onClick={(ev) => ev.stopPropagation()}
                      className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                    />
                  ),
                }] : []),
                {
                  key: 'name', header: 'Name',
                render: (e) => (
                  <div className="flex items-center gap-3">
                    <Avatar name={e.name} size="sm" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{e.name}</p>
                      <p className="text-xs text-[var(--text-muted)] truncate md:hidden">{e.email || e.phone}</p>
                    </div>
                  </div>
                ),
              },
              {
                key: 'contact', header: 'Contact', hideClass: 'hidden md:table-cell',
                render: (e) => (
                  <div className="space-y-0.5">
                    {e.email && <p className="text-xs text-[var(--text-secondary)] truncate flex items-center gap-1"><Mail size={10} />{e.email}</p>}
                    {e.phone && <p className="text-xs text-[var(--text-muted)] flex items-center gap-1"><Phone size={10} />{e.phone}</p>}
                  </div>
                ),
              },
              {
                key: 'property', header: 'Property', hideClass: 'hidden lg:table-cell',
                render: (e) => e.linked_property_id && propertyMap[e.linked_property_id] ? (
                  <p className="text-xs text-[var(--text-secondary)] truncate max-w-[200px] flex items-center gap-1">
                    <Building2 size={10} className="text-[var(--text-muted)] shrink-0" />
                    {propertyMap[e.linked_property_id].address}
                  </p>
                ) : (
                  <span className="text-xs text-[var(--text-muted)]">—</span>
                ),
              },
              {
                key: 'status', header: 'Status',
                render: (e) => (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusStyle(e.status)}`}>
                    {statusLabel(e.status)}
                  </span>
                ),
              },
              {
                key: 'follow_up', header: 'Follow Up', hideClass: 'hidden sm:table-cell',
                render: (e) => e.follow_up_date ? (
                  <span className={`text-xs flex items-center gap-1 ${isOverdue(e.follow_up_date) ? 'text-orange-400 font-medium' : 'text-[var(--text-muted)]'}`}>
                    <Calendar size={10} />{formatDate(e.follow_up_date)}
                  </span>
                ) : (
                  <span className="text-xs text-[var(--text-muted)]">—</span>
                ),
              },
              {
                key: 'action', header: '', align: 'right', width: 'w-20',
                render: (e) => !['converted', 'rejected'].includes(e.status) ? (
                  <button onClick={(ev) => openWorkflow(e, ev)}
                    className="text-[10px] px-2.5 py-1 rounded-lg bg-gradient-to-r from-orange-500/20 to-pink-500/20 text-[var(--text-primary)] hover:from-orange-500/30 hover:to-pink-500/30 transition-colors font-medium whitespace-nowrap">
                    Progress / Reject
                  </button>
                ) : null,
              },
            ]}
            data={filtered}
            rowKey={(e) => e.id}
            onRowClick={(e) => !editMode && navigate(`/enquiries/${e.id}`)}
            />
          </>
        )}
      </div>

      {/* Add Enquiry Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-[var(--overlay-bg)] backdrop-blur-sm" onClick={() => setShowAdd(false)}>
          <div className="bg-[var(--bg-card)] border border-[var(--border-input)] rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-md space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Enquiry</h2>
              <button onClick={() => setShowAdd(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
            </div>
            <Input label="Full Name *" value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="First and last name" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} placeholder="email@example.com" type="email" />
              <Input label="Phone" value={form.phone} onChange={v => setForm({ ...form, phone: v })} placeholder="+44..." />
            </div>
            <Select label="Property" value={form.property_id} onChange={v => setForm({ ...form, property_id: v })}
              options={[{ value: '', label: 'Select property (optional)' }, ...properties.map(p => ({ value: String(p.id), label: `${p.address}${p.postcode ? `, ${p.postcode}` : ''}` }))]} />
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1.5">Notes</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none resize-none"
                placeholder="Initial notes..." />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button variant="gradient" onClick={addEnquiry} disabled={saving || !form.name.trim()}>
                {saving ? 'Adding...' : 'Add Enquiry'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Workflow Modal */}
      {workflowEnquiry && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-[var(--overlay-bg)] backdrop-blur-sm"
          onClick={() => setWorkflowEnquiry(null)}>
          <div className="bg-[var(--bg-card)] border border-[var(--border-input)] rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-md space-y-2"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Avatar name={workflowEnquiry.name} size="md" />
                <div>
                  <h3 className="text-lg font-bold">{workflowEnquiry.name}</h3>
                  <p className="text-xs text-[var(--text-muted)]">Update workflow</p>
                </div>
              </div>
              <button onClick={() => setWorkflowEnquiry(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
            </div>

            {workflowMode === 'choose' ? (
              <>
                <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-3">Progress</p>
                <button onClick={() => { setWorkflowMode('viewing'); if (workflowEnquiry) { const fn = workflowEnquiry.name?.split(' ')[0] || ''; setSmsBody(generateViewingSms(fn, wfPropId, wfDate, wfTime)); } }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center"><BookingIcon size={14} className="text-white" /></div>
                  <div className="flex-1"><p className="text-sm font-medium">Book Viewing</p><p className="text-xs text-[var(--text-muted)]">Select date, time & property</p></div>
                  <ArrowRight size={14} className="text-[var(--text-muted)]" />
                </button>
                <button onClick={() => { setWorkflowMode('follow_up'); setWfViewingWith(''); const fn = workflowEnquiry?.name?.split(' ')[0] || ''; setSmsBody(`Hi ${fn || '[name]'}, just following up on your property enquiry with Fleming Lettings. Are you still looking? Please let us know if you'd like to arrange a viewing or have any questions. Call us on 01902 212 415. - Fleming Lettings`); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center"><AwaitingIcon size={14} className="text-white" /></div>
                  <div className="flex-1"><p className="text-sm font-medium">Set Follow Up</p><p className="text-xs text-[var(--text-muted)]">Schedule a follow-up date</p></div>
                  <ArrowRight size={14} className="text-[var(--text-muted)]" />
                </button>
                <button onClick={async () => {
                  if (workflowEnquiry) {
                    try {
                      const full = await api.get(`/api/tenant-enquiries/${workflowEnquiry.id}`);
                      setOnboardingData(full);
                      setOnboardingEnquiryId(workflowEnquiry.id);
                      setWorkflowEnquiry(null);
                    } catch { /* failed to load enquiry for onboarding */ }
                  }
                }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center"><OnboardingIcon size={14} className="text-white" /></div>
                  <div className="flex-1"><p className="text-sm font-medium">Start Onboarding</p><p className="text-xs text-[var(--text-muted)]">Begin tenant onboarding</p></div>
                  <ArrowRight size={14} className="text-[var(--text-muted)]" />
                </button>
                <div className="h-px bg-[var(--border-subtle)] my-3" />
                <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-2">Archive</p>
                <button onClick={() => { setWorkflowMode('reject'); setSmsEnabled(false); const fn = workflowEnquiry?.name?.split(' ')[0] || ''; setSmsBody(`Hi ${fn || '[name]'}, thank you for your enquiry with Fleming Lettings. Unfortunately, we are unable to proceed with your application at this time. We wish you the best in your property search. - Fleming Lettings`); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center"><XCircle size={14} className="text-white" /></div>
                  <div className="flex-1"><p className="text-sm font-medium text-red-400">Reject & Archive</p><p className="text-xs text-[var(--text-muted)]">Archive this enquiry</p></div>
                  <ArrowRight size={14} className="text-[var(--text-muted)]" />
                </button>
              </>
            ) : (
              <div className="space-y-4">
                <button onClick={() => setWorkflowMode('choose')} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">← Back</button>
                {workflowMode === 'viewing' && (() => {
                  const firstName = workflowEnquiry?.name?.split(' ')[0] || '';
                  return (
                    <>
                      <Select label="Assign To (Agent)" value={wfAssignedTo} onChange={setWfAssignedTo} searchable
                        options={[{ value: '', label: 'Unassigned' }, ...allUsers.map(u => ({ value: u.name, label: u.name }))]} />
                      <Select label="Property *" searchable value={wfPropId} onChange={(v) => {
                        setWfPropId(v);
                        setSmsBody(generateViewingSms(firstName, v, wfDate, wfTime));
                      }}
                        options={[{ value: '', label: 'Select property...' }, ...properties.map(p => ({ value: String(p.id), label: `${p.address}${p.postcode ? `, ${p.postcode}` : ''}` }))]} />
                      <div className="grid grid-cols-2 gap-3">
                        <DatePicker label="Viewing Date *" value={wfDate} onChange={(v) => {
                          setWfDate(v);
                          setSmsBody(generateViewingSms(firstName, wfPropId, v, wfTime));
                        }} />
                        <div>
                          <label className="block text-xs text-[var(--text-secondary)] mb-1.5 font-medium">Viewing Time</label>
                          <input type="time" value={wfTime} onChange={e => { setWfTime(e.target.value); setSmsBody(generateViewingSms(firstName, wfPropId, wfDate, e.target.value)); }}
                            className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-input)] transition-colors [&::-webkit-calendar-picker-indicator]:invert" />
                        </div>
                      </div>
                      <Input label="Additional Notes" value={wfViewingWith} onChange={setWfViewingWith} placeholder="e.g. Key collection instructions" />

                      {/* SMS Confirmation */}
                      <div className="h-px bg-[var(--border-subtle)] my-1" />
                      {workflowEnquiry?.phone ? (
                        <div className="space-y-3">
                          <label className="flex items-center gap-3 cursor-pointer py-2 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                            <input type="checkbox" checked={smsEnabled} onChange={e => setSmsEnabled(e.target.checked)} className="w-4 h-4 rounded accent-orange-500" />
                            <Phone size={14} className="text-teal-400" />
                            <div className="flex-1">
                              <span className="text-sm font-medium text-[var(--text-primary)]">Send SMS confirmation</span>
                              <p className="text-[10px] text-[var(--text-muted)]">{workflowEnquiry.phone}</p>
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
                  );
                })()}
                {workflowMode === 'follow_up' && (() => {
                  return (
                    <>
                      <Select label="Assign To (Agent)" value={wfAssignedTo} onChange={setWfAssignedTo} searchable
                        options={[{ value: '', label: 'Unassigned' }, ...allUsers.map(u => ({ value: u.name, label: u.name }))]} />
                      <div>
                        <label className="block text-xs text-[var(--text-secondary)] mb-1.5 font-medium">Notes</label>
                        <textarea value={wfViewingWith} onChange={e => setWfViewingWith(e.target.value)} rows={3}
                          placeholder="Why are we following up? Any context for the agent..."
                          className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-orange)]/50 resize-none transition-colors" />
                      </div>
                      <DatePicker label="Follow-up Date *" value={wfDate} onChange={setWfDate} />

                      {/* SMS */}
                      <div className="h-px bg-[var(--border-subtle)] my-1" />
                      {workflowEnquiry?.phone ? (
                        <div className="space-y-3">
                          <label className="flex items-center gap-3 cursor-pointer py-2 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                            <input type="checkbox" checked={smsEnabled} onChange={e => setSmsEnabled(e.target.checked)} className="w-4 h-4 rounded accent-orange-500" />
                            <Phone size={14} className="text-teal-400" />
                            <div className="flex-1">
                              <span className="text-sm font-medium text-[var(--text-primary)]">Send SMS</span>
                              <p className="text-[10px] text-[var(--text-muted)]">{workflowEnquiry.phone}</p>
                            </div>
                          </label>
                          {smsEnabled && (
                            <div>
                              <label className="block text-[11px] text-[var(--text-muted)] font-medium mb-1.5 uppercase tracking-wider">Message Preview</label>
                              <textarea value={smsBody} onChange={e => setSmsBody(e.target.value)} rows={3}
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
                  );
                })()}
                {workflowMode === 'onboarding' && (
                  <div className="space-y-3">
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <p className="text-sm font-medium text-amber-400">Are you sure you want to begin onboarding?</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">This will move the enquiry to the onboarding stage.</p>
                    </div>
                  </div>
                )}
                {workflowMode === 'reject' && (() => {
                  const firstName = workflowEnquiry?.name?.split(' ')[0] || '';
                  return (
                    <>
                      <div>
                        <label className="block text-xs text-[var(--text-secondary)] mb-1.5 font-medium">Reason (optional)</label>
                        <textarea value={wfReason} onChange={e => {
                          setWfReason(e.target.value);
                          if (smsEnabled) {
                            const base = `Hi ${firstName || '[name]'}, thank you for your enquiry with Fleming Lettings. Unfortunately, we are unable to proceed with your application at this time.`;
                            const reasonLine = e.target.value ? ` Reason: ${e.target.value}.` : '';
                            setSmsBody(`${base}${reasonLine} We wish you the best in your property search. - Fleming Lettings`);
                          }
                        }} rows={3}
                          className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none resize-none"
                          placeholder="Reason for rejection..." />
                      </div>

                      {/* SMS */}
                      <div className="h-px bg-[var(--border-subtle)] my-1" />
                      {workflowEnquiry?.phone ? (
                        <div className="space-y-3">
                          <label className="flex items-center gap-3 cursor-pointer py-2 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                            <input type="checkbox" checked={smsEnabled} onChange={e => {
                              setSmsEnabled(e.target.checked);
                              if (e.target.checked && !smsBody) {
                                const base = `Hi ${firstName || '[name]'}, thank you for your enquiry with Fleming Lettings. Unfortunately, we are unable to proceed with your application at this time.`;
                                const reasonLine = wfReason ? ` Reason: ${wfReason}.` : '';
                                setSmsBody(`${base}${reasonLine} We wish you the best in your property search. - Fleming Lettings`);
                              }
                            }} className="w-4 h-4 rounded accent-orange-500" />
                            <Phone size={14} className="text-teal-400" />
                            <div className="flex-1">
                              <span className="text-sm font-medium text-[var(--text-primary)]">Send rejection SMS</span>
                              <p className="text-[10px] text-[var(--text-muted)]">{workflowEnquiry.phone}</p>
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
                  );
                })()}
                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setWorkflowEnquiry(null)}>Cancel</Button>
                  <Button
                    variant={workflowMode === 'reject' ? 'outline' : 'gradient'}
                    onClick={doWorkflowAction}
                    disabled={wfLoading || (workflowMode === 'viewing' && (!wfDate || !wfPropId)) || (workflowMode === 'follow_up' && !wfDate)}
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

      {/* Onboarding Wizard */}
      {onboardingEnquiryId && onboardingData && (
        <OnboardingWizard
          enquiryId={onboardingEnquiryId}
          enquiry={onboardingData}
          properties={properties}
          users={allUsers}
          onClose={() => { setOnboardingEnquiryId(null); setOnboardingData(null); }}
          onUpdate={async () => {
            try {
              const fresh = await api.get(`/api/tenant-enquiries/${onboardingEnquiryId}`);
              setOnboardingData(fresh);
            } catch { /* failed to refresh onboarding data */ }
            await load();
          }}
        />
      )}
    </Layout>
  );
}
