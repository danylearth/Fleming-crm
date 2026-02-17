import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { GlassCard, Button, Input, Select, Avatar, StatusDot, SectionHeader, EmptyState } from '../components/v3';
import DocumentUpload from '../components/v3/DocumentUpload';
import RentPayments from '../components/v3/RentPayments';
import { useApi } from '../hooks/useApi';
import { Pencil, Save, X, Mail, Phone, Building2, Calendar, FileText } from 'lucide-react';

interface Tenant {
  id: number; name: string; email: string; phone: string; property_id: number;
  property_address: string; move_in_date: string; status: string; notes: string;
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

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.put(`/api/tenants/${id}`, form);
      setTenant({ ...tenant!, ...updated });
      setEditing(false);
    } catch (e) { console.error(e); }
    setSaving(false);
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
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
          <Avatar name={tenant.name} size="xl" />
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{tenant.name}</h1>
              <StatusDot status={tenant.status === 'active' ? 'active' : 'inactive'} size="md" />
              <span className="text-xs text-[var(--text-muted)] capitalize">{tenant.status}</span>
            </div>
            {tenant.property_address && (
              <p className="text-sm text-[var(--text-secondary)] mt-1 flex items-center gap-1.5">
                <Building2 size={14} /> {tenant.property_address}
              </p>
            )}
          </div>
          <div className="flex gap-2">
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Personal Info */}
            <GlassCard className="p-6">
              <SectionHeader title="Personal Information" />
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

            {/* Rent Payments */}
            <RentPayments tenantId={tenant.id} compact />

            {/* Notes */}
            <GlassCard className="p-6">
              <SectionHeader title="Notes" />
              {editing ? (
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={4}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-input)] transition-colors resize-none"
                  placeholder="Notes..." />
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">{tenant.notes || 'No notes'}</p>
              )}
            </GlassCard>

            {/* Documents */}
            <DocumentUpload entityType="tenant" entityId={tenant.id} />
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Property Link */}
            {tenant.property_id && (
              <GlassCard className="p-6">
                <SectionHeader title="Property" />
                <button onClick={() => navigate(`/v3/properties/${tenant.property_id}`)}
                  className="flex items-center gap-3 hover:bg-[var(--bg-subtle)] rounded-xl p-3 -m-3 transition-colors w-full text-left">
                  <div className="w-10 h-10 rounded-xl bg-[var(--bg-hover)] flex items-center justify-center">
                    <Building2 size={18} className="text-[var(--text-muted)]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{tenant.property_address || `Property #${tenant.property_id}`}</p>
                    <p className="text-xs text-[var(--text-muted)]">Click to view property</p>
                  </div>
                </button>
              </GlassCard>
            )}
          </div>
        </div>
      </div>
    </V3Layout>
  );
}
