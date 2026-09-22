import FreeAgentConnection from '../components/FreeAgentConnection';
import FlemoConnection from '../components/FlemoConnection';
import PermissionRequests from '../components/ui/PermissionRequests';
import { useTheme } from '../context/ThemeContext';
import { useEffect, useState, useRef } from 'react';
import Layout from '../components/Layout';
import { GlassCard, Button, Input, Avatar, SectionHeader, Select } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import { Camera, Lock } from 'lucide-react';

export default function Settings() {
  const { user, token, updateUser } = useAuth();
  const api = useApi();
  const { theme, toggleTheme } = useTheme();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [profileMessage, setProfileMessage] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const uploadPhoto = async (file?: File) => {
    if (!file) return;
    setProfileBusy(true); setProfileMessage('');
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Choose a photo smaller than 5 MB');
      const body = new FormData(); body.append('photo', file);
      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/profile/photo`, {method:'POST', headers:{Authorization:`Bearer ${token}`}, body});
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      updateUser(data); setProfileMessage('Photo updated');
    } catch (error) { setProfileMessage(error instanceof Error ? error.message : 'Photo could not be uploaded'); }
    finally { setProfileBusy(false); }
  };
  const [accent,setAccent]=useState(user?.accent_color || '#a32372');
  const [appearance,setAppearance]=useState({font:user?.appearance?.font || 'lufga',scale:user?.appearance?.scale || 100,background:user?.appearance?.background || 'default'});
  const [appearanceMsg,setAppearanceMsg]=useState('');
  const savedAppearance=useRef({appearance:user?.appearance,accent:user?.accent_color});
  useEffect(()=>{savedAppearance.current={appearance:user?.appearance,accent:user?.accent_color};},[user?.appearance,user?.accent_color]);
  useEffect(()=>{
    const root=document.documentElement;
    const previous={font:root.style.getPropertyValue('--user-font'),scale:root.style.fontSize,accent:root.style.getPropertyValue('--accent-orange'),button:root.style.getPropertyValue('--btn-primary-bg')};
    const fonts:Record<string,string>={lufga:"'Lufga', sans-serif",system:'system-ui, sans-serif',verdana:'Verdana, sans-serif',arial:'Arial, sans-serif',aptos:'Aptos, Calibri, sans-serif',times:'"Times New Roman", serif',comic:'"Comic Sans MS", cursive',georgia:'Georgia, serif',tahoma:'Tahoma, sans-serif',trebuchet:'"Trebuchet MS", sans-serif',courier:'"Courier New", monospace',calibri:'Calibri, sans-serif',cambria:'Cambria, serif',helvetica:'Helvetica, Arial, sans-serif',palatino:'Palatino, serif'};
    root.style.setProperty('--user-font',fonts[appearance.font] || fonts.lufga);root.style.fontSize=`${appearance.scale}%`;
    root.style.setProperty('--accent-orange',accent);root.style.setProperty('--btn-primary-bg',accent);
    return ()=>{const saved=savedAppearance.current;root.style.setProperty('--user-font',fonts[saved.appearance?.font || 'lufga']);root.style.fontSize=`${saved.appearance?.scale || 100}%`;root.style.setProperty('--accent-orange',saved.accent || previous.accent);root.style.setProperty('--btn-primary-bg',saved.accent || previous.button);};
  },[appearance,accent,user?.appearance,user?.accent_color]);

  const [appearanceBusy,setAppearanceBusy]=useState(false);
  const [loginHistory,setLoginHistory]=useState<{created_at:string}[]>([]);
  useEffect(()=>{let active=true;api.get('/api/auth/login-history').then(data=>{if(active)setLoginHistory(data);}).catch(()=>{});return()=>{active=false;};},[api]);
  const saveAppearance=async()=>{setAppearanceBusy(true);setAppearanceMsg('');try{const data=await api.put('/api/auth/profile',{accent_color:accent,appearance});updateUser(data);setAppearanceMsg('Appearance saved');}catch(error){setAppearanceMsg(error instanceof Error?error.message:'Could not save appearance');}finally{setAppearanceBusy(false);}};

  const handlePasswordChange = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordMsg('Please fill all fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg('Passwords do not match');
      return;
    }
    if (newPassword.length < 12) {
      setPasswordMsg('Password must be at least 12 characters');
      return;
    }

    setPasswordLoading(true);
    setPasswordMsg('');

    try {
      await api.put('/api/auth/password', { oldPassword, newPassword });
      setPasswordMsg('Password updated successfully');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordMsg(''), 3000);
    } catch (err: unknown) {
      setPasswordMsg(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <Layout title="Settings" breadcrumb={[{ label: 'Settings' }]}>
      <div className="p-4 md:p-8 grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div className="space-y-6 min-w-0">
        {/* Profile */}
        <GlassCard className="p-6">
          <SectionHeader title="Profile" />
          <div className="flex items-center gap-6">
            <label className="relative group cursor-pointer" aria-label="Upload profile photo">
              <Avatar name={user?.name} src={user?.avatar_url} size="xl" /><input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={profileBusy} onChange={event => { void uploadPhoto(event.target.files?.[0]); event.target.value = ''; }} />
              <div className="absolute inset-0 rounded-full bg-[var(--overlay-bg)] opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer">
                <Camera size={20} className="text-[var(--text-primary)]" />
              </div>
            </label>
            <div>
              <h2 className="text-lg font-semibold">{user?.name || 'User'}</h2>
              <p className="text-sm text-[var(--text-secondary)]">{user?.email || ''}</p>
            </div>
          </div>
          <p role="status" className="mt-4 text-sm">{profileMessage || 'Click your photo to upload a JPG, PNG or WebP (up to 5 MB).'}</p><p className="mt-3 text-sm">Last Login: {user?.last_login ? new Date(user.last_login).toLocaleString('en-GB') : 'Not Recorded'}</p><details className="mt-3 text-sm"><summary>Recent Login History</summary>{loginHistory.map((row,i)=><p key={i} className="mt-2">{new Date(row.created_at).toLocaleString('en-GB')}</p>)}</details>
        </GlassCard>

        <PermissionRequests />
        <FlemoConnection />
        <FreeAgentConnection />
        </div>
        <div className="space-y-6 min-w-0">
        {/* Password */}
        <GlassCard className="p-6">
          <SectionHeader title="Change Password" />
          <div className="space-y-4">
            <Input label="Current Password" value={oldPassword} onChange={setOldPassword} type="password" placeholder="••••••••" />
            <Input label="New Password" value={newPassword} onChange={setNewPassword} type="password" placeholder="••••••••" />
            <Input label="Confirm New Password" value={confirmPassword} onChange={setConfirmPassword} type="password" placeholder="••••••••" />
            {passwordMsg && (
              <p className={`text-xs ${passwordMsg.includes('match') || passwordMsg.includes('fill') || passwordMsg.includes('least') || passwordMsg.includes('Failed') || passwordMsg.includes('incorrect') ? 'text-red-400' : 'text-emerald-400'}`}>
                {passwordMsg}
              </p>
            )}
            <Button variant="primary" size="sm" onClick={handlePasswordChange} disabled={passwordLoading}>
              <Lock size={14} className="mr-2" /> {passwordLoading ? 'Updating...' : 'Update Password'}
            </Button>
          </div>
        </GlassCard>



        {/* Preferences */}
        <GlassCard className="p-6">
          <div className="flex items-center justify-between gap-3 mb-4"><h2 className="text-lg font-semibold">Appearance</h2><div className="flex items-center gap-3 text-sm"><span>Dark Mode</span><button role="switch" aria-label="Dark Mode" aria-checked={theme==='dark'} onClick={toggleTheme} className={`w-12 h-7 rounded-full relative ${theme==='dark'?'bg-emerald-600':'bg-slate-400'}`}><span className={`w-5 h-5 bg-white rounded-full absolute top-1 ${theme==='dark'?'right-1':'left-1'}`} /></button></div></div>
          <p className="text-sm text-[var(--text-secondary)] mb-3">Choose your colour. This preference follows your account.</p>
          <div className="flex flex-wrap gap-3 mb-4">{[['Fleming pink','#a32372'],['Purple','#6d28d9'],['Blue','#1d4ed8'],['Teal','#0f766e'],['Forest','#166534'],['Navy','#1e3a5f'],['Red','#b91c1c'],['Burgundy','#881337'],['Orange','#c2410c'],['Ochre','#854d0e'],['Olive','#4d7c0f'],['Cyan','#0e7490'],['Indigo','#4338ca'],['Slate','#475569'],['Charcoal','#27272a']].map(([name,color]) => <button key={color} type="button" disabled={appearanceBusy} aria-label={name} aria-pressed={accent === color} onClick={() => setAccent(color)} className="w-11 h-11 rounded-full border-4 border-white/50 text-white" style={{background:color}}>{accent === color ? '✓' : ''}</button>)}</div>
          <div className="grid sm:grid-cols-2 gap-4 mb-4"><Select label="Font" value={appearance.font} onChange={font=>setAppearance(a=>({...a,font}))} options={[{value:'lufga',label:'Fleming Lufga'},{value:'system',label:'System Font'},{value:'verdana',label:'Verdana'},{value:'arial',label:'Arial'},{value:'aptos',label:'Aptos'},{value:'times',label:'Times New Roman'},{value:'comic',label:'Comic Sans MS'},{value:'georgia',label:'Georgia'},{value:'tahoma',label:'Tahoma'},{value:'trebuchet',label:'Trebuchet MS'},{value:'courier',label:'Courier New'},{value:'calibri',label:'Calibri'},{value:'cambria',label:'Cambria'},{value:'helvetica',label:'Helvetica'},{value:'palatino',label:'Palatino'}]}/><Select label="Text Size" value={String(appearance.scale)} onChange={scale=>setAppearance(a=>({...a,scale:Number(scale)}))} options={[100,112.5,125,150].map(v=>({value:String(v),label:`${v}%`}))}/></div><Button disabled={appearanceBusy} onClick={()=>void saveAppearance()}>{appearanceBusy?'Saving…':'Save Appearance'}</Button><p role="status" className="mt-3 text-sm">{appearanceMsg}</p>
        </GlassCard>
        </div>
      </div>
    </Layout>
  );
}
