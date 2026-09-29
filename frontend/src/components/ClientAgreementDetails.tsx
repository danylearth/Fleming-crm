import {useEffect,useState,useRef} from 'react';
import {createPortal} from 'react-dom';
import {CheckCircle,X} from 'lucide-react';
import {useApi} from '../hooks/useApi';
import {Button,Input,Select} from './ui';
import AgreementPaymentAccountSummary from './AgreementPaymentAccountSummary';

type Details={landlordName:string;landlordAddress:string;companyNumber:string;landlordEmail:string;landlordPhone:string;serviceAddress:string;emergencyContact:string;directorName:string;depositScheme:string;bankAccountName?:string;bankSortCode?:string;bankAccountNumber?:string};
type Account={accountName:string;sortCode:string;accountNumber:string;bankName:string};
type State={landlordId:number;isCompany:boolean;defaults:Details;details:Details;directors:{id:number;name:string}[];saved:boolean;ready:boolean;serviceType:string;suggestedPaymentAccount:Account|null;paymentAccount:Account|null;paymentConfirmed:boolean;paymentOverride:boolean;defaultAccountApproved:boolean;paymentInstructions:string;companyAccounts?:{business:Account;clientMoney:Account;cmpNumber:string}};
const emptyAccount:Account={accountName:'',sortCode:'',accountNumber:'',bankName:''};
const accountsMatch=(a:Account,b:Account|null)=>!!b&&a.accountName.trim()===b.accountName.trim()&&a.sortCode.replace(/\D/g,'')===b.sortCode.replace(/\D/g,'')&&a.accountNumber===b.accountNumber;
const validAccount=(account:Account)=>!!account.accountName.trim()&&/^\d{6}$/.test(account.sortCode.replace(/\D/g,''))&&/^\d{8}$/.test(account.accountNumber);
const defaultInstructions=(serviceType:string)=>serviceType==='let_only'?'Initial rental payment and holding deposit is paid into Fleming Lettings client money account. Future payments will then be paid directly to the Landlord’s nominated account below.':'Initial rental payment and holding deposit is paid into Fleming Lettings client money account. Future payments continue to be paid into the client money account.';

export default function ClientAgreementDetails({enquiryId,onReady}:{enquiryId:number;onReady:(ready:boolean)=>void}){
 const dirty=useRef(false),record=useRef(enquiryId),api=useApi();
 const [state,setState]=useState<State|null>(null),[details,setDetails]=useState<Details|null>(null),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [account,setAccount]=useState<Account>(emptyAccount),[paymentConfirmed,setPaymentConfirmed]=useState(false),[editingAccount,setEditingAccount]=useState(false),[confirmOverride,setConfirmOverride]=useState(false),[overrideChecked,setOverrideChecked]=useState(false);
 const [differentCorrespondenceAddress,setDifferentCorrespondenceAddress]=useState(false);
 const [showCompanyAccounts,setShowCompanyAccounts]=useState(false);
 const load=(value:State)=>{setState(value);setDetails({...value.details,bankAccountName:'',bankSortCode:'',bankAccountNumber:''});setDifferentCorrespondenceAddress(value.details.serviceAddress!==value.details.landlordAddress);setAccount(value.paymentAccount||value.suggestedPaymentAccount||emptyAccount);setPaymentConfirmed(value.paymentConfirmed);setEditingAccount(false);setSaved(value.saved);onReady(value.ready&&value.saved);};
 useEffect(()=>{let active=true;if(record.current!==enquiryId){dirty.current=false;record.current=enquiryId;}if(!dirty.current)onReady(false);api.get(`/api/tenant-enquiries/${enquiryId}/client-agreement-details`).then(value=>{if(active&&!dirty.current)load(value);}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[api,enquiryId,onReady]);
 const change=(key:keyof Details,value:string)=>{dirty.current=true;setDetails(d=>d?{...d,[key]:value,...(key==='landlordAddress'&&!differentCorrespondenceAddress?{serviceAddress:value}:{})}:d);setSaved(false);onReady(false);};
 const changeAccount=(key:keyof Account,value:string)=>{dirty.current=true;setAccount(a=>({...a,[key]:value}));setPaymentConfirmed(false);onReady(false);};
 const refresh=async()=>{setBusy(true);try{const value=await api.get(`/api/tenant-enquiries/${enquiryId}/client-agreement-details`);setState(value);setDetails(value.defaults);setDifferentCorrespondenceAddress(value.defaults.serviceAddress!==value.defaults.landlordAddress);dirty.current=true;setSaved(false);onReady(false);setError('');}catch(e){setError(String(e));}finally{setBusy(false);}};
 const save=async(confirmPayment=paymentConfirmed,overrideApproved=false)=>{
  if(!details)return;setBusy(true);setError('');
  try{const value=await api.put(`/api/tenant-enquiries/${enquiryId}/client-agreement-details`,{...details,payment_account:account,payment_confirmed:confirmPayment,payment_override_approved:overrideApproved||(paymentConfirmed&&!accountsMatch(account,state?.suggestedPaymentAccount||null))});dirty.current=false;load(value);setConfirmOverride(false);}
  catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
 };
 const confirmAccount=()=>{if(!state)return;if(!accountsMatch(account,state.suggestedPaymentAccount)){setOverrideChecked(false);setConfirmOverride(true);}else void save(true);};
 const initialPaymentAccount=state?.serviceType==='let_only'?state.companyAccounts?.clientMoney:account;
 return <>
  {error&&<p role="alert" className="text-sm text-[var(--onboarding-danger)]">{error}</p>}
  <section aria-label="Landlords Details" className={`rounded-xl border p-3 space-y-3 ${saved?'border-emerald-500/25 bg-emerald-500/5':'border-[var(--border-input)] bg-[var(--bg-subtle)]'}`}>
   <h5 className="text-base font-semibold flex items-center gap-2">Landlords Details{saved&&<CheckCircle size={17} className="text-[var(--onboarding-success)]"/>}</h5>
   {!state||!details?<p className="text-sm">Loading landlord details…</p>:<fieldset disabled={busy} className="space-y-3">
    <p className="text-xs text-[var(--text-secondary)]">Prefilled from the landlord record. Changes here apply to this agreement.</p>
    <div className="grid sm:grid-cols-2 gap-3">
     <Input label={state.isCompany?'Limited Company Name *':'Landlord Name *'} value={details.landlordName} onChange={v=>change('landlordName',v)}/><Input label={state.isCompany?'Registered Address *':'Home Address *'} value={details.landlordAddress} onChange={v=>change('landlordAddress',v)}/>
     {state.isCompany&&<><Input label="Company Number *" value={details.companyNumber} onChange={v=>change('companyNumber',v)}/>{state.directors.length>0&&<Select compact label="Choose Director" value={state.directors.find(d=>d.name===details.directorName)?.name||''} onChange={v=>change('directorName',v)} options={[{value:'',label:'Choose or enter below'},...state.directors.map(d=>({value:d.name,label:d.name}))]}/>}<Input label="Director Signing for Company *" value={details.directorName} onChange={v=>change('directorName',v)}/></>}
     <Input label="Landlord Email *" type="email" value={details.landlordEmail} onChange={v=>change('landlordEmail',v)}/><Input label="Landlord Phone *" value={details.landlordPhone} onChange={v=>change('landlordPhone',v)}/>
     <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" className="mt-1" checked={differentCorrespondenceAddress} onChange={e=>{setDifferentCorrespondenceAddress(e.target.checked);dirty.current=true;setSaved(false);onReady(false);if(!e.target.checked)setDetails(d=>d?{...d,serviceAddress:d.landlordAddress}:d);}}/><span>Is there a different correspondence address?</span></label>
     {differentCorrespondenceAddress&&<Input label="Correspondence Address *" value={details.serviceAddress} onChange={v=>change('serviceAddress',v)}/>}<Input label="Emergency Contact *" value={details.emergencyContact} onChange={v=>change('emergencyContact',v)}/>
    </div>
    <div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>void refresh()}>Refresh Details</Button><Button size="sm" variant="gradient" disabled={busy} onClick={()=>void save()}>{busy?'Saving…':saved?'Details Confirmed':'Confirm Landlord Details'}</Button></div>
   </fieldset>}
  </section>
  <section aria-label="Payment Account Confirmation" className={`rounded-xl border p-3 space-y-3 ${paymentConfirmed?'border-emerald-500/25 bg-emerald-500/5':'border-[var(--border-input)] bg-[var(--bg-subtle)]'}`}>
   <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="text-base font-semibold flex items-center gap-2">Payment Account Confirmation{paymentConfirmed&&<CheckCircle size={18} className="text-[var(--onboarding-success)]"/>}</h5><button type="button" className="company-account-details-button ml-auto rounded-lg bg-[#742878] px-2.5 py-1 text-[11px] leading-4 font-medium text-white hover:bg-[#632268] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500 disabled:opacity-40" disabled={!state?.companyAccounts} onClick={()=>setShowCompanyAccounts(true)}>View Company Account Details</button></div>
   {state&&<div role="note" aria-label="Initial payment account in the APT" className="rounded-lg border border-purple-500/15 bg-purple-500/5 px-3 py-2.5 text-sm leading-relaxed space-y-3">
    <p>{defaultInstructions(state.serviceType)}</p>
    <AgreementPaymentAccountSummary account={initialPaymentAccount}/>
   </div>}
   <h6 className="text-sm font-semibold">{state?.serviceType==='let_only'?'Future rental payments — landlord’s account':'Future rental payments'}</h6>
   <fieldset disabled={busy||!editingAccount} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <Input label="Account Name *" value={account.accountName} onChange={v=>changeAccount('accountName',v)}/><Input label="Bank Name" value={account.bankName} onChange={v=>changeAccount('bankName',v)}/><Input label="Sort Code *" value={account.sortCode} onChange={v=>changeAccount('sortCode',v.replace(/\D/g,'').slice(0,6).match(/.{1,2}/g)?.join('-')||'')}/><Input label="Account Number *" value={account.accountNumber} onChange={v=>changeAccount('accountNumber',v.replace(/\D/g,'').slice(0,8))}/>
   </fieldset>
   {state&&!state.defaultAccountApproved&&accountsMatch(account,state.suggestedPaymentAccount)&&<p className="text-xs text-[var(--onboarding-warning)]">The landlord’s saved account still needs approval before it can be confirmed.</p>}
   <div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="outline" disabled={busy||!state} onClick={()=>{setEditingAccount(true);setPaymentConfirmed(false);onReady(false);}}>Edit Account</Button>{editingAccount&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>{setAccount(state?.suggestedPaymentAccount||emptyAccount);setPaymentConfirmed(false);onReady(false);}}>Use Suggested Account</Button>}<Button size="sm" variant="gradient" disabled={busy||!state||!validAccount(account)||(accountsMatch(account,state.suggestedPaymentAccount)&&!state.defaultAccountApproved)} onClick={confirmAccount}>{paymentConfirmed?'Account Confirmed':'Confirm Payment Account'}</Button></div>
  </section>
  {showCompanyAccounts&&createPortal(<div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="company-accounts-heading" className="w-full max-w-3xl max-h-[90dvh] overflow-y-auto rounded-2xl bg-[var(--bg-card)] text-[var(--text-primary)] p-5 space-y-4 shadow-xl"><div className="flex items-center justify-between gap-3"><h3 id="company-accounts-heading" className="text-lg font-semibold">Company Account Details</h3><button aria-label="Close company account details" onClick={()=>setShowCompanyAccounts(false)}><X size={20}/></button></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{([{title:'Business Bank Account',account:state?.companyAccounts?.business},{title:'Client Money Account',account:state?.companyAccounts?.clientMoney}] as const).map(({title,account:companyAccount},index)=><section key={title} className="rounded-xl border border-[var(--border-input)] bg-[var(--bg-subtle)] p-4"><h4 className="text-base font-semibold mb-3">{title}</h4><dl className="space-y-2 text-sm">{[['Account Name',companyAccount?.accountName],['Bank',companyAccount?.bankName],['Sort Code',companyAccount?.sortCode],['Account Number',companyAccount?.accountNumber],...(index===1?[['CMP Number',state?.companyAccounts?.cmpNumber]]:[])].map(([label,value])=><div key={label}><dt className="text-xs text-[var(--text-secondary)]">{label}</dt><dd className="break-words">{value||'Not recorded'}</dd></div>)}</dl></section>)}</div><div className="flex justify-end"><Button variant="outline" onClick={()=>setShowCompanyAccounts(false)}>Close</Button></div></section></div>,document.body)}
  {confirmOverride&&createPortal(<div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="confirm-payment-heading" className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl bg-[var(--bg-card)] text-[var(--text-primary)] p-5 space-y-4 shadow-xl">
   <div className="flex items-center justify-between gap-3"><h3 id="confirm-payment-heading" className="text-lg font-semibold">Confirm Changed Payment Account</h3><button aria-label="Close account confirmation" disabled={busy} onClick={()=>setConfirmOverride(false)}><X size={20}/></button></div>
   <p className="text-sm">These details will replace the suggested payment account in this agreement. The property, landlord and company bank records will stay unchanged.</p>
   <dl className="rounded-xl border border-purple-300 bg-purple-500/5 p-3 grid grid-cols-2 gap-2 text-sm"><dt>Account Name</dt><dd>{account.accountName}</dd><dt>Sort Code</dt><dd>{account.sortCode}</dd><dt>Account Number</dt><dd>{account.accountNumber}</dd></dl>
   {error&&<p role="alert" className="text-sm text-[var(--onboarding-danger)]">{error}</p>}
   <label className="flex gap-2 text-sm"><input type="checkbox" checked={overrideChecked} onChange={e=>setOverrideChecked(e.target.checked)}/>I have checked these details and confirm they should be used for this agreement.</label>
   <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={()=>setConfirmOverride(false)}>Cancel</Button><Button variant="gradient" disabled={busy||!overrideChecked} onClick={()=>void save(true,true)}>{busy?'Saving…':'Confirm Account'}</Button></div>
  </section></div>,document.body)}
 </>;
}
