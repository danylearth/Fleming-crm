import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { Card, GlassCard, Button, ProgressRing, SectionHeader, EmptyState, Avatar, Tag, Input, Select, DatePicker } from '../components/v3';
import DocumentUpload from '../components/v3/DocumentUpload';
import ActivityTimeline from '../components/v3/ActivityTimeline';
import AddressAutocomplete from '../components/v3/AddressAutocomplete';
import RentPayments from '../components/v3/RentPayments';
import { useApi } from '../hooks/useApi';
import { getPropertyImage } from '../utils/propertyImages';
import {
  Building2, Bed, PoundSterling, MapPin, User, Users,
  CheckCircle2, Clock, ChevronRight, Pencil, Save, X,
  AlertTriangle, ShieldCheck, FileText, Plus, Wrench, Trash2
} from 'lucide-react';

interface PropertyDetail {
  id: number; address: string; postcode: string; rent_amount: number;
  status: string; landlord_name: string; landlord_id?: number;
  landlord_phone?: string; landlord_email?: string;
  current_tenant: string | null; current_tenant_id?: number; tenant_id?: number;
  bedrooms: number; property_type: string;
  // Management
  service_type: string | null; charge_percentage: number | null; total_charge: number | null;
  council_tax_band: string | null; epc_grade: string | null;
  rent_review_date: string | null; onboarded_date: string | null;
  proof_of_ownership_received: number;
  // Leasehold
  is_leasehold: number; leasehold_start_date: string | null;
  leasehold_end_date: string | null; leaseholder_info: string | null;
  // Tenancy
  has_live_tenancy: number; tenancy_start_date: string | null;
  tenancy_type: string | null; has_end_date: number; tenancy_end_date: string | null;
  // Compliance
  eicr_expiry_date: string | null; epc_expiry_date: string | null;
  gas_safety_expiry_date: string | null; has_gas: number;
  notes: string | null;
}

interface Task {
  id: number; title: string; status: string; priority: string; due_date: string;
  property_id?: number;
}

interface MaintenanceRecord {
  id: number; title: string; status: string; priority: string; description: string;
  property_id: number; created_at: string; address?: string;
}

interface Expense {
  id: number; property_id: number; description: string; amount: number;
  category: string; expense_date: string;
}

const STATUS_COLORS: Record<string, string> = {
  to_let: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  let_agreed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  full_management: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  rent_collection: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};
const STATUS_LABELS: Record<string, string> = {
  to_let: 'To Let', let_agreed: 'Let Agreed', full_management: 'Full Management', rent_collection: 'Rent Collection',
};
const EPC_COLORS: Record<string, string> = {
  A: 'bg-emerald-500 text-white', B: 'bg-emerald-400 text-white', C: 'bg-lime-500 text-white',
  D: 'bg-yellow-500 text-black', E: 'bg-amber-500 text-white', F: 'bg-orange-500 text-white', G: 'bg-red-500 text-white',
};

function ReadField({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value || '—'}</p>
    </div>
  );
}

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!checked)}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
        checked ? 'bg-[var(--accent-orange)]/10 border-[var(--accent-orange)]/30 text-[var(--accent-orange)]' : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-muted)]'
      } ${disabled ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}>
      <div className={`w-4 h-4 rounded-md border flex items-center justify-center ${checked ? 'bg-[var(--accent-orange)] border-[var(--accent-orange)]' : 'border-[var(--border-input)]'}`}>
        {checked && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5L4.5 7.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </div>
      {label}
    </button>
  );
}

export default function PropertyDetailV3() {
  const { id } = useParams();
  const api = useApi();
  const navigate = useNavigate();
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ description: '', amount: '', category: 'maintenance', expense_date: '' });

  const populateForm = (p: PropertyDetail) => setForm({
    landlord_id: p.landlord_id, address: p.address || '', postcode: p.postcode || '',
    rent_amount: String(p.rent_amount || ''), bedrooms: String(p.bedrooms || ''),
    property_type: p.property_type || 'house', status: p.status || 'to_let',
    service_type: p.service_type || '', charge_percentage: String(p.charge_percentage ?? ''),
    total_charge: String(p.total_charge ?? ''), council_tax_band: p.council_tax_band || '',
    epc_grade: p.epc_grade || '', rent_review_date: p.rent_review_date || '',
    onboarded_date: p.onboarded_date || '', proof_of_ownership_received: !!p.proof_of_ownership_received,
    is_leasehold: !!p.is_leasehold, leasehold_start_date: p.leasehold_start_date || '',
    leasehold_end_date: p.leasehold_end_date || '', leaseholder_info: p.leaseholder_info || '',
    has_live_tenancy: !!p.has_live_tenancy, tenancy_start_date: p.tenancy_start_date || '',
    tenancy_type: p.tenancy_type || '', has_end_date: !!p.has_end_date,
    tenancy_end_date: p.tenancy_end_date || '',
    eicr_expiry_date: p.eicr_expiry_date || '', epc_expiry_date: p.epc_expiry_date || '',
    has_gas: !!p.has_gas, gas_safety_expiry_date: p.gas_safety_expiry_date || '',
  });

  useEffect(() => {
    Promise.all([
      api.get(`/api/properties/${id}`),
      api.get('/api/tasks').catch(() => []),
      api.get('/api/maintenance').catch(() => []),
      api.get(`/api/property-expenses/${id}`).catch(() => []),
    ]).then(([prop, tks, maint, exps]) => {
      setProperty(prop);
      populateForm(prop);
      setTasks(Array.isArray(tks) ? tks : []);
      setMaintenance(Array.isArray(maint) ? maint.filter((m: MaintenanceRecord) => m.property_id === Number(id)) : []);
      setExpenses(Array.isArray(exps) ? exps : []);
    }).catch(() => {})
    .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/api/properties/${id}`, {
        ...form,
        rent_amount: parseFloat(form.rent_amount) || 0,
        bedrooms: parseInt(form.bedrooms) || 0,
        charge_percentage: form.charge_percentage ? parseFloat(form.charge_percentage) : null,
        total_charge: form.total_charge ? parseFloat(form.total_charge) : null,
      });
      const updated = await api.get(`/api/properties/${id}`);
      setProperty(updated);
      populateForm(updated);
      setEditing(false);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const cancelEdit = () => { setEditing(false); if (property) populateForm(property); };

  const daysUntil = (d: string | null) => {
    if (!d) return null;
    return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const compliancePercent = (d: string | null) => {
    if (!d) return 0;
    const days = daysUntil(d)!;
    if (days < 0) return 0;
    if (days > 365) return 100;
    return Math.round((days / 365) * 100);
  };

  const overallCompliance = () => {
    const items = [
      compliancePercent(property?.eicr_expiry_date ?? null),
      compliancePercent(property?.epc_expiry_date ?? null),
      ...(property?.has_gas ? [compliancePercent(property.gas_safety_expiry_date)] : []),
    ];
    return items.length ? Math.round(items.reduce((a, b) => a + b, 0) / items.length) : 0;
  };

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  if (loading) {
    return (
      <V3Layout title="Property" breadcrumb={[{ label: 'Properties', to: '/v3/properties' }, { label: 'Loading...' }]}>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-[var(--border-input)] border-t-orange-500 rounded-full animate-spin" />
        </div>
      </V3Layout>
    );
  }

  if (!property) {
    return (
      <V3Layout title="Property" breadcrumb={[{ label: 'Properties', to: '/v3/properties' }, { label: 'Not Found' }]}>
        <EmptyState message="Property not found" />
      </V3Layout>
    );
  }

  const propertyTasks = tasks.filter(t => t.property_id === property.id).slice(0, 5);
  const isToLet = property.status === 'to_let';
  const statusColor = STATUS_COLORS[property.status] || 'bg-[var(--bg-hover)] text-[var(--text-muted)]';
  const statusLbl = STATUS_LABELS[property.status] || property.status;

  // Compliance reminders (expiring within 30 days)
  const reminders: { label: string; days: number }[] = [];
  const eicrDays = daysUntil(property.eicr_expiry_date);
  if (eicrDays !== null && eicrDays <= 30) reminders.push({ label: 'EICR', days: eicrDays });
  const epcDays = daysUntil(property.epc_expiry_date);
  if (epcDays !== null && epcDays <= 30) reminders.push({ label: 'EPC', days: epcDays });
  if (property.has_gas) {
    const gasDays = daysUntil(property.gas_safety_expiry_date);
    if (gasDays !== null && gasDays <= 30) reminders.push({ label: 'Gas Safety', days: gasDays });
  }

  return (
    <V3Layout title="" breadcrumb={[{ label: 'Properties', to: '/v3/properties' }, { label: property.address }]}>
      <div className="p-4 md:p-6 space-y-6 max-w-7xl">
        {/* Hero */}
        <div className="relative h-40 md:h-56 rounded-2xl overflow-hidden border border-[var(--border-subtle)]">
          <img src={getPropertyImage(property.id, 1200, 400)} alt={property.address}
            className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/60 to-transparent">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusColor}`}>{statusLbl}</span>
            </div>
            <h1 className="text-2xl font-bold text-white">{property.address}</h1>
            <p className="text-white/60 text-sm">{property.postcode}</p>
          </div>
          <div className="absolute top-4 right-4 flex gap-2">
            {editing ? (
              <>
                <Button variant="ghost" size="sm" onClick={cancelEdit} className="bg-black/40 backdrop-blur-sm text-white">
                  <X size={14} className="mr-1" /> Cancel
                </Button>
                <Button variant="gradient" size="sm" onClick={handleSave} disabled={saving}>
                  <Save size={14} className="mr-1" /> {saving ? 'Saving...' : 'Save'}
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="bg-black/40 backdrop-blur-sm text-white">
                <Pencil size={14} className="mr-1" /> Edit
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN — 2/3 */}
          <div className="lg:col-span-2 space-y-6">
            {/* Details */}
            <GlassCard className="p-6">
              <SectionHeader title="Details" />
              {editing ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <AddressAutocomplete label="Address" value={form.address} onChange={(v: string) => setForm({ ...form, address: v })}
                    onSelect={p => { if (p.postcode) setForm(f => ({ ...f, postcode: p.postcode || f.postcode })); }} />
                  <Input label="Postcode" value={form.postcode} onChange={(v: string) => setForm({ ...form, postcode: v })} />
                  <Input label="Rent (£/mo)" value={form.rent_amount} onChange={(v: string) => setForm({ ...form, rent_amount: v })} />
                  <Select label="Type" value={form.property_type} onChange={(v: string) => setForm({ ...form, property_type: v })}
                    options={[{ value: 'house', label: 'House' }, { value: 'flat', label: 'Flat' }, { value: 'bungalow', label: 'Bungalow' }, { value: 'studio', label: 'Studio' }, { value: 'hmo', label: 'HMO' }]} />
                  <Input label="Bedrooms" value={form.bedrooms} onChange={(v: string) => setForm({ ...form, bedrooms: v })} />
                  <Select label="Status" value={form.status} onChange={(v: string) => setForm({ ...form, status: v })}
                    options={[{ value: 'to_let', label: 'To Let' }, { value: 'let_agreed', label: 'Let Agreed' }, { value: 'full_management', label: 'Full Management' }, { value: 'rent_collection', label: 'Rent Collection' }]} />
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <ReadField label="Type" value={<span className="capitalize">{property.property_type}</span>} />
                  <ReadField label="Bedrooms" value={String(property.bedrooms)} />
                  <ReadField label="Rent" value={`£${property.rent_amount?.toLocaleString()}/mo`} />
                  <ReadField label="Postcode" value={property.postcode} />
                  <ReadField label="Status" value={
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusColor}`}>{statusLbl}</span>
                  } />
                </div>
              )}
            </GlassCard>

            {/* Management */}
            <GlassCard className="p-6">
              <SectionHeader title="Management" />
              {editing ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Select label="Service Type" value={form.service_type} onChange={(v: string) => setForm({ ...form, service_type: v })}
                    options={[{ value: '', label: 'Select...' }, { value: 'full_management', label: 'Full Management' }, { value: 'rent_collection', label: 'Rent Collection' }, { value: 'let_only', label: 'Let Only' }]} />
                  <Input label="Charge (%)" value={form.charge_percentage} onChange={(v: string) => setForm({ ...form, charge_percentage: v })} placeholder="e.g. 10" />
                  <Input label="Total Charge (£)" value={form.total_charge} onChange={(v: string) => setForm({ ...form, total_charge: v })} />
                  <Select label="Council Tax Band" value={form.council_tax_band} onChange={(v: string) => setForm({ ...form, council_tax_band: v })}
                    options={[{ value: '', label: 'Select...' }, ...['A','B','C','D','E','F','G','H'].map(b => ({ value: b, label: `Band ${b}` }))]} />
                  <Select label="EPC Grade" value={form.epc_grade} onChange={(v: string) => setForm({ ...form, epc_grade: v })}
                    options={[{ value: '', label: 'Select...' }, ...['A','B','C','D','E','F','G'].map(g => ({ value: g, label: `Grade ${g}` }))]} />
                  {form.postcode && (
                    <div className="col-span-full flex gap-2">
                      <button type="button" onClick={async () => {
                        try {
                          const data = await api.get(`/api/epc-lookup?postcode=${encodeURIComponent(form.postcode)}`);
                          if (data.length > 0) setForm(f => ({ ...f, epc_grade: data[0].current_rating || f.epc_grade }));
                        } catch {}
                      }} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors">
                        Auto-fetch EPC
                      </button>
                      <button type="button" onClick={async () => {
                        try {
                          const data = await api.get(`/api/council-tax-lookup?postcode=${encodeURIComponent(form.postcode)}`);
                          if (data.length > 0 && data[0].band) setForm(f => ({ ...f, council_tax_band: data[0].band }));
                        } catch {}
                      }} className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors">
                        Auto-fetch Council Tax
                      </button>
                    </div>
                  )}
                  <DatePicker label="Rent Review Date" value={form.rent_review_date} onChange={(v: string) => setForm({ ...form, rent_review_date: v })} />
                  <DatePicker label="Onboarded Date" value={form.onboarded_date} onChange={(v: string) => setForm({ ...form, onboarded_date: v })} />
                  <div className="flex flex-wrap gap-2 col-span-full">
                    <Toggle label="Proof of Ownership" checked={form.proof_of_ownership_received} onChange={v => setForm({ ...form, proof_of_ownership_received: v })} />
                    <Toggle label="Has Gas" checked={form.has_gas} onChange={v => setForm({ ...form, has_gas: v })} />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <ReadField label="Service Type" value={
                    property.service_type === 'full_management' ? 'Full Management' :
                    property.service_type === 'rent_collection' ? 'Rent Collection' :
                    property.service_type === 'let_only' ? 'Let Only' : null
                  } />
                  <ReadField label="Charge" value={property.charge_percentage ? `${property.charge_percentage}%` : null} />
                  <ReadField label="Total Charge" value={property.total_charge ? `£${property.total_charge}` : null} />
                  <ReadField label="Council Tax" value={property.council_tax_band ? `Band ${property.council_tax_band}` : null} />
                  <ReadField label="EPC Grade" value={property.epc_grade ? (
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold ${EPC_COLORS[property.epc_grade] || 'bg-[var(--bg-hover)] text-[var(--text-muted)]'}`}>
                      {property.epc_grade}
                    </span>
                  ) : null} />
                  <ReadField label="Rent Review" value={formatDate(property.rent_review_date)} />
                  <ReadField label="Onboarded" value={formatDate(property.onboarded_date)} />
                  <ReadField label="Proof of Ownership" value={property.proof_of_ownership_received ? 'Yes' : 'No'} />
                  <ReadField label="Gas Supply" value={property.has_gas ? 'Yes' : 'No'} />
                </div>
              )}
            </GlassCard>

            {/* Leasehold (conditional) */}
            {(editing ? form.is_leasehold : property.is_leasehold) ? (
              <GlassCard className="p-6">
                <SectionHeader title="Leasehold" />
                {editing ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <Toggle label="Leasehold Property" checked={form.is_leasehold} onChange={v => setForm({ ...form, is_leasehold: v })} />
                    <DatePicker label="Lease Start" value={form.leasehold_start_date} onChange={(v: string) => setForm({ ...form, leasehold_start_date: v })} />
                    <DatePicker label="Lease End" value={form.leasehold_end_date} onChange={(v: string) => setForm({ ...form, leasehold_end_date: v })} />
                    <Input label="Leaseholder Info" value={form.leaseholder_info} onChange={(v: string) => setForm({ ...form, leaseholder_info: v })} className="col-span-full" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <ReadField label="Lease Start" value={formatDate(property.leasehold_start_date)} />
                    <ReadField label="Lease End" value={formatDate(property.leasehold_end_date)} />
                    <ReadField label="Leaseholder Info" value={property.leaseholder_info} />
                  </div>
                )}
              </GlassCard>
            ) : editing ? (
              <div className="flex">
                <Toggle label="Mark as Leasehold" checked={false} onChange={v => setForm({ ...form, is_leasehold: v })} />
              </div>
            ) : null}

            {/* Current Tenancy (hidden if to_let) */}
            {!isToLet && (
              <GlassCard className="p-6">
                <SectionHeader title="Current Tenancy" />
                {editing ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <Toggle label="Live Tenancy" checked={form.has_live_tenancy} onChange={v => setForm({ ...form, has_live_tenancy: v })} />
                    <Select label="Tenancy Type" value={form.tenancy_type} onChange={(v: string) => setForm({ ...form, tenancy_type: v })}
                      options={[{ value: '', label: 'Select...' }, { value: 'AST', label: 'AST' }, { value: 'HMO', label: 'HMO' }, { value: 'Rolling', label: 'Rolling' }, { value: 'Other', label: 'Other' }]} />
                    <DatePicker label="Start Date" value={form.tenancy_start_date} onChange={(v: string) => setForm({ ...form, tenancy_start_date: v })} />
                    <Toggle label="Has End Date" checked={form.has_end_date} onChange={v => setForm({ ...form, has_end_date: v })} />
                    {form.has_end_date && <DatePicker label="End Date" value={form.tenancy_end_date} onChange={(v: string) => setForm({ ...form, tenancy_end_date: v })} />}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <ReadField label="Tenancy Type" value={property.tenancy_type} />
                    <ReadField label="Start Date" value={formatDate(property.tenancy_start_date)} />
                    {property.has_end_date ? <ReadField label="End Date" value={formatDate(property.tenancy_end_date)} /> : null}
                    <ReadField label="Status" value={property.has_live_tenancy ? 'Active' : 'Inactive'} />
                    {property.has_end_date && property.tenancy_end_date && (() => {
                      const days = daysUntil(property.tenancy_end_date);
                      if (days === null) return null;
                      return (
                        <ReadField label="Time Remaining" value={
                          <span className={`text-sm font-medium ${days < 0 ? 'text-red-400' : days < 30 ? 'text-amber-400' : days < 90 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                            {days < 0 ? `Expired ${Math.abs(days)} days ago` : `${days} days`}
                          </span>
                        } />
                      );
                    })()}
                  </div>
                )}
              </GlassCard>
            )}

            {/* Tasks */}
            <Card className="p-6">
              <SectionHeader title="Tasks" action={() => navigate('/v3/tasks')} actionLabel="View All" />
              {propertyTasks.length ? (
                <div className="space-y-2">
                  {propertyTasks.map(task => (
                    <div key={task.id} onClick={() => navigate(`/v3/tasks/${task.id}`)}
                      className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        task.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'
                      }`}>
                        {task.status === 'completed' ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{task.title}</p>
                      </div>
                      <Tag>{task.priority}</Tag>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState message="No tasks for this property" />
              )}
            </Card>

            {/* Maintenance */}
            <Card className="p-6">
              <SectionHeader title="Maintenance" action={() => navigate('/v3/maintenance')} actionLabel="View All" />
              {maintenance.length ? (
                <div className="space-y-2">
                  {maintenance.slice(0, 5).map(m => (
                    <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        m.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                        m.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-amber-500/20 text-amber-400'
                      }`}>
                        <Wrench size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{m.title}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">{m.status === 'completed' ? 'Completed' : m.status === 'in_progress' ? 'In Progress' : 'Open'}</p>
                      </div>
                      <Tag>{m.priority}</Tag>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState message="No maintenance records" />
              )}
            </Card>

            {/* Expenses */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <SectionHeader title="Expenses" />
                <Button variant="outline" size="sm" onClick={() => setShowExpenseForm(!showExpenseForm)}>
                  <Plus size={14} className="mr-1.5" /> Add
                </Button>
              </div>
              {showExpenseForm && (
                <div className="mb-4 p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-3">
                  <Input label="Description" value={expenseForm.description} onChange={(v: string) => setExpenseForm(f => ({ ...f, description: v }))} placeholder="e.g. Boiler repair" />
                  <div className="grid grid-cols-3 gap-3">
                    <Input label="Amount (£)" value={expenseForm.amount} onChange={(v: string) => setExpenseForm(f => ({ ...f, amount: v }))} type="number" />
                    <Select label="Category" value={expenseForm.category} onChange={(v: string) => setExpenseForm(f => ({ ...f, category: v }))}
                      options={[{ value: 'maintenance', label: 'Maintenance' }, { value: 'insurance', label: 'Insurance' }, { value: 'legal', label: 'Legal' }, { value: 'service_charge', label: 'Service Charge' }, { value: 'other', label: 'Other' }]} />
                    <DatePicker label="Date" value={expenseForm.expense_date} onChange={(v: string) => setExpenseForm(f => ({ ...f, expense_date: v }))} />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowExpenseForm(false)}>Cancel</Button>
                    <Button variant="gradient" size="sm" disabled={!expenseForm.description || !expenseForm.amount} onClick={async () => {
                      try {
                        await api.post('/api/property-expenses', { property_id: property.id, ...expenseForm, amount: parseFloat(expenseForm.amount) || 0 });
                        const exps = await api.get(`/api/property-expenses/${property.id}`);
                        setExpenses(Array.isArray(exps) ? exps : []);
                        setExpenseForm({ description: '', amount: '', category: 'maintenance', expense_date: '' });
                        setShowExpenseForm(false);
                      } catch {}
                    }}>Save</Button>
                  </div>
                </div>
              )}
              {expenses.length ? (
                <div className="space-y-2">
                  {expenses.map(e => (
                    <div key={e.id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-subtle)]">
                      <div className="w-7 h-7 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center">
                        <PoundSterling size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{e.description}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">{e.category}{e.expense_date ? ` · ${new Date(e.expense_date).toLocaleDateString('en-GB')}` : ''}</p>
                      </div>
                      <span className="text-sm font-medium text-red-400">-£{e.amount.toLocaleString()}</span>
                      <button onClick={async () => {
                        try {
                          await api.delete(`/api/property-expenses/${e.id}`);
                          setExpenses(prev => prev.filter(x => x.id !== e.id));
                        } catch {}
                      }} className="text-[var(--text-muted)] hover:text-red-400 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-[var(--border-subtle)] flex justify-between">
                    <span className="text-xs text-[var(--text-muted)]">Total</span>
                    <span className="text-sm font-semibold text-red-400">-£{expenses.reduce((a, e) => a + e.amount, 0).toLocaleString()}</span>
                  </div>
                </div>
              ) : !showExpenseForm ? (
                <EmptyState message="No expenses recorded" />
              ) : null}
            </Card>

            {/* Rent Payments */}
            <RentPayments propertyId={property.id} compact />
          </div>

          {/* RIGHT COLUMN — 1/3 */}
          <div className="space-y-6">
            {/* Compliance Overview */}
            <Card className="p-6">
              <SectionHeader title="Compliance" />
              <div className="flex justify-center mb-4">
                <ProgressRing value={overallCompliance()} size={90} strokeWidth={7} />
              </div>
              <div className="space-y-3">
                <ComplianceRow label="EICR" expiry={property.eicr_expiry_date} />
                <ComplianceRow label="EPC" expiry={property.epc_expiry_date} grade={property.epc_grade} />
                {property.has_gas ? <ComplianceRow label="Gas Safety" expiry={property.gas_safety_expiry_date} /> : null}
              </div>
            </Card>

            {/* Compliance Reminders */}
            {reminders.length > 0 && (
              <Card className="p-6 border-amber-500/30">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={16} className="text-amber-400" />
                  <span className="text-sm font-semibold text-amber-400">Expiring Soon</span>
                </div>
                <div className="space-y-2">
                  {reminders.map(r => (
                    <div key={r.label} className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">{r.label}</span>
                      <span className={`text-xs font-medium ${r.days < 0 ? 'text-red-400' : 'text-amber-400'}`}>
                        {r.days < 0 ? `Expired ${Math.abs(r.days)}d ago` : `${r.days} days`}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Landlord */}
            <Card className="p-6">
              <SectionHeader title="Landlord" />
              {property.landlord_name ? (
                <div onClick={() => property.landlord_id && navigate(`/v3/landlords/${property.landlord_id}`)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors">
                  <Avatar name={property.landlord_name} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{property.landlord_name}</p>
                    <p className="text-xs text-[var(--text-muted)]">Landlord</p>
                  </div>
                  <ChevronRight size={16} className="text-[var(--text-muted)]" />
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">No landlord linked</p>
              )}
            </Card>

            {/* Tenant (hidden if to_let) */}
            {!isToLet && (
              <Card className="p-6">
                <SectionHeader title="Tenant" />
                {property.current_tenant ? (
                  <div onClick={() => (property.current_tenant_id || property.tenant_id) && navigate(`/v3/tenants/${property.current_tenant_id || property.tenant_id}`)}
                    className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors">
                    <Avatar name={property.current_tenant} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{property.current_tenant}</p>
                      <p className="text-xs text-[var(--text-muted)]">Current Tenant</p>
                    </div>
                    <ChevronRight size={16} className="text-[var(--text-muted)]" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-[var(--text-muted)]">No tenant assigned</p>
                    <Button variant="outline" size="sm" onClick={() => navigate(`/v3/tenants?createFor=${property.id}`)}>
                      <Plus size={14} className="mr-1.5" />Create Tenant
                    </Button>
                  </div>
                )}
              </Card>
            )}

            {/* Documents */}
            <DocumentUpload entityType="property" entityId={property.id} />

            {/* Activity */}
            <Card className="p-6">
              <SectionHeader title="Activity" />
              <ActivityTimeline entityType="property" entityId={property.id} />
            </Card>
          </div>
        </div>
      </div>
    </V3Layout>
  );
}

function ComplianceRow({ label, expiry, grade }: { label: string; expiry: string | null; grade?: string | null }) {
  const days = expiry ? Math.ceil((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const color = days === null ? 'text-red-400' : days < 0 ? 'text-red-400' : days < 30 ? 'text-amber-400' : 'text-emerald-400';
  const formatD = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set';

  return (
    <div className="flex items-center justify-between py-2 border-b border-[var(--border-subtle)] last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-sm text-[var(--text-secondary)]">{label}</span>
        {grade && (
          <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold ${EPC_COLORS[grade] || 'bg-[var(--bg-hover)]'}`}>
            {grade}
          </span>
        )}
      </div>
      <div className="text-right">
        <p className={`text-xs font-medium ${color}`}>
          {days === null ? 'Not set' : days < 0 ? 'Expired' : `${days}d remaining`}
        </p>
        <p className="text-[10px] text-[var(--text-muted)]">{formatD(expiry)}</p>
      </div>
    </div>
  );
}
