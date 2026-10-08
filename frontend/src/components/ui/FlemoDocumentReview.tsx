import {useState} from 'react';
import {useApi} from '../../hooks/useApi';
import {useAuth} from '../../context/AuthContext';
import {DatePicker} from './DatePicker';
export interface DocumentReview {
 id:string; status:string; warning?:string; categories:string[];
 targets:{key:string;entity_type:string;id:number;label:string}[];
 items:{upload_id:string;name:string;target_key:string;doc_type:string;summary:string;expiry_date:string;outcome:string;date_evidence:string;outcome_evidence:string;limitation:string;update_compliance:boolean}[];
}
export default function FlemoDocumentReview({review,onComplete}:{review:DocumentReview;onComplete:(text:string)=>void}){
 const api=useApi(),{token}=useAuth();const [items,setItems]=useState(review.items),[busy,setBusy]=useState(false),[done,setDone]=useState(review.status==='applied'),[error,setError]=useState(''),[search,setSearch]=useState('');
 const change=(index:number,patch:Partial<DocumentReview['items'][number]>)=>setItems(current=>current.map((item,i)=>i===index?{...item,...patch}:item));
 const source=async(id:string,name:string)=>{try{const r=await fetch(`${import.meta.env.VITE_API_URL||''}/api/ai/attachments/${id}`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw Error('The attachment is no longer available.');const url=URL.createObjectURL(await r.blob()),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError((e as Error).message);}};
 const apply=async()=>{setBusy(true);setError('');try{const result=await api.post(`/api/ai/document-reviews/${review.id}/apply`,{items});setDone(true);onComplete(result.text);for(const item of result.items)window.dispatchEvent(new CustomEvent('crm-activity-updated',{detail:{entityType:item.entity_type,entityId:item.entity_id}}));window.dispatchEvent(new Event('focus'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const field='w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-card)] px-2 py-2 text-xs';
 return <section aria-label="Review attached documents" className="mt-2 space-y-3 text-xs text-[var(--text-primary)]">
 <p>Check each record and document before saving. ID documents remain pending verification.</p>
 {review.warning&&<p className="text-amber-600">{review.warning} Choose the record and category below to continue manually.</p>}
 <input aria-label="Find a filing record" placeholder="Find a person or property…" value={search} onChange={e=>setSearch(e.target.value)} className={field}/>
 {items.map((item,index)=>{const selected=review.targets.find(t=>t.key===item.target_key),certificate=['EICR','EPC','Gas Safety Certificate'].includes(item.doc_type),canUpdate=selected?.entity_type==='property'&&certificate&&item.doc_type===review.items[index].doc_type&&(item.doc_type!=='EICR'||item.outcome==='satisfactory');return <fieldset disabled={busy||done} key={item.upload_id} className="rounded-xl border border-[var(--border-input)] p-3 space-y-2 min-w-0">
 <legend className="font-medium break-all">{item.name}</legend><button type="button" className="underline" onClick={()=>void source(item.upload_id,item.name)}>View original document</button>
 <p>{item.summary}</p><p className="text-[var(--text-muted)]">{item.limitation}</p>
 <label className="block">Save to<select aria-label={`Record for ${item.name}`} className={field} value={item.target_key} onChange={e=>change(index,{target_key:e.target.value,update_compliance:false})}><option value="">Choose a record…</option>{review.targets.filter(t=>t.key===item.target_key||t.label.toLowerCase().includes(search.toLowerCase())).map(t=><option key={t.key} value={t.key}>{t.label} · {t.entity_type.replace('_',' ')}</option>)}</select></label>
 <label className="block">Document category<select aria-label={`Category for ${item.name}`} className={field} value={item.doc_type} onChange={e=>change(index,{doc_type:e.target.value,update_compliance:false})}>{review.categories.map(c=><option key={c}>{c}</option>)}</select></label>
 {canUpdate&&<label className="flex items-start gap-2"><input type="checkbox" checked={item.update_compliance} onChange={e=>change(index,{update_compliance:e.target.checked})}/>Update the property’s compliance date and complete the old reminder</label>}
 {certificate&&item.doc_type==='EICR'&&item.outcome!=='satisfactory'&&<p className="text-amber-600">The overall result is {item.outcome}. This report can be filed for review; its reminder will stay open.</p>}
 {item.update_compliance&&<><DatePicker label="Next inspection / expiry date" value={item.expiry_date} onChange={expiry_date=>change(index,{expiry_date})}/><p className="text-[var(--text-secondary)]">{item.date_evidence}</p>{item.outcome_evidence&&<p>{item.outcome_evidence}</p>}</>}
 </fieldset>;})}
 {error&&<p role="alert" className="text-red-600">{error}</p>}
 <button onClick={()=>void apply()} disabled={busy||done||items.some(i=>!i.target_key||(i.update_compliance&&!i.expiry_date))} className="rounded-full bg-[#8f2e70] text-white px-4 py-2 disabled:opacity-50">{done?'Saved':busy?'Saving…':'Save reviewed documents'}</button>
 </section>;
}
