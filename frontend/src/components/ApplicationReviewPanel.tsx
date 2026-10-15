import AcceptableDocumentsGuide from './AcceptableDocumentsGuide';
import MandatoryDocumentBadge from './ui/MandatoryDocumentBadge';
import DeliveryChoices from './ui/DeliveryChoices';
import {useEffect,useState,useRef} from 'react';
import {createPortal} from 'react-dom';
import {FileText,X,ChevronDown} from 'lucide-react';
import {useApi} from '../hooks/useApi';
import {Button,Select} from './ui';
import EmailPreviewModal from './ui/EmailPreviewModal';
import {applicationReviewSections,missingDocumentRequest,onboardingReviewNotes} from '../utils/applicationReview';

type RecordData=Record<string,any>;
type Props={enquiry:RecordData;documents:RecordData[];onChange:()=>Promise<void>;onView:(id:number,name:string)=>Promise<void>;onDownload:(id:number,name:string)=>Promise<void>;apiBase?:string};
const capitaliseFirst=(value:string)=>value.replace(/^(\s*)(\p{L})/u,(_,space,letter)=>space+letter.toUpperCase());
const colour=(status?:string)=>status==='approved'?'border-emerald-500/30 bg-emerald-500/10':status==='rejected'?'border-red-500/30 bg-red-500/10':status==='pending'?'border-amber-500/30 bg-amber-500/10':'border-[var(--border-input)] bg-[var(--bg-subtle)]';

export default function ApplicationReviewPanel({enquiry:initial,documents:initialDocuments,onChange,onView,onDownload,apiBase}:Props){
 const api=useApi();const actionsRef=useRef<HTMLElement>(null);
 const revealChanges=()=>{setShowApplication(false);setEmail(true);requestAnimationFrame(()=>actionsRef.current?.scrollIntoView({block:"nearest",behavior:"smooth"}));};
 const [enquiry,setEnquiry]=useState(initial),[documents,setDocuments]=useState(initialDocuments);
 const recordBase=apiBase||`/api/tenant-enquiries/${enquiry.id}`;
 const documentBase=(id:number)=>apiBase?`${apiBase}/files/${id}`:`/api/documents/${id}`;
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notes,setNotes]=useState('');
 const [showApplication,setShowApplication]=useState(initial.applicant_type==='guarantor'&&new URLSearchParams(location.search).has('applicationDetails')),[rejection,setRejection]=useState<{section?:string;document?:number;label:string}|null>(null),[reason,setReason]=useState('');
 const [email,setEmail]=useState(initial.applicant_type==='guarantor'),[sms,setSms]=useState(false),[emailPreview,setEmailPreview]=useState<any>(null),[smsPreview,setSmsPreview]=useState(false);
 useEffect(()=>setEnquiry(initial),[initial]);useEffect(()=>setDocuments(initialDocuments),[initialDocuments]);
 const name=[enquiry.first_name_1,enquiry.last_name_1].filter(Boolean).join(' ');
 const sections=applicationReviewSections(enquiry);
 const sectionLabel=(title:string)=>enquiry.applicant_type==='guarantor'&&title==='Address & Landlord'?'Current Address':title;
 const reviews=enquiry.application_section_reviews||{};
 const decision=(section:string)=>reviews[section]||reviews['Application Details']||(enquiry.application_review_status==='approved'?{status:'approved'}:{});
 const sectionPriority=(title:string)=>decision(title).status==='rejected'?0:decision(title).status==='pending'?1:decision(title).status==='approved'?3:2;
 const waiting=enquiry.application_review_status==='changes_requested'&&!!enquiry.application_changes_sent_at;
 const reviewDocs=documents.filter(d=>!['Completed Tenancy Application','Tenancy Agreement','Signed Tenancy Agreement','Signed Deed of Guarantee',...(apiBase?['Credit Check Report']:[])].includes(d.doc_type)).sort((a,b)=>(a.review_status==='approved'?2:a.review_status==='rejected'?0:1)-(b.review_status==='approved'?2:b.review_status==='rejected'?0:1));
 const required=['Primary Identification','Secondary Identification','Bank Statements',...(enquiry.applicant_type!=='guarantor'&&['Student','Unemployed'].includes(enquiry.app_form_data?.employment_status)?[]:['Proof of Income or Employment'])];
 const missing=required.filter(type=>!reviewDocs.some(d=>d.doc_type===type));
 const overrides=enquiry.application_document_overrides||{};
 const isOverridden=(type:string)=>overrides[type]?.status==='overridden';
 const allSections=sections.length>0&&sections.every(s=>decision(s.title).status==='approved');
 const hasRejections=sections.some(s=>decision(s.title).status==='rejected')||reviewDocs.some(d=>d.review_status==='rejected');
 const allDocuments=required.every(type=>reviewDocs.some(d=>d.doc_type===type&&d.review_status==='approved')||(missing.includes(type)&&isOverridden(type)))&&reviewDocs.every(d=>d.review_status==='approved');
 const approved=enquiry.application_review_status==='approved'&&allSections&&allDocuments;
 const awaitingTenant=waiting||!enquiry.application_form_completed;
 const statusClass=approved?'border-emerald-500/30 bg-emerald-500/15 text-[var(--onboarding-success)]':hasRejections&&!waiting?'border-red-500/30 bg-red-500/15 text-[var(--onboarding-danger)]':'border-amber-500/30 bg-amber-500/15 text-[var(--onboarding-warning)]';
 const changes=[...Object.entries(reviews).filter(([,r]:any)=>r.status==='rejected').map(([section,r]:any)=>`${sectionLabel(section)}: ${r.reason||''}`),...reviewDocs.filter(d=>d.review_status==='rejected').map(d=>`${d.doc_type}: ${d.review_notes||''}`),...missing.filter(type=>!isOverridden(type)).map(type=>missingDocumentRequest[type])].join('\n\n');
 const savedNotes=onboardingReviewNotes(enquiry.notes,enquiry.application_review_request);
 const url=enquiry.application_form_url|| (enquiry.applicant_type==='guarantor'?`${location.origin}/guarantor/index.html#apply`:`https://apply.fleminglettings.co.uk/${enquiry.application_form_slug||enquiry.application_form_token}`);
 const smsText=`Hi ${enquiry.first_name_1||'there'}, we have reviewed your application and require further information or documentation. Please reopen your application: ${url}. For help, call 01902 212 415. Fleming Lettings.`;
 async function save(action:()=>Promise<any>){
  setBusy(true);setError('');
  try{
   const result=await action();
   const failed=Object.values(result?.delivery||{}).filter((d:any)=>!d.success) as {error?:string}[];
   if(failed.length)setError('Review saved, but communication failed: '+failed.map(d=>d.error).join('; '));
   const [record,docs]=await Promise.all([api.get(apiBase?`${apiBase}/record`:recordBase),api.get(apiBase?`${apiBase}/files`:`/api/documents/tenant_enquiry/${enquiry.id}`)]);
   setEnquiry(record);setDocuments(docs);setRejection(null);setReason('');await onChange();
  }catch(e){setError(e instanceof Error?e.message:'The review could not be saved.');}finally{setBusy(false);}
 }
 const sectionReview=(section:string,status:string)=>save(async()=>{
  const result=await api.put(`${recordBase}/section-review`,{section,status,reason});
  if(status==='rejected')revealChanges();
  if(status==='approved'&&sections.every(s=>s.title===section||decision(s.title).status==='approved'))setShowApplication(false);
  return result;
 });
 const documentReview=(id:number,status:string)=>save(async()=>{const result=await api.put(`${documentBase(id)}/review`,{status,notes:status==='rejected'?reason:null});if(status==='rejected')revealChanges();return result;});
 const finish=(status:string)=>save(async()=>{const result=await api.post(`${recordBase}/application-review`,{status,notes:notes||null,changes_required:status==='changes_requested'?changes:null,send_email:status==='changes_requested'&&email,send_sms:status==='changes_requested'&&sms,...(sms?{sms_message:smsText}:{})});setNotes('');return result;});
 const openDocument=async(doc:RecordData,download=false)=>{try{await (download?onDownload:onView)(doc.id,doc.original_name);}catch(e){setError(e instanceof Error?e.message:'Document could not be opened.');}};
 const reject=(value:{section?:string;document?:number;label:string},existing?:string|null)=>{setReason(existing||'');setRejection(value);};
 const modal=(title:string,close:()=>void,body:React.ReactNode)=>createPortal(<div role="dialog" aria-modal="true" aria-label={`${name} — ${title}`} className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4" onClick={close}><div className="application-review-modal w-full max-w-3xl max-h-[88dvh] overflow-hidden rounded-2xl bg-[var(--bg-card)] text-[var(--text-primary)] flex flex-col" onClick={e=>e.stopPropagation()}><div className="flex items-center justify-between gap-4 border-b border-[var(--border-input)] p-5"><h3 className="text-lg font-semibold">{name} — {title}</h3><button aria-label="Close review" onClick={close}><X size={20}/></button></div><div className="overflow-y-auto p-5 space-y-4">{body}</div></div></div>,document.body);
 const sectionControls=(title:string)=><div className="review-section-actions flex shrink-0 flex-col gap-2">{decision(title).status==='approved'?<Button size="sm" variant="outline" className="review-reject" disabled={busy||waiting} onClick={()=>void sectionReview(title,'pending')}>Reset</Button>:<><Button size="sm" variant="outline" className="review-approve" disabled={busy||waiting} onClick={()=>void sectionReview(title,'approved')}>Approve</Button><Button size="sm" variant="outline" className="review-reject" disabled={busy||waiting} onClick={()=>reject({section:title,label:sectionLabel(title)},decision(title).reason)}>Reject</Button></>}</div>;
 const reviewActions=(<>   {!approved&&!waiting&&<aside ref={actionsRef} className="application-review-actions rounded-xl border border-[var(--border-input)]"><h5 className="font-semibold text-base">Actions & Previews</h5><p className="text-xs text-[var(--text-muted)]">Approve each application section and the required supporting documents to continue.</p>{changes&&<div aria-label="Rejection summary" className="rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-sm space-y-2"><h6 className="font-semibold">Reason for Rejection:</h6>{changes.split('\n\n').map((change,index)=><p key={index} className="whitespace-pre-wrap break-words">{change}</p>)}</div>}<label className="block text-sm">Add Internal Notes<textarea value={notes} onChange={e=>setNotes(capitaliseFirst(e.target.value))} rows={3} className="mt-2 block w-full resize-y rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] p-2"/></label>
    {changes&&<DeliveryChoices email={email} sms={sms} onEmail={setEmail} onSms={setSms} previewEmail={async()=>{try{setEmailPreview(await api.post(`${recordBase}/application-review/email-preview`,{changes_required:changes}));}catch(e){setError(String(e));}}} previewSms={()=>setSmsPreview(true)}/>}
    <div className="review-final-actions">
     {changes&&<Button size="sm" variant={hasRejections?'primary':'outline'} className={`review-final-action ${hasRejections?'review-primary-action':''}`} disabled={busy} onClick={()=>void finish('changes_requested')}>{email||sms?'Send Change Request':'Save Changes Required'}</Button>}
     {!hasRejections&&<Button size="sm" variant="primary" className="review-final-action review-primary-action" disabled={busy||!allSections||!allDocuments} onClick={()=>void finish('approved')}>Approve Application</Button>}
    </div>
   </aside>}</>);
 return <section aria-label={`${name} application review`} className={`min-w-0 rounded-xl border p-3 space-y-4 application-review-rows ${approved?'border-emerald-500/30 bg-emerald-500/5':hasRejections&&!waiting?'border-red-500/30 bg-red-500/5':enquiry.application_form_completed?'border-amber-500/30 bg-amber-500/10':'border-[var(--border-input)]'}`}>
  <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="font-semibold text-base">{name}</h5><span className={`ml-auto rounded-full border px-3 py-1 text-xs font-medium ${statusClass}`}>{approved?'Completed':awaitingTenant?(enquiry.applicant_type==='guarantor'?'Waiting on Guarantor':'Waiting on Tenant'):hasRejections?'Changes Required':'Ready for Review'}</span></div>
  {!enquiry.application_form_completed?<p className="text-sm">Waiting for this applicant to submit their form and documents.</p>:<div className="space-y-4"><div className="min-w-0 space-y-4">
   {waiting&&<p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">Review will reopen when this applicant resubmits. Approved sections stay locked.</p>}
   <div className={`rounded-xl border p-3 space-y-3 ${allSections?colour('approved'):sections.some(section=>decision(section.title).status==='rejected')?colour('rejected'):'border-amber-500/30 bg-amber-500/10'}`}><div className="flex items-center gap-2"><FileText size={18}/><div className="flex-1"><p className="font-semibold">Application Details</p><p className="text-xs">{allSections?'Approved':`${sections.filter(s=>decision(s.title).status==='approved').length} of ${sections.length} sections approved`}</p></div><Button size="sm" variant="outline" onClick={()=>setShowApplication(true)}>View Application</Button></div>
   </div>
   <div className="flex flex-wrap items-center justify-between gap-3"><h5 className="font-semibold text-base">Supporting Documents</h5><AcceptableDocumentsGuide guarantor={enquiry.applicant_type==='guarantor'}/></div>
   {missing.map(type=><div key={type} className={`rounded-xl border px-3 py-2 flex items-center justify-between gap-3 ${colour(isOverridden(type)?'approved':'rejected')}`}><div className="min-w-0 flex-1"><p>{type}</p><p className={`text-xs font-semibold ${isOverridden(type)?'text-[var(--onboarding-success)]':'text-[var(--onboarding-danger)]'}`}>{isOverridden(type)?'Overridden':<MandatoryDocumentBadge/>}</p></div>{!apiBase&&<Button size="sm" variant="outline" className={`shrink-0 ${isOverridden(type)?'review-reject':'review-approve'}`} disabled={busy||waiting} onClick={()=>void save(()=>api.put(`${recordBase}/document-override`,{doc_type:type,overridden:!isOverridden(type)}))}>{isOverridden(type)?'Reset':'Override'}</Button>}</div>)}
   {reviewDocs.map(doc=><details key={`${doc.id}-${doc.review_status}`} open={doc.review_status!=='approved'} className={`group rounded-xl border ${colour(doc.review_status)}`}><summary onClick={event=>{if(doc.review_status!=='approved')event.preventDefault();}} className="flex cursor-pointer list-none items-center gap-2 rounded-xl p-3 focus-visible:outline-2 focus-visible:outline-purple-500 [&::-webkit-details-marker]:hidden"><FileText size={16} className="shrink-0"/><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{doc.doc_type}</p><p className="text-xs">{doc.review_status==='approved'?'Approved':doc.review_status==='rejected'?'Changes Required':'Needs Review'}</p></div><ChevronDown size={16} className="shrink-0 transition-transform group-open:rotate-180"/></summary><div className="border-t border-[var(--border-subtle)] p-3 space-y-2"><p className="break-words text-sm">{doc.original_name}</p>
    <Select label={`Category for ${doc.original_name}`} hideLabel compact standardControl searchable={false} value={doc.doc_type} disabled={busy||waiting} onChange={value=>void save(()=>api.put(`${documentBase(doc.id)}/category`,{doc_type:value}))} options={(apiBase?['Primary Identification','Secondary Identification','Bank Statements','Proof of Income or Employment','Employment Reference','Other']:['Primary Identification','Secondary Identification','Bank Statements','Proof of Income or Employment','Credit Check Report','Other Financial Document','Right-to-Rent Share Code','Other']).map(type=>({value:type,label:type==='Other Financial Document'?'Other Supporting Documentation':type}))}/>
    {doc.review_notes&&doc.review_status==='rejected'&&<p className="text-sm whitespace-pre-wrap">Reason for Rejection: {doc.review_notes}</p>}
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>void openDocument(doc)}>View</Button><Button size="sm" variant="outline" onClick={()=>void openDocument(doc,true)}>Download</Button>{doc.review_status==='approved'?<Button size="sm" variant="outline" className="review-reject" disabled={busy||waiting} onClick={()=>void documentReview(doc.id,'pending')}>Reset</Button>:<><Button size="sm" variant="outline" className="review-approve" disabled={busy||waiting} onClick={()=>void documentReview(doc.id,'approved')}>Approve</Button><Button size="sm" variant="outline" className="review-reject" disabled={busy||waiting} onClick={()=>reject({document:doc.id,label:doc.original_name},doc.review_notes)}>Reject</Button></>}</div>
   </div></details>)}
   {savedNotes.length>0&&<div className="space-y-2"><h5 className="font-semibold text-base">Previous Onboarding Notes</h5>{savedNotes.map(note=><div key={note.id} className="rounded-xl border border-[var(--border-input)] p-3"><p className="text-xs">{note.author}{note.created_at&&` · ${new Date(note.created_at).toLocaleString('en-GB')}`}</p><p className="whitespace-pre-wrap text-sm mt-1">{note.text}</p></div>)}</div>}

  </div>{reviewActions}</div>}
  {error&&<p role="alert" className="text-sm text-[var(--onboarding-danger)]">{error}</p>}
  {showApplication&&modal('Application Details',()=>setShowApplication(false),<>{[...sections].sort((a,b)=>sectionPriority(a.title)-sectionPriority(b.title)).map(section=><details key={section.title} open={['rejected','pending'].includes(decision(section.title).status)} className={'group rounded-xl border '+colour(decision(section.title).status)}><summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden"><h4 className="font-semibold text-base">{sectionLabel(section.title)}{decision(section.title).status==='approved'?' — Approved':decision(section.title).status==='rejected'?' — Changes Required':decision(section.title).status==='pending'?' — Ready for Review':''}</h4><ChevronDown size={18} className="shrink-0 transition-transform group-open:rotate-180"/></summary><div className="review-section-content flex items-center gap-4 border-t border-[var(--border-subtle)] p-4"><div className="min-w-0 flex-1 space-y-3"><dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">{section.answers.map(answer=><div key={answer.key}><dt className="text-sm text-[var(--text-muted)]">{answer.label}</dt><dd className="text-sm whitespace-pre-wrap break-words mt-1">{answer.value}</dd></div>)}</dl>{decision(section.title).reason&&<p className="text-sm whitespace-pre-wrap">Reason for Rejection: {decision(section.title).reason}</p>}</div>{sectionControls(section.title)}</div></details>)}{error&&<p role="alert">{error}</p>}</>)}
 
  {rejection&&modal('Reason for Rejection',()=>{if(!busy)setRejection(null);},<><p className="font-semibold break-words">{rejection.label}</p><textarea autoCapitalize="sentences" aria-label="Reason for rejection" value={reason} onChange={e=>setReason(capitaliseFirst(e.target.value))} rows={5} className="w-full rounded-xl border border-[var(--border-input)] bg-[var(--bg-input)] p-3"/><Button disabled={busy||!reason.trim()} onClick={()=>void(rejection.section?sectionReview(rejection.section,'rejected'):documentReview(rejection.document!,'rejected'))}>Save Rejection</Button>{error&&<p role="alert">{error}</p>}</>)}
  {smsPreview&&modal('Preview SMS',()=>setSmsPreview(false),<p className="whitespace-pre-wrap">{smsText}</p>)}
  <EmailPreviewModal open={!!emailPreview} onClose={()=>setEmailPreview(null)} onSend={async()=>undefined} to={enquiry.email_1||''} from="contact@tenancies.fleminglettings.co.uk" initialSubject={emailPreview?.subject||''} initialBodyHtml={emailPreview?.html||''} previewOnly/>
 </section>;
}
