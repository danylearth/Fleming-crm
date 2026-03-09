import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { GlassCard, Button, Avatar, Input, Select, EmptyState } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { Save, Pencil, X, User, Users, Briefcase, Home, Building2, ArrowRight, XCircle, Calendar, ExternalLink, Upload, FileText, CheckCircle } from 'lucide-react';
import { BookingIcon, AwaitingIcon, OnboardingIcon, ConvertedIcon } from '../components/v3/icons/FlemingIcons';

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

const NATIONALITY_OPTIONS = [
  { value: '', label: '-' }, { value: 'British', label: 'British' }, { value: 'Irish', label: 'Irish' },
  { value: 'Polish', label: 'Polish' }, { value: 'Romanian', label: 'Romanian' }, { value: 'Other', label: 'Other' },
];
const EMPLOYMENT_OPTIONS = [
  { value: '', label: '-' }, { value: 'Employed', label: 'Employed' }, { value: 'Self-Employed', label: 'Self-Employed' },
  { value: 'Unemployed', label: 'Unemployed' }, { value: 'Student', label: 'Student' }, { value: 'Retired', label: 'Retired' },
];
const INDUSTRY_OPTIONS = [
  { value: '', label: '-' }, { value: 'IT & Technology', label: 'IT & Technology' },
  { value: 'Healthcare', label: 'Healthcare' }, { value: 'Construction', label: 'Construction' },
  { value: 'Education', label: 'Education' }, { value: 'Retail', label: 'Retail' }, { value: 'Other', label: 'Other' },
];

function ReadField({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-[11px] text-[var(--text-muted)] font-medium mb-1">{label}</p>
      <p className="text-sm text-[var(--text-primary)]">{value || '—'}</p>
    </div>
  );
}

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

export default function EnquiryDetailV3() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [properties, setProperties] = useState<{ id: number; address: string; postcode?: string; rent_amount?: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'applicant' | 'activity' | 'notes'>('applicant');
  const [jointApp, setJointApp] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');

  // Workflow
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [workflowMode, setWorkflowMode] = useState<'choose' | 'viewing' | 'follow_up' | 'onboarding' | 'reject' | 'convert'>('choose');
  const [wfDate, setWfDate] = useState('');
  const [wfTime, setWfTime] = useState('10:00');
  const [wfPropId, setWfPropId] = useState('');
  const [wfReason, setWfReason] = useState('');
  const [wfLoading, setWfLoading] = useState(false);

  const loadDetail = useCallback(async () => {
    try {
      const [d, props] = await Promise.all([
        api.get(`/api/tenant-enquiries/${id}`),
        api.get('/api/properties').catch(() => []),
      ]);
      setData(d);
      setForm({ ...d });
      if (d.is_joint_application || d.first_name_2 || d.last_name_2) setJointApp(true);
      setProperties(Array.isArray(props) ? props : []);
    } catch {}
    setLoading(false);
  }, [id, api]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const setField = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async (extra?: Record<string, any>) => {
    setSaving(true);
    try {
      await api.put(`/api/tenant-enquiries/${id}`, { ...form, is_joint_application: jointApp, ...extra });
      await loadDetail();
    } catch {}
    setSaving(false);
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
            });
            await save({ status: 'viewing_booked', linked_property_id: Number(wfPropId), viewing_date: wfDate });
          }
          break;
        case 'follow_up':
          if (wfDate) await save({ status: 'awaiting_response', follow_up_date: wfDate });
          break;
        case 'onboarding':
          await save({ status: 'onboarding', follow_up_date: wfDate || null });
          break;
        case 'reject':
          await save({ status: 'rejected', rejection_reason: wfReason });
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

  const saveNote = async () => {
    if (!noteDraft.trim()) return;
    const existing = form.notes || '';
    const timestamp = new Date().toLocaleString('en-GB');
    const newNotes = existing ? `${existing}\n\n[${timestamp}]\n${noteDraft.trim()}` : `[${timestamp}]\n${noteDraft.trim()}`;
    setField('notes', newNotes);
    await save({ notes: newNotes });
    setNoteDraft('');
  };

  if (loading) {
    return (
      <V3Layout title="Enquiry" breadcrumb={[{ label: 'Tenant Enquiries', to: '/v3/enquiries' }, { label: 'Loading...' }]}>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-[var(--border-input)] border-t-orange-500 rounded-full animate-spin" />
        </div>
      </V3Layout>
    );
  }

  if (!data) {
    return (
      <V3Layout title="Enquiry" breadcrumb={[{ label: 'Tenant Enquiries', to: '/v3/enquiries' }, { label: 'Not Found' }]}>
        <EmptyState message="Enquiry not found" />
      </V3Layout>
    );
  }

  const name = [data.first_name_1, data.last_name_1].filter(Boolean).join(' ') || 'Unknown';
  const kycDone = !!form.kyc_completed_1;
  const propertyLinked = !!form.linked_property_id;
  const canConvert = form.status === 'onboarding' && form.linked_property_id && form.first_name_1 && form.last_name_1 && form.email_1 && form.kyc_completed_1;
  const selectedProp = properties.find(p => p.id === Number(form.linked_property_id));

  return (
    <V3Layout
      title=""
      breadcrumb={[{ label: 'Tenant Enquiries', to: '/v3/enquiries' }, { label: name }]}
    >
      <div className="p-4 md:p-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Avatar name={name} size="lg" />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold">{name}</h1>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[form.status] || ''}`}>
              {STATUS_LABELS[form.status] || form.status}
            </span>
          </div>
          <div className="flex gap-2">
            {!['converted', 'rejected'].includes(form.status) && (
              <Button variant="gradient" size="sm" onClick={() => { setShowWorkflow(true); setWorkflowMode('choose'); setWfDate(''); setWfTime('10:00'); setWfPropId(form.linked_property_id?.toString() || ''); setWfReason(''); }}>
                <ArrowRight size={14} className="mr-1.5" /> Progress / Reject
              </Button>
            )}
            {editing ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}><X size={14} className="mr-1" />Cancel</Button>
                <Button variant="gradient" size="sm" onClick={() => { save(); setEditing(false); }} disabled={saving}>
                  <Save size={14} className="mr-1.5" />{saving ? 'Saving...' : 'Save'}
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil size={14} className="mr-1.5" />Edit
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tabs */}
            <div className="flex border-b border-[var(--border-subtle)]">
              {(['applicant', 'activity', 'notes'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    tab === t ? 'border-orange-500 text-[var(--text-primary)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}>
                  {t === 'applicant' ? 'Applicant Info' : t === 'activity' ? 'Activity' : 'Notes'}
                </button>
              ))}
            </div>

            {tab === 'applicant' && (
              <div className="space-y-6">
                {/* Applicant 1 */}
                <div>
                  <SectionDivider icon={<User size={16} />} title="Applicant 1">
                    {editing ? (
                      <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                        <input type="checkbox" checked={!!form.kyc_completed_1} onChange={e => setField('kyc_completed_1', e.target.checked)} className="w-4 h-4 rounded accent-orange-500" />
                        KYC Complete
                      </label>
                    ) : form.kyc_completed_1 ? (
                      <span className="text-xs text-emerald-400 font-medium">KYC ✓</span>
                    ) : (
                      <span className="text-xs text-[var(--text-muted)]">KYC Pending</span>
                    )}
                  </SectionDivider>
                  {editing ? (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                        <Input label="First Name" value={form.first_name_1 || ''} onChange={v => setField('first_name_1', v)} />
                        <Input label="Surname" value={form.last_name_1 || ''} onChange={v => setField('last_name_1', v)} />
                        <Input label="Date of Birth" value={form.date_of_birth_1 || ''} onChange={v => setField('date_of_birth_1', v)} type="date" />
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <Input label="Email" value={form.email_1 || ''} onChange={v => setField('email_1', v)} type="email" />
                        <Input label="Phone" value={form.phone_1 || ''} onChange={v => setField('phone_1', v)} />
                        <Input label="Address" value={form.current_address_1 || ''} onChange={v => setField('current_address_1', v)} />
                      </div>
                    </>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <ReadField label="First Name" value={form.first_name_1} />
                      <ReadField label="Surname" value={form.last_name_1} />
                      <ReadField label="Date of Birth" value={form.date_of_birth_1 ? new Date(form.date_of_birth_1).toLocaleDateString('en-GB') : null} />
                      <ReadField label="Email" value={form.email_1} />
                      <ReadField label="Phone" value={form.phone_1} />
                      <ReadField label="Address" value={form.current_address_1} />
                    </div>
                  )}
                </div>

                {/* Employment */}
                <div>
                  <SectionDivider icon={<Briefcase size={16} />} title="Employment" />
                  {editing ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <Select label="Status" value={form.employment_status_1 || ''} onChange={v => setField('employment_status_1', v)} options={EMPLOYMENT_OPTIONS} />
                      <Input label="Employer" value={form.employer_1 || ''} onChange={v => setField('employer_1', v)} />
                      <Input label="Annual Salary £" value={form.income_1?.toString() || ''} onChange={v => setField('income_1', v ? Number(v) : null)} type="number" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <ReadField label="Employment Status" value={form.employment_status_1} />
                      <ReadField label="Employer" value={form.employer_1} />
                      <ReadField label="Annual Salary" value={form.income_1 ? `£${Number(form.income_1).toLocaleString()}` : null} />
                    </div>
                  )}
                </div>

                {/* Joint toggle */}
                {editing && (
                  <label className="flex items-center gap-3 cursor-pointer py-3 px-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] w-fit">
                    <input type="checkbox" checked={jointApp} onChange={e => { setJointApp(e.target.checked); setField('is_joint_application', e.target.checked); }} className="w-4 h-4 rounded accent-orange-500" />
                    <Users size={16} className="text-pink-400" />
                    <span className="text-sm text-[var(--text-primary)] font-medium">Joint Application</span>
                  </label>
                )}
                {!editing && jointApp && (
                  <div className="flex items-center gap-2 py-2">
                    <Users size={16} className="text-pink-400" />
                    <span className="text-sm font-medium">Joint Application</span>
                  </div>
                )}

                {/* Applicant 2 */}
                {jointApp && (
                  <div>
                    <SectionDivider icon={<User size={16} />} title="Applicant 2" color="text-pink-400" />
                    {editing ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <Input label="First Name" value={form.first_name_2 || ''} onChange={v => setField('first_name_2', v)} />
                        <Input label="Surname" value={form.last_name_2 || ''} onChange={v => setField('last_name_2', v)} />
                        <Input label="Email" value={form.email_2 || ''} onChange={v => setField('email_2', v)} type="email" />
                        <Input label="Phone" value={form.phone_2 || ''} onChange={v => setField('phone_2', v)} />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <ReadField label="First Name" value={form.first_name_2} />
                        <ReadField label="Surname" value={form.last_name_2} />
                        <ReadField label="Email" value={form.email_2} />
                        <ReadField label="Phone" value={form.phone_2} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

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
                      <p className="text-xs text-[var(--text-muted)]">{new Date(data.viewing_date).toLocaleDateString('en-GB')}</p>
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

            {tab === 'notes' && (
              <div className="space-y-4">
                {form.notes ? (
                  <div className="bg-[var(--bg-subtle)] rounded-xl p-4 whitespace-pre-wrap text-sm text-[var(--text-primary)]">{form.notes}</div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">No notes yet.</p>
                )}
                <div>
                  <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="Add a note..." rows={3}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none resize-none" />
                  <Button variant="gradient" size="sm" onClick={saveNote} disabled={!noteDraft.trim()} className="mt-2">
                    <Save size={14} className="mr-1.5" /> Add Note
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Property */}
            <GlassCard className="p-5">
              <h4 className="text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wider mb-3">Linked Property</h4>
              {editing ? (
                <select value={form.linked_property_id || ''} onChange={e => setField('linked_property_id', e.target.value ? Number(e.target.value) : null)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] appearance-none focus:outline-none">
                  <option value="">No property linked</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.address}{p.postcode ? `, ${p.postcode}` : ''}</option>
                  ))}
                </select>
              ) : selectedProp ? (
                <div onClick={() => navigate(`/v3/properties/${selectedProp.id}`)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors">
                  <Building2 size={16} className="text-[var(--text-muted)]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{selectedProp.address}</p>
                    {selectedProp.postcode && <p className="text-xs text-[var(--text-muted)]">{selectedProp.postcode}</p>}
                  </div>
                  <ExternalLink size={12} className="text-[var(--text-muted)]" />
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">No property linked</p>
              )}
            </GlassCard>

            {/* Application Status */}
            <GlassCard className="p-5">
              <h4 className="text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wider mb-3">Application Status</h4>
              <div className="space-y-2 mb-3">
                {[
                  { label: 'KYC (Applicant 1)', done: kycDone },
                  { label: 'Property Linked', done: propertyLinked },
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
                  style={{ width: `${[kycDone, propertyLinked].filter(Boolean).length / 2 * 100}%` }} />
              </div>
            </GlassCard>
          </div>
        </div>
      </div>

      {/* Workflow Modal */}
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
                {workflowMode === 'viewing' && (
                  <>
                    <Select label="Property" value={wfPropId} onChange={setWfPropId}
                      options={[{ value: '', label: 'Select property...' }, ...properties.map(p => ({ value: String(p.id), label: p.address }))]} />
                    <Input label="Date" value={wfDate} onChange={setWfDate} type="date" />
                    <Input label="Time" value={wfTime} onChange={setWfTime} type="time" />
                  </>
                )}
                {workflowMode === 'follow_up' && <Input label="Follow-up Date" value={wfDate} onChange={setWfDate} type="date" />}
                {workflowMode === 'onboarding' && <Input label="Follow-up Date (optional)" value={wfDate} onChange={setWfDate} type="date" />}
                {workflowMode === 'reject' && (
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1.5">Reason (optional)</label>
                    <textarea value={wfReason} onChange={e => setWfReason(e.target.value)} rows={3}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none resize-none" />
                  </div>
                )}
                {workflowMode === 'convert' && <Input label="Tenancy Start Date" value={wfDate} onChange={setWfDate} type="date" />}
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
    </V3Layout>
  );
}
