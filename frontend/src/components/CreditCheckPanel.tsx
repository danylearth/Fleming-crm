import {useState} from 'react';
import {CheckCircle,FileText,Eye,Download} from 'lucide-react';
import {useAuth} from '../context/AuthContext';
import {useApi} from '../hooks/useApi';
import {Button,Select} from './ui';
import {isValidCreditScore} from '../utils/creditChecks';

type CreditEnquiry={id:number;first_name_1?:string;last_name_1?:string;application_review_status?:string;credit_check_completed?:number|boolean;credit_score?:string;credit_check_date?:string};
type CreditDocument={id:number;doc_type:string;original_name:string};
type Props={enquiry:CreditEnquiry;documents:CreditDocument[];onSaved:()=>Promise<void>;onView:(id:number,name:string)=>Promise<void>;onDownload:(id:number,name:string)=>Promise<void>};

export default function CreditCheckPanel({enquiry,documents,onSaved,onView,onDownload}:Props){
 const {token}=useAuth();const api=useApi();
 const [score,setScore]=useState(String(enquiry.credit_score||''));
 const [details,setDetails]=useState<Record<string,string>>({});
 const [file,setFile]=useState<File|null>(null),[replacing,setReplacing]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const [saved,setSaved]=useState<{record:CreditEnquiry;documents:CreditDocument[]}|null>(null);
 const record=saved?.record||enquiry;
 const report=(saved?.documents||documents).find(doc=>doc.doc_type==='Credit Check Report');
 const completed=Boolean(record.credit_check_completed);
 const editable=record.application_review_status==='approved';
 const showForm=!completed||!report||replacing;
 const name=[enquiry.first_name_1,enquiry.last_name_1].filter(Boolean).join(' ');
 const inputClass='mt-1 block w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-sm';
 async function save(){
  if(!token||!editable||!isValidCreditScore(score)||!file)return;
  setSaving(true);setError('');
  try{
   const body=new FormData();body.append('score',score.trim());body.append('report',file);body.append('result',JSON.stringify({...details,bankruptcy:details.bankruptcy?details.bankruptcy==='true':undefined}));
   const response=await fetch(`${import.meta.env.VITE_API_URL||''}/api/tenant-enquiries/${enquiry.id}/credit-check`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'Credit check could not be saved');
   const [updatedRecord,updatedDocuments]=await Promise.all([api.get(`/api/tenant-enquiries/${enquiry.id}`),api.get(`/api/documents/tenant_enquiry/${enquiry.id}`)]);
   setSaved({record:updatedRecord,documents:updatedDocuments});setFile(null);setReplacing(false);await onSaved();
  }catch(e){setError(e instanceof Error?e.message:'Credit check could not be saved');}finally{setSaving(false);}
 }
 async function openReport(download=false){
  if(!report)return;
  try{await(download?onDownload:onView)(report.id,report.original_name);}catch(e){setError(e instanceof Error?e.message:'Report could not be opened');}
 }
 return <section aria-label={`${name} credit check`} className={`credit-check-fields min-w-0 rounded-xl border p-3 space-y-2 ${completed?'border-emerald-500/30 bg-emerald-500/5':'border-[var(--border-input)]'}`}>
  <div className="flex items-center justify-between gap-3"><h5 className="text-base font-semibold">{name}</h5><span className={`rounded-full border border-transparent px-3 py-1 text-xs font-medium ${completed?'bg-emerald-500/15 text-[var(--onboarding-success)]':'bg-amber-500/15 text-[var(--onboarding-warning)]'}`}>{completed?'Completed':'Pending'}</span></div>
  <h5 className="text-base font-semibold">Credit Check Result</h5>
  {!editable&&<p className="text-sm text-[var(--onboarding-warning)]">Approve this applicant’s application before recording their credit check.</p>}
  {report&&<div className={`rounded-xl border p-3 space-y-3 ${completed?'border-emerald-500/20 bg-emerald-500/10':'border-[var(--border-input)] bg-[var(--bg-subtle)]'}`}>
   <div className="flex items-start gap-2"><FileText size={16} className="shrink-0 mt-0.5"/><p className="min-w-0 break-words text-sm">{report.original_name}</p></div>
   <div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="outline" onClick={()=>void openReport()}><Eye size={14} className="mr-1"/>View</Button><Button size="sm" variant="outline" onClick={()=>void openReport(true)}><Download size={14} className="mr-1"/>Download</Button>{completed&&!replacing&&<Button size="sm" variant="outline" disabled={!editable} onClick={()=>setReplacing(true)}>Replace</Button>}</div>
  </div>}
  {completed&&<p className="flex items-center gap-2 text-sm text-[var(--onboarding-success)]"><CheckCircle size={16}/>Credit score / rating: {record.credit_score}{record.credit_check_date&&` · ${new Date(record.credit_check_date).toLocaleDateString('en-GB')}`}</p>}
  {showForm&&<>
   <fieldset disabled={saving||!editable} className="space-y-2 disabled:opacity-60">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
     <label className="text-sm">Credit Score *<input required inputMode="numeric" pattern="[0-9]+" value={score} onChange={e=>setScore(e.target.value)} placeholder="e.g. 720" className={inputClass}/></label>
     <Select className="credit-select" label="Credit Rating" compact searchable={false} disabled={saving||!editable} value={details.rating||''} onChange={rating=>setDetails({...details,rating})} options={[{value:'',label:'Not supplied'},...['Very Poor','Poor','Fair','Good','Excellent'].map(label=>({value:label.toUpperCase().replace(/ /g,'_'),label}))]}/>
    </div>
    <label className="block text-sm">Upload Credit Report *
     <span className={`relative mt-1 flex min-h-11 items-center gap-3 rounded-lg border px-3 py-1.5 focus-within:ring-2 focus-within:ring-purple-400 ${file?'border-purple-400 bg-purple-500/10':'border-[var(--border-input)] bg-[var(--bg-input)]'}`}>
      <input aria-label="Upload Credit Report" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFile(e.target.files?.[0]||null)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0"/>
      <span className="shrink-0 rounded-md bg-[var(--bg-hover)] px-2 py-1">{file?'Change File':'Choose File'}</span>
      <span className="min-w-0"><span className="block truncate" title={file?.name}>{file?.name||'No file selected'}</span>{file&&<span className="block text-xs text-purple-600 dark:text-purple-300">Ready to save</span>}</span>
     </span>
    </label>
    <label className="block text-sm">Report Reference<input value={details.reference||''} onChange={e=>setDetails({...details,reference:e.target.value})} className={inputClass}/></label>
    <details className="rounded-xl border border-[var(--border-input)] p-3"><summary className="text-sm cursor-pointer">Additional Report Details</summary><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
     {([['provider','Provider'],['active_ccjs','Active CCJs'],['satisfied_ccjs','Satisfied CCJs'],['active_ccj_value','Active CCJ Value (£)'],['satisfied_ccj_value','Satisfied CCJ Value (£)'],['insolvencies','Insolvencies']] as const).map(([key,label])=><label key={key} className="text-sm">{label}<input type={key==='provider'?'text':'number'} min={0} step={key.endsWith('_value')?'0.01':'1'} value={details[key]||''} placeholder="Not supplied" onChange={e=>setDetails({...details,[key]:e.target.value})} className={inputClass}/></label>)}
     <Select className="credit-select" label="Bankruptcy" compact searchable={false} disabled={saving||!editable} value={details.bankruptcy||''} onChange={bankruptcy=>setDetails({...details,bankruptcy})} options={[{value:'',label:'Not supplied'},{value:'true',label:'Recorded'},{value:'false',label:'None recorded'}]}/>
    </div></details>
   </fieldset>
   <aside className="rounded-xl border border-[var(--border-input)] bg-[var(--bg-subtle)] p-3 flex flex-wrap items-center justify-between gap-2"><h5 className="font-semibold text-base">Actions & Previews</h5><div className="flex flex-wrap justify-end gap-2">{replacing&&<Button size="sm" variant="outline" disabled={saving} onClick={()=>{setReplacing(false);setFile(null);}}>Cancel</Button>}<Button size="sm" variant={completed?'outline':'gradient'} disabled={saving||!editable||!isValidCreditScore(score)||!file} onClick={()=>void save()}>{saving?'Saving…':completed?'Save Replacement':'Save Result & Report'}</Button></div></aside>
  </>}
  {error&&<p role="alert" className="text-sm text-[var(--onboarding-danger)]">{error}</p>}
 </section>;
}
