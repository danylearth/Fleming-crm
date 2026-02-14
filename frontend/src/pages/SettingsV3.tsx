import { useState } from 'react';
import V3Layout from '../components/V3Layout';
import { GlassCard, Button, Input, Avatar, SectionHeader } from '../components/v3';
import { useAuth } from '../context/AuthContext';
import { Camera, Lock, Bell, Palette } from 'lucide-react';

export default function SettingsV3() {
  const { user } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');

  const handlePasswordChange = () => {
    if (!newPassword || !confirmPassword) { setPasswordMsg('Please fill both fields'); return; }
    if (newPassword !== confirmPassword) { setPasswordMsg('Passwords do not match'); return; }
    if (newPassword.length < 6) { setPasswordMsg('Password must be at least 6 characters'); return; }
    setPasswordMsg('Password updated (UI only)');
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => setPasswordMsg(''), 3000);
  };

  return (
    <V3Layout title="Settings" breadcrumb={[{ label: 'Settings' }]}>
      <div className="p-4 md:p-8 space-y-6 md:space-y-8 max-w-2xl">
        {/* Profile */}
        <GlassCard className="p-6">
          <SectionHeader title="Profile" />
          <div className="flex items-center gap-6">
            <div className="relative group">
              <Avatar name={user?.name} size="xl" />
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer">
                <Camera size={20} className="text-white/80" />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold">{user?.name || 'User'}</h2>
              <p className="text-sm text-white/50">{user?.email || ''}</p>
            </div>
          </div>
        </GlassCard>

        {/* Password */}
        <GlassCard className="p-6">
          <SectionHeader title="Change Password" />
          <div className="space-y-4 max-w-sm">
            <Input label="New Password" value={newPassword} onChange={setNewPassword} type="password" placeholder="••••••••" />
            <Input label="Confirm Password" value={confirmPassword} onChange={setConfirmPassword} type="password" placeholder="••••••••" />
            {passwordMsg && (
              <p className={`text-xs ${passwordMsg.includes('match') || passwordMsg.includes('fill') || passwordMsg.includes('least') ? 'text-red-400' : 'text-emerald-400'}`}>
                {passwordMsg}
              </p>
            )}
            <Button variant="primary" size="sm" onClick={handlePasswordChange}>
              <Lock size={14} className="mr-2" /> Update Password
            </Button>
          </div>
        </GlassCard>

        {/* Preferences Placeholder */}
        <GlassCard className="p-6">
          <SectionHeader title="Preferences" />
          <div className="space-y-4 text-sm text-white/50">
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Bell size={16} className="text-white/40" />
                <span>Email Notifications</span>
              </div>
              <div className="w-10 h-6 bg-white/[0.1] rounded-full relative cursor-pointer">
                <div className="w-4 h-4 bg-white/40 rounded-full absolute top-1 left-1" />
              </div>
            </div>
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Palette size={16} className="text-white/40" />
                <span>Dark Mode</span>
              </div>
              <div className="w-10 h-6 bg-emerald-500/30 rounded-full relative cursor-pointer">
                <div className="w-4 h-4 bg-emerald-400 rounded-full absolute top-1 right-1" />
              </div>
            </div>
          </div>
        </GlassCard>
      </div>
    </V3Layout>
  );
}
