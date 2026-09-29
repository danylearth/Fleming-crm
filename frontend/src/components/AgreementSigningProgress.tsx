import {Button} from './ui';
import {CheckCircle,Clock,Eye,Download} from 'lucide-react';
type Party={key:string;role:string;name?:string;slug?:string;signed?:string;opened?:string;landlord?:boolean};
export default function AgreementSigningProgress({agreement,onView,onResend,onError,busy,resendEnabled}:{onView:(download:boolean)=>void;onResend:(key:string,name:string)=>void;onError:(error:string)=>void;busy:boolean;resendEnabled:boolean;agreement:{original_name:string;status:string;requires_landlord_signature:number;requires_joint_tenant_signature:number;landlord_signers?:{id:number;name:string;slug:string;signed_at?:string}[];landlord_name?:string;landlord_slug?:string;landlord_signed_at?:string;landlord_opened_at?:string;tenant_name?:string;tenant_slug?:string;tenant_signed_at?:string;tenant_opened_at?:string;joint_tenant_name?:string;joint_tenant_slug?:string;joint_tenant_signed_at?:string;joint_tenant_opened_at?:string}}){
 const a=agreement;
 const parties:Party[]=[
  ...(a.requires_landlord_signature?(a.landlord_signers?.length?a.landlord_signers.map((p,i)=>({key:`landlord:${p.id}`,role:a.landlord_signers!.length>1?`Landlord ${i+1}`:'Landlord',name:p.name,slug:p.slug,signed:p.signed_at,landlord:true})):[{key:'landlord',role:'Landlord',name:a.landlord_name,slug:a.landlord_slug,signed:a.landlord_signed_at,opened:a.landlord_opened_at,landlord:true}]):[]),
  {key:'tenant',role:'Tenant 1',name:a.tenant_name,slug:a.tenant_slug,signed:a.tenant_signed_at,opened:a.tenant_opened_at},
  ...(a.requires_joint_tenant_signature?[{key:'joint_tenant',role:'Tenant 2',name:a.joint_tenant_name,slug:a.joint_tenant_slug,signed:a.joint_tenant_signed_at,opened:a.joint_tenant_opened_at}]:[])
 ];
 const waitingOnLandlord=parties.some(p=>p.landlord&&!p.signed);
 const waiting=parties.filter(p=>!p.signed&&(!waitingOnLandlord||p.landlord));
 return <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
  <div className="flex flex-wrap items-start justify-between gap-3"><p className="text-xs text-[var(--text-muted)] break-words flex-1">{a.original_name}</p><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" size="sm" onClick={()=>onView(false)}><Eye size={14}/>View Agreement</Button><Button variant="outline" size="sm" onClick={()=>onView(true)}><Download size={14}/>Download Copy</Button></div></div>
  <h3 className="mt-1 font-semibold" role="status">{a.status==='completed'?'All signatures complete':`Waiting on ${waiting.map(p=>p.name||p.role.toLowerCase()).join(' and ')||'signature processing'} to sign`}</h3>
  <div className="mt-3 space-y-2">{parties.map(p=>{const held=!p.landlord&&waitingOnLandlord&&!p.signed;return <div key={p.role} className="flex flex-wrap items-center gap-3 rounded-lg bg-[var(--bg-subtle)] px-3 py-2">
   {p.signed?<CheckCircle size={18} className="text-emerald-600"/>:<Clock size={18} className={held?'text-[var(--text-muted)]':'text-amber-600'}/>}
   <div className="min-w-0 flex-1"><p className="text-sm font-medium">{p.role}{p.name?` · ${p.name}`:''}</p><p className="text-xs text-[var(--text-muted)]">{p.signed?`Signed ${new Date(p.signed).toLocaleDateString('en-GB')}`:held?'Invitation follows once all landlords sign':p.opened?`Last opened ${new Date(p.opened).toLocaleString('en-GB')}`:'Not opened yet'}</p></div>
   <div className="ml-auto flex flex-wrap items-center justify-end gap-2"><span className={`rounded-full px-2.5 py-1 text-xs ${p.signed?'bg-emerald-500/10 text-emerald-700':held?'bg-[var(--bg-hover)] text-[var(--text-secondary)]':'bg-amber-500/10 text-amber-700'}`}>{p.signed?'Signed':held?'Waiting for landlord first':'Waiting for signature'}</span>
   {p.slug&&<Button size="sm" variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(p.slug!.startsWith('http')?p.slug!:`https://apply.fleminglettings.co.uk/${p.slug}`);}catch{onError('Could not copy signing link');}}}>Copy Link</Button>}
   {!p.signed&&<Button size="sm" variant="outline" disabled={busy||held||!resendEnabled} onClick={()=>onResend(p.key,p.name||p.role)}>Resend</Button>}</div>
  </div>;})}</div>
  <p className="mt-3 text-xs text-[var(--text-muted)]">{a.status==='completed'?'The signed PDF is saved in the property and tenant documents.':'Signature status updates automatically.'}</p>
 </section>;
}
