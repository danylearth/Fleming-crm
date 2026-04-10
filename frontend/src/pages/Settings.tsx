import { useState } from 'react';
import Layout from '../components/Layout';
import { GlassCard, Button, Input, Avatar, SectionHeader } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import { Camera, Lock, Bell, Palette } from 'lucide-react';

export default function Settings() {
  const { user } = useAuth();
  const api = useApi();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // AI Config hidden until AI router is ported to PostgreSQL

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
      <div className="p-4 md:p-8 space-y-6 md:space-y-8 max-w-2xl">
        {/* Profile */}
        <GlassCard className="p-6">
          <SectionHeader title="Profile" />
          <div className="flex items-center gap-6">
            <div className="relative group">
              <Avatar name={user?.name} size="xl" />
              <div className="absolute inset-0 rounded-full bg-[var(--overlay-bg)] opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer">
                <Camera size={20} className="text-[var(--text-primary)]" />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold">{user?.name || 'User'}</h2>
              <p className="text-sm text-[var(--text-secondary)]">{user?.email || ''}</p>
            </div>
          </div>
        </GlassCard>

        {/* Password */}
        <GlassCard className="p-6">
          <SectionHeader title="Change Password" />
          <div className="space-y-4 max-w-sm">
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

        {/* Preferences Placeholder */}
        <GlassCard className="p-6">
          <SectionHeader title="Preferences" />
          <div className="space-y-4 text-sm text-[var(--text-secondary)]">
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Bell size={16} className="text-[var(--text-muted)]" />
                <span>Email Notifications</span>
              </div>
              <div className="w-10 h-6 bg-[var(--bg-input)] rounded-full relative cursor-pointer">
                <div className="w-4 h-4 bg-white/40 rounded-full absolute top-1 left-1" />
              </div>
            </div>
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Palette size={16} className="text-[var(--text-muted)]" />
                <span>Dark Mode</span>
              </div>
              <div className="w-10 h-6 bg-emerald-500/30 rounded-full relative cursor-pointer">
                <div className="w-4 h-4 bg-emerald-400 rounded-full absolute top-1 right-1" />
              </div>
            </div>
          </div>
        </GlassCard>
      </div>
    </Layout>
  );
}
