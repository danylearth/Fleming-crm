import {Link} from 'react-router-dom';
import {usePermissions} from '../hooks/usePermissions';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {CreditCard,RefreshCw,X} from 'lucide-react';
import {useApi} from '../hooks/useApi';
import {Button} from './ui';

type Payment={id:number;booked_at:string;description:string;amount:number;bank_amount?:number;bank_reference?:string;currency?:string;match_reason?:'amount'|'name'};
const money=(value:unknown)=>Number(value||0).toLocaleString('en-GB',{style:'currency',currency:'GBP'});
export default function HoldingDepositTransactions({enquiryId,enquiry,onChanged}:{enquiryId:number;enquiry:Record<string,any>;onChanged:()=>void|Promise<void>}){
 const permissions=usePermissions();
 const api=useApi(),callback=useRef(onChanged);callback.current=onChanged;
 const [data,setData]=useState<{matches:Payment[];linked:Payment[]}>({matches:[],linked:[]});
 const [resetting,setResetting]=useState(false);
 const [open,setOpen]=useState(false),[selection,setSelection]=useState<number|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  const refresh=async()=>{try{const next=await api.get(`/api/tenant-enquiries/${enquiryId}/holding-deposit-payments`);if(active){setData(next);setError('');await callback.current();}}catch(e){if(active)setError(e instanceof Error?e.message:'Could not load bank payments');}};
  void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},15000);
  window.addEventListener('focus',refresh);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);};
 },[api,enquiryId]);
 useEffect(()=>{if(!open)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy){e.stopPropagation();setOpen(false);}};window.addEventListener('keydown',close,true);return()=>window.removeEventListener('keydown',close,true);},[open,busy]);
 const refresh=async()=>{setBusy(true);setError('');try{setData(await api.get(`/api/tenant-enquiries/${enquiryId}/holding-deposit-payments`));await callback.current();}catch(e){setError(e instanceof Error?e.message:'Could not load bank payments');}finally{setBusy(false);}};
 const assign=async()=>{if(!selection)return;setBusy(true);setError('');try{await api.post(`/api/tenant-enquiries/${enquiryId}/allocate-holding-deposit`,{transaction_id:selection});setData(await api.get(`/api/tenant-enquiries/${enquiryId}/holding-deposit-payments`));await callback.current();setSelection(null);setOpen(false);}catch(e){setError(e instanceof Error?e.message:'Could not link payment');}finally{setBusy(false);}};
 const reset=async()=>{if(!selection||busy)return;setBusy(true);setError('');try{await api.post(`/api/tenant-enquiries/${enquiryId}/reset-holding-deposit-payment`,{transaction_id:selection});setData(await api.get(`/api/tenant-enquiries/${enquiryId}/holding-deposit-payments`));await callback.current();setSelection(null);setOpen(false);}catch(e){setError(e instanceof Error?e.message:'Could not reset bank payment');}finally{setBusy(false);}};
 return <div className="space-y-3">
  {data.linked.map(row=><section key={row.id} aria-label="Linked holding deposit transaction" className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-2 text-sm"><div className="flex flex-wrap justify-between gap-2"><h4 className="font-semibold">Linked Bank Payment</h4><span className="text-emerald-700 font-semibold">{money(row.amount)} allocated</span></div><p className="font-medium break-words">{row.description}</p><dl className="grid sm:grid-cols-2 gap-2 text-xs"><div><dt className="text-[var(--text-secondary)]">Payment Date</dt><dd>{new Date(row.booked_at).toLocaleDateString('en-GB')}</dd></div><div><dt className="text-[var(--text-secondary)]">Bank Amount</dt><dd>{money(row.bank_amount??row.amount)}</dd></div><div className="sm:col-span-2"><dt className="text-[var(--text-secondary)]">Reference</dt><dd className="break-words">{row.bank_reference||row.description}</dd></div></dl><div className="flex justify-between items-center text-xs"><span className="text-[var(--text-muted)]">Transaction #{row.id}</span>{permissions.canAccessFinance()&&<Link className="inline-flex items-center justify-center rounded-full border border-[var(--border-input)] px-4 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]" to={'/financials?transaction='+row.id}>View Transaction</Link>}</div></section>)}

  <Button variant="outline" size="sm" className="w-full gap-2" disabled={busy||!permissions.canEdit()} onClick={()=>{setResetting(data.linked.length>0);setSelection(data.linked[0]?.id??null);setOpen(true);void refresh();}}>{data.linked.length?<RefreshCw size={15}/>:<CreditCard size={15}/>}{data.linked.length?'Reset':`Link Bank Payment${data.matches.length?' ('+data.matches.length+' matching)':''}`}</Button>
  {Number(enquiry.holding_deposit_bank_amount)>0&&<p className="text-xs text-[var(--text-secondary)]">{money(enquiry.holding_deposit_bank_amount)} linked from the bank feed.</p>}
  {error&&!open&&<p role="alert" className="text-xs text-red-600">{error}</p>}
  {open&&createPortal(<div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-4" onClick={()=>{if(!busy)setOpen(false);}}><section role="dialog" aria-modal="true" aria-labelledby="holding-bank-heading" className="w-full max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-[var(--bg-card)] text-[var(--text-primary)] p-5 shadow-xl" onClick={e=>e.stopPropagation()}>
   <div className="flex items-center justify-between gap-3"><h3 id="holding-bank-heading" className="font-semibold text-lg">{resetting?'Reset Bank Link':'Holding Deposit Bank Payments'}</h3><button type="button" aria-label="Close bank payments" disabled={busy} onClick={()=>setOpen(false)}><X size={20}/></button></div>
   {resetting?<><p className="my-3 text-sm text-[var(--text-secondary)]">Unlink the selected bank payment from this application. The bank transaction and its history are kept, and receipt status is recalculated. Any separate manual receipt remains recorded.</p><div className="space-y-2">{data.linked.map(row=><label key={row.id} className="flex gap-3 rounded-xl border border-[var(--border-input)] p-3 text-sm"><input type="radio" name="reset-holding-payment" checked={selection===row.id} onChange={()=>setSelection(row.id)} disabled={busy}/><span>{money(row.amount)} · {row.description}</span></label>)}</div></>:<>
   <p className="my-3 text-sm text-[var(--text-secondary)]">Holding deposit: {money(enquiry.holding_deposit_amount)}. Select the correct payment below to link it to this application.</p>
   {data.linked.map(row=><div key={row.id} className="rounded-lg bg-emerald-500/10 p-3 mb-2 text-sm"><strong>{money(row.amount)} linked</strong> · {new Date(row.booked_at).toLocaleDateString('en-GB')}<p>{row.description}</p></div>)}
   <div className="flex items-center justify-between my-3"><h4 className="font-medium text-sm">Matching Unallocated Payments</h4><button type="button" aria-label="Refresh bank payments" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={16} className={busy?'animate-spin':''}/></button></div>
   <div className="space-y-2">{data.matches.map(row=><label key={row.id} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${selection===row.id?'border-purple-500 bg-purple-500/5':'border-[var(--border-input)]'}`}><input type="radio" name="holding-bank-payment" checked={selection===row.id} disabled={busy} onChange={()=>setSelection(row.id)} className="mt-1"/><span className="min-w-0 text-sm"><strong>{money(row.amount)}</strong> · {new Date(row.booked_at).toLocaleDateString('en-GB')}<span className="block break-words">{row.description}</span><span className="block text-xs text-[var(--text-secondary)]">{row.match_reason==='amount'?'Amount matches':'Applicant name matches'}</span></span></label>)}{!data.matches.length&&<p className="text-sm text-[var(--text-secondary)]">{busy?'Checking payments…':'No unallocated payments match the deposit amount or an applicant’s name.'}</p>}</div>
   <p className="mt-3 text-xs text-[var(--text-secondary)]">A full payment confirms receipt automatically for both joint applicants. Partial payments remain pending until the full deposit is covered.</p>
   </>}
   {error&&<p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
   <div className="mt-4 flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={()=>setOpen(false)}>Cancel</Button><Button disabled={busy||!selection} onClick={()=>void (resetting?reset():assign())}>{busy?'Updating…':resetting?'Reset':'Assign to Holding Deposit'}</Button></div>
  </section></div>,document.body)}
 </div>;
}
