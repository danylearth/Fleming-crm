import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { GlassCard, Button, Input, Avatar, Tag, SearchBar, EmptyState, DatePicker } from '../components/ui';
import BulkActions from '../components/ui/BulkActions';
import { useApi } from '../hooks/useApi';
import { Plus, X, Mail, Phone, Calendar, ArrowRight, UserPlus, XCircle, LayoutGrid, List } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';

interface Prospect {
  id: number; name: string; email: string; phone: string; address: string;
  status: string; follow_up_date: string; source: string; notes: string;
  created_at: string; updated_at: string;
}

const STATUSES = [
  { key: 'new', label: 'New', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { key: 'contacted', label: 'Contacted', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  { key: 'follow_up', label: 'Follow Up', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
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

export default function BDM() {
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
  const [workflowProspect, setWorkflowProspect] = useState<Prospect | null>(null);
  const [workflowMode, setWorkflowMode] = useState<'choose' | 'follow_up' | 'reject' | 'confirm_drag'>('choose');
  const [workflowDate, setWorkflowDate] = useState('');
  const [, setWorkflowReason] = useState('');
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [dragTargetStatus, setDragTargetStatus] = useState('');
  // Bulk actions state
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/landlords-bdm');
      setProspects(Array.isArray(data) ? data : []);
    } catch { /* failed to load prospects */ setProspects([]); }
    setLoading(false);
  }, [api]);
  useEffect(() => {
    const fetchData = async () => { await load(); };
    fetchData();
  }, [load]);

  const filtered = prospects.filter(p => {
    const matchSearch = !search || [p.name, p.email, p.phone, p.address, p.source]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()));
    let matchStatus = true;
    if (statusFilter === 'active') matchStatus = !['not_interested'].includes(p.status);
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
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      const msg = err?.response?.data?.error || err?.message || 'Failed to add';
      if (msg.includes('Duplicate')) setError('A prospect with this email or phone already exists');
      else setError(msg);
    }
    setSaving(false);
  };

  const openWorkflow = (p: Prospect, e: React.MouseEvent) => {
    e.stopPropagation();
    setWorkflowProspect(p);
    setWorkflowMode('choose');
    setWorkflowDate('');
    setWorkflowReason('');
    setDragTargetStatus('');
  };

  const doWorkflowAction = async (status: string, extra?: Record<string, string>) => {
    if (!workflowProspect) return;
    setWorkflowLoading(true);
    try {
      await api.put(`/api/landlords-bdm/${workflowProspect.id}`, {
        name: workflowProspect.name, email: workflowProspect.email, phone: workflowProspect.phone,
        address: workflowProspect.address, source: workflowProspect.source,
        notes: workflowProspect.notes, status,
        follow_up_date: extra?.follow_up_date || workflowProspect.follow_up_date,
      });
      setWorkflowProspect(null);
      await load();
    } catch (e) { console.error(e); }
    setWorkflowLoading(false);
  };

  const canConvert = (p: Prospect) => !!(p.name && p.email && p.phone && p.address);

  const doConvert = async () => {
    if (!workflowProspect) return;
    if (!canConvert(workflowProspect)) return;
    setConverting(true);
    try {
      await api.post(`/api/landlords-bdm/${workflowProspect.id}/convert`, {});
      setWorkflowProspect(null);
      await load();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) { alert(err?.response?.data?.error || err?.message || 'Failed to convert prospect'); }
    setConverting(false);
  };

  const onDragEnd = (result: DropResult) => {
    const { draggableId, destination, source } = result;
    if (!destination || destination.droppableId === source.droppableId) return;
    const prospectId = parseInt(draggableId);
    const newStatus = destination.droppableId;
    const p = prospects.find(pr => pr.id === prospectId);
    if (!p) return;
    // Open workflow modal with the target status pre-selected
    setWorkflowProspect(p);
    setDragTargetStatus(newStatus);
    if (newStatus === 'follow_up') {
      setWorkflowMode('follow_up');
    } else if (newStatus === 'not_interested') {
      setWorkflowMode('reject');
    } else {
      setWorkflowMode('confirm_drag');
    }
    setWorkflowDate('');
  };

  // Follow-up due count
  const followUpDue = prospects.filter(p => p.follow_up_date && isOverdue(p.follow_up_date) && !['onboarded', 'not_interested'].includes(p.status)).length;

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedIds.length} prospect${selectedIds.length !== 1 ? 's' : ''}? This action cannot be undone.`
    );

    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await api.post('/api/landlords-bdm/bulk-delete', { ids: selectedIds });
      setSelectedIds([]);
      await load();
    } catch (e) {
      console.error('Bulk delete error:', e);
      alert('Failed to delete prospects. Please try again.');
    }
    setIsDeleting(false);
  };

  const toggleSelectProspect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(p => p.id));
    }
  };

  return (
    <Layout title="Landlord Enquiries" breadcrumb={[{ label: 'Landlord Enquiries' }]}>
      <div className="p-4 md:p-8 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Active Prospects', value: activeCount, accent: true },
            { label: 'Follow-ups Due', value: followUpDue, warn: followUpDue > 0 },
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
          <Button
            variant={editMode ? "outline" : "ghost"}
            onClick={() => {
              setEditMode(!editMode);
              if (editMode) setSelectedIds([]);
            }}
          >
            {editMode ? 'Cancel' : 'Edit'}
          </Button>
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

        {/* Bulk Actions */}
        {editMode && (
          <BulkActions
            selectedIds={selectedIds}
            onClearSelection={() => setSelectedIds([])}
            onBulkDelete={handleBulkDelete}
            entityName="prospect"
            isDeleting={isDeleting}
          />
        )}

        {/* Content */}
        {loading ? (
          <div className="text-center py-16 text-[var(--text-muted)] text-sm">Loading...</div>
        ) : viewMode === 'kanban' ? (
          /* ==================== KANBAN VIEW ==================== */
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {STATUSES.filter(s => {
                if (statusFilter === 'active') return s.key !== 'not_interested';
                if (statusFilter === 'all') return true;
                return s.key === statusFilter;
              }).map(col => {
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
                    {/* Droppable area */}
                    <Droppable droppableId={col.key}>
                      {(provided, snapshot) => (
                        <div ref={provided.innerRef} {...provided.droppableProps}
                          className={`space-y-3 min-h-[100px] rounded-xl transition-colors ${snapshot.isDraggingOver ? 'bg-[var(--accent-orange)]/5 ring-1 ring-[var(--accent-orange)]/20' : ''}`}>
                          {colProspects.length === 0 && !snapshot.isDraggingOver ? (
                            <p className="text-xs text-[var(--text-muted)] text-center py-8">No prospects</p>
                          ) : colProspects.map((p, index) => (
                            <Draggable key={p.id} draggableId={String(p.id)} index={index}>
                              {(provided, snapshot) => (
                                <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
                                  style={provided.draggableProps.style}>
                                  <GlassCard className={`p-4 cursor-grab active:cursor-grabbing hover:border-[var(--accent-orange)]/30 transition-colors ${snapshot.isDragging ? 'ring-2 ring-[var(--accent-orange)]/40 shadow-lg' : ''}`}
                                    onClick={() => !snapshot.isDragging && navigate(`/bdm/${p.id}`)}>
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
                                    <div className="flex items-center gap-2 mt-3 pt-2 border-t border-[var(--border-subtle)]">
                                      {p.follow_up_date && (
                                        <span className={`text-[10px] flex items-center gap-1 ${isOverdue(p.follow_up_date) ? 'text-orange-400 font-medium' : 'text-[var(--text-muted)]'}`}>
                                          <Calendar size={10} />
                                          {formatDate(p.follow_up_date)}
                                          {isOverdue(p.follow_up_date) && ' ⚠'}
                                        </span>
                                      )}
                                      <button onClick={(e) => { e.stopPropagation(); openWorkflow(p, e); }}
                                        className="ml-auto text-[10px] px-2.5 py-1 rounded-lg bg-gradient-to-r from-orange-500/20 to-pink-500/20 text-[var(--text-primary)] hover:from-orange-500/30 hover:to-pink-500/30 transition-colors font-medium">
                                        Progress / Reject
                                      </button>
                                    </div>
                                  </GlassCard>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                );
              })}
            </div>
          </DragDropContext>
        ) : filtered.length === 0 ? (
          <EmptyState message={search || statusFilter !== 'active' ? 'No prospects match your filters' : 'No prospects yet — add your first one'} />
        ) : (
          /* ==================== LIST VIEW ==================== */
          <div className="overflow-x-auto">
            {editMode && (
              <div className="flex items-center gap-2 mb-2 px-4">
                <input
                  type="checkbox"
                  checked={selectedIds.length === filtered.length && filtered.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                />
                <span className="text-sm text-gray-400">
                  {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Select all'}
                </span>
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                  {editMode && <th className="text-left py-3 px-4 font-medium w-12"></th>}
                  <th className="text-left py-3 px-4 font-medium">Name</th>
                  <th className="text-left py-3 px-4 font-medium hidden md:table-cell">Contact</th>
                  <th className="text-left py-3 px-4 font-medium hidden lg:table-cell">Address</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-left py-3 px-4 font-medium hidden sm:table-cell">Follow Up</th>
                  <th className="text-left py-3 px-4 font-medium hidden lg:table-cell">Source</th>
                  <th className="text-right py-3 px-4 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}
                    onClick={() => !editMode && navigate(`/bdm/${p.id}`)}
                    className={`border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] ${!editMode ? 'cursor-pointer' : ''} transition-colors`}>
                    {editMode && (
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(p.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSelectProspect(p.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                        />
                      </td>
                    )}
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
                    <td className="py-3 px-4 text-right">
                      {!['onboarded', 'not_interested'].includes(p.status) && (
                        <button onClick={(e) => openWorkflow(p, e)}
                          className="text-[10px] px-2.5 py-1 rounded-lg bg-gradient-to-r from-orange-500/20 to-pink-500/20 text-[var(--text-primary)] hover:from-orange-500/30 hover:to-pink-500/30 transition-colors font-medium whitespace-nowrap">
                          Progress / Reject
                        </button>
                      )}
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
              <DatePicker label="Follow-up Date" value={form.follow_up_date} onChange={v => setForm({ ...form, follow_up_date: v })} />
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
      {/* Workflow Modal */}
      {workflowProspect && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-[var(--overlay-bg)] backdrop-blur-sm"
          onClick={() => setWorkflowProspect(null)}>
          <div className="bg-[var(--bg-card)] border border-[var(--border-input)] rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-md space-y-2"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Avatar name={workflowProspect.name} size="md" />
                <div>
                  <h3 className="text-lg font-bold">{workflowProspect.name}</h3>
                  <p className="text-xs text-[var(--text-muted)]">Update workflow</p>
                </div>
              </div>
              <button onClick={() => setWorkflowProspect(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
            </div>

            {workflowMode === 'choose' ? (
              <>
                <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-3">Progress</p>
                <button onClick={() => doWorkflowAction('contacted')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center">
                    <Phone size={14} className="text-white" />
                  </div>
                  <div className="flex-1"><p className="text-sm font-medium">Mark as Contacted</p><p className="text-xs text-[var(--text-muted)]">Initial outreach made</p></div>
                  <ArrowRight size={14} className="text-[var(--text-muted)]" />
                </button>
                <button onClick={() => setWorkflowMode('follow_up')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                    <Calendar size={14} className="text-white" />
                  </div>
                  <div className="flex-1"><p className="text-sm font-medium">Set Follow Up</p><p className="text-xs text-[var(--text-muted)]">Schedule a follow-up date</p></div>
                  <ArrowRight size={14} className="text-[var(--text-muted)]" />
                </button>

                {/* Convert — only when follow_up or later */}
                {['follow_up', 'interested'].includes(workflowProspect.status) && (
                  <>
                    <div className="h-px bg-[var(--border-subtle)] my-3" />
                    <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-2">Convert</p>
                    {canConvert(workflowProspect) ? (
                      <button onClick={doConvert} disabled={converting}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors text-left border border-emerald-500/20">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                          <UserPlus size={14} className="text-white" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-emerald-400">{converting ? 'Converting...' : 'Convert to Landlord'}</p>
                          <p className="text-xs text-[var(--text-muted)]">Move to Landlords module</p>
                        </div>
                        <ArrowRight size={14} className="text-[var(--text-muted)]" />
                      </button>
                    ) : (
                      <div className="px-4 py-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                        <p className="text-sm font-medium text-[var(--text-muted)]">Convert to Landlord</p>
                        <p className="text-xs text-orange-400 mt-1">Missing required fields:</p>
                        <ul className="text-xs text-[var(--text-muted)] mt-1 space-y-0.5">
                          {!workflowProspect.name && <li>• Name</li>}
                          {!workflowProspect.email && <li>• Email</li>}
                          {!workflowProspect.phone && <li>• Phone</li>}
                          {!workflowProspect.address && <li>• Address</li>}
                        </ul>
                        <p className="text-[10px] text-[var(--text-muted)] mt-2">Edit the prospect to add missing info first</p>
                      </div>
                    )}
                  </>
                )}

                <div className="h-px bg-[var(--border-subtle)] my-3" />
                <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-2">Archive</p>
                <button onClick={() => setWorkflowMode('reject')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center">
                    <XCircle size={14} className="text-white" />
                  </div>
                  <div className="flex-1"><p className="text-sm font-medium text-red-400">Not Interested</p><p className="text-xs text-[var(--text-muted)]">Archive this prospect</p></div>
                  <ArrowRight size={14} className="text-[var(--text-muted)]" />
                </button>
              </>
            ) : workflowMode === 'confirm_drag' ? (
              <div className="space-y-4">
                <p className="text-sm font-medium">
                  Move to <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ml-1 ${statusStyle(dragTargetStatus)}`}>{statusLabel(dragTargetStatus)}</span>
                </p>
                <p className="text-xs text-[var(--text-muted)]">Confirm moving {workflowProspect?.name} to {statusLabel(dragTargetStatus)}?</p>
                <div className="flex gap-3">
                  <Button variant="ghost" onClick={() => setWorkflowProspect(null)}>Cancel</Button>
                  <Button variant="gradient" onClick={() => doWorkflowAction(dragTargetStatus)} disabled={workflowLoading}>
                    {workflowLoading ? 'Moving...' : 'Confirm'}
                  </Button>
                </div>
              </div>
            ) : workflowMode === 'follow_up' ? (
              <div className="space-y-4">
                <p className="text-sm font-medium">Set Follow-up Date</p>
                <DatePicker label="Follow-up Date" value={workflowDate} onChange={setWorkflowDate} />
                <div className="flex gap-3">
                  <Button variant="ghost" onClick={() => dragTargetStatus ? setWorkflowProspect(null) : setWorkflowMode('choose')}>
                    {dragTargetStatus ? 'Cancel' : 'Back'}
                  </Button>
                  <Button variant="gradient" onClick={() => doWorkflowAction('follow_up', { follow_up_date: workflowDate })}
                    disabled={workflowLoading || !workflowDate}>
                    {workflowLoading ? 'Saving...' : 'Set Follow Up'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm font-medium text-red-400">Mark as Not Interested</p>
                <p className="text-xs text-[var(--text-muted)]">This will archive the prospect. Are you sure?</p>
                <div className="flex gap-3">
                  <Button variant="ghost" onClick={() => dragTargetStatus ? setWorkflowProspect(null) : setWorkflowMode('choose')}>
                    {dragTargetStatus ? 'Cancel' : 'Back'}
                  </Button>
                  <Button variant="gradient" onClick={() => doWorkflowAction('not_interested')} disabled={workflowLoading}>
                    {workflowLoading ? 'Archiving...' : 'Archive'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
