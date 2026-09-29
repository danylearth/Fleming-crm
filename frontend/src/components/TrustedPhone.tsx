import {useEffect,useState} from 'react';
import {ShieldCheck} from 'lucide-react';
import {useApi} from '../hooks/useApi';
import {useAuth} from '../context/AuthContext';
import {GlassCard,Input,Button} from './ui';
import PhoneVerification,{type PhoneChallenge} from './PhoneVerification';

export default function TrustedPhone({staffId,currentNumber,onSaved}:{staffId?:number;currentNumber?:string;onSaved?:()=>void}) {
 const api=useApi(),{logout}=useAuth();
 const [number,setNumber]=useState<string|null>(currentNumber||null),[phone,setPhone]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [challenge,setChallenge]=useState<PhoneChallenge|null>(null);
 const endpoint=staffId?`/api/users/${staffId}/trusted-phone`:'/api/auth/trusted-phone';
 useEffect(()=>{if(!staffId)api.get(endpoint).then(result=>setNumber(result.number)).catch(e=>setError(e.message));},[api,endpoint,staffId]);
 const request=async()=>{setBusy(true);setError('');setMessage('');try{setChallenge(await api.post(`${endpoint}/challenge`,{phone,password}));setPassword('');}catch(e){setError(e instanceof Error?e.message:'Could not request a code');}finally{setBusy(false);}};
 const save=async(codes:string[])=>{setBusy(true);setError('');try{const result=await api.put(endpoint,{phone,verification:{challengeId:challenge?.challengeId,codes}});setNumber(result.number);setChallenge(null);setPhone('');setMessage('Trusted number updated. Previous sessions and remembered devices have been revoked.');onSaved?.();if(!staffId)logout();}catch(e){setError(e instanceof Error?e.message:'Could not update the trusted number');}finally{setBusy(false);}};
 return <GlassCard className="p-6 flex flex-col gap-4"><h2 className="text-lg font-semibold flex items-center gap-2"><ShieldCheck size={20}/>Trusted Number & Two-Factor Authentication</h2><p className="text-sm">Trusted number: <strong>{number||'Not set'}</strong></p><p className="text-sm text-[var(--text-secondary)]">Mobile numbers receive a text; landlines receive a voice call. Unrecognised devices require a code at sign-in.</p>
 <Input label={number?'New Trusted Number':'Trusted Number'} type="tel" value={phone} onChange={value=>{setPhone(value);setChallenge(null);}}/>
 {!staffId&&<Input label="Current Password" type="password" value={password} onChange={setPassword}/>}
 <p className="text-xs text-[var(--text-muted)]">{staffId?'Your own trusted number will receive a code to approve this change. The staff member verifies the new number at their next sign-in.':'Changing this number requires your password and verification of both the existing and new numbers. You will then need to sign in again.'}</p>
 {error&&<p role="alert" className="text-sm text-red-500">{error}</p>}
 <div className="mt-auto">{challenge?<PhoneVerification key={challenge.challengeId} challenge={challenge} busy={busy} onVerify={save} onCancel={()=>setChallenge(null)}/>:<Button className="w-64 max-w-full h-12 gap-2" disabled={busy||!phone||(!staffId&&!password)} onClick={()=>void request()}><ShieldCheck size={16} className="shrink-0" aria-hidden="true"/>Request Verification Code</Button>}</div>
 {message&&<p role="status" className="text-sm text-emerald-600">{message}</p>}
 </GlassCard>;
}
