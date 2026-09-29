import {useState,type FormEvent} from 'react';
import {Link,useLocation} from 'react-router-dom';
import 'altcha';
import type {} from 'altcha/types/react';
import './ForgotPassword.css';

export default function ForgotPassword(){
 const location=useLocation();
 const [email,setEmail]=useState(location.state?.email||''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[sent,setSent]=useState(false),[check,setCheck]=useState(0);
 const base=import.meta.env.VITE_API_URL||'';
 const submit=async(e:FormEvent<HTMLFormElement>)=>{
  e.preventDefault();const altcha=new FormData(e.currentTarget).get('altcha');
  if(!altcha){setError('Complete the bot check before submitting.');return;}
  setBusy(true);setError('');
  try{const response=await fetch(`${base}/api/auth/forgot-password`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,altcha})});const data=await response.json();if(!response.ok)throw Error(data.error||'Could not submit your request');setSent(true);}
  catch(e){setError(e instanceof Error?e.message:'Could not submit your request');setCheck(v=>v+1);}finally{setBusy(false);}
 };
 return <main className="min-h-screen bg-gradient-to-br from-[#25073b] via-[#61114b] to-[#dc006d] flex items-center justify-center px-4 py-10"><div className="w-full max-w-md"><div className="flex flex-col items-center mb-8"><img src="/logo-light.png" alt="Fleming Lettings" className="h-20 w-auto mb-3"/><p className="text-white/80 text-sm">Your local property experts.</p></div><section className="bg-[var(--bg-card)] text-[var(--text-primary)] rounded-2xl border border-[var(--border-color)] p-8">
 {sent?<div role="status" className="space-y-4"><span className="text-4xl" aria-label="Request received">✅</span><h1 className="text-xl font-semibold">Request received</h1><p>Your request is pending administrator approval.</p><p className="text-sm text-[var(--text-secondary)]">Please contact your manager or administrator to expedite this process.</p></div>:<><h1 className="text-xl font-semibold mb-2">Forgot password?</h1>{location.state?.reason&&<p role="status" className="text-sm text-amber-700 mb-3">{location.state.reason}</p>}<p className="text-sm text-[var(--text-secondary)] mb-6">Enter your account email and complete the bot check to request a password reset.</p><form onSubmit={submit} className="space-y-4"><label className="block text-sm">Email Address<input type="email" name="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-3"/></label><div key={check} className="password-reset-check"><p className="text-sm font-bold text-[var(--text-primary)] mb-2 text-center">Spam Detector 🔎</p><altcha-widget challenge={`${base}/api/auth/reset-challenge`} type="checkbox" display="standard"/></div>{error&&<p role="alert" className="text-red-500 text-sm">{error}</p>}<button type="submit" disabled={busy} className="w-full bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] rounded-full py-3 text-sm font-semibold disabled:opacity-50">{busy?'Submitting…':'Request Password Reset'}</button></form></>}
 <Link to="/login" className="flex w-full items-center justify-center rounded-full bg-[var(--bg-input)] text-[var(--text-primary)] ring-1 ring-inset ring-[var(--border-input)] py-3 text-sm font-semibold mt-3 hover:opacity-80 transition-opacity"><span aria-hidden="true" className="mr-2 text-lg leading-none">👈</span>Back to Sign In</Link></section></div></main>;
}
