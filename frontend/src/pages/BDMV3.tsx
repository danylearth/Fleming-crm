import { useState, useEffect } from 'react';
import V3Layout from '../components/V3Layout';
import { GlassCard, Button, Input, Select, EmptyState, Tag } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { Plus, X, Mail, Phone, Building2, User } from 'lucide-react';

interface Prospect {
  id: number;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  status: string;
  source: string;
  notes: string;
  created_at: string;
}

const PIPELINE: { key: string; label: string; color: string }[] = [
  { key: 'new_lead', label: 'New Lead', color: 'from-blue-500/20 to-blue-600/10 border-blue-500/20' },
  { key: 'contacted', label: 'Contacted', color: 'from-purple-500/20 to-purple-600/10 border-purple-500/20' },
  { key: 'meeting_scheduled', label: 'Meeting', color: 'from-amber-500/20 to-amber-600/10 border-amber-500/20' },
  { key: 'proposal_sent', label: 'Proposal', color: 'from-orange-500/20 to-orange-600/10 border-orange-500/20' },
  { key: 'negotiating', label: 'Negotiating', color: 'from-pink-500/20 to-pink-600/10 border-pink-500/20' },
  { key: 'onboarded', label: 'Onboarded', color: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/20' },
];

const STATUS_LABELS: Record<string, string> = {
  new_lead: 'New Lead', contacted: 'Contacted', meeting_scheduled: 'Meeting Scheduled',
  proposal_sent: 'Proposal Sent', negotiating: 'Negotiating', onboarded: 'Onboarded', not_interested: 'Not Interested',
};

const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }));

export default function BDMV3() {
  const api = useApi();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ company_name: '', contact_name: '', email: '', phone: '', status: 'new_lead', source: '', notes: '' });

  const load = async () => {
    try {
      const data = await api.get('/api/landlords-bdm');
      setProspects(Array.isArray(data) ? data : data.prospects || []);
    } catch { setProspects([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: number, status: string) => {
    try {
      await api.put(`/api/landlords-bdm/${id}`, { status });
      await load();
    } catch {}
  };

  const addProspect = async () => {
    try {
      await api.post('/api/landlords-bdm', form);
      setShowAdd(false);
      setForm({ company_name: '', contact_name: '', email: '', phone: '', status: 'new_lead', source: '', notes: '' });
      await load();
    } catch {}
  };

  const grouped = PIPELINE.map(col => ({
    ...col,
    items: prospects.filter(p => p.status === col.key),
  }));

  return (
    <V3Layout title="BDM Pipeline" breadcrumb={[{ label: 'BDM' }]}>
      <div className="p-4 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-white/50 text-sm">{prospects.length} prospect{prospects.length !== 1 ? 's' : ''} in pipeline</p>
          <Button variant="gradient" size="sm" onClick={() => setShowAdd(true)}>
            <Plus size={14} className="mr-1.5" /> Add Prospect
          </Button>
        </div>

        {loading ? (
          <div className="text-center text-white/30 py-16">Loading...</div>
        ) : (
          <div className="flex md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 overflow-x-auto pb-4 md:pb-0 md:overflow-visible">
            {grouped.map(col => (
              <div key={col.key} className="min-w-[250px] md:min-w-0">
                <div className={`bg-gradient-to-b ${col.color} rounded-xl border p-3 mb-3`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{col.label}</span>
                    <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full">{col.items.length}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  {col.items.length === 0 ? (
                    <p className="text-xs text-white/20 text-center py-4">No prospects</p>
                  ) : (
                    col.items.map(p => (
                      <GlassCard key={p.id} className="p-4" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {p.company_name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{p.company_name}</p>
                            <p className="text-xs text-white/50 truncate">{p.contact_name}</p>
                          </div>
                        </div>
                        {p.source && <Tag>{p.source}</Tag>}

                        {expanded === p.id && (
                          <div className="mt-3 pt-3 border-t border-white/[0.08] space-y-2">
                            <div className="flex items-center gap-2 text-xs text-white/60">
                              <Mail size={12} /> {p.email}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-white/60">
                              <Phone size={12} /> {p.phone}
                            </div>
                            {p.notes && <p className="text-xs text-white/40 mt-2">{p.notes}</p>}
                            <Select label="Change Status" value={p.status} onChange={v => updateStatus(p.id, v)} options={STATUS_OPTIONS} className="mt-2" />
                          </div>
                        )}
                      </GlassCard>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Modal */}
        {showAdd && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-50 p-0 md:p-4" onClick={() => setShowAdd(false)}>
            <div className="bg-[#232323] rounded-t-2xl md:rounded-2xl border border-white/[0.1] w-full md:w-[480px] max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold">Add Prospect</h3>
                <button onClick={() => setShowAdd(false)} className="text-white/40 hover:text-white"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <Input label="Company Name" value={form.company_name} onChange={v => setForm(p => ({ ...p, company_name: v }))} placeholder="Company" />
                <Input label="Contact Name" value={form.contact_name} onChange={v => setForm(p => ({ ...p, contact_name: v }))} placeholder="Contact person" />
                <Input label="Email" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} placeholder="email@example.com" type="email" />
                <Input label="Phone" value={form.phone} onChange={v => setForm(p => ({ ...p, phone: v }))} placeholder="Phone number" />
                <Select label="Status" value={form.status} onChange={v => setForm(p => ({ ...p, status: v }))} options={STATUS_OPTIONS} />
                <Input label="Source" value={form.source} onChange={v => setForm(p => ({ ...p, source: v }))} placeholder="e.g. Referral, Cold call" />
                <Input label="Notes" value={form.notes} onChange={v => setForm(p => ({ ...p, notes: v }))} placeholder="Notes..." />
                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
                  <Button variant="gradient" onClick={addProspect} disabled={!form.company_name}>Add Prospect</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </V3Layout>
  );
}
