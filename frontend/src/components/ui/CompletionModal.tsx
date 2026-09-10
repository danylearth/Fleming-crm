import { useState } from 'react';
import { X, CheckCircle, Circle } from 'lucide-react';
import { Button } from './index';
import { useApi } from '../../hooks/useApi';
import type { CompletionItem } from '../../utils/tenantCompletion';
export default function CompletionModal({ tenantId, items, canEdit, onClose, onSaved }: { tenantId: number; items: CompletionItem[]; canEdit: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const api = useApi();
  const [selected,setSelected] = useState(''), [reason,setReason] = useState(''), [error,setError] = useState(''), [busy,setBusy] = useState(false);
  const save = async (key: string, complete: boolean) => {
    setBusy(true); setError('');
    try { await api.put(`/api/tenants/${tenantId}/completion-overrides`, { key, complete, reason }); await onSaved(); setSelected(''); setReason(''); }
    catch(e) { setError(e instanceof Error ? e.message : 'Could not save override'); }
    finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="completion-title"><div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--bg-card)] p-6">
    <div className="flex justify-between gap-3"><h2 id="completion-title" className="text-lg font-semibold">Completion checklist</h2><button disabled={busy} onClick={onClose} aria-label="Close checklist"><X size={20} /></button></div>
    <p className="my-3 text-sm text-[var(--text-secondary)]">{items.filter(i=>!i.done).length} items remaining. Guarantor checks apply only when Guarantor Required is Yes. Overrides are recorded separately from supporting evidence.</p>
    <div className="space-y-3">{items.map(item=><div key={item.key} className="rounded-xl border border-[var(--border-input)] p-3">
      <div className="flex items-center justify-between gap-3"><div className="flex gap-2 items-center text-sm">{item.done ? <CheckCircle size={18} className="text-green-400 shrink-0" /> : <Circle size={18} className="text-orange-400 shrink-0" />}<span>{item.label}<span className="block text-xs text-[var(--text-muted)]">{item.override ? 'Complete by staff override' : item.done ? 'Complete' : 'Missing'}</span></span></div>
        {canEdit && (item.override ? <Button size="sm" variant="ghost" disabled={busy} onClick={()=>save(item.key,false)}>Remove override</Button> : !item.done && <Button size="sm" variant="outline" disabled={busy} onClick={()=>{setSelected(item.key);setReason('');}}>Mark complete</Button>)}</div>
      {item.override && <p className="text-xs text-[var(--text-muted)] mt-2 break-words">{item.override.reason} · {item.override.by} · {new Date(item.override.at).toLocaleDateString('en-GB')}</p>}
      {selected === item.key && <div className="mt-3 space-y-2"><label className="text-xs block">Reason for overriding<textarea aria-label="Override reason" value={reason} onChange={e=>setReason(e.target.value)} maxLength={2000} className="mt-1 w-full rounded-lg bg-[var(--bg-input)] border border-[var(--border-input)] p-2 text-sm" /></label><Button size="sm" disabled={busy || !reason.trim()} onClick={()=>save(item.key,true)}>Save override</Button></div>}
    </div>)}</div>{error && <p role="alert" className="text-red-400 text-sm mt-3">{error}</p>}
  </div></div>;
}
