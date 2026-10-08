import {Building2,ChevronDown} from 'lucide-react';
import {useNotifications} from '../context/NotificationContext';
import {createPortal} from 'react-dom';
import {useState} from 'react';
import {Button,GlassCard,Input} from './ui';
import {useApi,invalidateCache} from '../hooks/useApi';
type Member={id:number;name:string;role:string;department?:string;is_active:number};
type Team={id:number;name:string;office_address?:string};
export default function DepartmentTeams({teams,users,onSaved}:{teams:Team[];users:Member[];onSaved:()=>Promise<void>}){
 const api=useApi();const {confirmAction}=useNotifications();const [open,setOpen]=useState(false),[editing,setEditing]=useState<number|null>(null),[name,setName]=useState(''),[officeAddress,setOfficeAddress]=useState(''),[members,setMembers]=useState<number[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const begin=(team?:Team)=>{setEditing(team?.id||null);setName(team?.name||'');setOfficeAddress(team?.office_address||'');setMembers(team?users.filter(u=>u.department===team.name).map(u=>u.id):[]);setError('');setOpen(true);};
 const save=async()=>{setBusy(true);setError('');try{const body={name,user_ids:members,office_address:officeAddress};if(editing)await api.put(`/api/departments/${editing}`,body);else await api.post('/api/departments',body);invalidateCache('/api/users');await onSaved();setOpen(false);}catch(e){setError(e instanceof Error?e.message:'Could not save team');}finally{setBusy(false);}};
 const remove=async()=>{if(!editing||!await confirmAction(`Delete ${name}? Members will become unassigned and keep their accounts and access roles.`))return;setBusy(true);setError('');try{await api.delete(`/api/departments/${editing}`);invalidateCache('/api/users');await onSaved();setOpen(false);}catch(e){setError(e instanceof Error?e.message:'Could not delete team');}finally{setBusy(false);}};
 const roles=[['admin','Administrators'],['manager','Managers'],['staff','Staff'],['viewer','Viewers']];
 const [expandedTeam,setExpandedTeam]=useState<number|null>(null);
 return <GlassCard className="p-5"><details><summary className="cursor-pointer font-semibold"><span className="inline-flex items-center gap-2"><Building2 size={18}/>Team View</span></summary><div className="space-y-4 mt-4"><div className="flex justify-end"><Button size="sm" onClick={()=>begin()}>Create Department/Team</Button></div>
 <div className="space-y-2">{[...teams,{id:0,name:'Unassigned'}].map(team=>{
   const list=users.filter(u=>u.is_active&&(team.id?u.department===team.name:!u.department));
   const expanded=expandedTeam===team.id;
   return <div key={team.id} className="rounded-xl border border-[var(--border-input)] overflow-hidden">
     <div className="flex items-center gap-2 pr-3">
       <button type="button" aria-expanded={expanded} aria-controls={`team-members-${team.id}`} onClick={()=>setExpandedTeam(expanded?null:team.id)} className="flex flex-1 min-w-0 items-center gap-3 p-4 text-left hover:bg-[var(--bg-hover)] transition-colors">
         <ChevronDown size={16} className={`shrink-0 text-[var(--text-muted)] transition-transform ${expanded?'':'-rotate-90'}`}/>
         <span className="flex-1 min-w-0 font-medium break-words">{team.name}</span>
         <span className="shrink-0 text-xs text-[var(--text-muted)]">{list.length} {list.length===1?'member':'members'}</span>
       </button>
       {!!team.id&&<Button size="sm" variant="outline" className="shrink-0" onClick={()=>begin(team)}>Edit Team</Button>}
     </div>
     <div id={`team-members-${team.id}`} hidden={!expanded} className="border-t border-[var(--border-subtle)] px-4 py-2 bg-[var(--bg-subtle)]">
       {roles.flatMap(([role])=>list.filter(member=>member.role===role)).map(member=><div key={member.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span>{member.name}</span><span className="text-xs text-[var(--text-muted)]">{({admin:'Administrator',manager:'Manager',staff:'Staff',viewer:'Viewer'} as Record<string,string>)[member.role]}</span></div>)}
       {!list.length&&<p className="py-2 text-sm text-[var(--text-muted)]">No active members</p>}
     </div>
   </div>;
 })}</div></div></details>
 {open&&createPortal(<div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"><div role="dialog" aria-modal="true" aria-label="Department / Team" className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-auto space-y-4"><h2 className="font-semibold">{editing?'Edit Department/Team':'Create Department/Team'}</h2><Input label="Team Name" value={name} onChange={setName}/><Input label="Office Address (optional)" value={officeAddress} onChange={setOfficeAddress}/><p className="text-xs text-[var(--text-muted)]">Add an address to offer this office as a handover location.</p><fieldset><legend className="text-sm mb-2">Assign Existing Users</legend>{users.filter(u=>u.is_active||members.includes(u.id)).map(u=><label key={u.id} className="flex gap-2 items-center py-2 text-sm"><input type="checkbox" checked={members.includes(u.id)} onChange={e=>setMembers(e.target.checked?[...members,u.id]:members.filter(id=>id!==u.id))}/>{u.name}{u.department&&u.department!==name?` · currently ${u.department}`:''}</label>)}</fieldset><p className="text-xs text-[var(--text-muted)]">Each user belongs to one department. Assigning someone moves their team membership; their access role stays the same.</p>{error&&<p role="alert" className="text-red-500">{error}</p>}<div className="flex flex-wrap justify-end gap-2">{editing&&<Button variant="outline" className="mr-auto !text-red-600" disabled={busy} onClick={()=>void remove()}>Delete Team</Button>}<Button variant="ghost" disabled={busy} onClick={()=>setOpen(false)}>Cancel</Button><Button disabled={busy||!name.trim()} onClick={()=>void save()}>Save Team</Button></div></div></div>,document.body)}
 </GlassCard>;
}
