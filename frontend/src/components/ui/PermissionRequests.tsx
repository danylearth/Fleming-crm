import {ShieldCheck} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { GlassCard, Button, Select, Input } from './index';
type PermissionRequest = { id: number; name: string; email: string; requested_role: string; reason: string; status: string };
export default function PermissionRequests() {
  const api = useApi();
  const { user } = useAuth();
  const [requests, setRequests] = useState<PermissionRequest[]>([]);
  const [role, setRole] = useState(user?.role === 'manager' ? 'staff' : 'manager');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/api/permission-requests').then(setRequests).catch(e => setMessage(e.message)); }, [api]);
  const submit = async (id?: number, status?: string) => {
    setBusy(true); setMessage('');
    try {
      if (id) await api.put(`/api/permission-requests/${id}`, { status });
      else { await api.post('/api/permission-requests', { requested_role: role, reason }); setReason(''); }
      setRequests(await api.get('/api/permission-requests')); setMessage(id ? 'Request reviewed.' : 'Request sent to your administrator.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not save request'); }
    finally { setBusy(false); }
  };
  return <GlassCard className="p-6 space-y-4"><h2 className="font-semibold flex items-center gap-2"><ShieldCheck size={18}/>Permission Requests</h2>
    {user?.role !== 'admin' && <div className="space-y-3"><p className="text-sm text-[var(--text-muted)]">Ask an administrator to change your access.</p><Select label="Requested Role" value={role} onChange={setRole} options={['viewer','staff','manager'].filter(r => r !== user?.role).map(r => ({ value: r, label: r.charAt(0).toUpperCase()+r.slice(1) }))} /><Input label="Reason" value={reason} onChange={setReason} /><Button disabled={busy || !reason.trim() || requests.some(r => r.status === 'pending')} onClick={() => submit()}>Request Change</Button></div>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {!requests.length && <p className="text-sm text-[var(--text-muted)]">No permission requests.</p>}
    {requests.map(r => <div key={r.id} className="border-t border-[var(--border-subtle)] pt-3 space-y-2"><p className="text-sm font-medium">{r.name} · {r.requested_role} · {r.status}</p><p className="text-sm whitespace-pre-wrap break-words">{r.reason}</p>{user?.role === 'admin' && r.status === 'pending' && <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => submit(r.id,'approved')}>Approve</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => submit(r.id,'rejected')}>Reject</Button></div>}</div>)}
  </GlassCard>;
}
