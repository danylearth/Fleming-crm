import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button, Input, DatePicker, Select } from './index';
import { useApi, invalidateCache } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
interface Review { id: number; old_rent: number; new_rent: number; effective_date: string; notice_served_date: string; notice_document_id: number; notice_name: string; service_method: string; notes: string; status: string; status_reason?: string; created_by: string }
export default function RentReviewModal({ tenantId, currentRent, linkedName, canEdit, onClose, onSaved }: { tenantId: number; currentRent?: number; linkedName?: string; canEdit: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const api = useApi(), { token } = useAuth();
  const [reviews,setReviews] = useState<Review[]>([]), [loading,setLoading] = useState(true), [editing,setEditing] = useState(false);
  const [rent,setRent] = useState(''), [served,setServed] = useState(''), [effective,setEffective] = useState(''), [last,setLast] = useState(''), [method,setMethod] = useState('in_person'), [notes,setNotes] = useState(''), [confirmed,setConfirmed] = useState(false);
  const [file,setFile] = useState<File | null>(null), [documentId,setDocumentId] = useState<number | null>(null), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const [changing,setChanging] = useState<{ id: number; status: string } | null>(null), [reason,setReason] = useState(''), [resumeConfirmed,setResumeConfirmed] = useState(false);
  useEffect(()=>{let active=true; api.get(`/api/tenants/${tenantId}/rent-reviews`).then(r=>{if(active){setReviews(r);setLoading(false);}}).catch(e=>{if(active){setError(e.message);setLoading(false);}}); return ()=>{active=false;};},[api,tenantId]);
  const refresh = async()=>{setReviews(await api.get(`/api/tenants/${tenantId}/rent-reviews`));await onSaved();};
  const save = async()=>{
    setBusy(true);setError('');
    try {
      let noticeId = documentId;
      if (!noticeId && file) {
        const data = new FormData(); data.append('file',file);data.append('doc_type','Section 13 — Form 4A rent increase notice');
        const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/documents/tenant/${tenantId}`, {method:'POST',headers:{Authorization:`Bearer ${token}`},body:data});
        const result = await res.json();if(!res.ok)throw new Error(result.error || 'Notice upload failed');noticeId=result.id;setDocumentId(result.id);invalidateCache('/api/documents');
      }
      await api.post(`/api/tenants/${tenantId}/rent-reviews`,{new_rent:Number(rent),notice_document_id:noticeId,notice_served_date:served,effective_date:effective,last_increase_date:last || null,service_method:method,notes,confirmed});
      setEditing(false);setDocumentId(null);setFile(null);await refresh();
    } catch(e){setError(e instanceof Error ? e.message : 'Rent increase could not be saved');} finally {setBusy(false);}
  };
  const changeStatus = async()=>{if(!changing)return;setBusy(true);setError('');try{await api.patch(`/api/rent-reviews/${changing.id}`,{status:changing.status,reason,confirmed:resumeConfirmed});setChanging(null);setReason('');setResumeConfirmed(false);await refresh();}catch(e){setError(e instanceof Error ? e.message : 'Status could not be saved');}finally{setBusy(false);}};
  const downloadNotice = async(review: Review)=>{setError('');try{const res=await fetch(`${import.meta.env.VITE_API_URL || ''}/api/documents/download/${review.notice_document_id}`,{headers:{Authorization:`Bearer ${token}`}});if(!res.ok)throw new Error('Notice could not be downloaded');const url=URL.createObjectURL(await res.blob()),a=document.createElement('a');a.href=url;a.download=review.notice_name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}catch(e){setError(e instanceof Error?e.message:'Download failed');}};
  const pending=reviews.some(r=>['scheduled','paused'].includes(r.status));
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="rent-review-title"><div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--bg-card)] p-6 space-y-4">
    <div className="flex justify-between"><h2 id="rent-review-title" className="text-lg font-semibold">Rent Review</h2><button disabled={busy} onClick={onClose} aria-label="Close rent review"><X size={20}/></button></div>
    <p className="text-sm text-[var(--text-secondary)]">For monthly assured tenancies in England: use Section 13 Form 4A, allow at least two months after service and 12 months between increases. The effective date must begin a tenancy period. No new tenancy agreement is created.</p>
    <div className="flex flex-wrap gap-4 text-sm text-[var(--accent-orange)]"><a href="https://assets.publishing.service.gov.uk/media/69eb2022606c20d412163366/Form_4A.pdf" target="_blank" rel="noopener noreferrer" className="underline">Download Form 4A</a><a href="https://www.gov.uk/assured-periodic-tenancies-tenants/rent-increases" target="_blank" rel="noopener noreferrer" className="underline">Section 13 guidance</a></div>
    <p className="text-xs text-[var(--text-muted)]">Form 4A is signed by the landlord or agent. Record service evidence; a tenant signature is not a requirement of the notice. Pause the increase if it is challenged or delayed. This screen records a notice you have already served.</p>
    {linkedName && <p className="text-sm">This records one rent for both linked tenants, including {linkedName}.</p>}
    {loading ? <p>Loading rent history…</p> : <>
      {canEdit && !pending && !editing && <Button variant="gradient" onClick={()=>setEditing(true)}>Rent increase agreed</Button>}
      {editing && <div className="space-y-4 border border-[var(--border-input)] rounded-xl p-4"><h3 className="font-semibold">Record agreed increase</h3><p className="text-sm">Current monthly rent: £{Number(currentRent || 0).toLocaleString('en-GB')}</p>
        <Input label="New monthly rent (£)" type="number" value={rent} onChange={setRent}/>
        <div className="grid sm:grid-cols-2 gap-4"><DatePicker label="Date notice was served" value={served} onChange={setServed}/><DatePicker label="New rent effective date" value={effective} onChange={setEffective}/></div>
        <DatePicker label="Previous rent increase date (leave blank if none)" value={last} onChange={setLast}/>
        <Select label="Service method" value={method} onChange={setMethod} options={[{value:'in_person',label:'In person'},{value:'post',label:'Post'},{value:'email',label:'Email — permitted by tenancy agreement'},{value:'other_agreed',label:'Other method permitted by tenancy agreement'}]}/>
        <label className="block text-sm">Completed, landlord/agent-signed Form 4A (PDF)<input className="block w-full mt-2 text-sm" type="file" accept="application/pdf,.pdf" onChange={e=>{setFile(e.target.files?.[0] || null);setDocumentId(null);}}/></label>
        {documentId && <p className="text-xs text-green-400">Notice uploaded. Correct any fields below and retry without uploading again.</p>}
        <label className="block text-sm">Service evidence, tenant acknowledgement and internal notes<textarea value={notes} onChange={e=>setNotes(e.target.value)} maxLength={10000} rows={3} className="block mt-2 w-full rounded-xl bg-[var(--bg-input)] border border-[var(--border-input)] p-3" placeholder="Record how service is evidenced and any acknowledgement or agreement from the tenant."/></label>
        <label className="flex gap-2 text-xs leading-5"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I have checked the monthly tenancy, previous rent increases, landlord approval and valid service of Form 4A on all tenants. There is no outstanding challenge or agreement to delay this increase.</span></label>
        <div className="flex gap-3"><Button disabled={busy || !confirmed || !rent || !served || !effective || !notes.trim() || (!file && !documentId)} onClick={save}>{busy?'Saving…':'Schedule rent increase'}</Button><Button variant="ghost" disabled={busy} onClick={()=>setEditing(false)}>Cancel</Button></div>
      </div>}
      {reviews.length>0 && <h3 className="font-semibold">Rent increase history</h3>}
      {reviews.map(r=><div key={r.id} className="p-4 border border-[var(--border-input)] rounded-xl space-y-2 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>£{Number(r.old_rent).toLocaleString('en-GB')} → £{Number(r.new_rent).toLocaleString('en-GB')} / month</strong><span className="capitalize">{r.status}</span></div><p>Effective {new Date(r.effective_date).toLocaleDateString('en-GB')} · Served {new Date(r.notice_served_date).toLocaleDateString('en-GB')}</p><p className="text-xs text-[var(--text-muted)] break-words whitespace-pre-wrap">{r.notes}</p>{r.status_reason&&<p className="text-orange-400 text-xs">{r.status_reason}</p>}<button className="underline text-[var(--accent-orange)]" onClick={()=>downloadNotice(r)}>Download notice</button>
        {canEdit&&['scheduled','paused'].includes(r.status)&&<div className="flex flex-wrap gap-2">{[r.status==='scheduled'?'paused':'scheduled','cancelled'].map(status=><Button key={status} size="sm" variant="outline" disabled={busy} onClick={()=>{setChanging({id:r.id,status});setReason('');setResumeConfirmed(false);}}>{status==='paused'?'Pause / challenge':status==='scheduled'?'Resume':'Cancel increase'}</Button>)}</div>}
        {changing?.id===r.id&&<div className="space-y-2"><Input label="Reason for status change" value={reason} onChange={setReason}/>{changing.status==='scheduled'&&<label className="flex gap-2 text-xs"><input type="checkbox" checked={resumeConfirmed} onChange={e=>setResumeConfirmed(e.target.checked)}/>The original notice and effective date remain valid and no challenge is outstanding.</label>}<Button size="sm" disabled={busy||!reason.trim()||(changing.status==='scheduled'&&!resumeConfirmed)} onClick={changeStatus}>Save status</Button></div>}
      </div>)}
    </>}{error&&<p role="alert" className="text-sm text-red-400">{error}</p>}
  </div></div>;
}
