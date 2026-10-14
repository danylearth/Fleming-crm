import { useEffect, useState } from 'react';
import {type LoginChallenge,type LoginDeliveryOptions, useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {  CheckCircle2, Eye, EyeOff } from 'lucide-react';


export default function Login() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Sign in | Fleming Lettings';
    return () => { document.title = previousTitle; };
  }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login,verifyLogin,resendLoginCode } = useAuth();
  const [resending,setResending]=useState(false),[notice,setNotice]=useState('');
  const [challenge,setChallenge]=useState<LoginChallenge|null>(null),[code,setCode]=useState(''),[rememberDevice,setRememberDevice]=useState(false);
  const [delivery,setDelivery]=useState<LoginDeliveryOptions|null>(null),[verificationMethod,setVerificationMethod]=useState<'phone'|'email'>('email');
  const navigate = useNavigate();
  const [resendAt,setResendAt]=useState(0),[resendSeconds,setResendSeconds]=useState(0);
  const [lockSeconds,setLockSeconds]=useState<number|null>(null);
  useEffect(()=>{
    if(!challenge){setResendSeconds(0);setLockSeconds(null);return;}
    const update=()=>{setResendSeconds(Math.max(0,Math.ceil((resendAt-Date.now())/1000)));setLockSeconds(challenge.lockAt?Math.max(0,Math.ceil((Date.parse(challenge.lockAt)-Date.now())/1000)):null);};
    update();const timer=window.setInterval(update,1000);
    return()=>window.clearInterval(timer);
  },[challenge,resendAt]);
  const acceptChallenge=(next:LoginChallenge)=>{const seconds=next.resendAfterSeconds??300;setResendAt(Date.now()+seconds*1000);setResendSeconds(seconds);setChallenge(next);};

  const handleResend=async()=>{
    if(!challenge||resending||Date.now()<resendAt)return;
    setResending(true);setError('');setNotice('');
    try{acceptChallenge(await resendLoginCode(challenge.challengeId));setCode('');setNotice('A new code has been sent. It expires after 20 minutes. Your previous code will no longer work.');}
    catch(err){setError(err instanceof Error?err.message:'Could not request a new code');}
    finally{setResending(false);}
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if(challenge){await verifyLogin(challenge.challengeId,code,rememberDevice);navigate('/');}
      else {
        const next=await login(email,password,delivery?verificationMethod:undefined);
        if(next&&'selectDelivery' in next){setDelivery(next);setVerificationMethod(next.options.some(option=>option.method==='email')?'email':'phone');}
        else if(next){acceptChallenge(next);setDelivery(null);setPassword('');}
        else navigate('/');
      }
    } catch (err: unknown) {
      if(err instanceof Error&&'requiresPasswordReset' in err&&err.requiresPasswordReset){navigate('/forgot-password',{state:{email,reason:'Three incorrect password attempts. Please request a password reset.'}});return;}
      setError(err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#25073b] via-[#61114b] to-[#dc006d] font-[family-name:var(--user-font)] flex items-center justify-center px-4 py-10">
      {/* Background gradient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-orange-500/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-pink-500/10 rounded-full blur-[128px]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <img
            src="/logo-light.png"
            alt="Fleming Lettings"
            className="h-20 w-auto object-contain mb-3"
          />
          <p className="text-white/80 text-sm">Your local property experts.</p>
        </div>

        {/* Card */}
        <div className="bg-[var(--bg-card)] text-[var(--text-primary)] rounded-2xl border border-[var(--border-color)] p-6 sm:p-8">
          <div className="text-center mb-6">
            <span aria-hidden="true" className="block text-6xl leading-none mb-4">👋</span>
            <h2 className="text-2xl font-semibold text-[var(--text-primary)] mb-2">Hey there team!</h2>
            <p className="text-sm text-[var(--text-muted)]">Sign in to get started.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!challenge&&!delivery&&<>
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1.5 font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-3 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-input)] transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1.5 font-medium">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-3 pr-11 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-input)] transition-colors"
                  required
                />
                <div className="flex flex-wrap justify-between items-center gap-2 mt-3"><button type="button" disabled={loading} onClick={()=>navigate('/forgot-password')} className="rounded-full bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50">Psst.. Forgot Password?</button><button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="ml-auto flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}{showPassword ? 'Hide Password' : 'Show Password'}
                </button></div>
              </div>
            </div>

            </>}
            {delivery&&<fieldset className="space-y-3">
              <legend className="font-semibold mb-2">Where should we send your code?</legend>
              <p className="text-sm text-[var(--text-secondary)]">Choose your saved email address or trusted number. Your code expires after 20 minutes.</p>
              {delivery.options.map(option=><label key={option.method} className={`flex items-center gap-3 rounded-xl border p-4 cursor-pointer ${verificationMethod===option.method?'border-[#853477] bg-[#853477]/5':'border-[var(--border-input)] bg-[var(--bg-input)]'}`}>
                <input type="radio" name="verificationMethod" value={option.method} checked={verificationMethod===option.method} onChange={()=>{setVerificationMethod(option.method);setError('');}} disabled={loading} className="h-4 w-4 shrink-0 accent-[#853477]"/>
                <span className="min-w-0 text-sm"><span className="block font-semibold">{option.label}</span><span className="block break-words text-[var(--text-secondary)]">{option.destination}</span></span>
              </label>)}
            </fieldset>}
            {challenge&&<section className="space-y-4"><h3 className="font-semibold">Verify your sign-in</h3><p className="text-sm">We sent a code by {challenge.methods?.[0]||'text message'} to {challenge.destinations[0]}. It expires after {Math.ceil(challenge.expiresInSeconds/60)} minutes.</p><label className="block text-sm">Verification Code<input aria-label="Verification Code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} className="mt-2 w-full rounded-xl border border-[var(--border-input)] bg-[var(--bg-input)] p-3 tracking-[.3em]"/></label><label className="flex items-start gap-2 text-left text-[13px] leading-5 text-[var(--text-secondary)] cursor-pointer"><input type="checkbox" checked={rememberDevice} onChange={e=>setRememberDevice(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#853477]"/><span className="min-w-0">Remember this device for 30 days. Only choose this on a device you trust.</span></label></section>}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 text-sm text-red-400">
                {error}
              </div>
            )}
            {notice&&<p role="status" className="text-sm text-[var(--text-secondary)]">{notice}</p>}
            {lockSeconds!==null&&<p role="status" className="text-sm text-amber-700">{lockSeconds===0?'Your account is locked. Contact an administrator to reset your access.':`This is your third and final code. Verify within ${Math.floor(lockSeconds/60)}:${String(lockSeconds%60).padStart(2,'0')} to avoid an account lock.`}</p>}

            <button
              type="submit"
              disabled={loading||resending||lockSeconds===0}
              className="flex items-center justify-center w-full bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold py-3 rounded-full hover:opacity-90 transition-colors disabled:opacity-40 text-sm"
            >
              {challenge&&!loading&&<CheckCircle2 size={18} aria-hidden="true" className="mr-2"/>}{loading ? delivery?'Sending code…':'Signing in…' : challenge?'Verify & Sign In':delivery?'Send Verification Code':'Sign In'}
            </button>
          </form>
          {challenge&&<button type="button" disabled={loading||resending||resendSeconds>0||(challenge.codesSent||0)>=3} onClick={()=>void handleResend()} className="w-full rounded-full bg-amber-100 text-amber-900 py-3 text-sm font-semibold mt-3 hover:bg-amber-200 transition-colors disabled:cursor-not-allowed disabled:opacity-70">{(challenge.codesSent||0)>=3?'No Further Codes Available':resending?'⏳ Requesting New Code…':resendSeconds>0?`⏳ Request Another in ${Math.floor(resendSeconds/60)}:${String(resendSeconds%60).padStart(2,'0')}`:'Request a New Code'}</button>}
          {(delivery||challenge)&&<button type="button" disabled={loading||resending} onClick={()=>{setChallenge(null);setDelivery(null);setCode('');setPassword('');setError('');setNotice('');}} className="flex w-full items-center justify-center rounded-full bg-[var(--bg-input)] text-[var(--text-primary)] ring-1 ring-inset ring-[var(--border-input)] py-3 text-sm font-semibold mt-3 hover:opacity-80 transition-opacity disabled:opacity-50"><span aria-hidden="true" className="mr-2">👉</span>Back to Sign In</button>}
        </div>
      </div>
    </div>
  );
}
