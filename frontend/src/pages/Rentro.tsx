import {useCallback,useEffect,useState} from 'react';
import Layout from '../components/Layout';
import {GlassCard,Button,Input,EmptyState} from '../components/ui';
import {useApi} from '../hooks/useApi';
import {useAuth} from '../context/AuthContext';
import {apiUrl} from '../utils/apiResponse';
import {Check,X,FileText,Home,UserCheck,Mail} from 'lucide-react';

// Rentro back office: decisions customers are waiting on. Ownership claims (uploaded evidence, and
// addresses already on Fleming's records), sign-ups that match an existing landlord, and the pilot allowlist.
type Claim={id:number;kind:'evidence'|'existing_address';claimed_role:string;created_at:string;account_name:string;account_email:string;landlord_id:number;landlord_name:string;
 property_id:number|null;address:string|null;postcode:string|null;duplicate_of_property_id:number|null;duplicate_address:string|null;duplicate_postcode:string|null;duplicate_owner:string|null;
 document_id:number|null;doc_type:string|null;original_name:string|null;submitted_address:{address:string;postcode:string}};
type Account={id:string;name:string;email:string;status:string;created_at:string;roles:{role:string;status:string;landlord_id:number|null}[];matching_landlords:{id:number;name:string}[]|null};
type Allowed={email:string;note:string|null;created_at:string;added_by:string|null};
const tabs=[{key:'ownership',label:'Ownership',icon:Home},{key:'accounts',label:'Accounts',icon:UserCheck},{key:'allowlist',label:'Pilot allowlist',icon:Mail}] as const;
const role=(r:string)=>r.replace('_',' ');
const when=(d:string)=>new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});

export default function Rentro(){
 const api=useApi(),{token}=useAuth();
 const [tab,setTab]=useState<(typeof tabs)[number]['key']>('ownership');
 const [claims,setClaims]=useState<Claim[]>([]),[accounts,setAccounts]=useState<Account[]>([]),[allowlist,setAllowlist]=useState<Allowed[]>([]);
 const [notes,setNotes]=useState<Record<number,string>>({}),[email,setEmail]=useState(''),[note,setNote]=useState('');
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const load=useCallback(async()=>{try{const [c,a,w]=await Promise.all([api.get('/api/rentro-admin/ownership'),api.get('/api/rentro-admin/accounts'),api.get('/api/rentro-admin/allowlist')]);setClaims(c);setAccounts(a);setAllowlist(w);}catch(e){setError(e instanceof Error?e.message:'Rentro could not be loaded');}finally{setLoading(false);}},[api]);
 useEffect(()=>{void load();},[load]);
 const act=async(work:()=>Promise<unknown>,done:string)=>{setBusy(true);setError('');setMessage('');try{await work();setMessage(done);await load();}catch(e){setError(e instanceof Error?e.message:'That did not work');}finally{setBusy(false);}};
 const decide=(c:Claim,decision:'verified'|'rejected')=>act(()=>api.post(`/api/rentro-admin/ownership/${c.id}/decision`,{decision,notes:notes[c.id]||''}),decision==='verified'?'Ownership verified. The landlord sees it as Approved.':'Rejected. The landlord sees your note and can upload again.');
 const view=async(id:number)=>{setError('');try{const res=await fetch(apiUrl(`/api/rentro-admin/documents/${id}/file`),{headers:{Authorization:`Bearer ${token}`}});if(!res.ok)throw new Error((await res.json().catch(()=>({}))).error||'The file could not be opened');window.open(URL.createObjectURL(await res.blob()),'_blank','noopener');}catch(e){setError(e instanceof Error?e.message:'The file could not be opened');}};
 const pending=accounts.filter(a=>a.roles.some(r=>r.status==='pending_link'));
 return <Layout title="Rentro" breadcrumb={[{label:'Rentro'}]}><div className="p-4 md:p-8 space-y-6">
  <div className="flex flex-wrap gap-2">{tabs.map(t=>{const Icon=t.icon;const count=t.key==='ownership'?claims.length:t.key==='accounts'?pending.length:0;return <Button key={t.key} size="sm" variant={tab===t.key?'primary':'ghost'} onClick={()=>setTab(t.key)}><Icon size={14}/>{t.label}{count>0&&<span className="ml-1 rounded-full bg-[var(--accent-orange,#d9731c)] text-white px-2 text-[11px]">{count}</span>}</Button>;})}</div>
  {error&&<p role="alert" className="text-red-500">{error}</p>}{message&&<p role="status" className="text-emerald-500">{message}</p>}
  {loading?<p>Loading…</p>:<>
  {tab==='ownership'&&(claims.length===0?<EmptyState message="No ownership claims are waiting for review."/>:<div className="space-y-4">{claims.map(c=><GlassCard key={c.id} className="p-5 space-y-3">
   <div className="flex flex-wrap justify-between gap-3"><div><p className="font-semibold">{c.kind==='evidence'?`${c.address}, ${c.postcode}`:`${c.submitted_address.address}, ${c.submitted_address.postcode}`}</p>
    <p className="text-sm text-[var(--text-muted)]">{c.account_name} ({c.account_email}) says they are the {role(c.claimed_role)} · {when(c.created_at)}</p></div>
    <span className="text-xs rounded-full px-3 py-1 h-fit bg-[var(--bg-hover)]">{c.kind==='evidence'?'Proof of ownership':'Address already on Fleming’s records'}</span></div>
   {c.kind==='existing_address'&&<p className="text-sm">Matches <a className="underline" href={`/properties/${c.duplicate_of_property_id}`}>{c.duplicate_address}, {c.duplicate_postcode}</a>{c.duplicate_owner?`, owned by ${c.duplicate_owner} on Fleming’s records`:''}. Verifying links {c.landlord_name} to that property as a co-owner. Confirm with the owner on record first.</p>}
   {c.document_id&&<Button size="sm" variant="outline" onClick={()=>view(c.document_id!)}><FileText size={14}/>Open {c.doc_type}: {c.original_name}</Button>}
   <Input label="Note to the landlord (needed to reject)" value={notes[c.id]||''} onChange={v=>setNotes(n=>({...n,[c.id]:v}))} placeholder="e.g. The name on the title doesn’t match your account"/>
   <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={()=>decide(c,'verified')}><Check size={14}/>Verify</Button><Button size="sm" variant="outline" disabled={busy||!(notes[c.id]||'').trim()} onClick={()=>decide(c,'rejected')}><X size={14}/>Reject</Button></div>
  </GlassCard>)}</div>)}
  {tab==='accounts'&&<GlassCard className="p-0 overflow-hidden">{accounts.length===0?<div className="p-6"><EmptyState message="No Rentro accounts yet."/></div>:<table className="w-full text-sm"><thead><tr className="text-left text-[var(--text-muted)]"><th className="p-3">Account</th><th className="p-3">Role</th><th className="p-3">Joined</th><th className="p-3"/></tr></thead><tbody>
   {accounts.map(a=>{const waiting=a.roles.find(r=>r.status==='pending_link');return <tr key={a.id} className="border-t border-[var(--border-color)]"><td className="p-3"><p className="font-medium">{a.name}</p><p className="text-xs text-[var(--text-muted)]">{a.email}</p></td>
    <td className="p-3">{a.roles.map(r=>`${r.role}${r.status==='pending_link'?' (waiting to be linked)':''}`).join(', ')||'None'}</td><td className="p-3">{when(a.created_at)}</td>
    <td className="p-3 text-right">{waiting&&(a.matching_landlords||[]).map(l=><Button key={l.id} size="sm" disabled={busy} onClick={()=>act(()=>api.post(`/api/rentro-admin/accounts/${a.id}/link-landlord`,{landlord_id:l.id}),`${a.name} is now linked to ${l.name}.`)}>Link to {l.name}</Button>)}</td></tr>;})}
  </tbody></table>}</GlassCard>}
  {tab==='allowlist'&&<div className="space-y-4"><GlassCard className="p-5 flex flex-wrap gap-3 items-end"><Input label="Email to invite" value={email} onChange={setEmail} placeholder="landlord@example.com"/><Input label="Note" value={note} onChange={setNote} placeholder="Optional"/>
   <Button disabled={busy||!email.trim()} onClick={()=>act(async()=>{await api.post('/api/rentro-admin/allowlist',{email,note});setEmail('');setNote('');},'Added. They can now sign up to Rentro.')}>Add to pilot</Button></GlassCard>
   <GlassCard className="p-0 overflow-hidden">{allowlist.length===0?<div className="p-6"><EmptyState message="Nobody is on the pilot allowlist yet."/></div>:<table className="w-full text-sm"><tbody>{allowlist.map(w=><tr key={w.email} className="border-t border-[var(--border-color)] first:border-t-0"><td className="p-3 font-medium">{w.email}</td><td className="p-3 text-[var(--text-muted)]">{w.note}</td><td className="p-3">{when(w.created_at)}{w.added_by?` · ${w.added_by}`:''}</td>
    <td className="p-3 text-right"><Button size="sm" variant="ghost" disabled={busy} onClick={()=>act(()=>api.delete(`/api/rentro-admin/allowlist/${encodeURIComponent(w.email)}`),'Removed from the pilot allowlist.')}>Remove</Button></td></tr>)}</tbody></table>}</GlassCard></div>}
  </>}
 </div></Layout>;
}
