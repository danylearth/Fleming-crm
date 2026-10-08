import {createPortal} from 'react-dom';
import {useRef,useState} from 'react';
import {BellRing,Mail,X} from 'lucide-react';
import {Button,Input} from './ui';
import DeliveryChoices from './ui/DeliveryChoices';
import {useApi} from '../hooks/useApi';
import {useNotifications} from '../context/NotificationContext';
import {emailTemplateFields,fillTemplate,fieldLabel} from '../utils/emailTemplates';
type Recipient={id:number;name:string;email:string;phone:string;subject?:string;html?:string;sms?:string};
type Template={id:string;label:string;subject?:string;html?:string;sms?:string;recipients?:Recipient[]};
export default function TenantMessageTemplates({tenantId,onSent,rentPaymentId}:{tenantId:number;onSent:()=>void;rentPaymentId?:number}){
 const api=useApi();const {confirmAction}=useNotifications();
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[channel,setChannel]=useState<'email'|'sms'>('email'),[chosen,setChosen]=useState(''),[values,setValues]=useState<Record<string,string>>({});
 const sending=useRef(false); const [choices,setChoices]=useState<Record<number,{email:boolean;sms:boolean}>>({}); const [previewRecipient,setPreviewRecipient]=useState(0),[sent,setSent]=useState<string[]>([]);
 const [data,setData]=useState<{email:string;phone:string;templates:Template[];smsTemplates:Template[]}>({email:'',phone:'',templates:[],smsTemplates:[]});
 const list=[...data.templates,...data.smsTemplates.filter(t=>!data.templates.some(e=>e.id===t.id))],template=list.find(t=>t.id===chosen);
 const recipients=template?.recipients||[{...template,id:tenantId,name:'Tenant',email:data.email,phone:data.phone}];
 const selection=(r:Recipient)=>choices[r.id]||{email:Boolean(r.html&&r.email),sms:Boolean(!r.html&&r.sms&&r.phone)};
 const pending=(r:Recipient)=>(['email','sms'] as const).filter(c=>selection(r)[c]&&!sent.includes(`${r.id}:${c}`));
 const preview=recipients[previewRecipient]||recipients[0],fields=emailTemplateFields(preview?.html||''),html=fillTemplate(preview?.html||'',values);
 const load=async()=>{setBusy(true);setError('');try{const result=await api.get(`/api/tenants/${tenantId}/message-templates?at=${Date.now()}${rentPaymentId?'&rent_payment_id='+rentPaymentId:''}`);setData(result);setChannel('email');setChosen(result.templates[0]?.id||result.smsTemplates[0]?.id||'');setValues({});setSent([]);setPreviewRecipient(0);setChoices({});setOpen(true);}catch(e){setError(String(e));}finally{setBusy(false);}};
 const send=async(targets:Recipient[])=>{if(!template||sending.current)return;const queue=targets.flatMap(r=>pending(r).map(c=>({r,c})));if(!queue.length)return;sending.current=true;setBusy(true);
  try{if(!await confirmAction(`Send this ${rentPaymentId?'rent reminder':'communication'} to ${targets.map(r=>r.name).join(' and ')} using their selected channels?`))return;
   setError('');const completed=[...sent],failures:string[]=[];
   for(const {r,c} of queue){const contact=c==='email'?r.email:r.phone;
    if(!contact){failures.push(`${r.name}: no ${c==='email'?'email address':'mobile number'} recorded.`);continue;}
    try{if(c==='email')await api.post('/api/email/send-generic',{entity_type:'tenant',entity_id:r.id,to_email:contact,subject:r.subject,body_html:fillTemplate(r.html||'',values)});else await api.post('/api/sms/send',{entity_type:'tenant',entity_id:r.id,to_phone:contact,message_body:r.sms});completed.push(`${r.id}:${c}`);setSent([...completed]);}
    catch(e){failures.push(`${r.name} (${c.toUpperCase()}): ${e instanceof Error?e.message:'Sending could not be confirmed. Check communications before retrying.'}`);}
   }
   onSent();if(failures.length)setError(failures.join('\n'));
  }finally{sending.current=false;setBusy(false);window.dispatchEvent(new Event('fleming:delivery-updated'));}
 };
 const choose=(id:string)=>{const t=list.find(t=>t.id===id);setChosen(id);setValues({});setSent([]);setError('');setPreviewRecipient(0);setChoices({});setChannel(t?.html?'email':'sms');};
 return <><Button size="sm" variant="outline" className="gap-2 !bg-purple-500/10 !text-[var(--feedback-purple)] !border-purple-500/20" disabled={busy} onClick={()=>void load()}>{rentPaymentId?<BellRing size={14}/>:<Mail size={14}/>} {rentPaymentId?'Send Reminder':'Send Template'}</Button>{error&&!open&&<p role="alert">{error}</p>}{open&&createPortal(
 <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-3 sm:p-5"><div role="dialog" aria-modal="true" aria-label={rentPaymentId?'Send Rent Reminder':'Send template'} className="bg-[var(--bg-card)] text-[var(--text-primary)] rounded-2xl w-full max-w-6xl max-h-[92dvh] flex flex-col overflow-hidden">
 <header className="flex items-center justify-between gap-3 p-5 border-b border-[var(--border-subtle)]"><div><h2 className="font-semibold text-lg">{rentPaymentId?'Send Rent Reminder':'Send Template'}</h2><p className="text-sm text-[var(--text-secondary)] mt-1">{recipients.length>1?'Joint tenancy · a personalised message will be sent to each tenant.':'Review the message and choose how to send it.'}</p></div><button aria-label="Close reminder" disabled={busy} className="p-2 rounded-full border border-[var(--border-input)]" onClick={()=>setOpen(false)}><X size={18}/></button></header>
 <div className="grid lg:grid-cols-[minmax(0,1fr)_290px] gap-5 p-5 min-h-0 overflow-y-auto">
 <main className="min-w-0 space-y-3">{list.length>1&&<label className="block text-sm">Template<select disabled={busy} className="block w-full rounded-xl border border-[var(--border-input)] bg-[var(--bg-input)] p-3 mt-1" value={chosen} onChange={e=>choose(e.target.value)}>{list.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>}
 <div className="flex flex-wrap justify-between items-center gap-2"><h3 className="font-semibold">{channel==='email'?'Email Preview':'SMS Preview'}</h3>{recipients.length>1&&<div className="flex flex-wrap gap-2" aria-label="Preview recipient">{recipients.map((r,i)=><button key={r.id} aria-pressed={i===previewRecipient} className={`px-3 py-1.5 rounded-full border text-sm ${i===previewRecipient?'border-purple-500 bg-purple-500/10':'border-[var(--border-input)]'}`} onClick={()=>setPreviewRecipient(i)}>{r.name}</button>)}</div>}</div>
 {template&&(channel==='email'?<><div className="grid sm:grid-cols-2 gap-3">{fields.map(f=><Input key={f} label={fieldLabel(f)} value={values[f]||''} onChange={v=>setValues(current=>({...current,[f]:v}))}/>)}</div><iframe title="Email preview" sandbox="" srcDoc={html} className="w-full h-[min(56dvh,580px)] min-h-[280px] bg-white rounded-xl border border-[var(--border-input)]"/></>:<div className="rounded-xl border border-[var(--border-input)] bg-[var(--bg-subtle)] p-5"><p className="text-xs text-[var(--text-muted)] mb-3">To: {preview.phone||'No mobile number recorded'}</p><p className="text-sm whitespace-pre-wrap leading-7">{preview.sms}</p></div>)}
 </main>
 <aside className="onboarding-actions self-start rounded-xl border border-[var(--border-input)] bg-[var(--bg-subtle)] p-3 space-y-3 [&_button]:!text-sm [&_button]:!leading-5" aria-label="Actions and previews"><h3 className="font-semibold">Actions &amp; Previews</h3>
 {recipients.map((r,i)=>{const selected=selection(r),remaining=pending(r);return <section key={r.id} aria-label={`Person ${i+1}: ${r.name}`} className="rounded-xl border border-[var(--border-input)] bg-[var(--bg-card)] p-3 space-y-3">
 <div className="text-sm min-w-0"><p className="text-[var(--text-secondary)]">Person {i+1}</p><h4 className="font-semibold mt-1">{r.name}</h4><p className="break-all text-[var(--text-secondary)]">{r.email||'No email address recorded'}</p><p className="text-[var(--text-secondary)]">{r.phone||'No mobile number recorded'}</p></div>
 <DeliveryChoices email={selected.email} sms={selected.sms} onEmail={v=>{if(r.html&&r.email&&!sent.includes(r.id+':email'))setChoices(c=>({...c,[r.id]:{...selected,email:v}}));}} onSms={v=>{if(r.sms&&r.phone&&!sent.includes(r.id+':sms'))setChoices(c=>({...c,[r.id]:{...selected,sms:v}}));}} previewEmail={()=>{setPreviewRecipient(i);setChannel('email');}} previewSms={()=>{setPreviewRecipient(i);setChannel('sms');}} disabled={busy}/>
 {sent.some(k=>k.startsWith(r.id+':'))&&<p role="status" className="text-sm text-emerald-700">Sent: {sent.filter(k=>k.startsWith(r.id+':')).map(k=>k.split(':')[1].toUpperCase()).join(', ')}</p>}
 <Button size="sm" variant="gradient" className="w-full" disabled={busy||!remaining.length||(remaining.includes('email')&&emailTemplateFields(r.html||'').some(f=>!values[f]?.trim()))} onClick={()=>void send([r])}>{busy?'Sending…':remaining.length?(rentPaymentId?'Send Reminder':'Send Message'):sent.some(k=>k.startsWith(r.id+':'))?'Sent':'Choose a Channel'}</Button>
 </section>;})}
 {recipients.length>1&&<Button size="sm" variant="gradient" className="w-full" disabled={busy||!recipients.some(r=>pending(r).length)||recipients.some(r=>pending(r).includes('email')&&emailTemplateFields(r.html||'').some(f=>!values[f]?.trim()))} onClick={()=>void send(recipients)}>Send Selected Reminders</Button>}
 <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={()=>setOpen(false)}>{sent.length?'Done':'Cancel'}</Button>
 {error&&<p role="alert" className="text-sm text-red-600 whitespace-pre-wrap">{error}</p>}

 </aside></div></div></div>,document.body)}</>;
}
