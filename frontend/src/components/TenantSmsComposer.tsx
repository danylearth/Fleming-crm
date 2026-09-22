import {useState} from 'react';
import {Phone,Send} from 'lucide-react';
import {GlassCard,SectionHeader,Button} from './ui';
import {useApi} from '../hooks/useApi';
import {calculateSmsSegments} from '../utils/sms';
export default function TenantSmsComposer({tenantId,phone,onSent}:{tenantId:number;phone?:string;onSent:()=>void}){
 const api=useApi();const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const send=async()=>{if(busy||!phone||!message.trim())return;setBusy(true);setError('');try{await api.post('/api/sms/send',{entity_type:'tenant',entity_id:tenantId,to_phone:phone,message_body:message.trim()});setMessage('');onSent();}catch(e){setError(e instanceof Error?e.message:'SMS could not be sent');}finally{setBusy(false);}};
 const segments=calculateSmsSegments(message);
 return <GlassCard className="p-6"><SectionHeader title="Send SMS" icon={<Phone size={16}/>}/>{phone?<><div className="flex flex-wrap gap-2"><textarea aria-label="SMS message" placeholder={`Send SMS to ${phone}...`} value={message} onChange={e=>setMessage(e.target.value)} rows={2} className="min-w-0 flex-1 rounded-xl border border-[var(--border-input)] bg-[var(--bg-input)] p-3 text-sm"/><Button variant="gradient" disabled={busy||!message.trim()} onClick={()=>void send()} className="gap-2"><Send size={14}/>{busy?'Sending…':'Send SMS'}</Button></div>{message&&<p className="text-xs mt-2 text-[var(--text-muted)]">{segments.charCount} chars · {segments.segments} segments · {segments.encoding}</p>}</>:<p className="text-sm text-[var(--text-muted)]">Add a phone number in Personal Information to send SMS.</p>}{error&&<p role="alert" className="text-sm text-red-600 mt-2">{error}</p>}</GlassCard>;
}
