import {useEffect,useRef,useState} from 'react';
import {useParams,useNavigate} from 'react-router-dom';
import {ExternalLink,FileSignature,Phone,Download} from 'lucide-react';
import {SigningPage,type Field} from '../components/SignatureRequests';
import {signatureEditor} from '../utils/signatureEditor.js';
import '../styles/publicDocumentSigning.css';
import {showDocumentTab} from '../utils/documentViewer';
type SigningData={title:string;name:string;status:string;signed_at?:string;copy_email_sent?:boolean;consentVersion?:string;acknowledgements?:[string,string][];pages:unknown[];fields:Field[]};
const signingAcknowledgements=[
 ['terms','I have read and understood the terms and conditions contained in this document and agree to them.'],
 ['legalEffect','I intend my electronic signature to have legal effect and understand that signing creates legally binding obligations.'],
 ['declaration','I confirm that I am the named signatory or an authorised representative, and that the information and declarations I provide are true to the best of my knowledge and belief.'],
] as const;
function croppedSignature(canvas:HTMLCanvasElement){
 const ctx=canvas.getContext('2d')!,{data}=ctx.getImageData(0,0,canvas.width,canvas.height);let left=canvas.width,top=canvas.height,right=-1,bottom=-1;
 for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(data[(y*canvas.width+x)*4+3]>20){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<left)return '';const result=document.createElement('canvas');result.width=right-left+9;result.height=bottom-top+9;result.getContext('2d')!.drawImage(canvas,left,top,right-left+1,bottom-top+1,4,4,right-left+1,bottom-top+1);return result.toDataURL('image/png');
}
export default function SignDocument(){
 const {token:legacyToken,signingSlug}=useParams();const token=legacyToken||signingSlug;const navigate=useNavigate();
 const [data,setData]=useState<SigningData|null>(null),[error,setError]=useState(''),[page,setPage]=useState(0),[busy,setBusy]=useState(false),[signature,setSignature]=useState('');
 const [initials,setInitials]=useState(''),[initialsText,setInitialsText]=useState('');
 const [acknowledgements,setAcknowledgements]=useState<Record<string,boolean>>({});
 const displayedAcknowledgements=data?.acknowledgements||signingAcknowledgements;
 const allConsents=displayedAcknowledgements.every(([key])=>acknowledgements[key]===true);
 const initialsCanvas=useRef<HTMLCanvasElement>(null),initialsEditor=useRef<ReturnType<typeof signatureEditor>|null>(null);
 const needsInitials=!!data?.fields.some(field=>field.type==='initials');
 const canvas=useRef<HTMLCanvasElement>(null),panel=useRef<HTMLElement>(null),editor=useRef<ReturnType<typeof signatureEditor>|null>(null),documentPanel=useRef<HTMLDivElement>(null);
 const base=`${import.meta.env.VITE_API_URL||''}/api/public/sign-documents/${token}`;
 const load=()=>fetch(base).then(async response=>{const body=await response.json();if(!response.ok)throw Error(body.error);setData(body);if(legacyToken&&typeof body.signing_slug==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)+-\d{39}$/.test(body.signing_slug))navigate('/'+body.signing_slug,{replace:true});}).catch(e=>setError(e.message));
 useEffect(()=>{if(data?.signed_at)window.scrollTo({top:0,behavior:'instant'});},[data?.signed_at]);
 useEffect(()=>{void load();},[token]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{
  if(!data||data.signed_at||!canvas.current)return;
  const target=canvas.current;
  const instance=signatureEditor({label:'Signature',canvas:target,name:()=>data.name,apply:image=>{target.width=image.width;target.height=image.height;const ctx=target.getContext('2d')!;ctx.drawImage(image,0,0);setSignature(croppedSignature(target));instance.refresh(true);}});
  editor.current=instance;return()=>{instance.destroy();editor.current=null;};
 },[data?.name,data?.signed_at]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{
  if(!data||data.signed_at||!initialsCanvas.current)return;
  const target=initialsCanvas.current,instance=signatureEditor({label:'Initials',canvas:target,name:()=>initialsCanvas.current?.dataset.initials||data!.name.split(/\s+/).filter(Boolean).map(part=>part[0]).join(''),apply:image=>{target.width=image.width;target.height=image.height;const ctx=target.getContext('2d')!;ctx.drawImage(image,0,0);setInitials(croppedSignature(target));instance.refresh(true);}});
  initialsEditor.current=instance;return()=>{instance.destroy();initialsEditor.current=null;};
 },[needsInitials,data?.name,data?.signed_at]);
 const clear=()=>{if(canvas.current)canvas.current.getContext('2d')?.clearRect(0,0,canvas.current.width,canvas.current.height);setSignature('');editor.current?.refresh(false);};
 const preview=()=>{setPage(data?.fields[0]?.page||0);documentPanel.current?.scrollIntoView({behavior:'smooth',block:'nearest'});};
 const submit=async()=>{if(!signature||!allConsents||(needsInitials&&!initials))return;setBusy(true);setError('');try{const response=await fetch(base+'/sign',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({signature,initials,consent:allConsents,consentVersion:data?.consentVersion,acknowledgements})});const result=await response.json();if(!response.ok)throw Error(result.error);await load();}catch(e){setError(e instanceof Error?e.message:'Could not save signature');}finally{setBusy(false);}};
 return <main className="public-document-signing">
  <header className="pds-top"><div className="pds-top-inner"><img src="/email-assets/signature-request-logo.png" alt="Fleming Lettings"/><a className="pds-help" href="tel:+441902212415">Need help? ☎️</a></div></header>
  <div className={`pds-shell${data?.signed_at?' pds-complete-shell':''}`}>
   {data?.signed_at?<section className="pds-complete" aria-labelledby="completion-title"><div className="pds-tick">✓</div><h1 id="completion-title">Thank you for signing</h1><p>Your signature has been recorded. No further action is needed from you.</p>{data.status==='completed'?<><p>{data.copy_email_sent?'A copy of this document has been sent to your registered email address':'Your completed document has been saved to the record.'}</p><a className="pds-button primary" href={base+'/pdf'} target="_blank" rel="noreferrer"><Download size={18} aria-hidden="true"/>Click to Download the Agreement</a></>:<div className="pds-outstanding">We’re waiting for the remaining recipients to sign. The completed document will be saved once everyone has signed.</div>}</section>:<>
   <h1>{data?.title.replace(/\.(pdf|docx?|html?)$/i,'')||'Your Document'}</h1>
   <div className="pds-notice">Please read the document carefully before signing. If anything is unclear or needs amending, contact our offices before you sign. Your electronic signature will be recorded against this document.</div>
   {error&&<p role="alert" className="pds-error">{error}</p>}
   {!data&&!error&&<p>Loading document…</p>}
   {data&&<>
    <div className="pds-grid">
     <section ref={documentPanel} className="pds-document" aria-label="Document preview">
      <div className="pds-toolbar"><button disabled={page===0} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page+1} of {data.pages.length}</span><button disabled={page===data.pages.length-1} onClick={()=>setPage(page+1)}>Next</button></div>
      <div className="pds-pages"><SigningPage key={`${data.status}-${data.signed_at||''}-${page}`} endpoint={`/api/public/sign-documents/${token}/page/${page}`}>{!data.signed_at&&data.fields.filter(field=>field.page===page).map((field,index)=>{
 const type=field.type||'signature',style={left:`${field.x*100}%`,top:`${field.y*100}%`,width:`${field.width*100}%`,height:`${field.height*100}%`};
 if(type==='date')return <span key={index} className="absolute flex items-center text-black text-sm" style={style}>{new Date().toLocaleDateString('en-GB',{timeZone:'Europe/London'})}</span>;
 const image=type==='initials'?initials:signature;
 if(image)return <img key={index} src={image} alt={type==='initials'?'Your draft initials':'Your draft signature'} className="pds-signature-preview" style={style}/>;
 return <div key={index} className="pds-target" style={style}><span>{type==='initials'?'Initials to show here':'Signature to show here'}</span></div>;
 })}</SigningPage></div>
     </section>
     <aside ref={panel} className="pds-panel">
      <h2>Review &amp; Sign 📃</h2>
      <a href={base+'/pdf'} target="_blank" rel="noreferrer" className="pds-open" onClick={event=>{event.preventDefault();const tab=window.open('about:blank','_blank');if(tab)showDocumentTab(tab,base+'/pdf',data.title);else setError('Allow a new tab to preview the document.');}}>Click to open in a new tab<ExternalLink size={16}/></a>
       <label className="pds-field"><span>Full Legal Name</span><input readOnly value={data.name}/></label>
       <label className="pds-field"><span>Date Signed</span><input readOnly type="date" value={new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date())}/></label>
       <div className="pds-field"><span>Signature</span><div className="signature-area sig"><canvas ref={canvas} width={700} height={290} aria-label="Your signature"/></div><div className="actions signature-actions"><button className="button secondary" onClick={()=>editor.current?.open()}>Click to Generate Signature</button><button className="button secondary" onClick={clear}>Clear</button></div></div>
       {needsInitials&&<div className="pds-field"><span>Initials</span><input aria-label="Initials" value={initialsText} maxLength={12} placeholder="Enter your initials" onChange={event=>{const value=event.target.value;setInitialsText(value);const target=initialsCanvas.current;if(!target)return;target.dataset.initials=value;target.width=700;target.height=290;const ctx=target.getContext('2d')!;ctx.clearRect(0,0,target.width,target.height);ctx.font='italic 90px Georgia';ctx.fillStyle='#27083d';ctx.fillText(value,24,160,650);setInitials(value.trim()?croppedSignature(target):'');initialsEditor.current?.refresh(!!value.trim());}}/><div className="signature-area sig"><canvas ref={initialsCanvas} width={700} height={290} aria-label="Your initials"/></div><div className="actions signature-actions"><button className="button secondary" onClick={()=>initialsEditor.current?.open()}>Add Initials</button><button className="button secondary" onClick={()=>{if(initialsCanvas.current)initialsCanvas.current.getContext('2d')?.clearRect(0,0,initialsCanvas.current.width,initialsCanvas.current.height);setInitials('');setInitialsText('');initialsEditor.current?.refresh(false);}}>Clear Initials</button></div></div>}
       {signature&&<p className="pds-meta" role="status">Your signature is shown on the document. Confirm below to save it.</p>}
       <fieldset className="pds-declarations"><legend>Before you sign</legend>
        {displayedAcknowledgements.map(([key,text])=><label className="pds-consent" key={key}><input type="checkbox" checked={acknowledgements[key]===true} onChange={e=>setAcknowledgements(previous=>({...previous,[key]:e.target.checked}))}/><span>{text}</span></label>)}
       </fieldset>
       <button className="pds-button" disabled={!signature||busy||(needsInitials&&!initials)} onClick={preview}>View Signature in Document</button>
       <button className="pds-button primary" disabled={busy||!allConsents||!signature||(needsInitials&&!initials)} onClick={()=>void submit()}>{busy?'Saving…':'Sign & Confirm Document ✓'}</button>
     </aside>
    </div>
   </>}
   </>}
  </div>
 </main>;
}

