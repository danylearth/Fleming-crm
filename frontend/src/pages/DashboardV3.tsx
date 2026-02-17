import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { Card, GlassCard, Button, Tag, EmptyState } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import {
  ChevronLeft, ChevronRight, Plus, Clock, CheckCircle2,
  AlertTriangle, Calendar as CalendarIcon, ListTodo
} from 'lucide-react';

// ─── Team Members (foundation for future automation/assignment) ───
const TEAM: { id: string; name: string; role: string; color: string; initials: string; avatar?: string }[] = [
  { id: 'all', name: 'Everyone', role: 'All Team', color: 'from-orange-500 to-pink-500', initials: 'All' },
  { id: 'danyl', name: 'Danyl', role: 'Director', color: 'from-violet-500 to-purple-500', initials: 'D' },
  { id: 'sarah', name: 'Sarah Chen', role: 'Property Manager', color: 'from-cyan-500 to-blue-500', initials: 'SC' },
  { id: 'alex', name: 'Alex Morgan', role: 'Lettings Negotiator', color: 'from-emerald-500 to-teal-500', initials: 'AM' },
  { id: 'mike', name: 'Mike Ross', role: 'Maintenance Lead', color: 'from-amber-500 to-orange-500', initials: 'MR' },
];

interface Task {
  id: number; title: string; description: string; status: string;
  priority: string; due_date: string; property_address?: string;
  entity_type?: string; entity_id?: number; task_type?: string;
  assigned_to?: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time?: string;
  type: 'task' | 'viewing' | 'maintenance' | 'enquiry';
  color: string;
  priority?: string;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function getMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Monday = 0
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;
  const days: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function formatDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export default function DashboardV3() {
  const api = useApi();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [viewings, setViewings] = useState<any[]>([]);
  const [maintenance, setMaintenance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState('all');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Calendar state
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  useEffect(() => {
    Promise.all([
      api.get('/api/tasks').catch(() => []),
      api.get('/api/property-viewings').catch(() => []),
      api.get('/api/maintenance').catch(() => []),
    ]).then(([tks, vws, mnt]) => {
      setTasks(Array.isArray(tks) ? tks : []);
      setViewings(Array.isArray(vws) ? vws : []);
      setMaintenance(Array.isArray(mnt) ? mnt : []);
    }).finally(() => setLoading(false));
  }, []);

  // Build calendar events from tasks, viewings, maintenance
  const events = useMemo<CalendarEvent[]>(() => {
    const evts: CalendarEvent[] = [];
    tasks.forEach(t => {
      if (t.due_date) {
        evts.push({
          id: `task-${t.id}`, title: t.title, date: t.due_date.slice(0, 10),
          type: 'task', color: t.priority === 'high' ? 'bg-red-500' : t.priority === 'medium' ? 'bg-amber-500' : 'bg-blue-500',
          priority: t.priority,
        });
      }
    });
    viewings.forEach((v: any) => {
      if (v.viewing_date) {
        evts.push({
          id: `viewing-${v.id}`, title: `Viewing: ${v.property_address || 'Property'}`,
          date: v.viewing_date.slice(0, 10), time: v.viewing_time,
          type: 'viewing', color: 'bg-purple-500',
        });
      }
    });
    maintenance.forEach((m: any) => {
      if (m.scheduled_date || m.created_at) {
        evts.push({
          id: `maint-${m.id}`, title: m.title || m.description || 'Maintenance',
          date: (m.scheduled_date || m.created_at).slice(0, 10),
          type: 'maintenance', color: 'bg-orange-500',
        });
      }
    });
    return evts;
  }, [tasks, viewings, maintenance]);

  // Events by date lookup
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach(e => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return map;
  }, [events]);

  const grid = getMonthGrid(calYear, calMonth);
  const todayStr = formatDate(now.getFullYear(), now.getMonth(), now.getDate());

  // Task filtering
  const filteredTasks = useMemo(() => {
    let list = [...tasks];
    // For now all tasks show for 'all'; member filtering is the foundation for assignment
    if (selectedMember !== 'all') {
      list = list.filter(t => t.assigned_to === selectedMember);
    }
    // Sort: incomplete first, then by due date
    list.sort((a, b) => {
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;
      const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      return da - db;
    });
    return list;
  }, [tasks, selectedMember]);

  // Events for selected date
  const selectedDateEvents = selectedDate ? (eventsByDate[selectedDate] || []) : [];

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  const firstName = user?.name?.split(' ')[0] || 'there';

  if (loading) {
    return (
      <V3Layout hideTopBar>
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-2 border-[var(--border-input)] border-t-orange-500 rounded-full animate-spin" />
        </div>
      </V3Layout>
    );
  }

  return (
    <V3Layout hideTopBar>
      <div className="p-4 md:p-8 space-y-6 h-full flex flex-col">
        {/* Header */}
        <div className="pt-10 md:pt-0 flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Hello, {firstName} 👋</h1>
            <p className="text-[var(--text-secondary)] mt-1 text-sm">
              {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Team Member Selector */}
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
          {TEAM.map(member => {
            const active = selectedMember === member.id;
            return (
              <button
                key={member.id}
                onClick={() => setSelectedMember(member.id)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border transition-all shrink-0 ${
                  active
                    ? 'border-orange-500/50 bg-orange-500/10'
                    : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--border-input)]'
                }`}
              >
                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${member.color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                  {member.initials}
                </div>
                <div className="text-left hidden sm:block">
                  <p className={`text-sm font-medium ${active ? 'text-orange-400' : ''}`}>{member.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">{member.role}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Main Split: Calendar | Tasks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
          {/* ═══ LEFT: Calendar ═══ */}
          <Card className="p-6 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <CalendarIcon size={18} className="text-orange-400" />
                <h2 className="text-lg font-bold">{MONTHS[calMonth]} {calYear}</h2>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { setCalYear(now.getFullYear()); setCalMonth(now.getMonth()); }}
                  className="px-3 py-1 text-xs rounded-full bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors mr-2">
                  Today
                </button>
                <button onClick={prevMonth} className="w-8 h-8 rounded-full hover:bg-[var(--bg-hover)] flex items-center justify-center transition-colors">
                  <ChevronLeft size={16} />
                </button>
                <button onClick={nextMonth} className="w-8 h-8 rounded-full hover:bg-[var(--bg-hover)] flex items-center justify-center transition-colors">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-2">
              {DAYS.map(d => (
                <div key={d} className="text-center text-xs text-[var(--text-muted)] font-medium py-1">{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 flex-1">
              {grid.map((day, i) => {
                if (day === null) return <div key={i} />;
                const dateStr = formatDate(calYear, calMonth, day);
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDate;
                const dayEvents = eventsByDate[dateStr] || [];
                const hasEvents = dayEvents.length > 0;

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                    className={`relative flex flex-col items-center py-1.5 rounded-xl transition-all ${
                      isSelected
                        ? 'bg-orange-500/20 border border-orange-500/40'
                        : isToday
                        ? 'bg-[var(--bg-hover)]'
                        : 'hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <span className={`text-sm font-medium ${
                      isToday ? 'text-orange-400 font-bold' : ''
                    } ${isSelected ? 'text-orange-300' : ''}`}>
                      {day}
                    </span>
                    {hasEvents && (
                      <div className="flex gap-0.5 mt-0.5">
                        {dayEvents.slice(0, 3).map((e, j) => (
                          <div key={j} className={`w-1.5 h-1.5 rounded-full ${e.color}`} />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected date events */}
            {selectedDate && (
              <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
                <p className="text-sm font-medium mb-3 text-[var(--text-secondary)]">
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
                {selectedDateEvents.length > 0 ? (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {selectedDateEvents.map(evt => (
                      <div key={evt.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--bg-subtle)]">
                        <div className={`w-2 h-2 rounded-full ${evt.color} shrink-0`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{evt.title}</p>
                          {evt.time && <p className="text-xs text-[var(--text-muted)]">{evt.time}</p>}
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-hover)] text-[var(--text-muted)] capitalize shrink-0">
                          {evt.type}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">No events on this day</p>
                )}
              </div>
            )}
          </Card>

          {/* ═══ RIGHT: Task List ═══ */}
          <Card className="p-6 flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <ListTodo size={18} className="text-orange-400" />
                <h2 className="text-lg font-bold">Tasks</h2>
                <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-subtle)] px-2 py-0.5 rounded-full">
                  {filteredTasks.filter(t => t.status !== 'completed').length} open
                </span>
              </div>
              <Button size="sm" variant="gradient" onClick={() => navigate('/v3/tasks')}>
                <Plus size={14} className="mr-1" /> View All
              </Button>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: 'Overdue', count: filteredTasks.filter(t => t.due_date && t.status !== 'completed' && new Date(t.due_date) < now).length, color: 'text-red-400 bg-red-500/10' },
                { label: 'Due Today', count: filteredTasks.filter(t => t.due_date?.slice(0, 10) === todayStr && t.status !== 'completed').length, color: 'text-amber-400 bg-amber-500/10' },
                { label: 'Completed', count: filteredTasks.filter(t => t.status === 'completed').length, color: 'text-emerald-400 bg-emerald-500/10' },
              ].map(s => (
                <div key={s.label} className={`text-center py-3 rounded-xl ${s.color}`}>
                  <p className="text-2xl font-bold">{s.count}</p>
                  <p className="text-xs opacity-80">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Task list */}
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {filteredTasks.length > 0 ? filteredTasks.slice(0, 20).map(task => {
                const overdue = task.due_date && task.status !== 'completed' && new Date(task.due_date) < now;
                const dueToday = task.due_date?.slice(0, 10) === todayStr;

                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors group"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      task.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400'
                      : overdue ? 'bg-red-500/20 text-red-400'
                      : dueToday ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                    }`}>
                      {task.status === 'completed' ? <CheckCircle2 size={16} /> : overdue ? <AlertTriangle size={14} /> : <Clock size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${task.status === 'completed' ? 'line-through text-[var(--text-muted)]' : ''}`}>
                        {task.title}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] truncate">
                        {task.property_address || task.description || 'No details'}
                      </p>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      <Tag active={task.priority === 'high'}>{task.priority}</Tag>
                      {task.due_date && (
                        <span className={`text-[10px] ${
                          overdue ? 'text-red-400' : dueToday ? 'text-amber-400' : 'text-[var(--text-muted)]'
                        }`}>
                          {overdue ? 'Overdue' : dueToday ? 'Today' : new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              }) : (
                <EmptyState message={selectedMember !== 'all' ? `No tasks assigned to ${TEAM.find(m => m.id === selectedMember)?.name}` : 'No tasks yet'} />
              )}
            </div>
          </Card>
        </div>
      </div>
    </V3Layout>
  );
}
