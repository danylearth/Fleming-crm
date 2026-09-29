import {rentDueTiming} from '../utils/rentDueTiming';
import ClientEarnings from '../components/ClientEarnings';
import DepositParticipantsSelect, {type DepositParticipant} from '../components/DepositParticipantsSelect';
import {PropertiesIcon} from '../components/ui/icons/FlemingIcons';
import DocumentsSection from '../components/DocumentsSection';
import { rentServiceGroups } from '../utils/rentServices';
import { formatPropertyAddress } from '../utils/propertyAddress';
import {useSearchParams} from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import Layout from '../components/Layout';
import { Button, Card, GlassCard, EmptyState, Select, Input } from '../components/ui';
import { useApi, invalidateCache } from '../hooks/useApi';
import { PoundSterling, TrendingUp, TrendingDown, Home, Landmark, RefreshCw, Clock3, X } from 'lucide-react';

interface RentPayment {
  id: number;
  property_id?: number;
  tenant_name?: string;
  address?: string;
  amount_due: number | string;
  amount_paid?: number | string;
  due_date?: string;
  payment_date?: string;
  status?: string; opening_balance_amount?: number; bank_received?:number; bank_payment_date?:string;
}

type RentSuggestion={rent_payment_id:number;tenant_name:string;address:string;due_date:string;outstanding:number;kind:string;reason:string;amount_matches:boolean};
const money=(value:number|string)=>Number(value).toLocaleString('en-GB',{style:'currency',currency:'GBP'});
interface BankFeedStatus {
  configured: boolean;
  connection?: { provider?:string; status: string; provider_name?: string; last_synced_at?: string; last_error?: string } | null;
  totals?: { total: number; rent_matches: number; deposit_matches: number; expense_matches: number; unmatched: number };
}

interface BankFeedTransaction {
  id: number;
  booked_at: string;
  description?: string;
  display_name?: string;
  merchant_name?: string;
  amount: number;
  currency: string;
  match_status: 'unmatched' | 'matched_rent' | 'matched_deposit' | 'matched_expense' | 'ignored';
  allocations?: {participants?:{name:string}[];kind:string;amount:number;category?:string;notes?:string;tenant_name?:string;property_address?:string}[];
  property_address?: string;
  tenant_name?: string;
}

interface Property {
  id: number;
  address: string;
  city?: string; postcode?: string;
  landlord_name?:string; landlord_type?: string; service_type?: string; active_monthly_rent?: number;
  monthly_rent?: number;
  rent?: number;
  rent_amount?: number;
  status?: string;
}

function AssignmentConfirmation({children,onCancel,onConfirm}:{children:React.ReactNode;onCancel:()=>void;onConfirm:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{dialog.current?.showModal();},[]);
 return <dialog ref={dialog} aria-labelledby="assignment-confirm-title" onCancel={event=>{event.preventDefault();onCancel();}} className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border-input)] bg-[var(--bg-card)] p-6 text-[var(--text-primary)] shadow-xl backdrop:bg-black/60">
  <h2 id="assignment-confirm-title" className="mb-3 text-lg font-bold">Are you sure you want to assign?</h2>{children}
  <div className="mt-6 flex justify-end gap-3"><button type="button" autoFocus onClick={onCancel} className="rounded-full border border-[var(--border-input)] px-5 py-2 text-sm">Cancel</button><Button onClick={onConfirm}>Confirm assignment</Button></div>
 </dialog>;
}

export default function Transactions() {
  const api = useApi();
  const [searchParams]=useSearchParams();const openedTransaction=useRef<string|null>(null);
  const [payments, setPayments] = useState<RentPayment[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [summary, setSummary] = useState({ monthly_rent: 0, collected: 0, outstanding: 0, active_tenancies: 0, assumed:0,let_only_fee_count:0,let_only_fee_total:0,let_only_fee_month:0,vacancy_loss:{total:0,periods:[] as {property_id:number;address:string;from:string;through:string;days:number;rent:number;costs:number;total:number}[],missing_dates:[] as {property_id:number;address:string}[]} });
  const [bankStatus, setBankStatus] = useState<BankFeedStatus | null>(null);
  const [bankTransactions, setBankTransactions] = useState<BankFeedTransaction[]>([]);
  const [bankBusy, setBankBusy] = useState(false);
  const [bankMessage, setBankMessage] = useState('');
  const [bankResult,setBankResult]=useState('');
  useEffect(()=>{if(bankMessage)setBankResult(bankMessage);},[bankMessage]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [rentSuggestions,setRentSuggestions]=useState<RentSuggestion[]>([]),[suggestionError,setSuggestionError]=useState('');
  const [selectedBank,setSelectedBank]=useState<BankFeedTransaction|null>(null);
  const [deposits,setDeposits]=useState<{security:number;holding:number;transactions:BankFeedTransaction[]}>({security:0,holding:0,transactions:[]});
  const [bankFilter,setBankFilter]=useState('unmatched');
  const [transactionName,setTransactionName]=useState(''),[showImportName,setShowImportName]=useState(false);
  const rentCutoff=new Date();rentCutoff.setUTCDate(rentCutoff.getUTCDate()-30);
  const selectablePayments=payments.filter(p=>p.due_date&&(Number(p.amount_paid||0)<Number(p.amount_due)||(!Number(p.bank_received)&&p.due_date.slice(0,10)>=rentCutoff.toISOString().slice(0,10))));
  const renameTransaction=async()=>{if(!selectedBank)return;setBankBusy(true);try{const row=await api.patch(`/api/bank-feed/transactions/${selectedBank.id}/name`,{display_name:transactionName});setSelectedBank({...selectedBank,display_name:row.display_name});await refreshBankData();setBankMessage('Transaction name saved.');}catch(e){setBankMessage(String(e));}finally{setBankBusy(false);}};
  type Allocation={participants:DepositParticipant[];kind:string;amount:string;rent_payment_id:string;tenant_id:string;property_id:string;maintenance_id:string;category:string;notes:string};
  const [allocations,setAllocations]=useState<Allocation[]>([]);
  const [pendingAssignment,setPendingAssignment]=useState<Allocation[]|null>(null);
  const [tenants,setTenants]=useState<{id:number;name:string;linked_tenant_id?:number;property_id?:number;tenancy_start_date?:string}[]>([]);
  const [enquiries,setEnquiries]=useState<{id:number;first_name_1:string;last_name_1:string;linked_property_id?:number;status?:string;balance_payment_requested?:number;balance_payment_received?:number}[]>([]);
  const [jobs,setJobs]=useState<{id:number;title:string;property_id:number}[]>([]);
  const freshAllocation=(amount=''):Allocation=>({kind:selectedBank&&Number(selectedBank.amount)<0?'expense':'rent',amount,participants:[],rent_payment_id:'',tenant_id:'',property_id:'',maintenance_id:'',category:'',notes:''});
  const beginAssign=useCallback(async(transaction:BankFeedTransaction)=>{
    setPendingAssignment(null);setRentSuggestions([]);setSuggestionError('');setBankMessage('');setTransactionName(transaction.display_name||transaction.description||'');setShowImportName(false);
    try{const [tenantRows,jobRows,enquiryRows,suggestions]=await Promise.all([api.get('/api/tenants'),api.get('/api/maintenance'),api.get('/api/tenant-enquiries'),transaction.match_status==='unmatched'&&Number(transaction.amount)>0?api.get(`/api/bank-feed/transactions/${transaction.id}/rent-suggestions?at=${Date.now()}`).catch(()=>{setSuggestionError('Suggestions could not be loaded. You can still choose a rent charge below.');return [];}):Promise.resolve([])]);setRentSuggestions(suggestions);setTenants(tenantRows);setEnquiries(enquiryRows);setJobs(jobRows);setSelectedBank(transaction);setAllocations([{amount:String(Math.abs(Number(transaction.amount))),kind:Number(transaction.amount)>0?'rent':'expense',participants:[],rent_payment_id:'',tenant_id:'',property_id:'',maintenance_id:'',category:'',notes:''}]);}
    catch(error){setBankMessage(error instanceof Error?error.message:'Could not load allocation options');}
  },[api]);
  useEffect(()=>{const requested=searchParams.get('transaction');if(!loading&&requested&&openedTransaction.current!==requested){const match=bankTransactions.find(t=>String(t.id)===requested);openedTransaction.current=requested;if(match){setBankFilter('all');void beginAssign(match);}else setBankMessage('The linked bank transaction is outside the loaded range. Use the bank feed to review its allocation.');}},[loading,searchParams,bankTransactions,beginAssign]);
  const reconcile=async(transaction:BankFeedTransaction,action:string,confirmedAllocations?:Allocation[])=>{
    const toSave=confirmedAllocations||allocations;setPendingAssignment(null);
    setBankBusy(true);setBankMessage('');
    try{await api.post(`/api/bank-feed/transactions/${transaction.id}/reconcile`,{action,confirm_rent_assignment:action==='assign'&&!!confirmedAllocations,allocations:toSave.map(a=>a.kind==='client_rent'?{...a,kind:'rent',category:'Client Rent'}:a)});setSelectedBank(null);invalidateCache('/api/rent-payments');invalidateCache('/api/tenant-enquiries');invalidateCache('/api/financial-summary');await refreshBankData();const [pay,totals]=await Promise.all([api.get('/api/rent-payments'),api.get('/api/financial-summary')]);setPayments(pay);setSummary(totals);setBankMessage(action==='assign'?`£${Math.abs(Number(transaction.amount)).toFixed(2)} assigned across ${toSave.length} allocation${toSave.length===1?'':'s'}.`:action==='unassign'?'Allocation removed. You can assign this payment again.':action==='ignore'?'Transaction ignored.':'Transaction restored.');}
    catch(error){setBankMessage(error instanceof Error?error.message:'Could not save transaction');}
    finally{setBankBusy(false);}
  };
  const setAllocation=(index:number,changes:Partial<Allocation>)=>{setPendingAssignment(null);setAllocations(current=>current.map((a,i)=>i===index?{...a,...changes}:a));};


  useEffect(() => {
    const load = async () => {
      try {
        const [pay, prop, ten, feedStatus, feedTransactions] = await Promise.all([
          api.get('/api/rent-payments'),
          api.get('/api/properties'),
          api.get('/api/financial-summary'),
          api.get('/api/bank-feed/status').catch(() => null),
          api.get(`/api/bank-feed/transactions?limit=500&transaction=${encodeURIComponent(searchParams.get('transaction')||'')}`).catch(() => []),
        ]);
        setPayments(Array.isArray(pay) ? pay : pay?.payments || []);
        setProperties(Array.isArray(prop) ? prop : prop?.properties || []);
        setSummary(ten);
        setDeposits(await api.get('/api/bank-feed/deposit-balances'));
        setBankStatus(feedStatus);
        setBankTransactions(Array.isArray(feedTransactions) ? feedTransactions : []);

      } catch {
        setLoadError('Financial data could not be loaded. Refresh the page to try again.');
      }
      setLoading(false);
    };
    load();
  }, [api,searchParams]);

  const refreshBankData = async () => {
    const [status, transactions] = await Promise.all([
      api.get(`/api/bank-feed/status?at=${Date.now()}`),
      api.get(`/api/bank-feed/transactions?limit=500&transaction=${encodeURIComponent(searchParams.get('transaction')||'')}&at=${Date.now()}`),
    ]);
    setDeposits(await api.get(`/api/bank-feed/deposit-balances?at=${Date.now()}`));
    setBankStatus(status);
    setBankTransactions(Array.isArray(transactions) ? transactions : []);
  };

  const connectBank = async () => {
    setBankBusy(true);
    setBankMessage('');
    try {
      const result = await api.post('/api/bank-feed/connect', {});
      window.location.assign(result.url);
    } catch (error) {
      setBankMessage(error instanceof Error ? error.message : 'Could not start the bank connection');
      setBankBusy(false);
    }
  };

  const syncBank = async () => {
    setBankBusy(true);
    setBankMessage('');
    try {
      const result = await api.post(bankStatus?.connection?.provider==='freeagent'?'/api/freeagent/sync':'/api/bank-feed/sync', {});
      setBankMessage(`${result.imported} new transaction${result.imported === 1 ? '' : 's'} imported; ready for review.`);
      await refreshBankData();
    } catch (error) {
      setBankMessage(error instanceof Error ? error.message : 'Bank sync failed');
    } finally {
      setBankBusy(false);
    }
  };

  // Calculate summaries
  const totalMonthlyRent = Number(summary.monthly_rent);
  const collected = Number(summary.collected);
  const outstanding = Number(summary.outstanding);
  const occupiedCount = Math.min(properties.length, Number(summary.active_tenancies));
  const totalCount = properties.length;
  const vacancyRate = (totalCount ? (totalCount - occupiedCount) / totalCount : 0) * 100;
  const vacancyLoss = summary.vacancy_loss?.total||0;
  const paymentDelays = payments
    .filter(payment => payment.due_date && payment.payment_date)
    .map(payment => Math.max(0, Math.round((new Date(payment.payment_date!).getTime() - new Date(payment.due_date!).getTime()) / 86400000)));
  const averageDaysLate = paymentDelays.length ? paymentDelays.reduce((sum, days) => sum + days, 0) / paymentDelays.length : 0;

  const fmt = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const statusGroups = rentServiceGroups(properties);
  statusGroups['Let Only Service']={count:Number(summary.let_only_fee_count||0),rent:Number(summary.let_only_fee_total||0)};

  return (
    <Layout title="Financials" breadcrumb={[{ label: 'Financials' }]}>
      {selectedBank&&pendingAssignment&&<AssignmentConfirmation onCancel={()=>setPendingAssignment(null)} onConfirm={()=>void reconcile(selectedBank,'assign',pendingAssignment)}>
        <p className="text-sm text-[var(--text-secondary)]">Assign this {Number(selectedBank.amount)>0?'incoming':'outgoing'} payment of <strong className="text-[var(--text-primary)]">{money(Math.abs(Number(selectedBank.amount)))}</strong>?</p>
        <div className="mt-4 space-y-3">{pendingAssignment.map((a,index)=>{const rent=payments.find(p=>String(p.id)===a.rent_payment_id);const outstanding=rent?Math.max(0,Number(rent.amount_due)-Number(rent.amount_paid||0)):0;return <div key={index} className="rounded-xl bg-[var(--bg-input)] p-3 text-sm"><p className="font-bold">{rent?.tenant_name||a.category||a.kind.replaceAll('_',' ')} · {money(a.amount)}</p>{rent&&<><p className="mt-1">{rent.address}</p><p className="mt-1 text-[var(--text-secondary)]">Due {rent.due_date?.slice(0,10).split('-').reverse().join('/')} · {money(outstanding)} outstanding</p>{Math.abs(Number(a.amount)-outstanding)>0.005&&<p className="mt-2 text-amber-700 dark:text-amber-400">The payment amount differs from the outstanding rent. Cancel to adjust or split the allocation.</p>}</>}</div>;})}</div>
      </AssignmentConfirmation>}
      {bankResult&&<div role="dialog" aria-modal="true" aria-labelledby="bank-result-title" className="fixed inset-0 z-[120] grid place-items-center bg-black/60 p-4" onKeyDown={event=>{if(event.key==='Escape')setBankResult('');}}><div className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] p-6 shadow-xl"><h2 id="bank-result-title" className="text-lg font-semibold">Bank Feed Results</h2><p className="mt-3 text-sm whitespace-pre-line break-words">{bankResult}</p><div className="flex justify-end mt-5"><button autoFocus className="rounded-full px-4 py-2 text-sm bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" onClick={()=>setBankResult('')}>Close</button></div></div></div>}
      {selectedBank&&<div role="dialog" aria-modal="true" aria-label="Assign bank transaction" className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4"><div className="flex w-full max-w-2xl max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-[var(--bg-card)]">
        <div className="flex shrink-0 items-center justify-between gap-4 px-6 py-4"><h2 className="text-lg font-semibold">{selectedBank.match_status==='unmatched'?'Assign':'Review'} {money(Math.abs(Number(selectedBank.amount)))}</h2><button type="button" aria-label="Close assignment" title="Close" disabled={bankBusy} onClick={()=>{setPendingAssignment(null);setSelectedBank(null);}} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--bg-input)] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"><X size={20}/></button></div>
        <div className="min-h-0 overflow-y-auto px-6 pb-6 space-y-4"><div className="flex items-end gap-2"><Input className="flex-1 [&_input]:h-11" label="Transaction Name" value={transactionName} onChange={setTransactionName}/><Button variant="outline" size="sm" className="!h-11 !py-2.5 shrink-0" disabled={bankBusy||!transactionName.trim()} onClick={()=>void renameTransaction()}>Save Name</Button></div>{selectedBank.display_name?.trim()&&selectedBank.display_name.trim()!==selectedBank.description?.trim()&&<button className="text-xs rounded-full border border-[var(--border-input)] px-3 py-1.5" onClick={()=>setShowImportName(v=>!v)}>{showImportName?'Hide Import Name':'View Import Name'}</button>}{showImportName&&selectedBank.display_name?.trim()!==selectedBank.description?.trim()&&<p className="text-sm break-words">{selectedBank.description}</p>}
        {selectedBank.match_status!=='unmatched'?<><div className="space-y-2">{selectedBank.allocations?.map((a,i)=><div key={i}><p>{a.kind.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase())}{a.category?` · ${a.category}`:''} · £{Number(a.amount).toFixed(2)}</p>{a.participants?.length?<p className="text-sm">{a.participants.map(p=>p.name).join(' & ')}</p>:a.tenant_name&&<p className="text-sm">{a.tenant_name}</p>}{a.notes&&<p className="text-sm whitespace-pre-wrap text-[var(--text-secondary)]">{a.notes}</p>}</div>)}</div><Button disabled={bankBusy} onClick={()=>void reconcile(selectedBank,'unassign')}>Unallocate Payment</Button><p className="text-xs">The original allocation and attached documents stay in the history. You can assign the payment again after removing its current allocation.</p></>:<>

        {selectedBank.match_status==='unmatched'&&Number(selectedBank.amount)>0&&<section aria-label="Suggested rent matches" className="rounded-xl border border-[var(--border-input)] p-3 space-y-2"><h3 className="text-sm font-semibold">Suggested rent matches</h3><p className="text-xs text-[var(--text-secondary)]">Based on previous confirmed payer names and references. Review the tenant, date and amount before assigning.</p>{suggestionError?<p role="status" className="text-xs">{suggestionError}</p>:!rentSuggestions.length?<p className="text-xs text-[var(--text-muted)]">No previous confirmed payer match found. Choose a rent charge below.</p>:<div className="max-h-56 overflow-y-auto space-y-1.5">{rentSuggestions.map(s=><div key={s.rent_payment_id} className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-3 py-2 text-xs ${rentDueTiming(s.due_date).className}`}><div className="min-w-0 flex-1 basis-64"><p className="font-semibold break-words">{s.tenant_name} · {s.address}</p><p>{s.due_date.split('-').reverse().join('/')} · {money(s.outstanding)} outstanding · {rentDueTiming(s.due_date).label}</p><p className="mt-0.5 text-[11px] leading-snug">{s.reason}{!s.amount_matches?' — payment amount differs; review the allocation.':''}</p></div><button type="button" className="shrink-0 rounded-full border border-current px-3 py-1.5 text-xs" onClick={()=>{setPendingAssignment([{...freshAllocation(String(Math.abs(Number(selectedBank.amount)))),kind:s.kind,rent_payment_id:String(s.rent_payment_id)}]);}}>Use suggestion</button></div>)}</div>}</section>}
        {allocations.map((a,index)=>{const incoming=Number(selectedBank.amount)>0;const categories:Record<string,string[]>={expense:['Ground Rent','Insurance','Lease Renewal','Management Fee','Other','Service Charge'],maintenance:['Contractors Invoice','Labour','Materials','Other','Refurbishment','Servicing'],financial:['Landlord Rent Remittance','Accountancy Fees','Utilities','Administration Expenses','Bank Fees','Commission Payment','Council Tax','Marketing Costs','Stamp Duty','Legal & Professional Fees','Office Costs','Other','Refunds'],income:['Commission Payment','Interest Received','Other','Tax Rebate']};return <div key={index} className="grid sm:grid-cols-2 gap-3 p-4 rounded-xl border border-[var(--border-input)]">
          <h3 className="sm:col-span-2 text-base font-bold">{incoming?'Money In':'Money Out'}</h3>
          <Select label="Payment Type" value={a.kind} onChange={kind=>setAllocation(index,{kind,category:''})} options={(incoming?[{value:'final_balance',label:'Final Tenancy Balance'},{value:'rent',label:'Portfolio Rent'},{value:'client_rent',label:'Client Rent'},{value:'deposit',label:'Security Deposit'},{value:'holding_deposit',label:'Holding Deposit'},{value:'income',label:'Other Money In'},{value:'financial',label:'Financials'}]:[{value:'deposit',label:'Security Deposit'},{value:'holding_deposit',label:'Holding Deposit'},{value:'expense',label:'Property Expense'},{value:'maintenance',label:'Maintenance & Repairs'},{value:'financial',label:'Financials'}]).sort((a,b)=>a.label.localeCompare(b.label))}/>
          <Input label="Amount (£)" type="currency" value={a.amount} onChange={amount=>setAllocation(index,{amount})}/>
          {categories[a.kind]&&<Select label="Category" value={a.category} onChange={category=>setAllocation(index,{category})} options={[{value:'',label:'Choose category'},...categories[a.kind].filter(category=>!incoming||category!=='Landlord Rent Remittance').map(v=>({value:v,label:v}))]}/>}
          {['rent','client_rent'].includes(a.kind)?<Select className="sm:col-span-2" searchable label="Rent Charge" value={a.rent_payment_id} onChange={rent_payment_id=>setAllocation(index,{rent_payment_id})} options={[{value:'',label:'Choose rent due'},...selectablePayments.filter(p=>{const client=properties.find(x=>x.id===p.property_id)?.landlord_type!=='internal';return a.kind==='client_rent'?client:!client;}).map(p=>({value:String(p.id),className:rentDueTiming(p.due_date!).className,label:`${p.tenant_name} · ${p.address} · ${p.due_date?.slice(0,10)} · ${money(p.amount_due)} · ${rentDueTiming(p.due_date!).label}`}))]}/>:a.kind==='final_balance'?<Select className="sm:col-span-2" searchable label="Tenant Enquiry" value={String(a.participants[0]?.enquiry_id||'')} onChange={id=>setAllocation(index,{participants:id?[{enquiry_id:Number(id)}]:[]})} options={[{value:'',label:'Choose final balance'},...enquiries.filter(e=>e.balance_payment_requested&&!e.balance_payment_received&&e.status!=='converted').map(e=>({value:String(e.id),label:`${e.first_name_1} ${e.last_name_1} · ${formatPropertyAddress(properties.find(p=>p.id===e.linked_property_id)?.address,properties.find(p=>p.id===e.linked_property_id)?.postcode)}`}))]}/>:['deposit','holding_deposit'].includes(a.kind)?<DepositParticipantsSelect value={a.participants} onChange={participants=>setAllocation(index,{participants})} options={[...tenants.filter(t=>t.property_id).map(t=>({key:`tenant:${t.id}`,name:t.name,address:formatPropertyAddress(properties.find(p=>p.id===t.property_id)?.address,properties.find(p=>p.id===t.property_id)?.postcode,properties.find(p=>p.id===t.property_id)?.city),participant:{tenant_id:t.id}})),...enquiries.filter(e=>e.linked_property_id&&e.status!=='converted').map(e=>({key:`enquiry:${e.id}`,name:[e.first_name_1,e.last_name_1].filter(Boolean).join(' '),address:formatPropertyAddress(properties.find(p=>p.id===e.linked_property_id)?.address,properties.find(p=>p.id===e.linked_property_id)?.postcode,properties.find(p=>p.id===e.linked_property_id)?.city),participant:{enquiry_id:e.id}}))]}/>:<div className="sm:col-span-2"><Select icon={<PropertiesIcon size={18} className="text-blue-500 shrink-0"/>} label={['financial','income'].includes(a.kind)&&a.category!=='Landlord Rent Remittance'?'Property (optional)':'Property'} searchable value={a.property_id} onChange={property_id=>setAllocation(index,{property_id,maintenance_id:''})} options={[{value:'',label:'Choose property'},...properties.filter(p=>a.category!=='Landlord Rent Remittance'||p.landlord_type==='external').map(p=>({value:String(p.id),label:formatPropertyAddress(p.address,p.postcode,p.city)+(a.category==='Landlord Rent Remittance'&&p.landlord_name?' · '+p.landlord_name:'')}))]}/></div>}
          {a.kind==='maintenance'&&<Select className="sm:col-span-2" label="Maintenance Task (optional)" value={a.maintenance_id} onChange={maintenance_id=>setAllocation(index,{maintenance_id})} options={[{value:'',label:'No linked task'},...jobs.filter(j=>String(j.property_id)===a.property_id).map(j=>({value:String(j.id),label:j.title}))]}/>}
          <label className="text-sm sm:col-span-2">Notes<textarea className="block w-full mt-2 p-3 rounded-xl border border-[var(--border-input)] bg-[var(--bg-input)]" rows={2} value={a.notes} onChange={e=>setAllocation(index,{notes:e.target.value})}/></label>
          {allocations.length>1&&<button className="text-sm underline" onClick={()=>{setPendingAssignment(null);setAllocations(current=>current.filter((_,i)=>i!==index));}}>Remove Allocation</button>}</div>})}
        <div className="flex justify-between"><Button size="sm" variant="outline" onClick={()=>{setPendingAssignment(null);setAllocations(current=>[...current,freshAllocation()]);}}>Split Payment</Button><p className="text-sm">Remaining: £{(Math.abs(Number(selectedBank.amount))-allocations.reduce((sum,a)=>sum+Number(a.amount||0),0)).toFixed(2)}</p></div></>}
        <DocumentsSection entityType="bank_transaction" entityId={selectedBank.id} title="Related Documents" compact/>
        <div className="flex justify-end gap-3"><Button disabled={bankBusy} variant="ghost" onClick={()=>setSelectedBank(null)}>Cancel</Button>{selectedBank.match_status==='unmatched'&&<Button disabled={bankBusy} onClick={()=>setPendingAssignment(allocations.map(a=>({...a})))}>Save Assignment</Button>}</div>
      </div></div></div>}
      <div className="p-4 md:p-8">
        {loadError ? <p role="alert" className="text-red-400 py-8">{loadError}</p> : loading ? (
          <div className="text-center text-[var(--text-muted)] py-16">Loading...</div>
        ) : (
          <>
            <Card className="p-5 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0"><Landmark size={20} /></div>
                  <div>
                    <h3 className="font-semibold">Barclays bank feed</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {!bankStatus?.configured && bankStatus?.connection?.status!=='connected'
                        ? 'Waiting for Open Banking provider credentials.'
                        : bankStatus.connection?.status === 'connected'
                          ? `Connected${bankStatus.connection.provider_name ? ` via ${bankStatus.connection.provider_name}` : ''}${bankStatus.connection.last_synced_at ? ` · last synced ${new Date(bankStatus.connection.last_synced_at).toLocaleString('en-GB')}` : ''}`
                          : 'Ready to connect and approve access in Barclays.'}
                    </p>
                    
                    {bankStatus?.connection?.last_error && <p className="text-xs text-red-400 mt-2">{bankStatus.connection.last_error}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  {bankStatus?.connection?.status === 'connected' ? (
                    <Button variant="outline" size="sm" onClick={syncBank} disabled={bankBusy} className="gap-2"><RefreshCw size={14} className={bankBusy ? 'animate-spin' : ''} /> Sync now</Button>
                  ) : (
                    <Button variant="gradient" size="sm" onClick={connectBank} disabled={bankBusy || !bankStatus?.configured}>Connect Barclays</Button>
                  )}
                </div>
              </div>
              {bankStatus?.totals && bankStatus.totals.total > 0 && (
                <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-[var(--border-subtle)] text-center">
                  <div><p className="font-semibold">{bankStatus.totals.rent_matches}</p><p className="text-[11px] text-[var(--text-muted)]">Rent matched</p></div>
                  <div><p className="font-semibold">{bankStatus.totals.deposit_matches}</p><p className="text-[11px] text-[var(--text-muted)]">Deposits matched</p></div>
                  <div><p className="font-semibold">{bankStatus.totals.expense_matches}</p><p className="text-[11px] text-[var(--text-muted)]">Expenses matched</p></div>
                  <div><p className="font-semibold">{bankStatus.totals.unmatched}</p><p className="text-[11px] text-[var(--text-muted)]">Needs review</p></div>
                </div>
              )}
            </Card>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4 mb-8">
              {[
                { label: 'Total Monthly Rent', value: fmt(totalMonthlyRent), icon: <PoundSterling size={20} />, color: 'from-blue-500 to-blue-600' },
                { label: 'Collected This Month', value: fmt(collected), icon: <TrendingUp size={20} />, color: 'from-emerald-500 to-emerald-600' },
                { label: 'Outstanding This Month', value: fmt(outstanding > 0 ? outstanding : 0), icon: <TrendingDown size={20} />, color: 'from-amber-500 to-orange-500' },
                { label: 'Vacancy Loss', value: fmt(vacancyLoss), icon: <Home size={20} />, color: 'from-red-500 to-pink-500' },
                { label: 'Average Lateness', value: `${averageDaysLate.toFixed(1)} days`, icon: <Clock3 size={20} />, color: 'from-violet-500 to-purple-600' },
              ].map(card => (
                <GlassCard key={card.label} className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider">{card.label}</span>
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center`}>
                      {card.icon}
                    </div>
                  </div>
                  <p className="text-2xl font-bold">{card.value}</p>
                </GlassCard>
              ))}
            </div>


            <div className="grid sm:grid-cols-2 gap-4 mb-6">{[{key:'security',label:'Security Deposits on Account',amount:deposits.security},{key:'holding',label:'Holding Deposits on Account',amount:deposits.holding}].map(d=><button key={d.key} type="button" onClick={()=>{setBankFilter(d.key);document.getElementById('bank-transactions')?.scrollIntoView({behavior:'smooth',block:'start'});}} className="rounded-2xl border border-[var(--border-input)] bg-[var(--bg-card)] p-5 text-left flex items-center justify-between gap-4"><div><p className="text-sm font-medium">{d.label}</p><p className={`text-2xl font-semibold mt-2 ${d.amount<0?'text-red-500':'text-[var(--feedback-emerald)]'}`}>{fmt(d.amount)}</p><p className="text-xs text-[var(--text-muted)] mt-2">Bank receipts less payments out</p></div><span className="rounded-full border border-[var(--border-input)] px-4 py-2 text-sm shrink-0">View</span></button>)}</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Rent Payments Table */}
              <Card className="p-5">
                <details open><summary className="text-lg font-semibold mb-4 cursor-pointer">Recent Bank-linked Rent Payments</summary>
                {payments.filter(p=>Number(p.bank_received)>0&&p.bank_payment_date&&new Date(p.bank_payment_date).getTime()>=Date.now()-30*86400000).length === 0 ? (
                  <EmptyState message="No payment records yet" icon={<PoundSterling size={24} />} />
                ) : (
                  <div className="overflow-auto max-h-72">
                    <div className="min-w-[400px] space-y-1">
                    <div className="grid grid-cols-[1fr_1.4fr_0.8fr_1fr] gap-3 text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wider pb-2 border-b border-[var(--border-subtle)]">
                      <span>Tenant</span><span>Property</span><span className="text-right">Amount</span><span className="text-right">Date</span>
                    </div>
                    {payments.filter(p=>Number(p.bank_received)>0&&p.bank_payment_date&&new Date(p.bank_payment_date).getTime()>=Date.now()-30*86400000).sort((a,b)=>String(b.bank_payment_date).localeCompare(String(a.bank_payment_date))).map(p => (
                      <div key={p.id} className="grid grid-cols-[1fr_1.4fr_0.8fr_1fr] gap-3 py-2.5 border-b border-[var(--border-subtle)] text-sm">
                        <span>{p.tenant_name || '—'}</span>
                        <span className="whitespace-normal break-words text-[var(--text-secondary)]">{p.address || '—'}</span>
                        <span className="text-right font-medium text-emerald-400">{fmt(Number(p.bank_received || 0))}</span>
                        <span className="text-right text-[var(--text-muted)]">{p.bank_payment_date ? new Date(p.bank_payment_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short',year:'numeric' }) : Number(p.amount_paid || 0) > 0 ? 'Not recorded' : 'Unpaid'}</span>
                      </div>
                    ))}
                    </div>
                  </div>
                )}</details>
              </Card>

              {/* Property Rent Breakdown */}
              <Card className="p-5">
                <h3 className="text-lg font-semibold mb-4">Service Income & Rent</h3><p className="text-xs text-[var(--text-muted)] mb-4">Let Only shows agreed fees earned after the agreement is signed and the initial balance is received. Other services show monthly rents, excluding Fleming-owned properties.</p>
                {Object.keys(statusGroups).length === 0 ? (
                  <EmptyState message="No property data available" icon={<Home size={24} />} />
                ) : (
                  <div className="space-y-3">
                    {Object.entries(statusGroups).map(([status, data]) => (
                      <div key={status} className="flex items-center justify-between p-3 bg-[var(--bg-subtle)] rounded-xl">
                        <div>
                          <p className="text-sm font-medium capitalize">{status.replace(/_/g, ' ')}</p>
                          <p className="text-xs text-[var(--text-muted)]">{data.count} propert{data.count !== 1 ? 'ies' : 'y'}</p>
                        </div>
                        <div className="text-right"><p className="text-sm font-semibold">{fmt(data.rent)}<span className="text-[var(--text-muted)] text-xs">{status==='Let Only Service'?' earned':'/mo'}</span></p>{status==='Let Only Service'&&<p className="text-xs text-[var(--text-muted)]">{fmt(Number(summary.let_only_fee_month||0))} this month</p>}</div>
                      </div>
                    ))}
                    {/* Total */}
                    <div className="flex items-center justify-between p-3 bg-gradient-to-r from-orange-500/10 to-pink-500/10 rounded-xl border border-orange-500/20">
                      <p className="text-sm font-semibold">Portfolio Turnover (monthly total)</p>
                      <p className="text-sm font-bold">{fmt(totalMonthlyRent)}<span className="text-[var(--text-muted)] text-xs">/mo</span></p>
                    </div>
                  </div>
                )}
              </Card>
              <div className="lg:col-span-2"><ClientEarnings refreshKey={bankMessage}/></div>
            </div>

            {bankTransactions.length > 0 && (
              <div id="bank-transactions"><Card className="p-5 mt-6">
                <h3 className="text-lg font-semibold mb-2">Bank Transactions</h3><div className="flex flex-wrap justify-between items-center gap-3 mb-3"><p className="text-sm text-[var(--text-muted)] flex-1 min-w-56">Transactions are imported daily into Financials. Rent reminders are sent manually from tenant records.</p><Select className="w-56" hideLabel label="Filter Bank Transactions" value={bankFilter} onChange={setBankFilter} options={[{value:'unmatched',label:'Needs Review'},{value:'all',label:'All Transactions'},{value:'ignored',label:'Ignored'},{value:'security',label:'Security Deposits'},{value:'holding',label:'Holding Deposits'}]}/></div>
                <div className="overflow-x-auto">
                  <div className="min-w-[860px]">
                    <div className="grid grid-cols-[100px_minmax(160px,1fr)_minmax(180px,1.2fr)_110px_170px] gap-3 text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wider pb-2 border-b border-[var(--border-subtle)]">
                      <span>Date</span><span>Description</span><span>Assignment</span><span className="text-right">Amount</span><span className="text-right">Action</span>
                    </div>
                    {(bankFilter==='security'||bankFilter==='holding'?deposits.transactions.filter(t=>t.allocations?.some(a=>bankFilter==='holding'?a.kind==='holding_deposit':a.kind==='deposit'||a.category?.startsWith('Security Deposit Payments'))):bankTransactions).filter(t=>['security','holding'].includes(bankFilter)||bankFilter==='all'||t.match_status===(bankFilter==='unmatched'?'unmatched':bankFilter)).map(transaction => (
                      <div key={transaction.id} className="grid grid-cols-[100px_minmax(160px,1fr)_minmax(180px,1.2fr)_110px_170px] gap-3 py-2.5 border-b border-[var(--border-subtle)] text-sm items-center">
                        <span className="text-[var(--text-muted)]">{new Date(transaction.booked_at).toLocaleDateString('en-GB')}</span>
                        <span className="truncate">{transaction.display_name || transaction.description || transaction.merchant_name || 'Bank transaction'}</span><div className="text-xs space-y-1 break-words">{transaction.allocations?.length?transaction.allocations.map((a,i)=><div key={i}><p className="font-medium">{a.kind.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase())}{a.category?` · ${a.category}`:''} · {fmt(Number(a.amount))}</p><p>{a.tenant_name||a.property_address||transaction.tenant_name||transaction.property_address}</p>{a.notes&&<p className="text-[var(--text-muted)] whitespace-pre-wrap">{a.notes}</p>}</div>):<span className="text-[var(--text-muted)]">{transaction.match_status==='ignored'?'Ignored':'Unassigned'}</span>}</div>
                        <span className={`text-right font-medium ${Number(transaction.amount) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{Number(transaction.amount) >= 0 ? '+' : '-'}{fmt(Math.abs(Number(transaction.amount)))}</span>
                        <div className="flex justify-end items-center gap-2 whitespace-nowrap">{transaction.match_status==='unmatched'?<><Button size="sm" className="rounded-full" disabled={bankBusy} onClick={()=>void beginAssign(transaction)}>Assign</Button><Button size="sm" variant="outline" className="!bg-red-500/10 !text-red-600 !border-red-500/20 rounded-full" disabled={bankBusy} onClick={()=>void reconcile(transaction,'ignore')}>Ignore</Button></>:transaction.match_status==='ignored'?<Button size="sm" variant="outline" className="rounded-full" disabled={bankBusy} onClick={()=>void reconcile(transaction,'restore')}>Undo Ignore</Button>:<Button size="sm" variant="outline" className="rounded-full" onClick={()=>void beginAssign(transaction)}>View / Edit</Button>}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card></div>
            )}

            <GlassCard className="mt-6 p-5"><details><summary className="font-semibold cursor-pointer">Vacancy Loss · {fmt(vacancyLoss)} · View Calculation</summary><p className="text-sm text-[var(--text-muted)] mt-3">Recorded gaps after a tenancy ends, through the day before the next starts (or today). Rent uses the property's monthly rent, prorated by the days in each month. Actual marketing, council tax and utility costs within the gap are included; dated coverage is prorated. Dates before the first recorded tenancy are excluded.</p><div className="overflow-x-auto mt-4"><table className="w-full text-sm text-left"><thead><tr><th>Property / Period</th><th>Days</th><th>Lost Rent</th><th>Costs</th><th>Total</th></tr></thead><tbody>{summary.vacancy_loss?.periods.map((p,i)=><tr key={i} className="border-t border-[var(--border-input)]"><td className="py-3 pr-3">{p.address}<p className="text-xs text-[var(--text-muted)]">{new Date(p.from).toLocaleDateString('en-GB')} – {new Date(p.through).toLocaleDateString('en-GB')}</p></td><td>{p.days}</td><td>{fmt(p.rent)}</td><td>{fmt(p.costs)}</td><td>{fmt(p.total)}</td></tr>)}</tbody></table></div>{!summary.vacancy_loss?.periods.length&&<p className="text-sm mt-3">No dated vacancy gaps are recorded.</p>}{!!summary.vacancy_loss?.missing_dates.length&&<p className="text-sm text-amber-600 mt-3">Vacancy dates are missing for: {summary.vacancy_loss.missing_dates.map(p=>p.address).join('; ')}. These properties are excluded from the loss total until their tenancy dates are recorded.</p>}</details></GlassCard>

            {/* Vacancy info */}
            <GlassCard className="mt-6 p-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-sm font-semibold mb-1">Vacancy Rate</h3>
                  <p className="text-xs text-[var(--text-muted)]">{totalCount - occupiedCount} of {totalCount} properties vacant</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-32 sm:w-48 h-2 bg-[var(--bg-hover)] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-orange-500 to-pink-500 rounded-full transition-all" style={{ width: `${100 - vacancyRate}%` }} />
                  </div>
                  <span className="text-sm font-bold">{(100 - vacancyRate).toFixed(0)}%</span>
                  <span className="text-xs text-[var(--text-muted)]">occupied</span>
                </div>
              </div>
            </GlassCard>
          </>
        )}
      </div>
    </Layout>
  );
}
