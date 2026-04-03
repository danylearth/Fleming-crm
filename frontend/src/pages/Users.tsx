import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { GlassCard, Button, Input, Select, Avatar, EmptyState, DataTable, type Column } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { usePermissions } from '../hooks/usePermissions';
import { Plus, X, Users as UsersIcon, Mail, Shield, ShieldAlert, Eye, Key, CheckCircle, XCircle, Copy } from 'lucide-react';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  department?: string;
  is_active: number;
  created_at: string;
  last_login?: string;
}

export default function Users() {
  const navigate = useNavigate();
  const api = useApi();
  const { canManageUsers, isAdmin } = usePermissions();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'staff', department: '' });
  const [saving, setSaving] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [error, setError] = useState('');

  // Redirect if not admin
  useEffect(() => {
    if (!canManageUsers()) {
      navigate('/');
    }
  }, [canManageUsers, navigate]);

  const load = async () => {
    try {
      const data = await api.get('/api/users');
      setUsers(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin()) {
      load();
    }
  }, [isAdmin]);

  const filtered = users.filter(u => {
    if (!search) return true;
    return [u.name, u.email, u.role, u.department]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()));
  });

  const handleOpenCreate = () => {
    setEditUser(null);
    setForm({ name: '', email: '', role: 'staff', department: '' });
    setError('');
    setTempPassword('');
    setShowModal(true);
  };

  const handleOpenEdit = (user: User) => {
    setEditUser(user);
    setForm({ name: user.name, email: user.email, role: user.role, department: user.department || '' });
    setError('');
    setTempPassword('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setError('Name and email are required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (editUser) {
        // Update existing user
        await api.put(`/api/users/${editUser.id}`, form);
        setShowModal(false);
      } else {
        // Create new user
        const result = await api.post('/api/users', form);
        setTempPassword(result.tempPassword);
        // Don't close modal yet - show temp password
      }
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async (userId: number) => {
    if (!confirm('Reset this user\'s password? A temporary password will be generated.')) return;

    try {
      const result = await api.put(`/api/users/${userId}/reset-password`, {});
      setTempPassword(result.tempPassword);
      setEditUser(users.find(u => u.id === userId) || null);
      setShowModal(true);
    } catch (err: any) {
      alert(err.message || 'Failed to reset password');
    }
  };

  const handleToggleActive = async (user: User) => {
    const newStatus = user.is_active ? 0 : 1;
    const action = newStatus ? 'activate' : 'deactivate';

    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${user.name}?`)) return;

    try {
      await api.put(`/api/users/${user.id}`, { is_active: newStatus });
      await load();
    } catch (err: any) {
      alert(err.message || `Failed to ${action} user`);
    }
  };

  const handleDelete = async (user: User) => {
    if (!confirm(`Deactivate ${user.name}? This will prevent them from logging in.`)) return;

    try {
      await api.delete(`/api/users/${user.id}`);
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed to deactivate user');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  const roleColors: Record<string, string> = {
    admin: 'bg-red-500/20 text-red-400',
    manager: 'bg-orange-500/20 text-orange-400',
    staff: 'bg-blue-500/20 text-blue-400',
    viewer: 'bg-gray-500/20 text-gray-400'
  };

  const roleIcons: Record<string, any> = {
    admin: ShieldAlert,
    manager: Shield,
    staff: UsersIcon,
    viewer: Eye
  };

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'User',
      render: (user) => (
        <div className="flex items-center gap-3">
          <Avatar name={user.name} size="sm" />
          <div>
            <div className="font-medium text-sm">{user.name}</div>
            <div className="text-xs text-[var(--text-muted)]">{user.email}</div>
          </div>
        </div>
      )
    },
    {
      key: 'role',
      header: 'Role',
      render: (user) => {
        const RoleIcon = roleIcons[user.role] || UsersIcon;
        return (
          <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium ${roleColors[user.role] || 'bg-gray-500/20 text-gray-400'}`}>
            <RoleIcon size={12} className="mr-1" />
            {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
          </span>
        );
      }
    },
    {
      key: 'department',
      header: 'Department',
      render: (user) => user.department || <span className="text-[var(--text-muted)]">—</span>
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (user) => user.is_active ? (
        <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">
          <CheckCircle size={12} className="mr-1" />
          Active
        </span>
      ) : (
        <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
          <XCircle size={12} className="mr-1" />
          Inactive
        </span>
      )
    },
    {
      key: 'last_login',
      header: 'Last Login',
      render: (user) => user.last_login
        ? new Date(user.last_login).toLocaleDateString()
        : <span className="text-[var(--text-muted)]">Never</span>
    },
    {
      key: 'actions',
      header: '',
      render: (user) => (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(user)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleResetPassword(user.id)}>
            <Key size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleToggleActive(user)}
            className={user.is_active ? '' : 'text-emerald-400'}
          >
            {user.is_active ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      )
    }
  ];

  if (!isAdmin()) {
    return null; // Will redirect via useEffect
  }

  return (
    <Layout title="Team Management" breadcrumb={[{ label: 'Team' }]}>
      <div className="p-4 md:p-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <GlassCard className="p-4">
            <div className="text-sm text-[var(--text-secondary)]">Total Users</div>
            <div className="text-2xl font-semibold mt-1">{users.length}</div>
          </GlassCard>
          <GlassCard className="p-4">
            <div className="text-sm text-[var(--text-secondary)]">Active</div>
            <div className="text-2xl font-semibold mt-1 text-emerald-400">{users.filter(u => u.is_active).length}</div>
          </GlassCard>
          <GlassCard className="p-4">
            <div className="text-sm text-[var(--text-secondary)]">Admins</div>
            <div className="text-2xl font-semibold mt-1 text-orange-400">{users.filter(u => u.role === 'admin').length}</div>
          </GlassCard>
          <GlassCard className="p-4">
            <div className="text-sm text-[var(--text-secondary)]">Staff</div>
            <div className="text-2xl font-semibold mt-1">{users.filter(u => u.role === 'staff' || u.role === 'manager').length}</div>
          </GlassCard>
        </div>

        {/* Search & Actions */}
        <GlassCard className="p-4">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <Input
              value={search}
              onChange={setSearch}
              placeholder="Search users..."
              className="w-full md:w-80"
            />
            <Button variant="primary" size="sm" onClick={handleOpenCreate}>
              <Plus size={16} className="mr-2" />
              Add User
            </Button>
          </div>
        </GlassCard>

        {/* Users Table */}
        <GlassCard className="overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-[var(--text-secondary)]">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={<UsersIcon size={48} />}
                message={search ? 'No users found. Try adjusting your search.' : 'No users yet. Get started by adding your first user.'}
              />
              {!search && (
                <div className="flex justify-center mt-4">
                  <Button variant="primary" size="sm" onClick={handleOpenCreate}>
                    <Plus size={16} className="mr-2" />
                    Add User
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <DataTable columns={columns} data={filtered} rowKey={(user) => user.id} />
          )}
        </GlassCard>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-[var(--overlay-bg)] backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-[var(--bg-card)] border border-[var(--border-input)] rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-md space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                {tempPassword ? 'User Created' : editUser ? 'Edit User' : 'Add New User'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                <X size={20} />
              </button>
            </div>

            {tempPassword ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <CheckCircle size={20} className="text-emerald-400 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-emerald-400 mb-2">
                        {editUser ? 'Password Reset' : 'User Created Successfully'}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] mb-3">
                        Temporary password for <strong>{form.email}</strong>:
                      </div>
                      <div className="flex items-center gap-2 bg-[var(--bg-input)] p-2 rounded border border-[var(--border-input)]">
                        <code className="flex-1 text-sm font-mono">{tempPassword}</code>
                        <button
                          onClick={() => copyToClipboard(tempPassword)}
                          className="p-1.5 hover:bg-[var(--bg-hover)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          title="Copy to clipboard"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] mt-2">
                        Save this password - it won't be shown again. The user should change it after first login.
                      </div>
                    </div>
                  </div>
                </div>
                <Button variant="primary" onClick={() => {
                  setShowModal(false);
                  setTempPassword('');
                  setEditUser(null);
                }}>
                  Done
                </Button>
              </div>
            ) : (
              <>
                <Input label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="John Doe" />
                <Input label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="john@example.com" type="email" />
                <Select
                  label="Role"
                  value={form.role}
                  onChange={(v) => setForm({ ...form, role: v })}
                  options={[
                    { value: 'admin', label: 'Admin - Full system access' },
                    { value: 'manager', label: 'Manager - Can manage all entities' },
                    { value: 'staff', label: 'Staff - Can edit assigned items' },
                    { value: 'viewer', label: 'Viewer - Read-only access' }
                  ]}
                />
                <Input label="Department (optional)" value={form.department} onChange={(v) => setForm({ ...form, department: v })} placeholder="Operations" />

                {error && (
                  <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">
                    {error}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">Cancel</Button>
                  <Button variant="primary" onClick={handleSave} disabled={saving} className="flex-1">
                    {saving ? 'Saving...' : editUser ? 'Update User' : 'Create User'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
