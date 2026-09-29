import {useState} from 'react';
import {CheckCircle,FileText,Eye,Download,RefreshCw,Plus} from 'lucide-react';
import {useAuth} from '../context/AuthContext';
import {Button,DatePicker} from './ui';

export type ComplianceDocument={docType:string;label:string;expiryDate:string|null;ready:boolean;reason:string|null;document?:{id:number;original_name:string}};
const expiryTypes=['EPC','EICR','Gas Safety Certificate'];
const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;

export default function AgreementComplianceDocuments({propertyId,enquiryId,items,onView,onDownload,onChange}:{propertyId:number;enquiryId:number;items:ComplianceDocument[];onView:(id:number,name:string)=>void;onDownload:(id:number,name:string)=>void;onChange:()=>Promise<void>}){
 const {token,user}=useAuth();
 const [editing,setEditing]=useState<string|null>(null),[file,setFile]=useState<File|null>(null),[expiry,setExpiry]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const save=async(item:ComplianceDocument)=>{
  if(!token||(!file&&!item.document)||(expiryTypes.includes(item.docType)&&!validDate(expiry)))return;
  setBusy(true);setError('');setNotice('');
  try{
   const body=new FormData();if(file)body.append('file',file);body.append('doc_type',item.docType);body.append('enquiry_id',String(enquiryId));if(expiryTypes.includes(item.docType))body.append('expiry_date',expiry);
   const response=await fetch(`${import.meta.env.VITE_API_URL||''}/api/properties/${propertyId}/compliance-documents`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Document could not be saved');
   setEditing(null);setFile(null);setNotice(`${item.label} saved to the property record.`);
   window.dispatchEvent(new CustomEvent('crm-activity-updated',{detail:{entityType:'property',entityId:propertyId}}));
   try{await onChange();}catch{setError('The document was saved, but its status could not be refreshed. Please reopen this stage.');}
  }catch(e){setError(e instanceof Error?e.message:'Document could not be saved');}finally{setBusy(false);}
 };
 return <div className="agreement-compliance-documents space-y-2">
  {notice&&<p role="status" className="flex items-center gap-2 text-xs text-[var(--onboarding-success)]"><CheckCircle size={14}/>{notice}</p>}
  {error&&<p role="alert" className="text-sm text-[var(--onboarding-danger)]">{error}</p>}
  {items.map(item=>{
   const isEditing=editing===item.docType;
   return <section key={item.docType} aria-label={`${item.label} property document`} className={`rounded-xl border p-3 ${item.ready?'border-emerald-500/25 bg-emerald-500/5':'border-[var(--border-input)] bg-[var(--bg-card)]'}`}>
    <div className="flex flex-wrap items-center gap-3">
     <FileText size={18} className="shrink-0"/>
     <div className="min-w-0 flex-1"><h6 className="text-sm font-semibold">{item.label}</h6><p className={`text-xs ${item.ready?'text-[var(--onboarding-success)]':'text-[var(--onboarding-warning)]'}`}>{item.ready?(item.expiryDate?`Valid to ${new Date(`${item.expiryDate.slice(0,10)}T00:00:00`).toLocaleDateString('en-GB')}`:'Saved to property'):item.reason}</p></div>
     {!isEditing&&<div className="flex flex-wrap gap-2">
      {item.document&&<><Button size="sm" variant="outline" className="gap-1.5 !min-h-9 !text-[13px]" onClick={()=>onView(item.document!.id,item.document!.original_name)}><Eye size={14}/>View</Button><Button size="sm" variant="outline" className="gap-1.5 !min-h-9 !text-[13px]" onClick={()=>onDownload(item.document!.id,item.document!.original_name)}><Download size={14}/>Download</Button></>}
      {user?.role!=='viewer'&&<Button size="sm" variant="outline" className="gap-1.5 !min-h-9 !text-[13px]" disabled={busy} onClick={()=>{setEditing(item.docType);setExpiry(item.expiryDate?.slice(0,10)||'');setFile(null);setError('');setNotice('');}}>{item.document?<RefreshCw size={14}/>:<Plus size={14}/>} {item.document?'Update':'Add'}</Button>}
     </div>}
    </div>
    {item.document&&<p className="mt-1 text-xs text-[var(--text-secondary)] break-words">{item.document.original_name}</p>}
    {isEditing&&<div className="mt-2 space-y-2 border-t border-[var(--border-subtle)] pt-2">
     <fieldset disabled={busy} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_200px] gap-3 items-start disabled:opacity-60">
      <label className="min-w-0 text-sm">{item.document?'Replacement document (optional)':'Document *'}
       <span className={`relative mt-1 flex min-h-11 items-center gap-2 rounded-lg border px-3 py-1.5 focus-within:ring-2 focus-within:ring-purple-400 ${file?'border-purple-400 bg-purple-500/10':'border-[var(--border-input)] bg-[var(--bg-input)]'}`}>
        <input aria-label={`${item.label} file`} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFile(e.target.files?.[0]||null)}/>
        <span className="shrink-0 rounded-md bg-[var(--bg-hover)] px-2 py-1">{file?'Change File':'Choose File'}</span><span className="min-w-0"><span className="block truncate" title={file?.name}>{file?.name||(item.document?'Keep current file':'No file selected')}</span>{file&&<span className="block text-xs text-purple-600 dark:text-purple-300">Ready to save</span>}</span>
       </span>
      </label>
      {expiryTypes.includes(item.docType)&&<DatePicker className="compliance-expiry" label="Expiry date *" value={expiry} onChange={setExpiry}/>}
     </fieldset>
     <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-[var(--text-secondary)]">Saves directly to the property record and updates its compliance information and renewal dates.</p><div className="ml-auto flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>{setEditing(null);setError('');}}>Cancel</Button><Button size="sm" variant="gradient" disabled={busy||(!file&&!item.document)||(expiryTypes.includes(item.docType)&&!validDate(expiry))} onClick={()=>void save(item)}>{busy?'Saving…':'Save Document'}</Button></div></div>
    </div>}
   </section>;
  })}
 </div>;
}
