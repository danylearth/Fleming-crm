import {pipelineVisible,pipelineStage,matchesPipelineAgent} from '../utils/pipeline';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { Card, GlassCard, SectionHeader, EmptyState, Select, Button } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { getPropertyImage, getPropertyPlaceholder } from '../utils/propertyImages';
import {
  Building2, Users, Wrench, MessageSquare, AlertTriangle,
  Clock, CheckCircle2, ArrowRight, CalendarDays, Trash2, X, ListChecks, Eye, KeyRound, Handshake
} from 'lucide-react';

interface MaintenanceItem {
  assigned_to?:number;assigned_name?:string; id: number; property_address: string; description: string; status: string; priority: string;
}

interface OverdueTask {
  id: number; title: string; status: string; priority: string; due_date: string;
}

interface DashboardData {
  stats: { properties: number; active_tenancies: number; open_maintenance: number; active_enquiries: number };
  complianceAlerts: { id: number; property_address: string; type: string; expiry_date: string; assigned_to?:string;task_id?:number }[];
  recentMaintenance: MaintenanceItem[];
  recentTasks: OverdueTask[];
}

interface Property {
  id: number; address: string; postcode: string; rent_amount: number;
  status: string; landlord_name: string; current_tenant: string | null;
  bedrooms: number; property_type: string; image_url?: string | null;
}

interface Task {
  dashboard_dismissed_at?: string;
  id: number; title: string; description: string; status: string; task_type?:string; entity_type?:string; entity_id?:number;
  priority: string; due_date: string; property_address?: string; assigned_to?: string;
}

interface Enquiry {
  viewing_date?:string;viewing_time?:string;handover_date?:string;handover_not_required?:number; previous_agent?:string; id: number; status: string; first_name_1?: string; last_name_1?: string;
  property_address?: string; property_id?: number; created_at?: string;
  email_1?: string; phone_1?: string;
  application_form_completed?: number | boolean; application_review_status?: string;
  balance_payment_received?:number; balance_payment_requested?:number; balance_follow_up_date?:string; tenancy_agreement_completed?: boolean; tenancy_agreement_status?: string; updated_at?:string; follow_up_date?:string; holding_deposit_requested?:number; application_form_sent?:number;
}

export default function Dashboard() {
  const api = useApi();
  const { confirmAction } = useNotifications();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [teamMembers,setTeamMembers]=useState<{id:number;name:string}[]>([]);
  const [maintenanceOwner,setMaintenanceOwner]=useState('all');
  const matchesMaintenanceOwner=(assigned:unknown)=>maintenanceOwner==='all'||(maintenanceOwner==='unassigned'?!assigned:[maintenanceOwner,teamMembers.find(m=>String(m.id)===maintenanceOwner)?.name].includes(String(assigned||'')));
  const [taskOwner,setTaskOwner]=useState('all');
  const [calendarOwner,setCalendarOwner]=useState('all');
  const [selectedTask,setSelectedTask]=useState<Task|null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [landlordEnquiries,setLandlordEnquiries]=useState<{id:number;previous_agent?:string;name?:string;first_name?:string;last_name?:string;status:string;updated_at?:string;created_at?:string;follow_up_date?:string}[]>([]);
  const [pipelineOldest,setPipelineOldest]=useState(false);
  const [pipelineAgent,setPipelineAgent]=useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/dashboard').catch(() => null),
      api.get('/api/properties').catch(() => []),
      api.get('/api/tasks').catch(() => []),
      api.get('/api/tenant-enquiries').catch(() => []),
      api.get('/api/users/options').catch(()=>[]),
      api.get('/api/landlords-bdm').catch(()=>[]),
    ]).then(([dash, props, tks, enqs, members, bdm]) => {
      setTeamMembers(members);setLandlordEnquiries(bdm);
      setDashboard(dash);
      setProperties(Array.isArray(props) ? props : []);
      setTasks(Array.isArray(tks) ? tks : []);
      setEnquiries(Array.isArray(enqs) ? enqs.filter((enquiry: Enquiry) => !['rejected','converted','closed'].includes(enquiry.status)) : []);
    }).finally(() => setLoading(false));
  }, [api]);

  const firstName = user?.name?.split(' ')[0] || 'there';

  const stats = dashboard?.stats || {
    properties: properties.length,
    active_tenancies: properties.filter(p => p.status === 'active').length,
    open_maintenance: 0,
    active_enquiries: enquiries.length,
  };

  const [now] = useState(Date.now);

  const calendarDays = useMemo(() => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, offset) => {
      const date = new Date(start);
      date.setDate(start.getDate() + offset);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return {
        key,
        date,
        tasks: tasks.filter(task => task.due_date?.slice(0, 10) === key && ['pending','in_progress'].includes(task.status) && (calendarOwner==='all'||(calendarOwner==='unassigned'?!task.assigned_to:[calendarOwner,teamMembers.find(m=>String(m.id)===calendarOwner)?.name].includes(String(task.assigned_to))))),
      };
    });
  }, [now, tasks, calendarOwner, teamMembers]);

  const teamColors = ['bg-violet-400', 'bg-cyan-400', 'bg-emerald-400', 'bg-amber-400', 'bg-pink-400'];
  const colorForMember = (name?: string) => {
    if (!name) return 'bg-slate-400';
    const hash = Array.from(name).reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return teamColors[hash % teamColors.length];
  };

  const daysUntil = (date: string) => {
    const diff = (new Date(date).getTime() - now) / (1000 * 60 * 60 * 24);
    return Math.ceil(diff);
  };

  const urgencyColor = (date: string) => {
    const d = daysUntil(date);
    if (d < 0) return 'text-red-400';
    if (d < 30) return 'text-amber-400';
    return 'text-emerald-400';
  };

  const visibleRecentTasks = tasks.filter(task => ['pending','in_progress'].includes(task.status) && !task.dashboard_dismissed_at && !['tenant_enquiry','landlord_bdm'].includes(task.entity_type||'') && (taskOwner==='all' || (taskOwner==='me' ? [String(user?.id),user?.name].includes(task.assigned_to) : [taskOwner,teamMembers.find(member=>String(member.id)===taskOwner)?.name].includes(String(task.assigned_to)))));

  const todayKey=new Date(now).toLocaleDateString('en-CA',{timeZone:'Europe/London'});
  const pipeline=[
    ...enquiries.filter(e=>pipelineVisible(e,todayKey,new Date(now).toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour12:false}).slice(0,5))).map(e=>({key:`tenant-${e.id}`,name:[e.first_name_1,e.last_name_1].filter(Boolean).join(' ')||'Tenant Enquiry',previousAgent:e.previous_agent||'—',type:'Tenant Enquiry',date:e.balance_follow_up_date&&e.balance_follow_up_date.slice(0,10)<=todayKey?e.balance_follow_up_date:e.follow_up_date&&e.follow_up_date.slice(0,10)<=todayKey?e.follow_up_date:e.updated_at||e.created_at||'',status:pipelineStage(e,todayKey),href:`/enquiries/${e.id}`,onboarding:!!(e.holding_deposit_requested||e.application_form_sent||e.status==='onboarding')})),
    ...landlordEnquiries.filter(e=>!['onboarded','not_interested','rejected','closed'].includes(e.status)&&(!e.follow_up_date||e.follow_up_date.slice(0,10)<=todayKey)).map(e=>({key:`landlord-${e.id}`,name:e.name||[e.first_name,e.last_name].filter(Boolean).join(' ')||'Landlord Enquiry',previousAgent:e.previous_agent||'—',type:'Landlord Enquiry',date:e.follow_up_date&&e.follow_up_date.slice(0,10)<=todayKey?e.follow_up_date:e.updated_at||e.created_at||'',status:e.follow_up_date&&e.follow_up_date.slice(0,10)<=todayKey?'Follow-up Due':e.status.replaceAll('_',' '),href:`/bdm/${e.id}`,onboarding:false})),
    ...tasks.filter(t=>t.entity_type==='tenant'&&t.task_type==='follow_up'&&t.status!=='completed'&&t.due_date?.slice(0,10)<=todayKey).map(t=>({key:`followup-${t.id}`,name:t.title,previousAgent:teamMembers.find(m=>String(m.id)===String(t.assigned_to))?.name||t.assigned_to||'—',type:'Tenant Follow-up',date:t.due_date,status:'Follow-up Due',href:`/tasks/${t.id}`,onboarding:false})),
  ].filter(row=>matchesPipelineAgent(row.previousAgent,pipelineAgent,teamMembers)).sort((a,b)=>(Date.parse(a.date||'1970-01-01')-Date.parse(b.date||'1970-01-01'))*(pipelineOldest?1:-1));

  const deleteTask = async (task: Task) => {
    if (!await confirmAction(`Delete reminder “${task.title}”?`)) return;
    try {
      await api.delete(`/api/tasks/${task.id}`);
      setTasks(current => current.filter(item => item.id !== task.id));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Reminder could not be deleted');
    }
  };

  if (loading) {
    return (
      <Layout hideTopBar>
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-2 border-[var(--border-input)] border-t-orange-500 rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout hideTopBar>
      {selectedTask && <div role="dialog" aria-modal="true" aria-labelledby="task-detail-title" className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-4" onClick={()=>setSelectedTask(null)}><div className="w-full max-w-lg rounded-2xl bg-[var(--bg-card)] p-6 space-y-4" onClick={e=>e.stopPropagation()}><div className="flex justify-between gap-4"><h2 id="task-detail-title" className="font-semibold text-lg">{selectedTask.title}</h2><button aria-label="Close task" onClick={()=>setSelectedTask(null)}><X size={20}/></button></div><p className="whitespace-pre-wrap text-sm">{selectedTask.description || 'No description'}</p><p className="text-sm">{selectedTask.property_address}</p><p className="text-sm">Assigned To: {teamMembers.find(m=>String(m.id)===String(selectedTask.assigned_to))?.name || selectedTask.assigned_to || (selectedTask.entity_type==='maintenance'?'Maintenance':'Unassigned')}</p><p className="text-sm capitalize">{selectedTask.status} · {selectedTask.priority} Priority</p><p className="text-sm">Due: {selectedTask.due_date ? new Date(selectedTask.due_date).toLocaleDateString('en-GB') : 'Not Set'}</p><Button onClick={()=>navigate(`/tasks/${selectedTask.id}`)}>Open Task</Button></div></div>}
      <div className="p-4 md:p-8 space-y-6 md:space-y-8">
        {/* Greeting */}
        <div className="pt-10 md:pt-0">
          <h1 className="text-2xl md:text-4xl font-bold">Hi there {firstName} 👋</h1>
          <p className="text-[var(--text-secondary)] mt-1 text-sm">Lets go to work!</p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Properties', value: stats.properties, icon: Building2, color: 'from-orange-500 to-pink-500' },
            { label: 'Active Tenancies', value: stats.active_tenancies, icon: Users, color: 'from-purple-500 to-indigo-500' },
            { label: 'Open Maintenance', value: stats.open_maintenance, icon: Wrench, color: 'from-amber-500 to-orange-500' },
            { label: 'Active Enquiries', value: stats.active_enquiries, icon: MessageSquare, color: 'from-pink-500 to-rose-500' },
          ].map(stat => (
            <GlassCard key={stat.label} className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                  <stat.icon size={18} />
                </div>
              </div>
              <p className={`text-3xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>
                {stat.value}
              </p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">{stat.label}</p>
            </GlassCard>
          ))}
        </div>

        {/* Two Column: Compliance + Pipeline */}
        <div className="grid grid-cols-1 min-[1700px]:grid-cols-2 gap-6">
          {/* Compliance and maintenance alerts */}
          <Card className="p-6">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-5"><h2 className="font-semibold flex items-center gap-2"><AlertTriangle size={16}/> Compliance Alerts & Maintenance Requests</h2><div className="flex flex-wrap items-center gap-2 ml-auto max-w-full"><Select hideLabel searchable className="w-64 max-w-full" label="Select User…" value={maintenanceOwner} onChange={setMaintenanceOwner} options={[{value:'all',label:'View All'},{value:'unassigned',label:'Unassigned'},...teamMembers.map(m=>({value:String(m.id),label:m.name}))]}/></div></div>
            {dashboard?.complianceAlerts?.some(a=>matchesMaintenanceOwner(a.assigned_to)) || dashboard?.recentMaintenance?.some(m=>matchesMaintenanceOwner(m.assigned_to)) ? (
              <div id="dashboard-alerts" className="space-y-3">
                {dashboard!.complianceAlerts.filter(a=>matchesMaintenanceOwner(a.assigned_to)).map((alert, i) => (
                  <button key={`compliance-${i}`} onClick={() => navigate(alert.task_id?`/tasks/${alert.task_id}`:`/properties/${alert.id}`)} className="w-full flex items-center justify-between p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors text-left">
                    <div className="flex items-center gap-3">
                      <AlertTriangle size={16} className={urgencyColor(alert.expiry_date)} />
                      <div>
                        <p className="text-sm font-medium">{alert.property_address}</p>
                        <p className="text-xs text-[var(--text-muted)]">{alert.type}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${urgencyColor(alert.expiry_date)}`}>
                        {daysUntil(alert.expiry_date) < 0
                          ? `${Math.abs(daysUntil(alert.expiry_date))}d overdue`
                          : `${daysUntil(alert.expiry_date)}d left`}
                      </p>
                      <div className="flex items-center justify-end gap-2 mt-1"><span className="text-xs text-[var(--text-muted)]">{new Date(alert.expiry_date).toLocaleDateString('en-GB')}</span><span aria-label="View alert" title="View alert" className="rounded-full bg-[var(--bg-hover)] p-2"><Eye size={14}/></span></div>
                    </div>
                  </button>
                ))}
                {dashboard!.recentMaintenance.filter(m=>matchesMaintenanceOwner(m.assigned_to)).map(item => (
                  <button key={`maintenance-${item.id}`} onClick={() => navigate(`/maintenance/${item.id}`)} className="w-full flex items-center justify-between p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors text-left">
                    <div className="flex items-center gap-3 min-w-0"><Wrench size={16} className="text-amber-400 shrink-0" /><div className="min-w-0"><p className="text-sm font-medium truncate">{item.property_address}</p><p className="text-xs text-[var(--text-muted)] truncate">{item.description}</p></div></div>
                    {item.assigned_name && <span title={item.assigned_name} className="rounded-full bg-amber-500/15 px-2 py-1 text-xs mx-2">{item.assigned_name?item.assigned_name.split(' ').map(n=>n[0]).join('').slice(0,2):''}</span>}<span className="text-[10px] font-semibold uppercase text-amber-400">{item.status.replace('_', ' ')}<span aria-label="View maintenance" title="View maintenance" className="inline-flex ml-2 rounded-full bg-[var(--bg-hover)] p-2"><Eye size={14}/></span></span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState message="No compliance alerts or open maintenance requests" />
            )}{user?.role==='admin'&&!!(dashboard?.complianceAlerts.length||dashboard?.recentMaintenance.length)&&<div className="flex justify-end mt-4"><Button size="sm" variant="outline" className="!text-red-600 !border-red-300" onClick={async()=>{if(!await confirmAction('Clear all current compliance alerts and maintenance requests from the dashboard? The records and tasks will remain available.','Clear Dashboard Alerts'))return;try{await api.post('/api/dashboard/clear-alerts',{});setDashboard(await api.get('/api/dashboard'));}catch(e){alert(e instanceof Error?e.message:'Could not clear alerts');}}}>Clear All</Button></div>}
          </Card>

          {/* Pipeline */}
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4"><h2 className="font-semibold flex items-center gap-2"><MessageSquare size={16}/>Enquiry Pipeline</h2><Select hideLabel searchable className="w-64 max-w-full" label="Filter enquiries by agent" value={pipelineAgent} onChange={setPipelineAgent} options={[{value:'all',label:'View All'},...teamMembers.map(m=>({value:String(m.id),label:m.name}))]}/></div>
            {pipeline.length ? <div className="overflow-x-auto max-h-96"><table className="w-full text-sm text-left [&_th+th]:border-l [&_td+td]:border-l [&_th]:border-[var(--border-subtle)] [&_td]:border-[var(--border-subtle)]"><thead><tr className="text-xs text-[var(--text-muted)]"><th className="py-3">Enquiry Name</th><th className="px-3">Enquiry Type</th><th className="px-3">Stage</th><th className="px-3">Previous Agent</th><th><button onClick={()=>setPipelineOldest(v=>!v)} className="px-3 py-2 min-w-28 text-left whitespace-nowrap" aria-label="Sort pipeline by date">Date {pipelineOldest?'↑':'↓'}</button></th><th className="px-3 text-center">Action</th></tr></thead><tbody>{pipeline.map(row=><tr key={row.key} className="border-t border-[var(--border-subtle)]"><td className="py-3 pr-3"><button className="text-left" onClick={()=>navigate(row.href)}><strong className="block">{row.name}</strong></button></td><td className="px-3 text-xs">{row.type}</td><td className="px-3 text-xs">{row.status.charAt(0).toUpperCase()+row.status.slice(1)}</td><td className="px-3 text-xs">{row.previousAgent}</td><td className="px-3 text-xs whitespace-nowrap">{row.date?new Date(row.date).toLocaleDateString('en-GB'):'Not Set'}</td><td className="px-3 text-center"><Button size="sm" className="!text-xs !px-3 !py-1 whitespace-nowrap" onClick={()=>navigate(row.href+(row.onboarding?'?onboarding=1':''))}>{row.onboarding?'Continue':'View'}</Button></td></tr>)}</tbody></table></div>:<EmptyState message={pipelineAgent==='all'?"No enquiries or follow-ups awaiting action":"No enquiries or follow-ups awaiting action for this agent"}/>}
          </Card>
        </div>

        {/* Team Calendar */}
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4"><h2 className="font-semibold flex items-center gap-2"><CalendarDays size={16}/>Team Calendar</h2><div className="flex flex-wrap items-center gap-2"><Select hideLabel searchable className="w-64 max-w-full" label="Filter calendar by user" value={calendarOwner} onChange={setCalendarOwner} options={[{value:'all',label:'All Users'},{value:'unassigned',label:'Unassigned'},...teamMembers.map(m=>({value:String(m.id),label:m.name}))]}/><Button size="sm" className="h-11 w-28 shrink-0" variant="outline" onClick={()=>navigate('/tasks')}>Open Calendar</Button></div></div>
          <div className="overflow-x-auto"><div className="grid grid-cols-7 gap-2 min-w-[600px]">
            {calendarDays.map(({ key, date, tasks: dayTasks }, index) => (
              <button
                key={key}
                onClick={() => navigate('/tasks')}
                className={`min-h-24 rounded-xl border p-2 text-left transition-colors hover:bg-[var(--bg-hover)] ${index === 0 ? 'border-orange-500/40 bg-orange-500/5' : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40'}`}
              >
                <span className="block text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  {date.toLocaleDateString('en-GB', { weekday: 'short' })}
                </span>
                <span className="block text-lg font-semibold mt-0.5">{date.getDate()}</span>
                <div className="flex flex-wrap gap-1 mt-3" aria-label={`${dayTasks.length} open tasks`}>
                  {dayTasks.slice(0, 6).map(task => (
                    <span key={task.id} title={`${task.title}${task.assigned_to ? ` — ${teamMembers.find(member=>String(member.id)===task.assigned_to)?.name || task.assigned_to}` : ''}`} className={`w-2 h-2 rounded-full ${colorForMember(task.assigned_to)}`} />
                  ))}
                  {dayTasks.length > 6 && <span className="text-[9px] text-[var(--text-muted)]">+{dayTasks.length - 6}</span>}
                </div>
              </button>
            ))}
          </div>
          </div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 text-xs text-[var(--text-muted)]">
            {[...new Set(calendarDays.flatMap(day => day.tasks.map(task => String(task.assigned_to || 'unassigned'))))].map(owner => {
              const ownerTasks=calendarDays.flatMap(day=>day.tasks).filter(task=>String(task.assigned_to||'unassigned')===owner);
              return <div key={owner} className="self-start min-w-0"><div className="flex items-center gap-1.5 font-medium min-h-6"><span className={`w-2 h-2 shrink-0 rounded-full ${owner==='unassigned'?'bg-slate-400':colorForMember(owner)}`} />{owner==='unassigned'?'Unassigned':teamMembers.find(member=>String(member.id)===owner)?.name||owner}</div>
                <div className="flex flex-col gap-2 mt-2">{ownerTasks.map(task=>{const Icon=task.task_type==='viewing'?Eye:task.task_type==='handover'?KeyRound:task.task_type==='meeting'?Handshake:task.task_type==='reminder'?Clock:ListChecks;return <button key={task.id} className="flex items-start gap-1.5 text-left text-[11px]" onClick={()=>navigate('/tasks')}><Icon size={13} className="shrink-0 mt-0.5"/><span>{task.title}<span className="block text-[10px] opacity-70">{new Date(task.due_date).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span></span></button>;})}</div>
              </div>;
            })}
          </div>
        </Card>

        {/* Recent Tasks */}
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4"><h2 className="font-semibold flex gap-2 items-center"><ListChecks size={16}/> Tasks</h2><div className="flex flex-wrap items-center gap-2"><Select hideLabel searchable className="w-64 max-w-full" label="Select User…" value={taskOwner} onChange={setTaskOwner} options={[{value:'all',label:'View All'},{value:'me',label:'My Tasks'},...teamMembers.map(m=>({value:String(m.id),label:m.name}))]}/><Button size="sm" className="h-11 w-28 shrink-0" variant="outline" onClick={()=>navigate('/tasks')}>View All</Button></div></div>
          {visibleRecentTasks.length ? (
            <div className="space-y-2">
              {visibleRecentTasks.slice(0, 5).map(task => (
                <div key={task.id} className="flex items-center gap-4 p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    task.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400'
                    : task.priority === 'high' ? 'bg-red-500/20 text-red-400'
                    : 'bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                  }`}>
                    {task.status === 'completed' ? <CheckCircle2 size={16} /> : <Clock size={16} />}
                  </div>
                  <button type="button" onClick={()=>setSelectedTask(task)} className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{task.property_address || task.description}</p>
                  </button>
                  <span className="text-xs text-[var(--text-muted)]">{teamMembers.find(m=>String(m.id)===String(task.assigned_to))?.name||task.assigned_to||(task.entity_type==='maintenance'?'Maintenance':'Unassigned')}</span>
                  <div className="flex flex-wrap items-center gap-3 shrink-0"><span className="text-xs text-[var(--text-muted)]">{task.due_date?new Date(task.due_date).toLocaleDateString('en-GB'):'—'}</span><span className={`rounded-full px-2 py-1 text-xs ${task.priority==='high'||task.priority==='urgent'?'bg-red-500/15 text-red-600':task.priority==='medium'?'bg-amber-500/15 text-amber-600':'bg-emerald-500/15 text-emerald-600'}`}>{task.priority.charAt(0).toUpperCase()+task.priority.slice(1)}</span><Button size="sm" variant="outline" onClick={()=>setSelectedTask(task)}>View</Button></div>
                  <button
                    type="button"
                    onClick={() => deleteTask(task)}
                    className="p-2 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    aria-label={`Delete ${task.title}`}
                    title="Delete reminder"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No tasks yet" />
          )}
          <div className="flex justify-end mt-4">{user?.role === 'admin' && visibleRecentTasks.length > 0 && <button className="self-end rounded-full bg-red-600 px-4 py-2.5 text-xs text-white font-medium whitespace-nowrap" onClick={async () => { if (!await confirmAction('Clear all recent tasks from the dashboard? They will remain available in Team Calendar.', 'Clear Recent Tasks')) return; try { await api.post('/api/tasks/clear-recent', {}); setTasks(current => current.map(t => ({ ...t, dashboard_dismissed_at: new Date().toISOString() }))); } catch (e) { alert(e instanceof Error ? e.message : 'Could not clear tasks'); } }}>Clear All</button>}</div>
        </Card>

        {/* My Properties Carousel */}
        <div>
          <SectionHeader title="My Properties" action={() => navigate('/properties')} actionLabel="View All" />
          {properties.length ? (
            <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2 scrollbar-hide">
              {properties.map(prop => (
                <GlassCard
                  key={prop.id}
                  onClick={() => navigate(`/properties/${prop.id}`)}
                  className="min-w-[280px] max-w-[280px] shrink-0 overflow-hidden"
                >
                  <img
                    src={getPropertyImage(prop.id, 400, 240, `${prop.address}, ${prop.postcode}`, prop.image_url, prop.landlord_name)}
                    alt={prop.address}
                    className="h-36 w-full object-cover"
                    loading="lazy"
                    onError={event => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = getPropertyPlaceholder(prop.id, 400, 240, prop.landlord_name);
                    }}
                  />
                  <div className="p-4">
                    <div className="mb-2"><span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-medium ${prop.status==='let'?'bg-emerald-500/15 text-[var(--feedback-emerald)]':prop.status==='to_let'?'bg-red-500/15 text-red-600':prop.status==='let_agreed'?'bg-amber-500/15 text-[var(--feedback-amber)]':'bg-slate-500/15 text-[var(--text-secondary)]'}`}>{({let:'Let',to_let:'To Let',let_agreed:'Let Agreed'} as Record<string,string>)[prop.status]||prop.status.replaceAll('_',' ')}</span></div>
                    <p className="font-semibold text-sm truncate">{prop.address}</p>
                    <p className="text-xs text-[var(--text-muted)]">{prop.postcode}</p>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border-subtle)]">
                      <span className="text-sm font-bold bg-gradient-to-r from-orange-500 to-pink-500 bg-clip-text text-transparent">
                        £{prop.rent_amount?.toLocaleString()}/mo
                      </span>
                      <ArrowRight size={14} className="text-[var(--text-muted)]" />
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          ) : (
            <EmptyState message="No properties found" />
          )}
        </div>
      </div>
    </Layout>
  );
}
