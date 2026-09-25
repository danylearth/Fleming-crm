import {useEffect,useRef} from 'react';
import {Button} from './ui';
import ServiceAgreements from './ServiceAgreements';

export default function PropertyContractStep({propertyId,onClose,existing=false}:{propertyId:number;onClose:()=>void;existing?:boolean}) {
 const close=useRef<HTMLButtonElement>(null);
 useEffect(()=>{close.current?.focus();},[]);
 return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-bg)] p-4" onKeyDown={event=>{if(event.key==='Escape')onClose();}}>
  <section role="dialog" aria-modal="true" aria-labelledby="property-contract-title" className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--bg-card)] p-5 space-y-4">
   <div className="flex items-start justify-between gap-4"><div><h2 id="property-contract-title" className="text-lg font-semibold">{existing?'Property service contract':'Property saved · Prepare service contract'}</h2><p className="text-sm text-[var(--text-muted)] mt-2">Check the agreed fees, preview the contract email, then send it to the landlord for signing.</p></div><button ref={close} type="button" onClick={onClose} className="shrink-0 underline text-sm">Close</button></div>
   <p className="text-sm text-[var(--text-muted)]">The landlord must confirm or enter their bank details before signing. You can finish this later from the property's Service Contracts section.</p>
   <ServiceAgreements propertyId={propertyId}/>
   <Button variant="outline" onClick={onClose}>{existing?'Done':'Open property record'}</Button>
  </section>
 </div>;
}
