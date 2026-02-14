import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { GlassCard, Button, Avatar, SearchBar, Input, Select, EmptyState } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { Plus, Mail, Phone, Building2, X, Clock } from 'lucide-react';

interface Enquiry {
  id: number;
  name: string;
  email: string;
  phone: string;
  status: string;
  source: string;
  linked_property_id: number | null;
  property_address: string | null;
  notes: string;
  created_at: string;
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

const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }));

function formatTime(d: string) {
  const date = new Date(d);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function EnquiriesV3() {
  const api = useApi();
  const navigate = useNavigate();
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Enquiry | null>(null);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', status: 'new', source: '', linked_property_id: '', notes: '' });

  const load = async () => {
    try {
      const data = await api.get('/api/tenant-enquiries');
      setEnquiries(Array.isArray(data) ? data : data.enquiries || []);
    } catch { setEnquiries([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const newEnquiries = enquiries.filter(e => e.status === 'new');
  const filtered = enquiries.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.email.toLowerCase().includes(search.toLowerCase())
  );

  const updateStatus = async (id: number, status: string) => {
    try {
      await api.put(`/api/tenant-enquiries/${id}`, { status });
      await load();
      if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : null);
    } catch {}
  };

  const addEnquiry = async () => {
    try {
      await api.post('/api/tenant-enquiries', {
        ...form,
        linked_property_id: form.linked_property_id ? Number(form.linked_property_id) : null,
      });
      setShowAdd(false);
      setForm({ name: '', email: '', phone: '', status: 'new', source: '', linked_property_id: '', notes: '' });
      await load();
    } catch {}
  };

  return (
    <V3Layout hideTopBar>
      <div className="flex h-full">
        {/* Left Panel */}
        <div className="w-[350px] shrink-0 border-r border-white/[0.06] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 h-16 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold">Enquiries</h2>
              {newEnquiries.length > 0 && (
                <span className="bg-blue-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                  {newEnquiries.length} new
                </span>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(true)}>
              <Plus size={16} />
            </Button>
          </div>

          {/* New enquiries horizontal scroll */}
          {newEnquiries.length > 0 && (
            <div className="px-5 py-3 border-b border-white/[0.06]">
              <p className="text-[11px] text-white/40 font-medium uppercase tracking-wider mb-2">New Enquiries</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {newEnquiries.map(e => (
                  <div key={e.id} onClick={() => setSelected(e)}
                    className="shrink-0 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2 cursor-pointer hover:bg-blue-500/20 transition-colors min-w-[120px]">
                    <p className="text-xs font-medium truncate">{e.name}</p>
                    <p className="text-[10px] text-white/40 mt-0.5">{formatTime(e.created_at)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search */}
          <div className="px-4 py-3">
            <SearchBar value={search} onChange={setSearch} placeholder="Search enquiries..." />
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-white/30 text-sm">Loading...</div>
            ) : filtered.length === 0 ? (
              <EmptyState message="No enquiries found" />
            ) : (
              filtered.map(e => (
                <div key={e.id} onClick={() => setSelected(e)}
                  className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors border-b border-white/[0.04] ${
                    selected?.id === e.id ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
                  }`}>
                  <Avatar name={e.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{e.name}</p>
                      <span className="text-[10px] text-white/30 shrink-0 ml-2">{formatTime(e.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[e.status] || 'bg-white/10 text-white/50'}`}>
                        {STATUS_LABELS[e.status] || e.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {selected ? (
            <>
              {/* Detail Header */}
              <div className="flex items-center gap-4 px-8 h-16 border-b border-white/[0.06] shrink-0">
                <Avatar name={selected.name} size="md" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold">{selected.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[selected.status]}`}>
                    {STATUS_LABELS[selected.status] || selected.status}
                  </span>
                </div>
              </div>

              {/* Detail Content */}
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {/* Contact Info */}
                <GlassCard className="p-5">
                  <h4 className="text-xs text-white/40 font-medium uppercase tracking-wider mb-3">Contact Information</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 text-sm">
                      <Mail size={14} className="text-white/40" />
                      <span>{selected.email}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Phone size={14} className="text-white/40" />
                      <span>{selected.phone}</span>
                    </div>
                    {selected.property_address && (
                      <div className="flex items-center gap-3 text-sm">
                        <Building2 size={14} className="text-white/40" />
                        <span className="text-orange-400">{selected.property_address}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-sm">
                      <Clock size={14} className="text-white/40" />
                      <span className="text-white/60">Source: {selected.source || 'N/A'}</span>
                    </div>
                  </div>
                </GlassCard>

                {/* Notes */}
                {selected.notes && (
                  <div>
                    <h4 className="text-xs text-white/40 font-medium uppercase tracking-wider mb-3">Notes</h4>
                    <div className="space-y-2">
                      <div className="bg-white/[0.04] rounded-2xl rounded-tl-sm px-4 py-3 max-w-[80%]">
                        <p className="text-sm text-white/80">{selected.notes}</p>
                        <p className="text-[10px] text-white/30 mt-1">{new Date(selected.created_at).toLocaleDateString('en-GB')}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Status Actions */}
                <div>
                  <h4 className="text-xs text-white/40 font-medium uppercase tracking-wider mb-3">Update Status</h4>
                  <div className="flex flex-wrap gap-2">
                    {STATUS_OPTIONS.filter(s => s.value !== selected.status).map(s => (
                      <button key={s.value} onClick={() => updateStatus(selected.id, s.value)}
                        className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${STATUS_COLORS[s.value]} hover:brightness-125`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState message="Select an enquiry to view details" />
            </div>
          )}
        </div>

        {/* Add Modal */}
        {showAdd && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
            <div className="bg-[#232323] rounded-2xl border border-white/[0.1] w-[480px] max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold">Add Enquiry</h3>
                <button onClick={() => setShowAdd(false)} className="text-white/40 hover:text-white"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <Input label="Name" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="Full name" />
                <Input label="Email" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} placeholder="email@example.com" type="email" />
                <Input label="Phone" value={form.phone} onChange={v => setForm(p => ({ ...p, phone: v }))} placeholder="Phone number" />
                <Select label="Status" value={form.status} onChange={v => setForm(p => ({ ...p, status: v }))} options={STATUS_OPTIONS} />
                <Input label="Source" value={form.source} onChange={v => setForm(p => ({ ...p, source: v }))} placeholder="e.g. Rightmove, Website" />
                <Input label="Property ID (optional)" value={form.linked_property_id} onChange={v => setForm(p => ({ ...p, linked_property_id: v }))} placeholder="Property ID" />
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
