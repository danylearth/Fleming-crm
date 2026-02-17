import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { GlassCard, Button, Input, Select, Avatar, Tag, SearchBar, EmptyState } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { Plus, X, Mail, Phone, MapPin, Calendar, ChevronDown, Search, ArrowRight, UserPlus, XCircle, LayoutGrid, List } from 'lucide-react';

interface Prospect {
  id: number; name: string; email: string; phone: string; address: string;
  status: string; follow_up_date: string; source: string; notes: string;
  created_at: string; updated_at: string;
}

const STATUSES = [
  { key: 'new', label: 'New', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { key: 'contacted', label: 'Contacted', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  { key: 'follow_up', label: 'Follow Up', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { key: 'interested', label: 'Interested', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  { key: 'onboarded', label: 'Onboarded', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { key: 'not_interested', label: 'Not Interested', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
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

export default function BDMV3() {
  const navigate = useNavigate();
  const api = useApi();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // active = not onboarded/not_interested
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', source: '', follow_up_date: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

  const load = async () => {
    try {
      const data = await api.get('/api/landlords-bdm');
      setProspects(Array.isArray(data) ? data : []);
    } catch { setProspects([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = prospects.filter(p => {
    const matchSearch = !search || [p.name, p.email, p.phone, p.address, p.source]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()));
    let matchStatus = true;
    if (statusFilter === 'active') matchStatus = !['onboarded', 'not_interested'].includes(p.status);
    else if (statusFilter !== 'all') matchStatus = p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statusCounts = prospects.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const activeCount = prospects.filter(p => !['onboarded', 'not_interested'].includes(p.status)).length;

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.post('/api/landlords-bdm', { ...form, status: 'new' });
      setShowModal(false);
      setForm({ name: '', email: '', phone: '', address: '', source: '', follow_up_date: '', notes: '' });
      await load();
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to add';
      if (msg.includes('Duplicate')) setError('A prospect with this email or phone already exists');
      else setError(msg);
    }
    setSaving(false);
  };

  // Follow-up due count
  const followUpDue = prospects.filter(p => p.follow_up_date && isOverdue(p.follow_up_date) && !['onboarded', 'not_interested'].includes(p.status)).length;

  return (
    <V3Layout title="Landlords BDM" breadcrumb={[{ label: 'BDM' }]}>
      <div className="p-4 md:p-8 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Active Prospects', value: activeCount, accent: true },
            { label: 'Follow-ups Due', value: followUpDue, warn: followUpDue > 0 },
            { label: 'Interested', value: statusCounts['interested'] || 0 },
            { label: 'Onboarded', value: statusCounts['onboarded'] || 0 },
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
          <div className="flex-1"><SearchBar value={search} onChange={setSearch} placeholder="Search prospects..." /></div>
          <div className="flex items-center gap-1 bg-[var(--bg-input)] rounded-xl p-1 border border-[var(--border-input)]">
            <button onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
              <List size={16} />
            </button>
            <button onClick={() => setViewMode('kanban')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'kanban' ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
              <LayoutGrid size={16} />
            </button>
          </div>
          <Button variant="gradient" onClick={() => setShowModal(true)}>
            <Plus size={16} className="mr-2" /> Add Prospect
          </Button>
        </div>

        {/* Status filter */}
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'active', label: `Active (${activeCount})` },
            { key: 'all', label: `All (${prospects.length})` },
            ...STATUSES.map(s => ({ key: s.key, label: `${s.label} (${statusCounts[s.key] || 0})` })),
          ].map(f => (
            <Tag key={f.key} active={statusFilter === f.key} onClick={() => setStatusFilter(f.key)}>
              {f.label}
            </Tag>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-16 text-[var(--text-muted)] text-sm">Loading...</div>
        ) : viewMode === 'kanban' ? (
          /* ==================== KANBAN VIEW ==================== */
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STATUSES.filter(s => s.key !== 'onboarded' && s.key !== 'not_interested').map(col => {
              const colProspects = prospects.filter(p => {
                const matchSearch = !search || [p.name, p.email, p.phone, p.address, p.source]
                  .some(v => v?.toLowerCase().includes(search.toLowerCase()));
                return p.status === col.key && matchSearch;
              });
              return (
                <div key={col.key} className="min-w-[280px] flex-1">
                  {/* Column header */}
                  <div className={`rounded-xl border px-4 py-3 mb-3 ${col.color}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{col.label}</span>
                      <span className="text-xs bg-[var(--bg-input)] px-2 py-0.5 rounded-full">{colProspects.length}</span>
                    </div>
                  </div>
                  {/* Cards */}
                  <div className="space-y-3">
                    {colProspects.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)] text-center py-8">No prospects</p>
                    ) : colProspects.map(p => (
                      <GlassCard key={p.id} className="p-4 cursor-pointer hover:border-[var(--accent-orange)]/30 transition-colors"
                        onClick={() => navigate(`/v3/bdm/${p.id}`)}>
                        <div className="flex items-start gap-3">
                          <Avatar name={p.name} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{p.name}</p>
                            {p.email && (
                              <p className="text-xs text-[var(--text-muted)] truncate flex items-center gap-1 mt-0.5">
                                <Mail size={10} />{p.email}
                              </p>
                            )}
                            {p.phone && (
                              <p className="text-xs text-[var(--text-muted)] truncate flex items-center gap-1 mt-0.5">
                                <Phone size={10} />{p.phone}
                              </p>
                            )}
                          </div>
                        </div>
                        {(p.follow_up_date || p.source) && (
                          <div className="flex items-center gap-3 mt-3 pt-2 border-t border-[var(--border-subtle)]">
                            {p.follow_up_date && (
                              <span className={`text-[10px] flex items-center gap-1 ${isOverdue(p.follow_up_date) ? 'text-orange-400 font-medium' : 'text-[var(--text-muted)]'}`}>
                                <Calendar size={10} />
                                {formatDate(p.follow_up_date)}
                                {isOverdue(p.follow_up_date) && ' ⚠'}
                              </span>
                            )}
                            {p.source && (
                              <span className="text-[10px] text-[var(--text-muted)] ml-auto">{p.source}</span>
                            )}
                          </div>
                        )}
                      </GlassCard>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState message={search || statusFilter !== 'active' ? 'No prospects match your filters' : 'No prospects yet — add your first one'} />
        ) : (
          /* ==================== LIST VIEW ==================== */
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                  <th className="text-left py-3 px-4 font-medium">Name</th>
                  <th className="text-left py-3 px-4 font-medium hidden md:table-cell">Contact</th>
                  <th className="text-left py-3 px-4 font-medium hidden lg:table-cell">Address</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-left py-3 px-4 font-medium hidden sm:table-cell">Follow Up</th>
                  <th className="text-left py-3 px-4 font-medium hidden lg:table-cell">Source</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}
                    onClick={() => navigate(`/v3/bdm/${p.id}`)}
                    className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={p.name} size="sm" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{p.name}</p>
                          <p className="text-xs text-[var(--text-muted)] truncate md:hidden">{p.email || p.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      <div className="space-y-0.5">
                        {p.email && <p className="text-xs text-[var(--text-secondary)] truncate flex items-center gap-1"><Mail size={10} />{p.email}</p>}
                        {p.phone && <p className="text-xs text-[var(--text-muted)] flex items-center gap-1"><Phone size={10} />{p.phone}</p>}
                      </div>
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell">
                      <p className="text-xs text-[var(--text-muted)] truncate max-w-[200px]">{p.address || '—'}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusStyle(p.status)}`}>
                        {statusLabel(p.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 hidden sm:table-cell">
                      {p.follow_up_date ? (
                        <span className={`text-xs flex items-center gap-1 ${isOverdue(p.follow_up_date) ? 'text-orange-400 font-medium' : 'text-[var(--text-muted)]'}`}>
                          <Calendar size={10} />
                          {formatDate(p.follow_up_date)}
                          {isOverdue(p.follow_up_date) && ' ⚠'}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell">
                      <span className="text-xs text-[var(--text-muted)]">{p.source || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-[var(--overlay-bg)] backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-[var(--bg-card)] border border-[var(--border-input)] rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-md space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Prospect</h2>
              <button onClick={() => { setShowModal(false); setError(''); }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
            </div>
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-xs text-red-400">{error}</div>
            )}
            <Input label="Full Name *" value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="Landlord name" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} placeholder="email@example.com" type="email" />
              <Input label="Phone" value={form.phone} onChange={v => setForm({ ...form, phone: v })} placeholder="+44..." />
            </div>
            <Input label="Address" value={form.address} onChange={v => setForm({ ...form, address: v })} placeholder="Property or contact address" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Source" value={form.source} onChange={v => setForm({ ...form, source: v })} placeholder="e.g. Referral, Rightmove" />
              <Input label="Follow-up Date" value={form.follow_up_date} onChange={v => setForm({ ...form, follow_up_date: v })} placeholder="YYYY-MM-DD" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1.5">Notes</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none resize-none"
                placeholder="Initial notes..." />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => { setShowModal(false); setError(''); }}>Cancel</Button>
              <Button variant="gradient" onClick={handleAdd} disabled={saving || !form.name.trim()}>
                {saving ? 'Adding...' : 'Add Prospect'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </V3Layout>
  );
}
