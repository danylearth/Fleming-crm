import {useEffect,useRef,useState} from 'react';
import ServiceAgreements from './ServiceAgreements';

export default function PropertyContractStep({propertyId,onClose,existing=false}:{propertyId:number;onClose:()=>void;existing?:boolean}) {
 const [stage,setStage]=useState('Not Started');
 const close=useRef<HTMLButtonElement>(null);
 useEffect(()=>{close.current?.focus();},[]);
 return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-bg)] p-3" onKeyDown={event=>{if(event.key==='Escape')onClose();}}>
  <section role="dialog" aria-modal="true" aria-labelledby="property-contract-title" className="w-full max-w-3xl max-h-[94vh] overflow-y-auto rounded-2xl bg-[var(--bg-card)] p-5 space-y-4">
   <div className="flex items-start justify-between gap-4"><div><h2 id="property-contract-title" className="text-lg font-semibold">{existing?'Property Service Contract':'Property Saved · Prepare Service Contract'}</h2><p className="text-sm text-[var(--text-muted)] mt-1">Review the agreement and send it to the landlord for signing.</p></div><span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${stage==='Signed'||stage==='Admin Override'?'bg-emerald-500/15 text-emerald-600':stage==='Contract Sent'||stage==='Draft'?'bg-amber-500/15 text-amber-600':'bg-red-500/15 text-red-600'}`}>{stage}</span></div>
   <ServiceAgreements propertyId={propertyId} compact onStageChange={setStage}/><div className="flex justify-start"><button ref={close} type="button" onClick={onClose} className="rounded-full border border-[var(--border-input)] px-5 py-1.5 text-sm">Close</button></div>
  </section>
 </div>;
}
