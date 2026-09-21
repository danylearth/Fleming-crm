import { createPortal } from 'react-dom';
import SmsEditor from './SmsEditor';
import { useState } from 'react';
import { X } from 'lucide-react';
import { Button, DatePicker } from './index';
import { useApi } from '../../hooks/useApi';
import EmailPreviewModal from './EmailPreviewModal';

interface Preview { tenant_id: number; name: string; to: string; subject: string; html: string; sms: string }
export default function TenancyEndModal({ tenantId, linkedName, initialDate, onClose, onSaved }: {
  tenantId: number; linkedName?: string; initialDate?: string; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const api = useApi();
  const [endDate, setEndDate] = useState((initialDate || '').slice(0, 10));
  const [notes, setNotes] = useState('');
  const [email, setEmail] = useState(false);
  const [sms, setSms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [smsEdits,setSmsEdits] = useState<Record<string,string>>({});
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [previewChannel, setPreviewChannel] = useState<'email' | 'sms' | null>(null);
  const [selected, setSelected] = useState(0);
  const submit = async (previewOnly: boolean, channel?: 'email' | 'sms') => {
    setBusy(true); setError('');
    try {
      const result = await api.post(`/api/tenants/${tenantId}/tenancy-end`, { end_date: endDate, notes, send_email: email, send_sms: sms, preview_only: previewOnly, sms_messages: smsEdits });
      if (previewOnly) { setPreviews(result.previews); setSelected(0); setPreviewChannel(channel || 'email'); }
      else { await onSaved(); if (result.failures?.length) setError(`End date saved. Some messages were not sent: ${result.failures.join('; ')}`); else onClose(); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the tenancy end date'); }
    finally { setBusy(false); }
  };
  const preview = previews[selected];
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="tenancy-end-title">
    <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border-input)] bg-[var(--bg-card)] p-6 shadow-2xl">
      <div className="flex justify-between gap-3"><h2 id="tenancy-end-title" className="text-lg font-semibold">Schedule Tenancy End</h2><button disabled={busy} onClick={onClose} aria-label="Close tenancy end"><X size={20} /></button></div>
      {linkedName && <p className="mt-3 text-sm text-[var(--text-secondary)]">This updates both linked tenants, including {linkedName}. Selected messages are personalised and sent to each tenant.</p>}
      <div className="mt-5 space-y-4"><DatePicker label="Scheduled End Date" value={endDate} onChange={v => { setEndDate(v); setSmsEdits({}); }} />
        <p className="text-xs text-[var(--text-muted)]">The tenancy remains active through this date and moves to Archived the following day.</p>
        <label className="block text-xs">Internal Notes<textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={10000} rows={3} className="mt-2 w-full rounded-xl border border-[var(--border-input)] bg-[var(--bg-input)] p-3 text-sm" placeholder="Internal Notes — not included in messages" /></label>
        <div className="flex items-center justify-between gap-3"><label className="text-sm flex gap-2"><input type="checkbox" checked={email} onChange={e => setEmail(e.target.checked)} />Send Email</label><Button variant="outline" size="sm" disabled={!endDate || busy} onClick={() => submit(true, 'email')}>Preview Email</Button></div>
        <div className="flex items-center justify-between gap-3"><label className="text-sm flex gap-2"><input type="checkbox" checked={sms} onChange={e => setSms(e.target.checked)} />Send SMS</label><Button variant="outline" size="sm" disabled={!endDate || busy} onClick={() => submit(true, 'sms')}>Preview SMS</Button></div>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-3"><Button variant="ghost" disabled={busy} onClick={onClose}>Close</Button><Button disabled={!endDate || busy} onClick={() => submit(false)} className="!bg-red-600 !text-white">{busy ? 'Saving…' : 'Schedule End'}</Button></div>
      </div>
    </div>
    {previewChannel === 'email' && preview && <EmailPreviewModal open previewOnly onClose={() => setPreviewChannel(null)} onSend={async () => {}} to={preview.to} from="contact@tenancies.fleminglettings.co.uk" initialSubject={preview.subject} initialBodyHtml={preview.html}>
      {previews.length > 1 && <select aria-label="Preview tenant" value={selected} onChange={e => setSelected(Number(e.target.value))}>{previews.map((p, i) => <option key={p.tenant_id} value={i}>{p.name}</option>)}</select>}
    </EmailPreviewModal>}
    {previewChannel === 'sms' && createPortal(<div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4"><div className="max-w-xl rounded-2xl bg-[var(--bg-card)] p-6 space-y-4"><h3 className="font-semibold">SMS Preview</h3>{previews.map(p => <div key={p.tenant_id}><p className="font-medium text-sm">{p.name}</p><SmsEditor value={smsEdits[p.tenant_id] || p.sms} onChange={v => setSmsEdits(current => ({ ...current, [p.tenant_id]: v }))} /></div>)}<Button onClick={() => setPreviewChannel(null)}>Close Preview</Button></div></div>, document.body)}
  </div>;
}
