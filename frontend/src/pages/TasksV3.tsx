import { useState, useEffect, useRef } from 'react';
import V3Layout from '../components/V3Layout';
import { Card, GlassCard, Button, Input, Avatar, ProgressRing, EmptyState } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { Plus, X, CheckCircle2, Clock, Inbox, Calendar, Search, ChevronDown, ChevronLeft, ChevronRight, Building2, Users, UserCircle, Tag, List, CalendarDays } from 'lucide-react';

interface Task {
  id: number; title: string; description: string; assigned_to: string;
  priority: string; status: string; due_date: string; created_at: string;
  entity_type?: string; entity_id?: number; task_type?: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-blue-500/20 text-blue-400',
  medium: 'bg-amber-500/20 text-amber-400',
  high: 'bg-red-500/20 text-red-400',
};

const STATUS_LABELS: Record<string, string> = { pending: 'Pending', in_progress: 'In Progress', completed: 'Completed' };
const PRIORITY_LABELS: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' };
const TASK_TYPES = ['manual', 'viewing', 'follow_up', 'document', 'maintenance', 'onboarding', 'compliance', 'other'];

function isOverdue(task: Task) {
  return task.status !== 'completed' && task.due_date && new Date(task.due_date) < new Date();
}

/* ========== Filter Dropdown ========== */
function FilterDropdown({ icon: Icon, label, value, displayValue, onClear, items, onSelect }: {
  icon: any; label: string; value: number | string | null; displayValue?: string;
  onClear: () => void; items: { id: number | string; label: string }[]; onSelect: (id: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = items.filter(i => i.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
          value ? 'bg-[var(--accent-orange)]/10 border-[var(--accent-orange)]/30 text-[var(--accent-orange)]'
            : 'bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
        }`}>
        <Icon size={14} />
        <span className="max-w-[120px] truncate">{value ? displayValue : label}</span>
        {value ? <X size={12} className="hover:text-white" onClick={e => { e.stopPropagation(); onClear(); }} />
          : <ChevronDown size={12} className={open ? 'rotate-180' : ''} />}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-64 bg-[var(--bg-card)] border border-[var(--border-input)] rounded-xl shadow-2xl overflow-hidden right-0">
          <div className="p-2 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2 bg-[var(--bg-input)] rounded-lg px-3 py-2">
              <Search size={14} className="text-[var(--text-muted)]" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none" autoFocus />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? <p className="text-xs text-[var(--text-muted)] text-center py-4">No results</p>
              : filtered.map(i => (
                <button key={i.id} onClick={() => { onSelect(i.id); setOpen(false); setSearch(''); }}
                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-[var(--bg-hover)] transition-colors truncate ${value === i.id ? 'text-[var(--accent-orange)]' : 'text-[var(--text-secondary)]'}`}>
                  {i.label}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ========== Status/Priority Filter Tags ========== */
function FilterTags({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => (
        <button key={o.key} onClick={() => onChange(o.key)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            value === o.key ? 'bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/30'
              : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-subtle)] hover:text-[var(--text-secondary)]'
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function TasksV3() {
  const api = useApi();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [properties, setProperties] = useState<{ id: number; address: string; landlord_id: number | null }[]>([]);
  const [landlords, setLandlords] = useState<{ id: number; name: string }[]>([]);
  const [tenants, setTenants] = useState<{ id: number; name: string; property_id: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterProperty, setFilterProperty] = useState<number | null>(null);
  const [filterLandlord, setFilterLandlord] = useState<number | null>(null);
  const [filterTenant, setFilterTenant] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', assigned_to: '', priority: 'medium', status: 'pending', due_date: '', task_type: 'manual' });

  const load = async () => {
    try {
      const [data, props, lands, tens] = await Promise.all([
        api.get('/api/tasks'),
        api.get('/api/properties'),
        api.get('/api/landlords'),
        api.get('/api/tenants'),
      ]);
      setTasks(Array.isArray(data) ? data : data.tasks || []);
      setProperties(props);
      setLandlords(lands);
      setTenants(tens);
    } catch { setTasks([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Build lookup maps
  const propertyLandlordMap = properties.reduce((acc, p) => { if (p.landlord_id) acc[p.id] = p.landlord_id; return acc; }, {} as Record<number, number>);
  const tenantPropertyMap = tenants.reduce((acc, t) => { if (t.property_id) acc[t.id] = t.property_id; return acc; }, {} as Record<number, number>);

  const counts = {
    completed: tasks.filter(t => t.status === 'completed').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    pending: tasks.filter(t => t.status === 'pending').length,
  };

  const filtered = tasks.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !t.description?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType && t.task_type !== filterType) return false;
    if (filterProperty && !(t.entity_type === 'property' && t.entity_id === filterProperty)) return false;
    if (filterLandlord) {
      // Match tasks linked to landlord directly, or to properties owned by this landlord
      const landlordPropertyIds = properties.filter(p => p.landlord_id === filterLandlord).map(p => p.id);
      const match = (t.entity_type === 'landlord' && t.entity_id === filterLandlord) ||
        (t.entity_type === 'property' && landlordPropertyIds.includes(t.entity_id!));
      if (!match) return false;
    }
    if (filterTenant) {
      const match = (t.entity_type === 'tenant' && t.entity_id === filterTenant) ||
        (t.entity_type === 'tenant_enquiry' && t.entity_id === filterTenant);
      if (!match) return false;
    }
    return true;
  });

  const updateStatus = async (id: number, status: string) => {
    try { await api.put(`/api/tasks/${id}`, { status }); await load(); } catch {}
  };

  const addTask = async () => {
    try {
      await api.post('/api/tasks', form);
      setShowAdd(false);
      setForm({ title: '', description: '', assigned_to: '', priority: 'medium', status: 'pending', due_date: '', task_type: 'manual' });
      await load();
    } catch {}
  };

  const completionPct = tasks.length > 0 ? Math.round((counts.completed / tasks.length) * 100) : 0;
  const hasFilters = filterProperty || filterLandlord || filterTenant || filterType;

  return (
    <V3Layout title="Tasks" breadcrumb={[{ label: 'Tasks' }]}>
      <div className="p-4 md:p-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {[
            { label: 'Done', count: counts.completed, icon: <CheckCircle2 size={20} />, color: 'text-emerald-400' },
            { label: 'In Progress', count: counts.in_progress, icon: <Clock size={20} />, color: 'text-amber-400' },
            { label: 'In Queue', count: counts.pending, icon: <Inbox size={20} />, color: 'text-blue-400' },
          ].map(s => (
            <GlassCard key={s.label} className="p-5 flex items-center gap-4">
              <div className={s.color}>{s.icon}</div>
              <div>
                <p className="text-2xl font-bold">{s.count}</p>
                <p className="text-xs text-[var(--text-secondary)]">{s.label}</p>
              </div>
            </GlassCard>
          ))}
          <GlassCard className="p-5 flex flex-col items-center justify-center">
            <ProgressRing value={completionPct} size={48} strokeWidth={4} />
            <p className="text-[10px] text-[var(--text-muted)] mt-1 uppercase tracking-wider font-medium">Complete</p>
          </GlassCard>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5">
                <Search size={16} className="text-[var(--text-muted)]" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks..."
                  className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none" />
                {search && <button onClick={() => setSearch('')}><X size={14} className="text-[var(--text-muted)]" /></button>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <FilterDropdown icon={CheckCircle2} label="Status" value={filterStatus === 'all' ? null : filterStatus}
                displayValue={filterStatus !== 'all' ? STATUS_LABELS[filterStatus] : undefined}
                onClear={() => setFilterStatus('all')}
                items={Object.entries(STATUS_LABELS).map(([k, v]) => ({ id: k, label: v }))}
                onSelect={id => setFilterStatus(id)} />
              <FilterDropdown icon={Tag} label="Priority" value={filterPriority === 'all' ? null : filterPriority}
                displayValue={filterPriority !== 'all' ? PRIORITY_LABELS[filterPriority] : undefined}
                onClear={() => setFilterPriority('all')}
                items={Object.entries(PRIORITY_LABELS).map(([k, v]) => ({ id: k, label: v }))}
                onSelect={id => setFilterPriority(id)} />
              <FilterDropdown icon={Building2} label="Property" value={filterProperty}
                displayValue={properties.find(p => p.id === filterProperty)?.address}
                onClear={() => setFilterProperty(null)}
                items={properties.map(p => ({ id: p.id, label: p.address }))}
                onSelect={id => setFilterProperty(id)} />
              <FilterDropdown icon={UserCircle} label="Landlord" value={filterLandlord}
                displayValue={landlords.find(l => l.id === filterLandlord)?.name}
                onClear={() => setFilterLandlord(null)}
                items={landlords.map(l => ({ id: l.id, label: l.name }))}
                onSelect={id => setFilterLandlord(id)} />
              <FilterDropdown icon={Users} label="Tenant" value={filterTenant}
                displayValue={tenants.find(t => t.id === filterTenant)?.name}
                onClear={() => setFilterTenant(null)}
                items={tenants.map(t => ({ id: t.id, label: t.name }))}
                onSelect={id => setFilterTenant(id)} />
              <FilterDropdown icon={Tag} label="Type" value={filterType}
                displayValue={filterType ? filterType.replace('_', ' ') : undefined}
                onClear={() => setFilterType(null)}
                items={TASK_TYPES.map(t => ({ id: t, label: t.replace('_', ' ').replace(/^\w/, c => c.toUpperCase()) }))}
                onSelect={id => setFilterType(id)} />
              <Button variant="gradient" onClick={() => setShowAdd(true)}>
                <Plus size={14} className="mr-1.5" /> Add Task
              </Button>
            </div>
          </div>
          {/* Status/Priority tags removed — now in dropdowns above */}
        </div>

        {/* Task List + Calendar side by side */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
        {loading ? (
          <div className="text-center text-[var(--text-muted)] py-16">Loading...</div>
        ) : filtered.length === 0 ? (
          <EmptyState message={hasFilters || search ? 'No tasks match your filters' : 'No tasks yet'} icon={<CheckCircle2 size={32} />} />
        ) : (
          <div className="space-y-3">
            {filtered.map(task => {
              const overdue = isOverdue(task);
              const taskPct = task.status === 'completed' ? 100 : task.status === 'in_progress' ? 50 : 0;
              return (
                <Card key={task.id} className={`p-4 md:p-5 ${overdue ? 'border-red-500/40' : ''}`} hover>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <ProgressRing value={taskPct} size={40} strokeWidth={3} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-[var(--text-muted)]' : ''}`}>{task.title}</p>
                          {overdue && <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-medium">Overdue</span>}
                          {task.task_type && task.task_type !== 'manual' && (
                            <span className="text-[10px] bg-[var(--bg-hover)] text-[var(--text-muted)] px-2 py-0.5 rounded-full">
                              {task.task_type.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                        {task.description && <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{task.description}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap pl-[52px] sm:pl-0">
                      {task.assigned_to && <Avatar name={task.assigned_to} size="xs" />}
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${PRIORITY_COLORS[task.priority]}`}>
                        {PRIORITY_LABELS[task.priority] || task.priority}
                      </span>
                      {task.due_date && (
                        <div className={`flex items-center gap-1 text-xs ${overdue ? 'text-red-400' : 'text-[var(--text-muted)]'}`}>
                          <Calendar size={12} />
                          {new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </div>
                      )}
                      <div className="flex gap-1">
                        {task.status !== 'in_progress' && task.status !== 'completed' && (
                          <Button variant="ghost" size="sm" onClick={() => updateStatus(task.id, 'in_progress')}>Start</Button>
                        )}
                        {task.status !== 'completed' && (
                          <Button variant="ghost" size="sm" onClick={() => updateStatus(task.id, 'completed')}>Done</Button>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        </div>
        {/* Calendar */}
        {!loading && (
          <GlassCard className="p-6">
            <div className="flex items-center justify-between mb-6">
              <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); } else setCalMonth(calMonth - 1); }}
                className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                <ChevronLeft size={18} />
              </button>
              <h3 className="text-lg font-semibold">
                {new Date(calYear, calMonth).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              </h3>
              <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); } else setCalMonth(calMonth + 1); }}
                className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                <ChevronRight size={18} />
              </button>
            </div>
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-px mb-1">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                <div key={d} className="text-center text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider py-2">{d}</div>
              ))}
            </div>
            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-px">
              {(() => {
                const firstDay = new Date(calYear, calMonth, 1);
                const lastDay = new Date(calYear, calMonth + 1, 0);
                const startPad = (firstDay.getDay() + 6) % 7; // Monday-based
                const totalDays = lastDay.getDate();
                const today = new Date();
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

                const cells = [];
                for (let i = 0; i < startPad; i++) cells.push(<div key={`pad-${i}`} className="min-h-[90px] bg-[var(--bg-subtle)]/30 rounded-lg" />);

                for (let day = 1; day <= totalDays; day++) {
                  const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isToday = dateStr === todayStr;
                  const dayTasks = filtered.filter(t => t.due_date?.startsWith(dateStr));

                  cells.push(
                    <div key={day} className={`min-h-[90px] rounded-lg p-1.5 border transition-colors ${
                      isToday ? 'border-[var(--accent-orange)]/40 bg-[var(--accent-orange)]/5' : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)]/20 hover:bg-[var(--bg-hover)]'
                    }`}>
                      <p className={`text-xs font-medium mb-1 ${isToday ? 'text-[var(--accent-orange)]' : 'text-[var(--text-secondary)]'}`}>{day}</p>
                      <div className="space-y-1">
                        {dayTasks.slice(0, 3).map(t => (
                          <div key={t.id} className={`text-[10px] px-1.5 py-0.5 rounded truncate ${
                            t.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 line-through' :
                            t.priority === 'high' || t.priority === 'urgent' ? 'bg-red-500/10 text-red-400' :
                            'bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                          }`}>
                            {t.title}
                          </div>
                        ))}
                        {dayTasks.length > 3 && (
                          <p className="text-[9px] text-[var(--text-muted)] px-1">+{dayTasks.length - 3} more</p>
                        )}
                      </div>
                    </div>
                  );
                }
                return cells;
              })()}
            </div>
          </GlassCard>
        )}
        </div>

        {/* Add Modal */}
        {showAdd && (
          <div className="fixed inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm flex items-end md:items-center justify-center z-50" onClick={() => setShowAdd(false)}>
            <div className="bg-[var(--bg-card)] rounded-t-2xl md:rounded-2xl border border-[var(--border-input)] w-full md:w-[480px] max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold">Add Task</h3>
                <button onClick={() => setShowAdd(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <Input label="Title" value={form.title} onChange={v => setForm(p => ({ ...p, title: v }))} placeholder="Task title" />
                <Input label="Description" value={form.description} onChange={v => setForm(p => ({ ...p, description: v }))} placeholder="Description..." />
                <Input label="Assigned To" value={form.assigned_to} onChange={v => setForm(p => ({ ...p, assigned_to: v }))} placeholder="Person name" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Priority</label>
                    <div className="flex gap-1.5">
                      {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                        <button key={k} onClick={() => setForm(p => ({ ...p, priority: k }))}
                          className={`flex-1 text-xs py-2 rounded-lg border font-medium transition-colors ${
                            form.priority === k ? PRIORITY_COLORS[k] + ' border-current' : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                          }`}>{v}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Type</label>
                    <div className="relative">
                      <select value={form.task_type} onChange={e => setForm(p => ({ ...p, task_type: e.target.value }))}
                        className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] appearance-none">
                        {TASK_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                <Input label="Due Date" value={form.due_date} onChange={v => setForm(p => ({ ...p, due_date: v }))} type="date" />
                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
                  <Button variant="gradient" onClick={addTask} disabled={!form.title}>Add Task</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </V3Layout>
  );
}
