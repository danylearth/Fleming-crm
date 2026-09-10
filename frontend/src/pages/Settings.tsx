import FlemoConnection from '../components/FlemoConnection';
import PermissionRequests from '../components/ui/PermissionRequests';
import { useTheme } from '../context/ThemeContext';
import { useState } from 'react';
import Layout from '../components/Layout';
import { GlassCard, Button, Input, Avatar, SectionHeader } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import { Camera, Lock, Palette } from 'lucide-react';

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
  const selectColor = async (accent_color: string) => {
    setProfileBusy(true);
    try { const data = await api.put('/api/auth/profile', {accent_color}); updateUser(data); setProfileMessage('Appearance saved'); }
    catch (error) { setProfileMessage(error instanceof Error ? error.message : 'Appearance could not be saved'); }
    finally { setProfileBusy(false); }
  };

  const handlePasswordChange = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordMsg('Please fill all fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg('Password must be at least 6 characters');
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
          <p role="status" className="mt-4 text-sm">{profileMessage || 'Click your photo to upload a JPG, PNG or WebP (up to 5 MB).'}</p>
        </GlassCard>

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

        {/* AI Assistant Configuration hidden until AI router is ported to PostgreSQL */}

        <PermissionRequests />

        {/* Preferences */}
        <GlassCard className="p-6">
          <SectionHeader title="Appearance" />
          <p className="text-sm text-[var(--text-secondary)] mb-3">Choose your colour. This preference follows your account.</p>
          <div className="flex flex-wrap gap-3 mb-4">{[['Fleming pink','#a32372'],['Purple','#6d28d9'],['Blue','#1d4ed8'],['Teal','#0f766e'],['Forest','#166534']].map(([name,color]) => <button key={color} type="button" disabled={profileBusy} aria-label={name} aria-pressed={(user?.accent_color || '#a32372') === color} onClick={() => void selectColor(color)} className="w-11 h-11 rounded-full border-4 border-white/50 text-white" style={{background:color}}>{(user?.accent_color || '#a32372') === color ? '✓' : ''}</button>)}</div>
          <div className="space-y-4 text-sm text-[var(--text-secondary)]">
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Palette size={16} className="text-[var(--text-muted)]" />
                <span>Dark Mode</span>
              </div>
              <button role="switch" aria-label="Dark Mode" aria-checked={theme==='dark'} onClick={toggleTheme} className={`w-12 h-7 rounded-full relative ${theme==='dark'?'bg-emerald-600':'bg-slate-400'}`}><span className={`w-5 h-5 bg-white rounded-full absolute top-1 ${theme==='dark'?'right-1':'left-1'}`} /></button>
            </div>
          </div>
        </GlassCard>
      <FlemoConnection />
      </div>
    </Layout>
  );
}
