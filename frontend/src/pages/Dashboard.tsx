import DashboardWorkPanels from '../components/DashboardWorkPanels';
import {applicationReadyForReview,pipelineVisible,pipelineStage,matchesPipelineAgent} from '../utils/pipeline';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import DashboardTaskPreview from '../components/DashboardTaskPreview';
import PropertyCarousel from '../components/PropertyCarousel';
import { Card, GlassCard, SectionHeader, EmptyState, Select, Button } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { usePortfolio } from '../context/PortfolioContext';
import { portfolioMatcher, type PortfolioRecord } from '../utils/dashboardPortfolio';
import { useNotifications } from '../context/NotificationContext';
import { getPropertyImage, getPropertyPlaceholder, propertyCardColours } from '../utils/propertyImages';
import {
  Building2, Users, Wrench, MessageSquare, 
  Clock, CheckCircle2, ArrowRight, Trash2, UserRound, BriefcaseBusiness, CalendarDays, ListChecks
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
  landlord_type?: string;
  id: number; address: string; postcode: string; rent_amount: number;
  status: string; landlord_name: string; landlord_id?: number; current_tenant: string | null;
  bedrooms: number; property_type: string; image_url?: string | null;
}

interface Task {
  dashboard_dismissed_at?: string;
  id: number; title: string; description: string; status: string; task_type?:string; entity_type?:string; entity_id?:number;
  priority: string; due_date: string; property_address?: string; assigned_to?: string;
}

interface Enquiry {
  landlord_type?: string;
  viewing_date?:string;viewing_time?:string;handover_date?:string;handover_not_required?:number; previous_agent?:string; id: number; status: string; first_name_1?: string; last_name_1?: string;
  property_address?: string; property_id?: number; created_at?: string;
  email_1?: string; phone_1?: string;
  joint_partner_id?:number; application_changes_sent_at?:string; application_form_completed?: number | boolean; application_review_status?: string;
  balance_payment_received?:number; balance_payment_requested?:number; balance_follow_up_date?:string; tenancy_agreement_completed?: boolean; tenancy_agreement_status?: string; updated_at?:string; follow_up_date?:string; holding_deposit_requested?:number; application_form_sent?:number;
}

export default function Dashboard() {
  const api = useApi();
  const { confirmAction } = useNotifications();
  const { user } = useAuth();
  const { portfolioFilter } = usePortfolio();
  const navigate = useNavigate();
  const [allDashboard, setDashboard] = useState<DashboardData | null>(null);
  const [allProperties, setProperties] = useState<Property[]>([]);
  const cardColours = useMemo(() => propertyCardColours(allProperties), [allProperties]);
  const [portfolioRecords, setPortfolioRecords] = useState<{tenants: PortfolioRecord[]; landlords: PortfolioRecord[]; maintenance: PortfolioRecord[]}>({tenants:[],landlords:[],maintenance:[]});
  const [teamMembers,setTeamMembers]=useState<{id:number;name:string}[]>([]);
  const [taskOwner,setTaskOwner]=useState('all');
  const [calendarOwner,setCalendarOwner]=useState('all');
  const [selectedTask,setSelectedTask]=useState<Task|null>(null);
  const [allTasks, setTasks] = useState<Task[]>([]);
  const [allEnquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [allLandlordEnquiries,setLandlordEnquiries]=useState<{id:number;previous_agent?:string;name?:string;first_name?:string;last_name?:string;status:string;updated_at?:string;created_at?:string;follow_up_date?:string}[]>([]);
  const [pipelineOldest,setPipelineOldest]=useState(false);
  const [pipelineAgent,setPipelineAgent]=useState('all');
  const [pipelineType,setPipelineType]=useState<'all'|'landlord'|'tenant'>('all');
  const [hiddenPipeline,setHiddenPipeline]=useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const getAll = async (endpoint: string) => {
      const rows = [];
      for (let offset=0; ; offset+=1000) {
        const page = await api.get(`${endpoint}?limit=1000&offset=${offset}`);
        rows.push(...page);
        if (page.length < 1000) return rows;
      }
    };
    Promise.all([
      api.get('/api/dashboard').catch(() => null),
      getAll('/api/properties').catch(() => []),
      getAll('/api/tasks').catch(() => []),
      getAll('/api/tenant-enquiries').catch(() => []),
      api.get('/api/users/options').catch(()=>[]),
      api.get('/api/landlords-bdm').catch(()=>[]),
      getAll('/api/tenants').catch(()=>[]),
      getAll('/api/landlords').catch(()=>[]),
      getAll('/api/maintenance').catch(()=>[]),
    ]).then(([dash, props, tks, enqs, members, bdm, tenants, landlords, maintenance]) => {
      if (!active) return;
      setPortfolioRecords({tenants,landlords,maintenance});
      setTeamMembers(members);setLandlordEnquiries(bdm);
      setDashboard(dash);
      setProperties(Array.isArray(props) ? props : []);
      setTasks(Array.isArray(tks) ? tks : []);
      setEnquiries(Array.isArray(enqs) ? enqs : []);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api]);

  const matches = portfolioMatcher({...portfolioRecords, properties:allProperties, enquiries:allEnquiries}, portfolioFilter);
  const properties = allProperties.filter(matches.record);
  const tasks = allTasks.filter(matches.task);
  const enquiries = allEnquiries.filter(matches.record).filter(e=>!['rejected','converted','closed'].includes(e.status));
  const landlordEnquiries = portfolioFilter === 'internal' ? [] : allLandlordEnquiries;
  const dashboard = allDashboard && {
    ...allDashboard,
    complianceAlerts: allDashboard.complianceAlerts.filter(a=>matches.property(a.id)),
    recentMaintenance: allDashboard.recentMaintenance.filter(m=>matches.maintenance(m.id)),
    stats: portfolioFilter === 'all' ? allDashboard.stats : {
      properties:properties.length,
      active_tenancies:new Set(portfolioRecords.tenants.filter(matches.record).filter(t=>(t.status||'active')==='active').map(t=>t.property_id).filter(Boolean)).size,
      open_maintenance:portfolioRecords.maintenance.filter(matches.record).filter(m=>['open','in_progress'].includes(m.status||'')).length,
      active_enquiries:enquiries.length,
    },
  };

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

  const visibleRecentTasks = tasks.filter(task => ['pending','in_progress'].includes(task.status) && !task.dashboard_dismissed_at && !['tenant_enquiry','landlord_bdm','maintenance'].includes(task.entity_type||'') && !['eicr_reminder','epc_reminder','gas_reminder'].includes(task.task_type||'') && !dashboard?.complianceAlerts.some(alert=>alert.task_id===task.id) && (taskOwner==='all' || (taskOwner==='me' ? [String(user?.id),user?.name].includes(task.assigned_to) : [taskOwner,teamMembers.find(member=>String(member.id)===taskOwner)?.name].includes(String(task.assigned_to)))));

  const todayKey=new Date(now).toLocaleDateString('en-CA',{timeZone:'Europe/London'});
  const pipeline=[
    ...enquiries.map(e=>({...e,ready_for_review:applicationReadyForReview(e,allEnquiries.find(p=>p.id===e.joint_partner_id))})).filter(e=>pipelineVisible(e,todayKey,new Date(now).toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour12:false}).slice(0,5))).map(e=>({key:`tenant-${e.id}`,name:[e.first_name_1,e.last_name_1].filter(Boolean).join(' ')||'Tenant Enquiry',previousAgent:e.previous_agent||'—',type:'Tenant Enquiry',date:e.balance_follow_up_date&&e.balance_follow_up_date.slice(0,10)<=todayKey?e.balance_follow_up_date:e.follow_up_date&&e.follow_up_date.slice(0,10)<=todayKey?e.follow_up_date:e.updated_at||e.created_at||'',status:pipelineStage(e,todayKey),href:`/enquiries/${e.id}`,onboarding:!!(e.holding_deposit_requested||e.application_form_sent||e.status==='onboarding')})),
    ...landlordEnquiries.filter(e=>!['onboarded','not_interested','rejected','closed'].includes(e.status)&&(!e.follow_up_date||e.follow_up_date.slice(0,10)<=todayKey)).map(e=>({key:`landlord-${e.id}`,name:e.name||[e.first_name,e.last_name].filter(Boolean).join(' ')||'Landlord Enquiry',previousAgent:e.previous_agent||'—',type:'Landlord Enquiry',date:e.follow_up_date&&e.follow_up_date.slice(0,10)<=todayKey?e.follow_up_date:e.updated_at||e.created_at||'',status:e.follow_up_date&&e.follow_up_date.slice(0,10)<=todayKey?'Follow-up Due':e.status.replaceAll('_',' '),href:`/bdm/${e.id}`,onboarding:false})),
    ...tasks.filter(t=>t.entity_type==='tenant'&&t.task_type==='follow_up'&&t.status!=='completed'&&t.due_date?.slice(0,10)<=todayKey).map(t=>({key:`followup-${t.id}`,name:t.title,previousAgent:teamMembers.find(m=>String(m.id)===String(t.assigned_to))?.name||t.assigned_to||'—',type:'Tenant Follow-up',date:t.due_date,status:'Follow-up Due',href:`/tasks/${t.id}`,onboarding:false})),
  ] .filter(row=>!hiddenPipeline.includes(row.key)).filter(row=>pipelineType==='all'||(pipelineType==='landlord'?row.type==='Landlord Enquiry':row.type.startsWith('Tenant '))).filter(row=>matchesPipelineAgent(row.previousAgent,pipelineAgent,teamMembers)).sort((a,b)=>(Date.parse(a.date||'1970-01-01')-Date.parse(b.date||'1970-01-01'))*(pipelineOldest?1:-1));

  const clearTask = async (task: Task) => {
    if (!await confirmAction(`Clear “${task.title}” from the dashboard? The task stays open.`)) return;
    try {
      await api.post('/api/tasks/clear-recent', {ids:[task.id]});
      setSelectedTask(null);
      setTasks(current => current.map(item => item.id === task.id ? {...item,dashboard_dismissed_at:new Date().toISOString()} : item));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Reminder could not be cleared');
    }
  };

  if (loading) {
    return (
      <Layout title="Dashboard">
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-2 border-[var(--border-input)] border-t-orange-500 rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Dashboard">
      {selectedTask && <DashboardTaskPreview key={selectedTask.id} task={selectedTask} members={teamMembers} onClear={user?.role==='admin'?()=>void clearTask(selectedTask):undefined} onClose={()=>setSelectedTask(null)} onUpdated={updated=>{setSelectedTask(current=>current?{...current,...updated}:null);setTasks(current=>current.map(task=>task.id===updated.id?{...task,...updated}:task));}}/>}
      <div className="dashboard-consistent-type p-4 md:p-8 space-y-6 md:space-y-8">
        {/* Greeting */}
        <div className="pt-0">
          <h1 className="text-2xl md:text-4xl font-bold">Hi there {firstName} 👋</h1>
          <p className="text-[var(--text-secondary)] mt-1 text-sm">Lets go to work!</p>
          {portfolioFilter!=='all'&&<p className="mt-2 text-xs text-[var(--text-muted)]">Showing {portfolioFilter==='internal'?'your own portfolio':'client properties'} across this dashboard. Tasks and enquiries without a linked portfolio remain under All.</p>}
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

        <div className="space-y-6">
          <DashboardWorkPanels alerts={dashboard?.complianceAlerts||[]} maintenance={dashboard?.recentMaintenance||[]} teamMembers={teamMembers} onChanged={async()=>setDashboard(await api.get('/api/dashboard'))}/>
          {/* Pipeline */}
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4"><div><h2 className="font-semibold flex items-center gap-2"><MessageSquare size={16}/>Enquiry Pipeline</h2><p className="dashboard-section-subtitle">New and existing tenant and landlord onboardings</p></div><div className="flex flex-wrap items-center gap-2"><div role="group" aria-label="Enquiry type" className="flex flex-wrap gap-2">{([{value:'all',label:'All'},{value:'landlord',label:'Landlord Enquiries'},{value:'tenant',label:'Tenant Enquiries'}] as const).map(option=><button key={option.value} aria-pressed={pipelineType===option.value} onClick={()=>setPipelineType(option.value)} className={'rounded-full border px-3 py-2 text-sm font-medium transition-colors '+(pipelineType===option.value?'bg-[var(--accent-orange,#8f2e70)] border-[var(--accent-orange,#8f2e70)] text-white':'border-[var(--border-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]')}>{option.label}</button>)}</div><Select hideLabel searchable className="w-64 max-w-full" label="Filter enquiries by agent" value={pipelineAgent} onChange={setPipelineAgent} options={[{value:'all',label:'View All'},...teamMembers.map(m=>({value:String(m.id),label:m.name}))]}/></div></div>
            {pipeline.length ? <div className="overflow-x-auto max-h-96"><table className="dashboard-enquiry-table w-full text-sm text-left [&_th+th]:border-l [&_td+td]:border-l [&_th]:border-[var(--border-subtle)] [&_td]:border-[var(--border-subtle)]"><thead><tr className="text-sm text-[var(--text-muted)]"><th className="py-3">Enquiry Name</th><th className="px-2 whitespace-nowrap">Enquiry Type</th><th className="px-2">Stage</th><th className="px-2">Last Agent</th><th><button onClick={()=>setPipelineOldest(v=>!v)} className="px-2 py-2 text-left whitespace-nowrap" aria-label="Sort pipeline by date">Date {pipelineOldest?'↑':'↓'}</button></th><th className="px-2 text-center dashboard-action-cell">Action</th></tr></thead><tbody>{pipeline.map(row=><tr key={row.key} className="border-t border-[var(--border-subtle)]"><td className="py-1.5 pr-3"><button className="dashboard-enquiry-name" onClick={()=>navigate(row.href)}>{row.type==='Landlord Enquiry'?<BriefcaseBusiness size={17} className="enquiry-kind-icon" aria-label="Landlord enquiry"/>:<UserRound size={17} className="enquiry-kind-icon" aria-label="Tenant enquiry"/>}<span className="block font-normal">{row.key.startsWith('followup-')?row.name:row.name.replace(/^(?:(?:mr|mrs|ms|miss|dr|prof|sir|dame|rev)\.?\s+)+/i,'')}</span></button></td><td className="px-2 text-sm whitespace-nowrap">{row.type}</td><td className="px-2 text-sm">{row.status.charAt(0).toUpperCase()+row.status.slice(1)}</td><td className="px-2 text-sm">{row.previousAgent}</td><td className="px-2 text-sm whitespace-nowrap">{row.date?new Date(row.date).toLocaleDateString('en-GB'):'Not Set'}</td><td className="px-2 text-center dashboard-action-cell"><div className="dashboard-row-actions"><Button size="sm" className="dashboard-row-open" onClick={()=>navigate(row.href+(row.onboarding?'?onboarding=1':''))}>{row.onboarding?'Continue':'View'}<ArrowRight size={14}/></Button><button aria-label={'Remove '+row.name+' from this view'} className="dashboard-row-dismiss" onClick={()=>setHiddenPipeline(current=>[...current,row.key])}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table></div>:<EmptyState message={pipelineAgent==='all'?"No enquiries or follow-ups awaiting action":"No enquiries or follow-ups awaiting action for this agent"}/>}
          </Card>
        </div>

        {/* Team Calendar */}
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4"><h2 className="font-semibold flex items-center gap-2"><CalendarDays size={16}/>Team Calendar</h2><div className="flex flex-wrap items-center gap-2"><Select hideLabel searchable className="w-64 max-w-full" label="Filter calendar by user" value={calendarOwner} onChange={setCalendarOwner} options={[{value:'all',label:'All Users'},{value:'unassigned',label:'Unassigned'},...teamMembers.map(m=>({value:String(m.id),label:m.name}))]}/><Button size="sm" className="h-11 w-28 shrink-0" variant="outline" onClick={()=>navigate('/tasks')}>Open Calendar</Button></div></div>
          <div className="overflow-x-auto"><div className="grid grid-cols-7 gap-2 min-w-[600px]">
            {calendarDays.map(({ key, date, tasks: dayTasks }, index) => {
              const owners = new Map<string, { name: string; count: number }>();
              dayTasks.forEach(task => {
                const assignedTo = String(task.assigned_to || '');
                const member = teamMembers.find(member => String(member.id) === assignedTo || member.name === assignedTo);
                const owner = member ? String(member.id) : assignedTo || 'unassigned';
                const summary = owners.get(owner);
                if (summary) summary.count += 1;
                else owners.set(owner, { name: member?.name || assignedTo || 'Unassigned', count: 1 });
              });
              return (
              <button
                key={key}
                onClick={() => navigate('/tasks')}
                className={`min-h-24 flex flex-col items-stretch rounded-xl border p-2 text-left transition-colors hover:bg-[var(--bg-hover)] ${index === 0 ? 'border-orange-500/40 bg-orange-500/5' : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40'}`}
              >
                <span className="block text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  {date.toLocaleDateString('en-GB', { weekday: 'short' })}
                </span>
                <span className="block text-lg font-semibold mt-0.5">{date.getDate()}</span>
                <div className="space-y-2 mt-3" aria-label={`${dayTasks.length} open tasks and assignments`}>
                  {[...owners].map(([owner, { name, count }]) => (
                    <div key={owner} className="flex items-center gap-1.5 text-xs" title={`${name}: ${count} ${count === 1 ? 'task/assignment' : 'tasks/assignments'}`}>
                      <span className={`w-2 h-2 shrink-0 rounded-full ${owner === 'unassigned' ? 'bg-slate-400' : colorForMember(owner)}`} />
                      <span className="min-w-0 flex-1 break-words">{name}</span>
                      <span className="shrink-0 rounded-full bg-[var(--bg-hover)] px-1.5 py-0.5 font-semibold tabular-nums">{count}</span>
                    </div>
                  ))}
                </div>
              </button>
              );
            })}
          </div>
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
                  {user?.role === 'admin' && <button
                    type="button"
                    onClick={() => clearTask(task)}
                    className="p-2 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    aria-label={`Clear ${task.title}`}
                    title="Clear from dashboard"
                  >
                    Clear
                  </button>}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No tasks yet" />
          )}
          <div className="flex justify-end mt-4">{portfolioFilter === 'all' && user?.role === 'admin' && visibleRecentTasks.length > 0 && <button className="self-end rounded-full bg-red-600 px-4 py-2.5 text-xs text-white font-medium whitespace-nowrap" onClick={async () => { if (!await confirmAction('Clear all recent tasks from the dashboard? They will remain available in Team Calendar.', 'Clear Recent Tasks')) return; try { await api.post('/api/tasks/clear-recent', {ids:visibleRecentTasks.map(t=>t.id)}); setTasks(current => current.map(t => visibleRecentTasks.some(visible=>visible.id===t.id)?{ ...t, dashboard_dismissed_at: new Date().toISOString() }:t)); } catch (e) { alert(e instanceof Error ? e.message : 'Could not clear tasks'); } }}>Clear All</button>}</div>
        </Card>

        {/* My Properties Carousel */}
        <div>
          <SectionHeader title="My Properties" action={() => navigate('/properties')} actionLabel="View All" />
          {properties.length ? (
            <PropertyCarousel>
              {properties.map((prop) => (
                <GlassCard
                  key={prop.id}
                  onClick={() => navigate(`/properties/${prop.id}`)}
                  className="min-w-[280px] max-w-[280px] shrink-0 overflow-hidden"
                >
                  <img
                    src={getPropertyImage(prop.id, 400, 240, `${prop.address}, ${prop.postcode}`, prop.image_url, prop.landlord_name, prop.landlord_id, cardColours.get(prop.id))}
                    alt={prop.address}
                    className="h-36 w-full object-cover"
                    loading="lazy"
                    onError={event => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = getPropertyPlaceholder(prop.id, 400, 240, prop.landlord_name, prop.landlord_id, cardColours.get(prop.id));
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
            </PropertyCarousel>
          ) : (
            <EmptyState message="No properties found" />
          )}
        </div>
      </div>
    </Layout>
  );
}
