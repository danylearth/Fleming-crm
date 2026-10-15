import {useId,useRef} from 'react';
import {createPortal} from 'react-dom';
import {FileText,X} from 'lucide-react';
import guides from '../data/acceptableDocuments.json';

export default function AcceptableDocumentsGuide({guarantor=false}:{guarantor?:boolean}){
 const dialog=useRef<HTMLDialogElement>(null),headingId=useId();
 return <><button type="button" onClick={()=>dialog.current?.showModal()} className="inline-flex items-center justify-center gap-2 rounded-full border border-purple-300 bg-purple-500/10 px-3 py-2 text-xs font-semibold text-purple-700 dark:text-purple-300"><FileText size={14} aria-hidden="true"/>Click to View Acceptable Documents</button>{createPortal(
  <dialog ref={dialog} aria-labelledby={headingId} className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-2xl max-h-[85dvh] overflow-y-auto rounded-2xl border border-[var(--border-input)] bg-[var(--bg-card)] p-5 text-[var(--text-primary)] shadow-xl backdrop:bg-black/50" onClick={event=>{if(event.target!==event.currentTarget)return;const bounds=event.currentTarget.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)event.currentTarget.close();}}>
   <div className="mb-4 flex items-start justify-between gap-3"><h2 id={headingId} className="text-lg font-semibold">Acceptable Documents</h2><button type="button" aria-label="Close acceptable documents" onClick={()=>dialog.current?.close()} className="rounded-full p-2 hover:bg-[var(--bg-hover)]"><X size={20}/></button></div>
   <p className="mb-4 text-sm text-[var(--text-secondary)]">Use the guidance below when reviewing the applicant’s supporting documents.</p>
   <div className="space-y-3">{Object.entries(guides).filter(([key])=>key!=='reference'||guarantor).map(([key,guide])=><details key={key} className="rounded-xl border border-[var(--border-input)] p-3" open={key==='identity'}><summary className="cursor-pointer text-sm font-semibold">{guide.title}</summary><div className="mt-3 space-y-3 text-sm"><p>{guide.intro}</p><ul className="list-disc space-y-2 pl-5">{guide.items.map(item=><li key={item}>{item}</li>)}</ul>{key==='income'&&<p className="rounded-lg bg-purple-500/10 p-3 text-[var(--text-secondary)]">For state pension or benefits evidence, applicants can use the <a href="https://www.gov.uk/proof-benefits-state-pension" target="_blank" rel="noreferrer" className="font-semibold text-purple-700 underline dark:text-purple-300">GOV.UK proof of entitlement service</a> to obtain their proof of entitlement.</p>}<p className="text-[var(--text-secondary)]">{guide.note}</p></div></details>)}</div>
  </dialog>,document.body)}</>;
}
