import {useEffect,useRef,useState} from 'react';
import {useApi} from '../hooks/useApi';
import {usePermissions} from '../hooks/usePermissions';
import {Button,Select} from './ui';
type Transaction={id:number;booked_at:string;description?:string;display_name?:string;amount:number;allocated_amount?:number;currency:string;match_status?:string};
const money=(n:number)=>Number(n).toLocaleString('en-GB',{style:'currency',currency:'GBP'});
export default function FinalBalanceTransactions({enquiryId,enquiry,onChanged}:{enquiryId:number;enquiry:Record<string,any>;onChanged:()=>void|Promise<void>}){
 const api=useApi(),permissions=usePermissions(),callback=useRef(onChanged);callback.current=onChanged;
 const [linked,setLinked]=useState<Transaction[]>([]),[available,setAvailable]=useState<Transaction[]>([]),[selecting,setSelecting]=useState(false),[selection,setSelection]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const canFinance=permissions.canAccessFinance();
 const paid=Math.max(Number(enquiry.balance_bank_amount||0),Number(enquiry.balance_manual_amount||0));
 const remaining=Math.max(0,Number(enquiry.balance_due_amount||0)-paid);
 useEffect(()=>{

  let active=true;
  const refresh=async()=>{try{const rows=await api.get(`/api/tenant-enquiries/${enquiryId}/balance-transactions`);if(active)setLinked(rows);await callback.current();}catch(e){if(active)setError(e instanceof Error?e.message:'Could not load payments');}};
  void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},15000);
  window.addEventListener('focus',refresh);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);};
 },[api,enquiryId,canFinance]);

 const choose=async()=>{setBusy(true);setError('');try{const rows=await api.get(`/api/tenant-enquiries/${enquiryId}/balance-matches`);setAvailable(rows);setSelecting(true);}catch(e){setError(String(e));}finally{setBusy(false);}};
 const assign=async()=>{
  const row=available.find(r=>String(r.id)===selection);if(!row)return;
  setBusy(true);setError('');
  try{await api.post(`/api/tenant-enquiries/${enquiryId}/allocate-balance`,{transaction_id:row.id});setLinked(await api.get(`/api/tenant-enquiries/${enquiryId}/balance-transactions`));setSelecting(false);setSelection('');await onChanged();}catch(e){setError(e instanceof Error?e.message:'Could not allocate payment');}finally{setBusy(false);}
 };
 return <section className="space-y-3 rounded-xl border border-[var(--border-input)] bg-[var(--bg-card)] p-4">
  <h5 className="font-semibold">Bank Payments</h5>
  <p className="text-sm">{money(Number(enquiry.balance_bank_amount||0))} linked from the bank feed{!enquiry.balance_payment_received?` · ${money(remaining)} still to pay`:''}.</p>
  {!enquiry.balance_payment_received&&remaining===0&&<p className="text-sm text-emerald-700">Full balance linked. Confirm Receipt of Funds in Actions &amp; Previews to continue.</p>}
  {linked.map(row=><div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--bg-subtle)] p-3 text-sm"><div><p className="font-medium">{row.display_name||row.description||'Bank payment'}</p><p>{String(row.booked_at).slice(0,10)} · {money(Number(row.allocated_amount))} allocated</p></div>{canFinance&&<a href={`/financials?transaction=${row.id}`} target="_blank" rel="noreferrer" className="rounded-full border border-[var(--border-input)] px-3 py-2">View / Unassign</a>}</div>)}
  {!enquiry.balance_payment_received&&(selecting?<div className="space-y-3"><Select searchable label="Incoming Bank Transaction" value={selection} onChange={setSelection} options={[{value:'',label:'Choose an unallocated payment'},...available.map(r=>({value:String(r.id),label:`${String(r.booked_at).slice(0,10)} · ${money(Number(r.amount))} · ${r.display_name||r.description||'Bank payment'}`}))]}/><p className="text-sm text-[var(--text-secondary)]">Payments are matched by the balance amount or an applicant name. After linking the payment, confirm receipt in Actions & Previews to continue.</p><div className="flex flex-wrap justify-end gap-2">{permissions.isAdmin()&&<a href="/financials" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-full border border-[var(--border-input)] px-4 py-1.5 text-xs font-medium">Open Financials</a>}<Button size="sm" variant="outline" disabled={busy} onClick={()=>setSelecting(false)}>Cancel</Button><Button size="sm" disabled={busy||!selection||!permissions.canEdit()} onClick={()=>void assign()}>{busy?'Allocating…':'Allocate to Final Balance'}</Button></div></div>:<Button variant="outline" size="sm" disabled={busy} onClick={()=>void choose()}>{permissions.canEdit()?'Link Bank Transaction':'View Matching Payments'}</Button>)}
  {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
 </section>;
}
