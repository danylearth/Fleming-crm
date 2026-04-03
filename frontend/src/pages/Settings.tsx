import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { GlassCard, Button, Input, Avatar, SectionHeader } from '../components/v3';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import { Camera, Lock, Bell, Palette, Bot, Mail, Key, CheckCircle, AlertCircle } from 'lucide-react';

export default function Settings() {
  const { user } = useAuth();
  const api = useApi();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // AI Config state
  const [resendApiKey, setResendApiKey] = useState('');
  const [emailFrom, setEmailFrom] = useState('');
  const [assistantName, setAssistantName] = useState('');
  const [configMsg, setConfigMsg] = useState('');
  const [configLoading, setConfigLoading] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const config = await api.get('/api/ai/config');
      setResendApiKey(config.resend_api_key || '');
      setEmailFrom(config.email_from || '');
      setAssistantName(config.assistant_name || '');
    } catch {
      // Config not set yet
    }
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
    } catch (err: any) {
      setPasswordMsg(err.message || 'Failed to update password');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setConfigLoading(true);
    try {
      const updates: Record<string, string> = {};
      if (resendApiKey && !resendApiKey.startsWith('****')) updates.resend_api_key = resendApiKey;
      if (emailFrom) updates.email_from = emailFrom;
      if (assistantName) updates.assistant_name = assistantName;

      await api.put('/api/ai/config', updates);
      setConfigMsg('Configuration saved');
      setTimeout(() => setConfigMsg(''), 3000);
      loadConfig();
    } catch (err: any) {
      setConfigMsg(err.message || 'Failed to save');
    } finally {
      setConfigLoading(false);
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

        {/* AI Assistant Configuration */}
        <GlassCard className="p-6">
          <SectionHeader title="AI Assistant" />
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--bg-hover)] border border-[var(--border-subtle)]">
              <Bot size={18} className="text-orange-400 mt-0.5 shrink-0" />
              <div className="text-xs text-[var(--text-secondary)]">
                Configure the AI assistant's email capabilities and identity. The assistant can send emails, chase references, and send rent reminders on your behalf.
              </div>
            </div>

            <Input
              label="Assistant Name"
              value={assistantName}
              onChange={setAssistantName}
              placeholder="e.g. Fleming AI, Assistant"
            />

            <div className="pt-2">
              <SectionHeader title="Email Configuration" />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-secondary)] flex items-center gap-2">
                <Key size={12} /> Resend API Key
              </label>
              <input
                type="password"
                value={resendApiKey}
                onChange={e => setResendApiKey(e.target.value)}
                placeholder="re_xxxxxxxxxxxx"
                className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-input)] border border-[var(--border-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-orange-500/50"
              />
              <p className="text-[10px] text-[var(--text-muted)]">
                Get your API key from <a href="https://resend.com" target="_blank" rel="noopener" className="text-orange-400 hover:underline">resend.com</a>. Free tier: 100 emails/day.
                {!resendApiKey || resendApiKey === '' ? ' Without a key, emails will be simulated.' : ''}
              </p>
            </div>

            <Input
              label="From Email Address"
              value={emailFrom}
              onChange={setEmailFrom}
              placeholder="Fleming Lettings <noreply@fleminglettings.com>"
            />

            {configMsg && (
              <div className={`flex items-center gap-2 text-xs ${configMsg.includes('Failed') ? 'text-red-400' : 'text-emerald-400'}`}>
                {configMsg.includes('Failed') ? <AlertCircle size={12} /> : <CheckCircle size={12} />}
                {configMsg}
              </div>
            )}

            <Button variant="primary" size="sm" onClick={handleSaveConfig} disabled={configLoading}>
              <Mail size={14} className="mr-2" /> {configLoading ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </GlassCard>

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
