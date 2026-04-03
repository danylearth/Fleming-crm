import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { Card, GlassCard, Button, Input, Select, Avatar, ProgressRing, EmptyState, DatePicker } from '../components/v3';
import BulkActions from '../components/v3/BulkActions';
import { useApi } from '../hooks/useApi';
import {
  Plus, X, CheckCircle2, Clock, Inbox, Calendar, Search, ChevronDown,
  ChevronLeft, ChevronRight, Building2, Users, UserCircle, Tag,
  List, CalendarDays, MoreVertical
} from 'lucide-react';

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

const TEAM = [
  { id: 'all', name: 'Everyone', role: 'All Team', color: 'from-orange-500 to-pink-500', initials: 'All' },
  { id: 'danyl', name: 'Danyl', role: 'Director', color: 'from-violet-500 to-purple-500', initials: 'D' },
  { id: 'sarah', name: 'Sarah Chen', role: 'Property Manager', color: 'from-cyan-500 to-blue-500', initials: 'SC' },
  { id: 'alex', name: 'Alex Morgan', role: 'Lettings Negotiator', color: 'from-emerald-500 to-teal-500', initials: 'AM' },
  { id: 'mike', name: 'Mike Ross', role: 'Maintenance Lead', color: 'from-amber-500 to-orange-500', initials: 'MR' },
];

const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 7AM–7PM
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function fmtDate(y: number, m: number, d: number) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function getMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  let startDow = first.getDay() - 1; if (startDow < 0) startDow = 6;
  const last = new Date(year, month + 1, 0);
  const days: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(d);
  while (days.length % 7 !== 0) days.push(null);
  return days;
}
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
    document.addEventListener('mousedown', handler); return () => document.removeEventListener('mousedown', handler);
  }, []);
  const filtered = items.filter(i => i.label.toLowerCase().includes(search.toLowerCase()));
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
          value ? 'bg-[var(--accent-orange)]/10 border-[var(--accent-orange)]/30 text-[var(--accent-orange)]'
            : 'bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
        }`}>
        <Icon size={14} /><span className="max-w-[120px] truncate">{value ? displayValue : label}</span>
        {value ? <X size={12} className="hover:text-white" onClick={e => { e.stopPropagation(); onClear(); }} /> : <ChevronDown size={12} className={open ? 'rotate-180' : ''} />}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-64 bg-[var(--bg-card)] border border-[var(--border-input)] rounded-xl shadow-2xl overflow-hidden right-0">
          <div className="p-2 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2 bg-[var(--bg-input)] rounded-lg px-3 py-2">
              <Search size={14} className="text-[var(--text-muted)]" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${label.toLowerCase()}...`}
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

export default function Tasks() {
  const api = useApi();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [properties, setProperties] = useState<{ id: number; address: string; landlord_id: number | null }[]>([]);
  const [landlords, setLandlords] = useState<{ id: number; name: string }[]>([]);
  const [tenants, setTenants] = useState<{ id: number; name: string; property_id: number | null }[]>([]);
  const [users, setUsers] = useState<{ id: number; name: string; email: string; role: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterProperty, setFilterProperty] = useState<number | null>(null);
  const [filterLandlord, setFilterLandlord] = useState<number | null>(null);
  const [filterTenant, setFilterTenant] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', assigned_to: '', priority: 'medium', status: 'pending',
    due_date: '', task_type: 'manual', entity_type: '', entity_id: null as number | null
  });
  // Bulk actions state
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // View mode
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  // Calendar state
  const now = new Date();
  const todayStr = fmtDate(now.getFullYear(), now.getMonth(), now.getDate());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedMember, setSelectedMember] = useState('all');
  const [calViewMode, setCalViewMode] = useState<'day' | 'week' | 'month'>('day');

  const load = async () => {
    try {
      const [data, props, lands, tens, usrs] = await Promise.all([
        api.get('/api/tasks'), api.get('/api/properties'), api.get('/api/landlords'),
        api.get('/api/tenants'), api.get('/api/users'),
      ]);
      setTasks(Array.isArray(data) ? data : data.tasks || []);
      setProperties(props); setLandlords(lands); setTenants(tens); setUsers(usrs);
    } catch { setTasks([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

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
      const landlordPropertyIds = properties.filter(p => p.landlord_id === filterLandlord).map(p => p.id);
      const match = (t.entity_type === 'landlord' && t.entity_id === filterLandlord) || (t.entity_type === 'property' && landlordPropertyIds.includes(t.entity_id!));
      if (!match) return false;
    }
    if (filterTenant) {
      const match = (t.entity_type === 'tenant' && t.entity_id === filterTenant) || (t.entity_type === 'tenant_enquiry' && t.entity_id === filterTenant);
      if (!match) return false;
    }
    // Team member filter
    if (selectedMember !== 'all') {
      const member = TEAM.find(m => m.id === selectedMember);
      if (member && t.assigned_to) {
        const assignedLower = t.assigned_to.toLowerCase();
        const nameLower = member.name.toLowerCase();
        if (!assignedLower.includes(nameLower) && !nameLower.includes(assignedLower)) return false;
      } else if (member && !t.assigned_to) {
        return false; // No assignment, filter it out when specific member selected
      }
    }
    return true;
  });

  const updateStatus = async (id: number, status: string) => {
    try { await api.put(`/api/tasks/${id}`, { status }); await load(); } catch {}
  };
  const addTask = async () => {
    try {
      const payload: any = { ...form };
      // Only include entity fields if entity_type is set
      if (!form.entity_type) {
        delete payload.entity_type;
        delete payload.entity_id;
      }
      console.log('Creating task with payload:', payload);
      await api.post('/api/tasks', payload);
      setShowAdd(false);
      setForm({
        title: '', description: '', assigned_to: '', priority: 'medium', status: 'pending',
        due_date: '', task_type: 'manual', entity_type: '', entity_id: null
      });
      await load();
    } catch (err) {
      console.error('Failed to create task:', err);
      alert('Failed to create task. Check console for details.');
    }
  };

  const completionPct = tasks.length > 0 ? Math.round((counts.completed / tasks.length) * 100) : 0;
  const hasFilters = filterProperty || filterLandlord || filterTenant || filterType;

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedIds.length} task${selectedIds.length !== 1 ? 's' : ''}? This action cannot be undone.`
    );

    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await api.post('/api/tasks/bulk-delete', { ids: selectedIds });
      setSelectedIds([]);
      await load();
    } catch (e) {
      console.error('Bulk delete error:', e);
      alert('Failed to delete tasks. Please try again.');
    }
    setIsDeleting(false);
  };

  const toggleSelectTask = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(t => t.id));
    }
  };

  // Calendar helpers
  const miniGrid = getMonthGrid(calYear, calMonth);
  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y-1); } else setCalMonth(m => m-1); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y+1); } else setCalMonth(m => m+1); };
  const prevDay = () => { const d = new Date(selectedDate+'T00:00:00'); d.setDate(d.getDate()-1); setSelectedDate(fmtDate(d.getFullYear(),d.getMonth(),d.getDate())); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); };
  const nextDay = () => { const d = new Date(selectedDate+'T00:00:00'); d.setDate(d.getDate()+1); setSelectedDate(fmtDate(d.getFullYear(),d.getMonth(),d.getDate())); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); };

  // Tasks for selected day
  const dayTasks = filtered.filter(t => t.due_date?.slice(0,10) === selectedDate);
  // Tasks by date for dots
  const tasksByDate = useMemo(() => {
    const m: Record<string, Task[]> = {};
    filtered.forEach(t => { if (t.due_date) { const d = t.due_date.slice(0,10); if (!m[d]) m[d] = []; m[d].push(t); } });
    return m;
  }, [filtered]);

  const dayInfo = (() => { const d = new Date(selectedDate+'T00:00:00'); return { weekday: d.toLocaleDateString('en-GB',{weekday:'long'}), day: d.getDate() }; })();
  const isSelectedToday = selectedDate === todayStr;

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
              <div><p className="text-2xl font-bold">{s.count}</p><p className="text-xs text-[var(--text-secondary)]">{s.label}</p></div>
            </GlassCard>
          ))}
          <GlassCard className="p-5 flex flex-col items-center justify-center">
            <ProgressRing value={completionPct} size={48} strokeWidth={4} />
            <p className="text-[10px] text-[var(--text-muted)] mt-1 uppercase tracking-wider font-medium">Complete</p>
          </GlassCard>
        </div>

        {/* ─── Controls ─── */}
        {viewMode === 'list' ? (
          /* List mode: search + filters */
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
              <div className="flex items-center bg-[var(--bg-card)] border border-[var(--border-color)] rounded-full p-0.5 mr-1">
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--bg-hover)] text-[var(--text-primary)]">
                  <List size={13} /> List
                </button>
                <div className="w-px h-4 bg-[var(--border-color)]" />
                <button onClick={() => { setViewMode('calendar'); setCalViewMode('month'); }}
                  className="px-3 py-1.5 rounded-full text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-all">Month</button>
                <button onClick={() => { setViewMode('calendar'); setCalViewMode('week'); }}
                  className="px-3 py-1.5 rounded-full text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-all">Week</button>
                <button onClick={() => { setViewMode('calendar'); setCalViewMode('day'); }}
                  className="px-3 py-1.5 rounded-full text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-all">Day</button>
              </div>
              <FilterDropdown icon={Building2} label="Property" value={filterProperty}
                displayValue={properties.find(p => p.id === filterProperty)?.address} onClear={() => setFilterProperty(null)}
                items={properties.map(p => ({ id: p.id, label: p.address }))} onSelect={id => setFilterProperty(id)} />
              <FilterDropdown icon={UserCircle} label="Landlord" value={filterLandlord}
                displayValue={landlords.find(l => l.id === filterLandlord)?.name} onClear={() => setFilterLandlord(null)}
                items={landlords.map(l => ({ id: l.id, label: l.name }))} onSelect={id => setFilterLandlord(id)} />
              <FilterDropdown icon={Users} label="Tenant" value={filterTenant}
                displayValue={tenants.find(t => t.id === filterTenant)?.name} onClear={() => setFilterTenant(null)}
                items={tenants.map(t => ({ id: t.id, label: t.name }))} onSelect={id => setFilterTenant(id)} />
              <FilterDropdown icon={Tag} label="Type" value={filterType}
                displayValue={filterType ? filterType.replace('_',' ') : undefined} onClear={() => setFilterType(null)}
                items={TASK_TYPES.map(t => ({ id: t, label: t.replace('_',' ').replace(/^\w/,c=>c.toUpperCase()) }))} onSelect={id => setFilterType(id)} />
              <Button
                variant={editMode ? "outline" : "secondary"}
                onClick={() => {
                  setEditMode(!editMode);
                  if (editMode) setSelectedIds([]);
                }}
              >
                {editMode ? 'Cancel' : 'Edit'}
              </Button>
              <Button variant="gradient" onClick={() => setShowAdd(true)}><Plus size={14} className="mr-1.5" /> Add Task</Button>
            </div>
          </div>
        ) : null /* calendar controls are rendered inline below */}

        {/* ═══ LIST VIEW ═══ */}
        {viewMode === 'list' && (
          loading ? (
            <div className="text-center text-[var(--text-muted)] py-16">Loading...</div>
          ) : filtered.length === 0 ? (
            <EmptyState message={hasFilters || search ? 'No tasks match your filters' : 'No tasks yet'} icon={<CheckCircle2 size={32} />} />
          ) : (
            <>
              {/* Bulk Actions */}
              {editMode && (
                <BulkActions
                  selectedIds={selectedIds}
                  onClearSelection={() => setSelectedIds([])}
                  onBulkDelete={handleBulkDelete}
                  entityName="task"
                  isDeleting={isDeleting}
                />
              )}

              {editMode && (
                <div className="flex items-center gap-2 mb-2">
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

              <div className="space-y-3">
              {filtered.map(task => {
                const overdue = isOverdue(task);
                const taskPct = task.status === 'completed' ? 100 : task.status === 'in_progress' ? 50 : 0;
                return (
                  <Card key={task.id} className={`p-4 md:p-5 ${overdue ? 'border-red-500/40' : ''} ${!editMode ? 'cursor-pointer' : ''}`} hover onClick={() => !editMode && navigate(`/v3/tasks/${task.id}`)}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {editMode && (
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(task.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleSelectTask(task.id);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                          />
                        )}
                        <ProgressRing value={taskPct} size={40} strokeWidth={3} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-[var(--text-muted)]' : ''}`}>{task.title}</p>
                            {overdue && <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-medium">Overdue</span>}
                            {task.task_type && task.task_type !== 'manual' && (
                              <span className="text-[10px] bg-[var(--bg-hover)] text-[var(--text-muted)] px-2 py-0.5 rounded-full">{task.task_type.replace('_',' ')}</span>
                            )}
                          </div>
                          {task.description && <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{task.description}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap pl-[52px] sm:pl-0">
                        {task.assigned_to && <Avatar name={task.assigned_to} size="xs" />}
                        <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${PRIORITY_COLORS[task.priority]}`}>{PRIORITY_LABELS[task.priority] || task.priority}</span>
                        {task.due_date && (
                          <div className={`flex items-center gap-1 text-xs ${overdue ? 'text-red-400' : 'text-[var(--text-muted)]'}`}>
                            <Calendar size={12} />{new Date(task.due_date).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
                          </div>
                        )}
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
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
            </>
          )
        )}

        {/* ═══ CALENDAR VIEW ═══ */}
        {viewMode === 'calendar' && !loading && (() => {
          // Week helpers
          const getWeekDates = (dateStr: string) => {
            const d = new Date(dateStr + 'T00:00:00');
            const dow = d.getDay(); const mondayOff = dow === 0 ? -6 : 1 - dow;
            const mon = new Date(d); mon.setDate(d.getDate() + mondayOff);
            return Array.from({ length: 7 }, (_, i) => { const dd = new Date(mon); dd.setDate(mon.getDate() + i); return fmtDate(dd.getFullYear(), dd.getMonth(), dd.getDate()); });
          };
          const weekDates = getWeekDates(selectedDate);

          // Navigation
          const navPrev = () => {
            if (calViewMode === 'day') prevDay();
            else if (calViewMode === 'week') { const d = new Date(selectedDate+'T00:00:00'); d.setDate(d.getDate()-7); setSelectedDate(fmtDate(d.getFullYear(),d.getMonth(),d.getDate())); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }
            else prevMonth();
          };
          const navNext = () => {
            if (calViewMode === 'day') nextDay();
            else if (calViewMode === 'week') { const d = new Date(selectedDate+'T00:00:00'); d.setDate(d.getDate()+7); setSelectedDate(fmtDate(d.getFullYear(),d.getMonth(),d.getDate())); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }
            else nextMonth();
          };

          // Title text
          const navTitle = calViewMode === 'month'
            ? `${MONTHS[calMonth]} ${calYear}`
            : calViewMode === 'week'
            ? (() => { const s = new Date(weekDates[0]+'T00:00:00'); const e = new Date(weekDates[6]+'T00:00:00'); return `${s.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${e.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`; })()
            : new Date(selectedDate+'T00:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'});

          // Task card renderer
          const TaskCard = ({ task }: { task: Task }) => {
            const colorMap: Record<string, { border: string; bg: string }> = {
              high: { border: 'border-red-500/60', bg: 'bg-red-500/10' },
              medium: { border: 'border-amber-500/60', bg: 'bg-amber-500/10' },
              low: { border: 'border-blue-500/60', bg: 'bg-blue-500/10' },
            };
            const c = colorMap[task.priority] || colorMap.low;
            return (
              <div onClick={() => navigate(`/v3/tasks/${task.id}`)} className={`${c.bg} border-l-[3px] ${c.border} rounded-xl p-2.5 cursor-pointer hover:brightness-110 transition-all`}>
                <p className={`text-xs font-medium truncate ${task.status === 'completed' ? 'line-through text-[var(--text-muted)]' : ''}`}>{task.title}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  {task.assigned_to && (
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-white text-[8px] font-bold border border-[var(--bg-card)]">
                      {task.assigned_to.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                    </div>
                  )}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[task.priority]}`}>{task.priority}</span>
                  {task.status !== 'completed' && (
                    <button onClick={(e) => { e.stopPropagation(); updateStatus(task.id, 'completed'); }}
                      className="text-[9px] text-emerald-400 hover:text-emerald-300 ml-auto">✓</button>
                  )}
                </div>
              </div>
            );
          };

          return (
            <div className="space-y-4">
              {/* Single toolbar: Today | < > Title | ── | List Month Week Day | + Add Task */}
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={() => { setSelectedDate(todayStr); setCalYear(now.getFullYear()); setCalMonth(now.getMonth()); }}
                  className="px-3 py-1.5 rounded-full bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] text-xs font-medium transition-colors">Today</button>
                <button onClick={navPrev} className="w-7 h-7 rounded-full hover:bg-[var(--bg-hover)] flex items-center justify-center"><ChevronLeft size={15} /></button>
                <button onClick={navNext} className="w-7 h-7 rounded-full hover:bg-[var(--bg-hover)] flex items-center justify-center"><ChevronRight size={15} /></button>
                <span className="text-sm font-semibold">{navTitle}</span>

                {/* Team avatars */}
                <div className="flex-1 flex items-center justify-center">
                  <div className="flex items-center gap-1">
                    {TEAM.map(member => {
                      const active = selectedMember === member.id;
                      return (
                        <button key={member.id} onClick={() => setSelectedMember(member.id)}
                          title={member.name}
                          className={`w-8 h-8 rounded-full bg-gradient-to-br ${member.color} flex items-center justify-center text-white text-[10px] font-bold transition-all ${
                            active ? 'ring-2 ring-orange-500 ring-offset-2 ring-offset-[var(--bg-page)] scale-110' : 'opacity-60 hover:opacity-100'
                          }`}>
                          {member.initials}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Combined: List | Month | Week | Day */}
                <div className="flex items-center bg-[var(--bg-card)] border border-[var(--border-color)] rounded-full p-0.5">
                  <button onClick={() => setViewMode('list')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all">
                    <List size={13} /> List
                  </button>
                  <div className="w-px h-4 bg-[var(--border-color)]" />
                  {(['month','week','day'] as const).map(m => (
                    <button key={m} onClick={() => setCalViewMode(m)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all capitalize ${
                        calViewMode === m ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                      }`}>{m}</button>
                  ))}
                </div>

                <Button variant="gradient" size="sm" onClick={() => setShowAdd(true)}><Plus size={13} className="mr-1" /> Add Task</Button>
              </div>

              {/* ── MONTH VIEW ── */}
              {calViewMode === 'month' && (
                <Card className="p-5">
                  <div className="grid grid-cols-7 mb-2">
                    {DAYS_SHORT.map(d => <div key={d} className="text-center text-xs text-[var(--text-muted)] font-medium py-2">{d}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-px">
                    {(() => {
                      const first = new Date(calYear, calMonth, 1);
                      const last = new Date(calYear, calMonth + 1, 0);
                      const startPad = (first.getDay() + 6) % 7;
                      const cells = [];
                      for (let i = 0; i < startPad; i++) cells.push(<div key={`pad-${i}`} className="min-h-[100px] bg-[var(--bg-subtle)]/30 rounded-lg" />);
                      for (let day = 1; day <= last.getDate(); day++) {
                        const dateStr = fmtDate(calYear, calMonth, day);
                        const isToday = dateStr === todayStr;
                        const isSel = dateStr === selectedDate;
                        const dTasks = filtered.filter(t => t.due_date?.startsWith(dateStr));
                        cells.push(
                          <div key={day} onClick={() => { setSelectedDate(dateStr); setCalViewMode('day'); }}
                            className={`min-h-[100px] rounded-lg p-1.5 border transition-colors cursor-pointer ${
                              isSel ? 'border-orange-500/50 bg-orange-500/5' : isToday ? 'border-[var(--accent-orange)]/40 bg-[var(--accent-orange)]/5' : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)]/20 hover:bg-[var(--bg-hover)]'
                            }`}>
                            <p className={`text-xs font-medium mb-1 ${isToday ? 'text-[var(--accent-orange)]' : 'text-[var(--text-secondary)]'}`}>{day}</p>
                            <div className="space-y-1">
                              {dTasks.slice(0, 3).map(t => (
                                <div key={t.id} className={`text-[10px] px-1.5 py-0.5 rounded truncate ${
                                  t.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 line-through' :
                                  t.priority === 'high' ? 'bg-red-500/10 text-red-400' : 'bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                                }`}>{t.title}</div>
                              ))}
                              {dTasks.length > 3 && <p className="text-[9px] text-[var(--text-muted)] px-1">+{dTasks.length - 3} more</p>}
                            </div>
                          </div>
                        );
                      }
                      return cells;
                    })()}
                  </div>
                </Card>
              )}

              {/* ── WEEK VIEW ── */}
              {calViewMode === 'week' && (
                <Card className="p-0 overflow-hidden">
                  {/* Week day headers */}
                  <div className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-[var(--border-subtle)]">
                    <div className="py-3 px-2 text-[10px] text-[var(--text-muted)] text-center">GMT</div>
                    {weekDates.map((dateStr, i) => {
                      const d = new Date(dateStr + 'T00:00:00');
                      const isTod = dateStr === todayStr;
                      const isSel = dateStr === selectedDate;
                      return (
                        <button key={dateStr} onClick={() => { setSelectedDate(dateStr); setCalViewMode('day'); }}
                          className={`py-3 text-center border-l border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors ${isSel ? 'bg-orange-500/5' : ''}`}>
                          <p className="text-[10px] text-[var(--text-muted)]">{DAYS_SHORT[i]}</p>
                          <p className={`text-sm font-bold mt-0.5 ${isTod ? 'w-7 h-7 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 text-white flex items-center justify-center mx-auto' : ''}`}>
                            {d.getDate()}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  {/* Time grid */}
                  <div className="overflow-y-auto max-h-[600px]">
                    {HOURS.map(hour => {
                      const timeLabel = `${hour > 12 ? hour-12 : hour === 0 ? 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
                      return (
                        <div key={hour} className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-[var(--border-subtle)] border-dashed min-h-[72px]">
                          <div className="px-2 py-2 text-[10px] text-[var(--text-muted)] text-right border-r border-[var(--border-subtle)]">{timeLabel}</div>
                          {weekDates.map(dateStr => {
                            const dTasks = filtered.filter(t => t.due_date?.startsWith(dateStr) && (9 + (t.id % 8)) === hour);
                            return (
                              <div key={dateStr} className="border-l border-[var(--border-subtle)] p-1 space-y-1">
                                {dTasks.map(t => <TaskCard key={t.id} task={t} />)}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* ── DAY VIEW ── */}
              {calViewMode === 'day' && (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
                  <Card className="p-0 overflow-hidden">
                    <div className="flex items-center justify-center gap-3 py-4 border-b border-[var(--border-subtle)]">
                      <button onClick={prevDay} className="w-8 h-8 rounded-full hover:bg-[var(--bg-hover)] flex items-center justify-center"><ChevronLeft size={16} /></button>
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--text-secondary)] text-sm">{dayInfo.weekday}</span>
                        <span className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                          isSelectedToday ? 'bg-gradient-to-r from-orange-500 to-pink-500 text-white' : 'bg-[var(--bg-subtle)]'
                        }`}>{dayInfo.day}</span>
                      </div>
                      <button onClick={nextDay} className="w-8 h-8 rounded-full hover:bg-[var(--bg-hover)] flex items-center justify-center"><ChevronRight size={16} /></button>
                    </div>
                    <div className="relative overflow-y-auto max-h-[600px]">
                      <div className="sticky top-0 z-10 bg-[var(--bg-card)] border-b border-[var(--border-subtle)] px-4 py-2 text-xs text-[var(--text-muted)]">GMT +00:00</div>
                      {HOURS.map(hour => {
                        const hourTasks = dayTasks.filter(t => (9 + (t.id % 8)) === hour);
                        const timeLabel = `${hour > 12 ? hour-12 : hour === 0 ? 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
                        const endHourLabel = (h: number) => `${h > 12 ? h-12 : h === 0 ? 12 : h}:00 ${h >= 12 ? 'PM' : 'AM'}`;
                        return (
                          <div key={hour} className="flex border-b border-[var(--border-subtle)] border-dashed min-h-[80px]">
                            <div className="w-20 shrink-0 px-4 py-3 text-xs text-[var(--text-muted)] text-right border-r border-[var(--border-subtle)]">{timeLabel}</div>
                            <div className="flex-1 p-2 flex flex-col gap-2">
                              {hourTasks.map(task => {
                                const colorMap: Record<string, { border: string; bg: string }> = {
                                  high: { border: 'border-red-500/60', bg: 'bg-red-500/10' },
                                  medium: { border: 'border-amber-500/60', bg: 'bg-amber-500/10' },
                                  low: { border: 'border-blue-500/60', bg: 'bg-blue-500/10' },
                                };
                                const c = colorMap[task.priority] || colorMap.low;
                                return (
                                  <div key={task.id} onClick={() => navigate(`/v3/tasks/${task.id}`)} className={`${c.bg} border-l-[3px] ${c.border} rounded-xl p-3 cursor-pointer hover:brightness-110 transition-all`}>
                                    <div className="flex items-start justify-between">
                                      <div>
                                        <p className="text-[10px] text-[var(--text-muted)] mb-1">{timeLabel} - {endHourLabel(hour+1)}</p>
                                        <p className="text-sm font-medium">{task.title}</p>
                                        {task.description && <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">{task.description}</p>}
                                      </div>
                                      <button onClick={e => e.stopPropagation()} className="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center shrink-0">
                                        <MoreVertical size={14} className="text-[var(--text-muted)]" />
                                      </button>
                                    </div>
                                    <div className="flex items-center gap-2 mt-2">
                                      {task.assigned_to && (
                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold border-2 border-[var(--bg-card)]">
                                          {task.assigned_to.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                                        </div>
                                      )}
                                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>
                                      {task.status !== 'completed' && (
                                        <button onClick={e => { e.stopPropagation(); updateStatus(task.id, 'completed'); }}
                                          className="text-[10px] text-emerald-400 hover:text-emerald-300 ml-auto">✓ Done</button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>

                  {/* Right sidebar */}
                  <div className="space-y-4">
                    {/* Team */}
                    <Card className="p-4">
                      <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Team</h3>
                      <div className="space-y-1">
                        {TEAM.map(member => {
                          const active = selectedMember === member.id;
                          return (
                            <button key={member.id} onClick={() => setSelectedMember(member.id)}
                              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-all ${
                                active ? 'bg-orange-500/10' : 'hover:bg-[var(--bg-hover)]'
                              }`}>
                              <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${member.color} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>{member.initials}</div>
                              <span className={`text-xs font-medium truncate ${active ? 'text-orange-400' : 'text-[var(--text-secondary)]'}`}>{member.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </Card>
                    {/* Mini calendar */}
                    <Card className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <button onClick={prevMonth} className="w-7 h-7 rounded-full hover:bg-[var(--bg-hover)] flex items-center justify-center"><ChevronLeft size={14} /></button>
                        <span className="text-sm font-semibold">{MONTHS[calMonth]} {calYear}</span>
                        <button onClick={nextMonth} className="w-7 h-7 rounded-full hover:bg-[var(--bg-hover)] flex items-center justify-center"><ChevronRight size={14} /></button>
                      </div>
                      <div className="grid grid-cols-7 mb-1">
                        {DAYS_SHORT.map(d => <div key={d} className="text-center text-[10px] text-[var(--text-muted)] font-medium py-1">{d}</div>)}
                      </div>
                      <div className="grid grid-cols-7 gap-y-1">
                        {miniGrid.map((day, i) => {
                          if (day === null) return <div key={i} />;
                          const dateStr = fmtDate(calYear, calMonth, day);
                          const isSel = dateStr === selectedDate;
                          const isTod = dateStr === todayStr;
                          const dayEvts = tasksByDate[dateStr] || [];
                          return (
                            <button key={i} onClick={() => setSelectedDate(dateStr)} className="flex flex-col items-center py-1">
                              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                                isSel ? 'bg-gradient-to-r from-orange-500 to-pink-500 text-white' : isTod ? 'ring-1 ring-orange-500/50 text-orange-400' : 'hover:bg-[var(--bg-hover)]'
                              }`}>{day}</span>
                              {dayEvts.length > 0 && (
                                <div className="flex gap-0.5 mt-0.5">
                                  {dayEvts.slice(0,3).map((t,j) => (
                                    <div key={j} className={`w-1 h-1 rounded-full ${t.priority === 'high' ? 'bg-red-500' : t.priority === 'medium' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                                  ))}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </Card>
                    <Card className="p-5">
                      <h3 className="text-sm font-semibold mb-3">{isSelectedToday ? "Today's Tasks" : new Date(selectedDate+'T00:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}</h3>
                      {dayTasks.length > 0 ? (
                        <div className="space-y-2">{dayTasks.map(t => (
                          <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--bg-subtle)]">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${t.priority === 'high' ? 'bg-red-500' : t.priority === 'medium' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                            <p className={`text-xs truncate flex-1 ${t.status === 'completed' ? 'line-through text-[var(--text-muted)]' : ''}`}>{t.title}</p>
                            <span className={`text-[10px] ${PRIORITY_COLORS[t.priority]} px-1.5 py-0.5 rounded-full`}>{t.priority}</span>
                          </div>
                        ))}</div>
                      ) : <p className="text-xs text-[var(--text-muted)]">No tasks on this day</p>}
                    </Card>
                    <Card className="p-5">
                      <h3 className="text-sm font-semibold mb-3">Status</h3>
                      <div className="space-y-2.5">
                        {[{ key: 'all', label: 'All Tasks' }, { key: 'pending', label: 'Pending' }, { key: 'in_progress', label: 'In Progress' }, { key: 'completed', label: 'Completed' }].map(opt => (
                          <label key={opt.key} className="flex items-center gap-3 cursor-pointer group" onClick={() => setFilterStatus(opt.key)}>
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                              filterStatus === opt.key ? 'border-orange-500' : 'border-[var(--border-input)]'
                            }`}>{filterStatus === opt.key && <div className="w-2 h-2 rounded-full bg-orange-500" />}</div>
                            <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    </Card>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Add Modal */}
        {showAdd && (
          <div className="fixed inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm flex items-end md:items-center justify-center z-50" onClick={() => setShowAdd(false)}>
            <div className="bg-[var(--bg-card)] rounded-t-2xl md:rounded-2xl border border-[var(--border-input)] w-full md:w-[480px] max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold">Add Task</h3>
                <button onClick={() => setShowAdd(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <Input label="Title" value={form.title} onChange={v => setForm(p => ({...p,title:v}))} placeholder="Task title" />
                <Input label="Description" value={form.description} onChange={v => setForm(p => ({...p,description:v}))} placeholder="Description..." />
                <Select
                  label="Assigned To"
                  value={form.assigned_to}
                  onChange={v => setForm(p => ({...p,assigned_to:v}))}
                  options={[
                    { value: '', label: 'Select user...' },
                    ...users.map(u => ({ value: u.name, label: `${u.name} (${u.role})` }))
                  ]}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Priority</label>
                    <div className="flex gap-1.5">
                      {Object.entries(PRIORITY_LABELS).map(([k,v]) => (
                        <button key={k} onClick={() => setForm(p => ({...p,priority:k}))}
                          className={`flex-1 text-xs py-2 rounded-lg border font-medium transition-colors ${
                            form.priority === k ? PRIORITY_COLORS[k]+' border-current' : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                          }`}>{v}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Type</label>
                    <Select
                      value={form.task_type}
                      onChange={v => setForm(p => ({...p, task_type: v}))}
                      options={TASK_TYPES.map(t => ({ value: t, label: t.replace('_',' ').replace(/^\w/,c=>c.toUpperCase()) }))}
                    />
                  </div>
                </div>
                <DatePicker label="Due Date" value={form.due_date} onChange={v => setForm(p => ({...p,due_date:v}))} />

                {/* Entity Linking */}
                <div className="border-t border-[var(--border-subtle)] pt-4 space-y-3">
                  <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Link to (Optional)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Select
                      label="Link Type"
                      value={form.entity_type}
                      onChange={v => setForm(p => ({...p, entity_type: v, entity_id: null}))}
                      options={[
                        { value: '', label: 'None' },
                        { value: 'property', label: 'Property' },
                        { value: 'landlord', label: 'Landlord' },
                        { value: 'tenant', label: 'Tenant' },
                      ]}
                    />
                    {form.entity_type === 'property' && (
                      <Select
                        label="Property"
                        value={String(form.entity_id || '')}
                        onChange={v => setForm(p => ({...p, entity_id: v ? Number(v) : null}))}
                        options={[
                          { value: '', label: 'Select property...' },
                          ...properties.map(p => ({ value: String(p.id), label: p.address }))
                        ]}
                      />
                    )}
                    {form.entity_type === 'landlord' && (
                      <Select
                        label="Landlord"
                        value={String(form.entity_id || '')}
                        onChange={v => setForm(p => ({...p, entity_id: v ? Number(v) : null}))}
                        options={[
                          { value: '', label: 'Select landlord...' },
                          ...landlords.map(l => ({ value: String(l.id), label: l.name }))
                        ]}
                      />
                    )}
                    {form.entity_type === 'tenant' && (
                      <Select
                        label="Tenant"
                        value={String(form.entity_id || '')}
                        onChange={v => setForm(p => ({...p, entity_id: v ? Number(v) : null}))}
                        options={[
                          { value: '', label: 'Select tenant...' },
                          ...tenants.map(t => ({ value: String(t.id), label: t.name }))
                        ]}
                      />
                    )}
                  </div>
                </div>

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
