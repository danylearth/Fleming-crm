import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { Card, GlassCard, Button, ProgressRing, SectionHeader, StatusDot, EmptyState, Avatar, Tag, Input, Select } from '../components/v3';
import DocumentUpload from '../components/v3/DocumentUpload';
import RentPayments from '../components/v3/RentPayments';
import { useApi } from '../hooks/useApi';
import { getPropertyImage } from '../utils/propertyImages';
import {
  Building2, Bed, PoundSterling, MapPin, User, Users,
  CheckCircle2, Clock, ChevronRight, Pencil, Save, X
} from 'lucide-react';

interface PropertyDetail {
  id: number; address: string; postcode: string; rent_amount: number;
  status: string; landlord_name: string; landlord_id?: number;
  current_tenant: string | null; tenant_id?: number;
  bedrooms: number; property_type: string;
  eicr_expiry_date: string | null; epc_expiry_date: string | null;
  gas_safety_expiry_date: string | null; has_gas: boolean;
}

interface Task {
  id: number; title: string; status: string; priority: string; due_date: string;
  property_id?: number;
}

export default function PropertyDetailV3() {
  const { id } = useParams();
  const api = useApi();
  const navigate = useNavigate();
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    address: '', postcode: '', rent_amount: '', bedrooms: '', property_type: '', status: 'active',
    eicr_expiry_date: '', epc_expiry_date: '', gas_safety_expiry_date: '',
  });

  useEffect(() => {
    Promise.all([
      api.get(`/api/properties/${id}`),
      api.get('/api/tasks').catch(() => []),
    ]).then(([prop, tks]) => {
      setProperty(prop);
      setForm({
        address: prop.address || '', postcode: prop.postcode || '',
        rent_amount: String(prop.rent_amount || ''), bedrooms: String(prop.bedrooms || ''),
        property_type: prop.property_type || '', status: prop.status || 'active',
        eicr_expiry_date: prop.eicr_expiry_date || '', epc_expiry_date: prop.epc_expiry_date || '',
        gas_safety_expiry_date: prop.gas_safety_expiry_date || '',
      });
      setTasks(Array.isArray(tks) ? tks : []);
    }).catch(() => {})
    .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.put(`/api/properties/${id}`, {
        ...form,
        rent_amount: parseFloat(form.rent_amount) || 0,
        bedrooms: parseInt(form.bedrooms) || 0,
      });
      setProperty({ ...property!, ...updated });
      setEditing(false);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const cancelEdit = () => {
    setEditing(false);
    if (property) setForm({
      address: property.address || '', postcode: property.postcode || '',
      rent_amount: String(property.rent_amount || ''), bedrooms: String(property.bedrooms || ''),
      property_type: property.property_type || '', status: property.status || 'active',
      eicr_expiry_date: property.eicr_expiry_date || '', epc_expiry_date: property.epc_expiry_date || '',
      gas_safety_expiry_date: property.gas_safety_expiry_date || '',
    });
  };

  const compliancePercent = (expiryDate: string | null) => {
    if (!expiryDate) return 0;
    const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return 0;
    if (days > 365) return 100;
    return Math.round((days / 365) * 100);
  };

  const complianceColor = (expiryDate: string | null): 'active' | 'warning' | 'error' => {
    if (!expiryDate) return 'error';
    const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return 'error';
    if (days < 30) return 'warning';
    return 'active';
  };

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : 'N/A';

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

  const propertyTasks = tasks.filter(t => t.property_id === property.id || !t.property_id).slice(0, 5);

  return (
    <V3Layout
      title=""
      breadcrumb={[
        { label: 'Properties', to: '/v3/properties' },
        { label: property.address },
      ]}
    >
      <div className="p-4 md:p-6 space-y-6 max-w-6xl">
        {/* Hero */}
        <div className="relative h-40 md:h-56 rounded-2xl overflow-hidden border border-[var(--border-subtle)]">
          <img
            src={getPropertyImage(property.id, 1200, 400)}
            alt={property.address}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/60 to-transparent">
            <div className="flex items-center gap-2 mb-1">
              <StatusDot status={property.status === 'active' ? 'active' : 'inactive'} size="md" />
              <span className="text-sm text-white/70 capitalize">{property.status}</span>
            </div>
            <h1 className="text-2xl font-bold text-white">{property.address}</h1>
            <p className="text-white/60 text-sm">{property.postcode}</p>
          </div>
          {/* Edit button */}
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

        {/* Edit Form */}
        {editing && (
          <GlassCard className="p-6">
            <SectionHeader title="Edit Property" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Input label="Address" value={form.address} onChange={v => setForm({ ...form, address: v })} />
              <Input label="Postcode" value={form.postcode} onChange={v => setForm({ ...form, postcode: v })} />
              <Input label="Rent (£/mo)" value={form.rent_amount} onChange={v => setForm({ ...form, rent_amount: v })} />
              <Input label="Bedrooms" value={form.bedrooms} onChange={v => setForm({ ...form, bedrooms: v })} />
              <Select label="Type" value={form.property_type} onChange={v => setForm({ ...form, property_type: v })}
                options={[
                  { value: 'house', label: 'House' }, { value: 'flat', label: 'Flat' },
                  { value: 'studio', label: 'Studio' }, { value: 'hmo', label: 'HMO' },
                ]} />
              <Select label="Status" value={form.status} onChange={v => setForm({ ...form, status: v })}
                options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'void', label: 'Void' }]} />
              <Input label="EICR Expiry" value={form.eicr_expiry_date} onChange={v => setForm({ ...form, eicr_expiry_date: v })} placeholder="YYYY-MM-DD" />
              <Input label="EPC Expiry" value={form.epc_expiry_date} onChange={v => setForm({ ...form, epc_expiry_date: v })} placeholder="YYYY-MM-DD" />
              <Input label="Gas Safety Expiry" value={form.gas_safety_expiry_date} onChange={v => setForm({ ...form, gas_safety_expiry_date: v })} placeholder="YYYY-MM-DD" />
            </div>
          </GlassCard>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Compliance Rings */}
            <Card className="p-6">
              <SectionHeader title="Compliance Overview" />
              <div className="grid grid-cols-2 md:flex md:items-center gap-6 md:gap-8">
                <div className="flex flex-col items-center">
                  <ProgressRing value={compliancePercent(property.eicr_expiry_date)} size={80} strokeWidth={6} />
                  <span className="text-xs text-[var(--text-secondary)] mt-2">EICR</span>
                  <span className={`text-xs mt-0.5 ${
                    complianceColor(property.eicr_expiry_date) === 'error' ? 'text-red-400'
                    : complianceColor(property.eicr_expiry_date) === 'warning' ? 'text-amber-400'
                    : 'text-emerald-400'
                  }`}>{formatDate(property.eicr_expiry_date)}</span>
                </div>
                <div className="flex flex-col items-center">
                  <ProgressRing value={compliancePercent(property.epc_expiry_date)} size={80} strokeWidth={6} />
                  <span className="text-xs text-[var(--text-secondary)] mt-2">EPC</span>
                  <span className={`text-xs mt-0.5 ${
                    complianceColor(property.epc_expiry_date) === 'error' ? 'text-red-400'
                    : complianceColor(property.epc_expiry_date) === 'warning' ? 'text-amber-400'
                    : 'text-emerald-400'
                  }`}>{formatDate(property.epc_expiry_date)}</span>
                </div>
                {property.has_gas && (
                  <div className="flex flex-col items-center">
                    <ProgressRing value={compliancePercent(property.gas_safety_expiry_date)} size={80} strokeWidth={6} />
                    <span className="text-xs text-[var(--text-secondary)] mt-2">Gas Safety</span>
                    <span className={`text-xs mt-0.5 ${
                      complianceColor(property.gas_safety_expiry_date) === 'error' ? 'text-red-400'
                      : complianceColor(property.gas_safety_expiry_date) === 'warning' ? 'text-amber-400'
                      : 'text-emerald-400'
                    }`}>{formatDate(property.gas_safety_expiry_date)}</span>
                  </div>
                )}
              </div>
            </Card>

            {/* Rent Payments */}
            <RentPayments propertyId={property.id} compact />

            {/* Tasks */}
            <Card className="p-6">
              <SectionHeader title="Tasks" action={() => navigate('/v3/tasks')} actionLabel="View All" />
              {propertyTasks.length ? (
                <div className="space-y-2">
                  {propertyTasks.map(task => (
                    <div key={task.id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-subtle)]">
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
                <EmptyState message="No tasks" />
              )}
            </Card>

            {/* Documents */}
            <DocumentUpload entityType="property" entityId={property.id} />
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Property Info */}
            <Card className="p-6">
              <SectionHeader title="Details" />
              <div className="space-y-4">
                {[
                  { icon: Building2, label: 'Type', value: property.property_type },
                  { icon: Bed, label: 'Bedrooms', value: property.bedrooms },
                  { icon: PoundSterling, label: 'Rent', value: `£${property.rent_amount?.toLocaleString()}/mo` },
                  { icon: MapPin, label: 'Postcode', value: property.postcode },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[var(--bg-hover)] flex items-center justify-center">
                      <item.icon size={15} className="text-[var(--text-muted)]" />
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">{item.label}</p>
                      <p className="text-sm font-medium capitalize">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Landlord */}
            <Card className="p-6">
              <SectionHeader title="Landlord" />
              {property.landlord_name ? (
                <div
                  onClick={() => property.landlord_id && navigate(`/v3/landlords/${property.landlord_id}`)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
                >
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

            {/* Tenant */}
            <Card className="p-6">
              <SectionHeader title="Tenant" />
              {property.current_tenant ? (
                <div
                  onClick={() => property.tenant_id && navigate(`/v3/tenants/${property.tenant_id}`)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
                >
                  <Avatar name={property.current_tenant} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{property.current_tenant}</p>
                    <p className="text-xs text-[var(--text-muted)]">Current Tenant</p>
                  </div>
                  <ChevronRight size={16} className="text-[var(--text-muted)]" />
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">No tenant assigned</p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </V3Layout>
  );
}
