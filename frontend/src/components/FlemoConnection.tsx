import {useCallback,useEffect,useState} from 'react';
import {useApi} from '../hooks/useApi';
import {GlassCard,Button} from './ui';
type Status={connected:boolean;email?:string;plan?:string;error?:string;login?:{verificationUrl:string;userCode:string}};
export default function FlemoConnection(){
  const api=useApi();const [status,setStatus]=useState<Status>({connected:false});const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const refresh=useCallback(async()=>{try{setStatus(await api.get('/api/ai/account'));setError('');}catch(e){setError(e instanceof Error?e.message:'Could not read AI connection');}},[api]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{if(!status.login)return;const timer=setInterval(()=>void refresh(),5000);return()=>clearInterval(timer);},[status.login,refresh]);
  const connect=async()=>{setBusy(true);setError('');try{const login=await api.post('/api/ai/account/connect',{});setStatus({connected:false,login});}catch(e){setError(e instanceof Error?e.message:'Sign-in could not start');}finally{setBusy(false);}};
  const disconnect=async()=>{setBusy(true);setError('');try{await api.post('/api/ai/account/disconnect',{});setStatus({connected:false});}catch(e){setError(e instanceof Error?e.message:'Could not disconnect');}finally{setBusy(false);}};
  return <GlassCard className="p-6"><h2 className="text-lg font-semibold mb-2">Flemo AI connection</h2><p className="text-sm text-[var(--text-muted)] mb-4">Connect your ChatGPT account to ask Flemo questions about CRM records and documents. Your account’s Codex usage limits apply. Relevant CRM information is shared with OpenAI when you ask a question.</p>
    {status.connected?<div className="space-y-3"><p className="text-sm text-emerald-500">Connected as {status.email || 'your ChatGPT account'}{status.plan?' · '+status.plan:''}</p><Button variant="outline" disabled={busy} onClick={disconnect}>Disconnect ChatGPT</Button></div>:status.login?<div className="space-y-3"><p className="text-sm">1. Open the sign-in page. 2. Enter this code and complete sign-in.</p><p className="font-mono text-2xl tracking-wider select-all">{status.login.userCode}</p><a className="inline-block rounded-lg bg-[#91236f] px-4 py-2 text-sm font-semibold text-white" href={status.login.verificationUrl} target="_blank" rel="noopener noreferrer">Sign in to ChatGPT</a><p className="text-xs text-[var(--text-muted)]">This page will update after you finish signing in. If asked, enable device-code login in your ChatGPT security settings.</p><button onClick={disconnect} disabled={busy} className="text-sm underline">Cancel sign-in</button></div>:<Button onClick={connect} disabled={busy}>{busy?'Opening sign-in…':'Connect ChatGPT'}</Button>}
    {(error||status.error)&&<p role="alert" className="text-sm text-red-500 mt-3">{error||status.error}</p>}
  </GlassCard>;
}
