import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {ShieldCheck,Wrench,Trash2,Zap,Flame,House,X,ArrowRight} from 'lucide-react';
import {useApi} from '../hooks/useApi';
import {useAuth} from '../context/AuthContext';
import {useNotifications} from '../context/NotificationContext';
import {Select} from './ui';
import './DashboardWorkPanels.css';

export interface DashboardAlert {id:number;alert_key?:string;property_address:string;type:string;expiry_date:string;assigned_to?:string|number|null;task_id?:number;priority?:string}
interface Maintenance {id:number;description:string;property_address:string;status:string;priority:string;assigned_name?:string;assigned_to?:string|number|null}
const certificateTypes=['EICR','EPC','Gas Safety'];
export const isCertificateAlert=(alert:DashboardAlert)=>certificateTypes.includes(alert.type);
export default function DashboardWorkPanels({alerts,maintenance,teamMembers,onChanged}:{alerts:DashboardAlert[];maintenance:Maintenance[];teamMembers:{id:number;name:string}[];onChanged:()=>Promise<void>}){
 const navigate=useNavigate(),api=useApi(),{user}=useAuth(),{notify,confirmAction}=useNotifications();
 const [selected,setSelected]=useState<{key:string;title:string;address:string;detail:string;href:string;propertyHref?:string}|null>(null),[busy,setBusy]=useState(false);
 const [complianceOwner,setComplianceOwner]=useState('all'),[maintenanceOwner,setMaintenanceOwner]=useState('all'),[otherOwner,setOtherOwner]=useState('all');
 const ownerOptions=[{value:'all',label:'All Users'},{value:'unassigned',label:'Unassigned'},...teamMembers.map(m=>({value:String(m.id),label:m.name}))];
 const matchesOwner=(assigned:unknown,owner:string)=>owner==='all'||(owner==='unassigned'?!assigned:[owner,teamMembers.find(m=>String(m.id)===owner)?.name].includes(String(assigned||'')));
 const ownerFilter=(label:string,value:string,onChange:(value:string)=>void)=><Select compact hideLabel searchable className="work-owner-filter" dropdownMinWidth={240} dropdownClassName="work-owner-menu" label={label} value={value} onChange={onChange} options={ownerOptions}/>;
 const canClear=user?.role==='admin';
 const clear=async(key:string)=>{if(!await confirmAction('Clear this item from the dashboard? The record stays open and its history is kept.','Clear Dashboard Item'))return;setBusy(true);try{await api.post('/api/dashboard/clear-alerts',{keys:[key]});setSelected(null);await onChanged();notify('Cleared from the dashboard. The record stays open.','success');}catch(e){notify(e instanceof Error?e.message:'Could not clear this item','error');}finally{setBusy(false);}};
 const clearButton=(key:string,title:string)=>canClear&&<button className="clear work-clear" aria-label={'Clear '+title+' from dashboard'} title="Clear from dashboard" disabled={busy} onClick={()=>void clear(key)}><Trash2 size={16} aria-hidden="true"/></button>;
 const days=(date:string)=>Math.round((Date.parse(date.slice(0,10)+'T12:00:00')-Date.parse(new Date().toLocaleDateString('en-CA',{timeZone:'Europe/London'})+'T12:00:00'))/86400000);
 const certificates=alerts.filter(a=>isCertificateAlert(a)&&matchesOwner(a.assigned_to,complianceOwner)),allOther=alerts.filter(a=>!isCertificateAlert(a)),other=allOther.filter(a=>matchesOwner(a.assigned_to,otherOwner)),visibleMaintenance=maintenance.filter(m=>matchesOwner(m.assigned_to,maintenanceOwner));
 const alertRow=(a:DashboardAlert)=>{
  const left=days(a.expiry_date),date=new Date(a.expiry_date.slice(0,10)+'T12:00:00').toLocaleDateString('en-GB');
  const key=a.alert_key||[a.id,a.type,a.expiry_date.slice(0,10),a.priority||''].join(':');
  const item={key,title:isCertificateAlert(a)?a.type+' renewal':a.type,address:a.property_address,detail:'Due '+date,href:a.task_id?'/tasks/'+a.task_id:'/properties/'+a.id,propertyHref:'/properties/'+a.id};
  const Icon=a.type==='EICR'?Zap:a.type==='Gas Safety'?Flame:a.type==='EPC'?House:ShieldCheck;
  return <article key={key} className="work-row work-alert-row">
   <div className="work-description">
    <div className="work-alert-heading">
     <button onClick={()=>setSelected(item)} className="work-title work-certificate-title"><Icon size={15} aria-hidden="true"/>{a.type}</button>
     <time dateTime={a.expiry_date.slice(0,10)}>{date}</time>
     <span className={'work-due-badge '+(left<0?'overdue':left<=7?'due-soon':'upcoming')}>{left<0?(-left)+' days overdue':left===0?'Due today':left+' days left'}</span>
    </div>
    <p title={a.property_address}>{a.property_address}</p>
   </div>
   <div className="work-buttons"><button onClick={()=>setSelected(item)}>View <ArrowRight size={14} aria-hidden="true"/></button>{clearButton(key,item.title)}</div>
  </article>;
 };
 return <><div className="dashboard-work-pair"><section className="dashboard-work-panel"><header><div><h2><ShieldCheck size={18}/> Compliance <span>{certificates.length}</span></h2><p>EICR, EPC and Gas Safety Reports</p></div><div className="work-panel-controls">{ownerFilter("Filter compliance by user",complianceOwner,setComplianceOwner)}<button onClick={()=>navigate('/properties')}>View All →</button></div></header><div className="dashboard-work-list" tabIndex={0} aria-label="Compliance reminders">{certificates.length?certificates.map(alertRow):<p className="work-empty">{complianceOwner==='all'?'No certificates due for renewal.':'No certificate reminders for this user.'}</p>}</div></section>
 <section className="dashboard-work-panel"><header><div><h2><Wrench size={18}/> Maintenance <span>{visibleMaintenance.length}</span></h2><p>New and existing maintenance tasks</p></div><div className="work-panel-controls">{ownerFilter("Filter maintenance by user",maintenanceOwner,setMaintenanceOwner)}<button onClick={()=>navigate('/maintenance')}>View All →</button></div></header><div className="dashboard-work-list" tabIndex={0} aria-label="Maintenance requests">{visibleMaintenance.length?visibleMaintenance.map(m=>{const item={key:'maintenance:'+m.id,title:m.description,address:m.property_address,detail:m.status.replaceAll('_',' ')+' · '+(m.assigned_name||'Unassigned'),href:'/maintenance/'+m.id};return <article key={m.id} className="work-row"><div className="work-description"><button className="work-title" onClick={()=>setSelected(item)}>{m.description}</button><p>{m.property_address}</p><small>{m.status.replaceAll('_',' ')} · {m.assigned_name||'Unassigned'}</small></div><div className="work-buttons"><button onClick={()=>setSelected(item)}>View <ArrowRight size={14} aria-hidden="true"/></button>{clearButton(item.key,item.title)}</div></article>}):<p className="work-empty">{maintenanceOwner==='all'?'No open maintenance requests.':'No maintenance requests for this user.'}</p>}</div></section></div>
 {allOther.length>0&&<section className="dashboard-work-panel"><header><div><h2>Other Property Reminders <span>{other.length}</span></h2><p>Insurance, inventories and inspections</p></div>{ownerFilter("Filter other reminders by user",otherOwner,setOtherOwner)}</header><div className="dashboard-work-list" aria-label="Other property reminders">{other.length?other.map(alertRow):<p className="work-empty">No property reminders for this user.</p>}</div></section>}
 {selected&&<div className="work-backdrop" onClick={()=>!busy&&setSelected(null)}><section role="dialog" aria-modal="true" aria-label={selected.title} className="work-detail" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape'&&!busy)setSelected(null);}}><header><h2>{selected.title}</h2><button autoFocus aria-label="Close item preview" onClick={()=>setSelected(null)}><X size={20}/></button></header><p>{selected.address}</p><p>{selected.detail}</p><small>Clearing hides the dashboard item. It does not complete the work.</small><footer>{clearButton(selected.key,selected.title)}{selected.propertyHref&&<button onClick={()=>navigate(selected.propertyHref!)}>View Property</button>}<button className="primary" onClick={()=>navigate(selected.href)}>View Full Record →</button></footer></section></div>}</>;
}
