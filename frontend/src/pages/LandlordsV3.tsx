import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { GlassCard, Button, Input, Avatar, Tag, SearchBar, EmptyState } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { Plus, X, Building2, Phone, Mail } from 'lucide-react';

interface Landlord {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  property_count: number;
}

export default function LandlordsV3() {
  const navigate = useNavigate();
  const api = useApi();
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const data = await api.get('/api/landlords');
      setLandlords(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = landlords.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.post('/api/landlords', form);
      setShowModal(false);
      setForm({ name: '', email: '', phone: '', address: '', notes: '' });
      await load();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  return (
    <V3Layout title="Landlords" breadcrumb={[{ label: 'Landlords' }]}>
      <div className="p-4 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Search landlords..." />
          </div>
          <Button variant="gradient" onClick={() => setShowModal(true)}>
            <Plus size={16} className="mr-2" /> Add Landlord
          </Button>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="text-center py-16 text-white/30 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <EmptyState message={search ? 'No landlords match your search' : 'No landlords yet. Add your first one!'} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(l => (
              <GlassCard key={l.id} onClick={() => navigate(`/v3/landlords/${l.id}`)} className="p-5">
                <div className="flex items-start gap-4">
                  <Avatar name={l.name} size="lg" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{l.name}</h3>
                    {l.email && (
                      <p className="text-xs text-white/50 truncate flex items-center gap-1 mt-1">
                        <Mail size={11} /> {l.email}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-white/40">
                    <Building2 size={13} />
                    <span>{l.property_count || 0} {l.property_count === 1 ? 'property' : 'properties'}</span>
                  </div>
                  {l.phone && (
                    <Tag><Phone size={11} className="mr-1" />{l.phone}</Tag>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-[#232323] border border-white/[0.1] rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-md space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Landlord</h2>
              <button onClick={() => setShowModal(false)} className="text-white/40 hover:text-white"><X size={18} /></button>
            </div>
            <Input label="Name" value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="Full name" />
            <Input label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} placeholder="email@example.com" type="email" />
            <Input label="Phone" value={form.phone} onChange={v => setForm({ ...form, phone: v })} placeholder="+44..." />
            <Input label="Address" value={form.address} onChange={v => setForm({ ...form, address: v })} placeholder="Address" />
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
