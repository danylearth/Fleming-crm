import {useState} from 'react';
import {ChevronDown} from 'lucide-react';
import {TenantsIcon,EnquiriesIcon} from './ui/icons/FlemingIcons';
export type DepositParticipant={tenant_id?:number;enquiry_id?:number};
export type DepositOption={key:string;name:string;address:string;participant:DepositParticipant};
export default function DepositParticipantsSelect({value,options,onChange}:{value:DepositParticipant[];options:DepositOption[];onChange:(value:DepositParticipant[])=>void}){
 const [open,setOpen]=useState(false),[search,setSearch]=useState('');
 const key=(p:DepositParticipant)=>p.tenant_id?`tenant:${p.tenant_id}`:`enquiry:${p.enquiry_id}`;
 const selected=new Set(value.map(key));
 return <div className="sm:col-span-2"><p className="text-xs text-[var(--text-secondary)] mb-1.5 flex items-center gap-2"><TenantsIcon size={17} className="text-[var(--feedback-emerald)]"/>Tenants / Tenant Enquiries</p>
  <button type="button" aria-label="Select deposit tenants and enquiries" aria-expanded={open} onClick={()=>setOpen(!open)} className="w-full min-h-[42px] px-4 py-2.5 rounded-xl border border-[var(--border-input)] bg-[var(--bg-input)] text-sm flex items-center justify-between gap-3 text-left"><span>{value.length?`${value.length} selected`:'Choose tenants or enquiries'}</span><ChevronDown size={16}/></button>
  {!!value.length&&<div className="flex flex-wrap gap-2 mt-2">{options.filter(o=>selected.has(o.key)).map(o=><button type="button" aria-label={`Remove ${o.name}`} key={o.key} className="text-xs rounded-full bg-[var(--bg-subtle)] border border-[var(--border-input)] px-3 py-1" onClick={()=>onChange(value.filter(p=>key(p)!==o.key))}>{o.name} ×</button>)}</div>}
  {open&&<div className="mt-2 rounded-xl border border-[var(--border-input)] bg-[var(--bg-card)] p-2"><input aria-label="Search tenants and enquiries" placeholder="Search name or property…" value={search} onChange={e=>setSearch(e.target.value)} className="w-full p-2 rounded-lg bg-[var(--bg-input)] text-sm"/><div className="max-h-56 overflow-y-auto">{options.filter(o=>`${o.name} ${o.address}`.toLowerCase().includes(search.toLowerCase())).map(o=><label key={o.key} className="flex gap-3 items-center p-2 rounded-lg hover:bg-[var(--bg-subtle)] text-sm cursor-pointer"><input type="checkbox" checked={selected.has(o.key)} onChange={e=>onChange(e.target.checked?[...value,o.participant]:value.filter(p=>key(p)!==o.key))}/>{o.participant.tenant_id?<TenantsIcon size={18} className="text-[var(--feedback-emerald)] shrink-0"/>:<EnquiriesIcon size={18} className="text-pink-500 shrink-0"/>}<span>{o.name}<span className="block text-xs text-[var(--text-muted)]">{o.participant.tenant_id?'Tenant':'Tenant enquiry'} · {o.address}</span></span></label>)}</div><button type="button" className="text-sm px-3 py-2" onClick={()=>setOpen(false)}>Done</button></div>}
  <p className="text-xs text-[var(--text-muted)] mt-2">Choose the joint applicants for one property. The deposit amount is recorded once.</p>
 </div>;
}
