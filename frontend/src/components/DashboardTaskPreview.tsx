import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {ArrowRight,CheckCircle2,RotateCcw,UserPlus,X} from 'lucide-react';
import {Button,Select} from './ui';
import {useApi} from '../hooks/useApi';

interface PreviewTask {
  id:number;title:string;description:string;status:string;priority:string;
  due_date:string;property_address?:string;assigned_to?:string;entity_type?:string;
}
export default function DashboardTaskPreview({task,members,onClose,onUpdated,onClear}:{
  task:PreviewTask;members:{id:number;name:string}[];onClose:()=>void;onUpdated:(task:PreviewTask)=>void;onClear?:()=>void;
}) {
  const api=useApi(),navigate=useNavigate();
  const [assigning,setAssigning]=useState(false),[assignee,setAssignee]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy)onClose();};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[onClose,busy]);
  const update=async(changes:{status?:string;assigned_to?:string|null})=>{
    setBusy(true);setError('');
    try{const saved=await api.put(`/api/tasks/${task.id}`,changes);onUpdated({...task,...saved});setAssigning(false);}
    catch(e){setError(e instanceof Error?e.message:'Could not update this task. Please try again.');}
    finally{setBusy(false);}
  };
  const closed=task.status==='completed';
  const assignedName=members.find(m=>String(m.id)===String(task.assigned_to))?.name||task.assigned_to||(task.entity_type==='maintenance'?'Maintenance':'Unassigned');
  return <div role="dialog" aria-modal="true" aria-labelledby="task-detail-title" className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-4" onClick={()=>!busy&&onClose()}>
    <div className="w-full max-w-2xl max-h-[90vh] overflow-auto rounded-2xl bg-[var(--bg-card)] p-6" onClick={e=>e.stopPropagation()}>
      <div className="flex items-start justify-between gap-4"><h2 id="task-detail-title" className="font-semibold text-lg">{task.title}</h2><button aria-label="Close preview" disabled={busy} onClick={onClose} className="shrink-0 p-1"><X size={20}/></button></div>
      <div className="space-y-3 py-5 text-sm"><p className="whitespace-pre-wrap">{task.description||'No description'}</p>{task.property_address&&<p>{task.property_address}</p>}<p>Assigned To: {assignedName}</p><p className="capitalize">{task.status.replaceAll('_',' ')} · {task.priority} Priority</p><p>Due: {task.due_date?new Date(task.due_date).toLocaleDateString('en-GB'):'Not Set'}</p></div>
      {error&&<p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="border-t border-[var(--border-subtle)] pt-4 space-y-4">
        {assigning&&<div className="ml-auto max-w-sm space-y-3"><Select label="Assign To" value={assignee} onChange={setAssignee} disabled={busy} options={[{value:'',label:'Unassigned'},...members.map(m=>({value:String(m.id),label:m.name}))]}/><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={()=>setAssigning(false)}>Cancel</Button><Button disabled={busy} onClick={()=>void update({assigned_to:assignee||null})}>Save Assignment</Button></div></div>}
        <div className="flex flex-wrap justify-end gap-2">
          {onClear&&<Button variant="outline" disabled={busy} onClick={onClear}>Clear</Button>}
          <Button className="gap-2" variant="outline" disabled={busy} onClick={()=>{setAssignee(String(members.find(m=>String(m.id)===String(task.assigned_to)||m.name===task.assigned_to)?.id||''));setAssigning(!assigning);setError('');}}><UserPlus size={16}/>Assign Task</Button>
          <Button className={`gap-2 ${closed?'':'!bg-red-600 !text-white !border-red-600 hover:!bg-red-700'}`} variant="outline" disabled={busy} onClick={()=>void update({status:closed?'pending':'completed'})}>{closed?<RotateCcw size={16}/>:<CheckCircle2 size={16}/>} {closed?'Reopen Task':'Close Task'}</Button>
          <Button className="gap-2" disabled={busy} onClick={()=>navigate(`/tasks/${task.id}`)}><ArrowRight size={16}/>Open Task</Button>
        </div>
      </div>
    </div>
  </div>;
}
