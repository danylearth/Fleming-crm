import {useState} from 'react';
import {Button} from './ui';

export type PhoneChallenge={challengeId:string;destinations:string[];methods?:string[];expiresInSeconds:number};
export default function PhoneVerification({challenge,busy,onVerify,onCancel}:{challenge:PhoneChallenge;busy:boolean;onVerify:(codes:string[])=>Promise<void>;onCancel:()=>void}) {
 const [codes,setCodes]=useState<string[]>(()=>challenge.destinations.map(()=>''));
 return <section className="mt-4 rounded-xl border border-[var(--border-input)] bg-[var(--bg-subtle)] p-5 space-y-4" aria-label="Phone verification">
  <h3 className="font-semibold">Verify this change</h3>
  <p className="text-sm text-[var(--text-secondary)]">Enter the six-digit code sent to your trusted number. Codes expire after {Math.ceil(challenge.expiresInSeconds/60)} minutes and can be used once.</p>
  {challenge.destinations.map((number,index)=><label className="block text-sm" key={index}>{challenge.destinations.length>1?(index===0?'Current number':'New number'):'Verification code'} · {number} ({challenge.methods?.[index]||'text message'})<input aria-label={`Verification code ${index+1}`} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={codes[index]} onChange={e=>setCodes(current=>current.map((v,i)=>i===index?e.target.value.replace(/\D/g,''):v))} className="block mt-2 w-full max-w-xs rounded-xl border border-[var(--border-input)] bg-[var(--bg-input)] p-3 tracking-[.3em]"/></label>)}
  <div className="flex gap-3"><Button disabled={busy||codes.some(code=>!/^\d{6}$/.test(code))} onClick={()=>void onVerify(codes)}>Verify & Save</Button><Button variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button></div>
 </section>;
}
