import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { GlassCard, Button, Input, Select, Avatar, Tag, StatusDot, SearchBar, EmptyState } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { Plus, X, Mail, Building2, Calendar } from 'lucide-react';

interface Tenant {
  id: number; name: string; email: string; phone: string; property_id: number;
  property_address: string; move_in_date: string; status: string; notes: string;
}

export default function TenantsV3() {
  const navigate = useNavigate();
  const api = useApi();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', property_id: '', move_in_date: '', status: 'active', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try { setTenants(await api.get('/api/tenants')); } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = tenants.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) || t.email?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.post('/api/tenants', { ...form, property_id: form.property_id ? Number(form.property_id) : null });
      setShowModal(false);
      setForm({ name: '', email: '', phone: '', property_id: '', move_in_date: '', status: 'active', notes: '' });
      await load();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const statusFilters = ['all', 'active', 'inactive'];

  return (
    <V3Layout title="Tenants" breadcrumb={[{ label: 'Tenants' }]}>
      <div className="p-4 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="flex-1"><SearchBar value={search} onChange={setSearch} placeholder="Search tenants..." /></div>
          <Button variant="gradient" onClick={() => setShowModal(true)}>
            <Plus size={16} className="mr-2" /> Add Tenant
          </Button>
        </div>

        {/* Status filter pills */}
        <div className="flex gap-2">
          {statusFilters.map(s => (
            <Tag key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Tag>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16 text-[var(--text-muted)] text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <EmptyState message={search || statusFilter !== 'all' ? 'No tenants match your filters' : 'No tenants yet'} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(t => (
              <GlassCard key={t.id} onClick={() => navigate(`/v3/tenants/${t.id}`)} className="p-5">
                <div className="flex items-start gap-4">
                  <Avatar name={t.name} size="lg" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm truncate">{t.name}</h3>
                      <StatusDot status={t.status === 'active' ? 'active' : 'inactive'} />
                    </div>
                    {t.email && (
                      <p className="text-xs text-[var(--text-secondary)] truncate flex items-center gap-1 mt-1">
                        <Mail size={11} /> {t.email}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 space-y-1.5">
                  {t.property_address && (
                    <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 truncate">
                      <Building2 size={12} /> {t.property_address}
                    </p>
                  )}
                  {t.move_in_date && (
                    <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
                      <Calendar size={12} /> {new Date(t.move_in_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-[var(--overlay-bg)] backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-[var(--bg-card)] border border-[var(--border-input)] rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-md space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Tenant</h2>
              <button onClick={() => setShowModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
            </div>
            <Input label="Name" value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="Full name" />
            <Input label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} placeholder="email@example.com" type="email" />
            <Input label="Phone" value={form.phone} onChange={v => setForm({ ...form, phone: v })} placeholder="+44..." />
            <Input label="Property ID" value={form.property_id} onChange={v => setForm({ ...form, property_id: v })} placeholder="Property ID" />
            <Input label="Move-in Date" value={form.move_in_date} onChange={v => setForm({ ...form, move_in_date: v })} placeholder="YYYY-MM-DD" />
            <Select label="Status" value={form.status} onChange={v => setForm({ ...form, status: v })} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button variant="gradient" onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </V3Layout>
  );
}
