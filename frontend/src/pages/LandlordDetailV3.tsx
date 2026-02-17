import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { GlassCard, Button, Input, Avatar, SectionHeader, EmptyState, Card } from '../components/v3';
import DocumentUpload from '../components/v3/DocumentUpload';
import RentPayments from '../components/v3/RentPayments';
import { useApi } from '../hooks/useApi';
import { Pencil, Save, X, Mail, Phone, MapPin, Building2 } from 'lucide-react';
import { getPropertyImage } from '../utils/propertyImages';

interface Landlord {
  id: number; name: string; email: string; phone: string; address: string; notes: string; property_count: number;
}
interface Property {
  id: number; address: string; landlord_id: number; type?: string; status?: string;
}

export default function LandlordDetailV3() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const [landlord, setLandlord] = useState<Landlord | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [l, props] = await Promise.all([
          api.get(`/api/landlords/${id}`),
          api.get('/api/properties'),
        ]);
        setLandlord(l);
        setForm({ name: l.name, email: l.email || '', phone: l.phone || '', address: l.address || '', notes: l.notes || '' });
        setProperties(props.filter((p: Property) => p.landlord_id === Number(id)));
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.put(`/api/landlords/${id}`, form);
      setLandlord({ ...landlord!, ...updated });
      setEditing(false);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  if (loading) return <V3Layout title="Loading..."><div className="p-8 text-[var(--text-muted)] text-sm">Loading...</div></V3Layout>;
  if (!landlord) return <V3Layout title="Not Found"><div className="p-8 text-[var(--text-muted)]">Landlord not found</div></V3Layout>;

  return (
    <V3Layout breadcrumb={[{ label: 'Landlords', to: '/v3/landlords' }, { label: landlord.name }]}>
      <div className="p-4 md:p-8 space-y-6 md:space-y-8">
        {/* Hero */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-orange-500/20 via-pink-500/20 to-purple-500/20 border border-[var(--border-color)]">
          <div className="p-4 md:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-4 md:gap-6">
            <Avatar name={landlord.name} size="xl" />
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{landlord.name}</h1>
              <p className="text-[var(--text-secondary)] text-sm mt-1">{landlord.property_count || properties.length} properties managed</p>
            </div>
            <div className="flex gap-2">
              <Button variant={editing ? 'ghost' : 'outline'} onClick={() => {
                if (editing) { setEditing(false); setForm({ name: landlord.name, email: landlord.email || '', phone: landlord.phone || '', address: landlord.address || '', notes: landlord.notes || '' }); }
                else setEditing(true);
              }}>
                {editing ? <><X size={14} className="mr-2" />Cancel</> : <><Pencil size={14} className="mr-2" />Edit</>}
              </Button>
              {editing && (
                <Button variant="gradient" onClick={handleSave} disabled={saving}>
                  <Save size={14} className="mr-2" />{saving ? 'Saving...' : 'Save'}
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact Info */}
            <GlassCard className="p-6">
              <SectionHeader title="Contact Information" />
              {editing ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="Name" value={form.name} onChange={v => setForm({ ...form, name: v })} />
                  <Input label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} type="email" />
                  <Input label="Phone" value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
                  <Input label="Address" value={form.address} onChange={v => setForm({ ...form, address: v })} />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { icon: Mail, label: 'Email', value: landlord.email },
                    { icon: Phone, label: 'Phone', value: landlord.phone },
                    { icon: MapPin, label: 'Address', value: landlord.address },
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

            {/* Rent Payments (across all landlord properties) */}
            {properties.length > 0 && properties.map(p => (
              <RentPayments key={p.id} propertyId={p.id} compact />
            )).slice(0, 1)}

            {/* Notes */}
            <GlassCard className="p-6">
              <SectionHeader title="Notes" />
              {editing ? (
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={4}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-input)] transition-colors resize-none"
                  placeholder="Notes..." />
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">{landlord.notes || 'No notes'}</p>
              )}
            </GlassCard>

            {/* Documents */}
            <DocumentUpload entityType="landlord" entityId={landlord.id} />
          </div>

          {/* Right column — Properties */}
          <div className="space-y-6">
            <div>
              <SectionHeader title="Properties" actionLabel="View All" action={() => navigate('/v3/properties')} />
              {properties.length === 0 ? (
                <EmptyState message="No properties linked" />
              ) : (
                <div className="space-y-3">
                  {properties.map(p => (
                    <Card key={p.id} hover onClick={() => navigate(`/v3/properties/${p.id}`)} className="overflow-hidden">
                      <img
                        src={getPropertyImage(p.id, 400, 160)}
                        alt={p.address}
                        className="h-24 w-full object-cover"
                        loading="lazy"
                      />
                      <div className="p-3">
                        <p className="text-sm font-medium truncate">{p.address}</p>
                        {p.type && <p className="text-xs text-[var(--text-muted)]">{p.type}</p>}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </V3Layout>
  );
}
