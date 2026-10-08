import {useEffect,useState} from 'react';
export default function TenancyChangeover(){
 const [state,setState]=useState<any>(null);
 useEffect(()=>{let disposed=false;const refresh=()=>{void fetch('/api/preview/reapplication-changeover').then(r=>r.json()).then(value=>{if(!disposed)setState(value);});};refresh();const timer=setInterval(refresh,15000);window.addEventListener('focus',refresh);return()=>{disposed=true;clearInterval(timer);window.removeEventListener('focus',refresh);};},[]);
 if(!state||state.changed)return null;
 const date=(value:string)=>new Date(value+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
 return <section aria-label="Tenancy changeover and billing" className="rounded-2xl border border-amber-300 bg-amber-50 text-amber-950 p-6 space-y-4">
  <h3 className="text-base font-semibold">Tenancy Changeover &amp; Billing</h3>
  <p className="text-sm">Zoe’s sole tenancy is scheduled. Mathew remains an active tenant until the joint tenancy ends.</p>
  <div className="space-y-3">{state.billingProfiles.map((profile:any,index:number)=><div key={profile.id} className="rounded-xl border border-amber-200 bg-white/50 p-3">
   <div className="flex flex-wrap justify-between gap-2 text-sm font-semibold"><span>{index===0?'Zoe & Mathew — joint tenancy':'Zoe — sole tenancy'}</span><span className="capitalize">{profile.status}</span></div>
   <p className="text-sm mt-2">£{profile.monthlyRent.toLocaleString('en-GB')} per month · Due day {profile.dueDay}</p>
   <p className="text-sm text-[var(--text-secondary)]">{index===0?'Billing ends '+date(profile.end):'Billing starts '+date(profile.start)}</p>
  </div>)}</div>
  <p className="text-xs text-[var(--text-secondary)]">The previous tenancy, invoices, payments and any outstanding balance stay in history. Mathew is excluded from the new sole-tenancy billing.</p>
 </section>;
}
