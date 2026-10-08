import {useEffect,useRef,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import {useAuth} from '../context/AuthContext';
import {Button} from './ui';

export default function ServiceContractDraft({agreementId,issued}:{agreementId:number;issued:boolean}){
 const {token}=useAuth();const pages=useRef<HTMLDivElement>(null);
 const [expanded,setExpanded]=useState(false);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(!expanded)return;
  const controller=new AbortController();let task:any;
  const target=pages.current!;target.replaceChildren();setLoading(true);setError('');
  void(async()=>{try{
   const response=await fetch((import.meta.env.VITE_API_URL||'')+'/api/service-agreements/'+agreementId+'/pdf',{headers:{Authorization:'Bearer '+token},signal:controller.signal});
   if(!response.ok||!response.headers.get('content-type')?.includes('application/pdf'))throw Error('Contract unavailable');
   const bytes=await response.arrayBuffer(),libraryUrl='/vendor/pdfjs/pdf.mjs';
   const pdfjs=await import(/* @vite-ignore */ libraryUrl);
   if(controller.signal.aborted)return;
   pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.mjs';
   task=pdfjs.getDocument({data:bytes,isEvalSupported:false,cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/'});
   const pdf=await task.promise;
   for(let number=1;number<=pdf.numPages;number++){
    if(controller.signal.aborted)return;
    const page=await pdf.getPage(number),viewport=page.getViewport({scale:1.5}),canvas=document.createElement('canvas');
    canvas.width=viewport.width;canvas.height=viewport.height;canvas.style.cssText='display:block;width:100%;height:auto;margin:0 auto 12px;background:white';canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Contract page '+number+' of '+pdf.numPages);
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    if(controller.signal.aborted)return;
    target.append(canvas);setLoading(false);
   }
  }catch{if(!controller.signal.aborted){target.replaceChildren();setLoading(false);setError('The contract could not be loaded. Please try again.');}}})();
  return()=>{controller.abort();void task?.destroy();};
 },[agreementId,issued,token,attempt,expanded]);
 return <details aria-label="Contract document" onToggle={event=>setExpanded(event.currentTarget.open)} className="mt-4 min-w-0 rounded-xl border border-[var(--border-input)] bg-[var(--bg-card)] overflow-hidden">
  <summary className="p-4 flex items-center justify-between gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden"><div><h5 className="font-semibold">{issued?'Service Contract':'Draft Contract'}</h5><p className="text-sm text-[var(--text-secondary)] mt-1">{issued?'Agreement sent to the landlord for signing.':'Review the contract before sending it to the landlord.'}</p></div><ChevronDown aria-hidden="true" size={20} className={'shrink-0 transition-transform '+(expanded?'rotate-180':'')}/></summary>
  {error&&<div role="alert" className="p-4 space-y-3"><p className="text-sm">{error}</p><Button variant="outline" onClick={()=>setAttempt(n=>n+1)}>Retry Contract</Button></div>}
  {loading&&<p role="status" className="p-4 text-sm text-[var(--text-secondary)]">Loading contract…</p>}
  <div ref={pages} title={issued?'Service Contract':'Draft Contract'} aria-busy={loading} className={(loading||error?'hidden ':'')+'w-full h-[70dvh] min-h-[420px] overflow-y-auto bg-[var(--bg-subtle)] p-2 sm:p-3'}/>
 </details>;
}
