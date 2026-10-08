import {useState} from 'react';
import {createPortal} from 'react-dom';
import {Button,Select,DatePicker} from '../../frontend/src/components/ui';
import ApplicationReviewPanel from '../../frontend/src/components/ApplicationReviewPanel';
import {ReapplicationInvite} from './current-fields';

export default function ReapplicationIssue({enquiry,documents,onView,onDownload,onChange,guarantorDecision,onGuarantorDecision,applicationProgress}:any){
 const [setup,setSetup]=useState(false),[property,setProperty]=useState('same'),[type,setType]=useState('sole'),[date,setDate]=useState('2026-11-06');
 const approved=enquiry.application_review_status==='approved';
 return <div className="h-full min-h-0 flex flex-col gap-3">
  <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-[var(--text-secondary)]">Sole application · 99 Ringwood Road · Starts 06/11/2026</p><Button size="sm" variant="outline" onClick={()=>setSetup(true)}>Application Settings</Button></div>
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:h-full min-h-0 items-start overflow-y-auto lg:overflow-hidden">
   <section aria-label="Application form progress" className={`min-w-0 lg:h-full min-h-0 lg:overflow-y-auto rounded-xl border p-4 space-y-4 ${enquiry.application_form_completed?'border-emerald-500/30 bg-emerald-500/5':'border-[var(--border-input)]'}`}>
    <h5 className="font-semibold text-base">Application Form</h5>{applicationProgress}
    {!enquiry.application_form_sent&&!enquiry.application_form_completed&&<aside className="onboarding-actions space-y-3 border-t border-[var(--border-input)] pt-4"><h5 className="font-semibold">Actions &amp; Previews</h5><ReapplicationInvite embedded/></aside>}
    {approved&&<aside aria-label="Section actions" className="onboarding-actions rounded-xl border border-[var(--border-input)] bg-[var(--bg-subtle)] p-3 space-y-3 self-start"><h5 className="text-base font-semibold">Actions &amp; Previews</h5><Select label="Guarantor Required" value={guarantorDecision} onChange={onGuarantorDecision} options={[{value:'',label:'Select Yes or No'},{value:'yes',label:'Yes'},{value:'no',label:'No'}]} /></aside>}
   </section>
   <ApplicationReviewPanel enquiry={enquiry} documents={documents} onView={onView} onDownload={onDownload} onChange={onChange}/>
  </div>
  {setup&&createPortal(<div role="dialog" aria-modal="true" aria-label="Application Settings" className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4"><div className="application-review-modal w-full max-w-3xl rounded-2xl bg-[var(--bg-card)] text-[var(--text-primary)] overflow-hidden"><div className="flex justify-between p-5 border-b border-[var(--border-input)]"><h3 className="text-lg font-semibold">Application Settings</h3><button aria-label="Close application settings" onClick={()=>setSetup(false)}>×</button></div><div className="p-5 grid grid-cols-2 gap-4"><Select label="Property" value={property} onChange={setProperty} options={[{value:'same',label:'99 Ringwood Road'},{value:'different',label:'Select another property'}]}/><Select label="Application Type" value={type} onChange={setType} options={[{value:'sole',label:'Sole Application'},{value:'joint',label:'Joint Application'}]}/><DatePicker label="Proposed Start Date" value={date} onChange={setDate}/></div><div className="border-t border-[var(--border-input)] p-5 flex justify-end"><Button variant="outline" onClick={()=>setSetup(false)}>Close</Button></div></div></div>,document.body)}
 </div>;
}
