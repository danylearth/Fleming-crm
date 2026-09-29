import { useState, useEffect } from 'react';
import { Button, DatePicker, Input, Select, TimePicker } from './ui';
import { useApi } from '../hooks/useApi';
import { OFFICE_ADDRESS } from '../utils/meetingLocations';
import { Mail, Phone } from 'lucide-react';

export default function LandlordAppointmentForm({ prospect, kind, onBack, onSaved, contactMade=false }: {
  prospect: { id: number; name: string; email: string; phone: string; address: string };
  contactMade?:boolean; kind: 'meeting' | 'follow_up'; onBack: () => void; onSaved: () => void;
}) {
  const api = useApi();
  const [requestId] = useState(() => crypto.randomUUID());
  const [contactNote,setContactNote]=useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [locationType, setLocationType] = useState('');
  const [otherAddress, setOtherAddress] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [users, setUsers] = useState<{ id: number; name: string; role: string }[]>([]);
  const [sendEmail, setSendEmail] = useState(!contactMade&&Boolean(prospect.email));
  const [sendSms, setSendSms] = useState(!contactMade&&Boolean(prospect.phone));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/api/users/options').then(setUsers).catch(() => {}); }, [api]);
  const location = locationType === 'office' ? OFFICE_ADDRESS : locationType === 'enquiry' ? prospect.address : otherAddress.trim();
  const message = `Hi ${prospect.name}, ${kind === 'meeting' ? 'your meeting with Fleming Lettings is booked' : 'we will follow up with you'} on ${date ? new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '[date]'}${time ? ` at ${time} (UK time)` : ''}${kind === 'meeting' ? ` at ${location || '[location]'}` : ''}. If you need to rearrange, please contact us on 01902 212 415. Fleming Lettings.`;
  async function save() {
    setSaving(true); setError('');
    try {
      const result = await api.post(`/api/landlords-bdm/${prospect.id}/appointment`, { request_id: requestId, kind, contact_made:contactMade, contact_note:contactNote, date, time, location, assigned_to: assignedTo || null, send_email: sendEmail, send_sms: sendSms });
      setSaved(true);
      const failures = Object.entries(result.delivery || {}).filter(([key, value]) => ['email', 'sms'].includes(key) && !(value as { success?: boolean }).success).map(([key]) => key);
      if (failures.length || result.delivery?.warning || result.delivery?.pending) setError(result.delivery?.warning || `Booking saved. ${failures.length ? `${failures.join(' and ')} could not be sent.` : 'Communications are still being processed.'} Check the record’s communication history.`);
      else onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save appointment'); }
    finally { setSaving(false); }
  }
  return <div className="space-y-4">
    <button onClick={onBack} disabled={saving} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">← Back</button>
    {contactMade&&<label className="block text-sm">Contact Note *<textarea aria-label="Contact Note" value={contactNote} onChange={e=>setContactNote(e.target.value)} maxLength={4000} rows={3} className="mt-1 p-3 w-full rounded-xl border bg-[var(--bg-input)]"/></label>}
    <Select label="Assign To (Agent)" value={assignedTo} onChange={setAssignedTo} options={[{ value: '', label: 'Unassigned' }, ...users.filter(u => ['admin', 'manager', 'staff'].includes(u.role)).map(u => ({ value: String(u.id), label: u.name }))]} />
    {kind === 'meeting' && <>
      <Select label="Meeting Location *" value={locationType} onChange={setLocationType} options={[{ value: '', label: 'Choose location...' }, { value: 'office', label: 'Office Address' }, ...(prospect.address ? [{ value: 'enquiry', label: 'Enquiry Address' }] : []), { value: 'other', label: 'Other Address' }]} />
      {locationType === 'other' ? <Input label="Address *" value={otherAddress} onChange={setOtherAddress} /> : location && <p className="text-sm text-[var(--text-secondary)]">{location}</p>}
    </>}
    <div className="grid grid-cols-2 gap-3"><DatePicker label={kind==='meeting'?'Meeting Date *':'Follow-up Date *'} value={date} onChange={setDate}/><div><label className="block text-xs text-[var(--text-secondary)] mb-1.5 font-medium">{kind==='meeting'?'Meeting Time *':'Time (optional)'}</label><TimePicker value={time} onChange={setTime}/></div></div>
    <div className="h-px bg-[var(--border-subtle)] my-1"/>
    {[{channel:'email',value:sendEmail,set:setSendEmail,contact:prospect.email,Icon:Mail},{channel:'SMS',value:sendSms,set:setSendSms,contact:prospect.phone,Icon:Phone}].map(({channel,value,set,contact,Icon})=><div key={channel} className="space-y-3"><label className="flex items-center gap-3 cursor-pointer py-2 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]"><input className="w-4 h-4 rounded accent-orange-500" type="checkbox" checked={value} disabled={!contact||saved} onChange={event=>set(event.target.checked)}/><Icon size={14} className={channel==='email'?'text-sky-400':'text-teal-400'}/><div className="flex-1"><span className="text-sm font-medium">Send {channel} confirmation</span><p className="text-[10px] text-[var(--text-muted)]">{contact||`No ${channel==='email'?'email address':'phone number'} recorded`}</p></div></label>{value&&<div><label className="block text-[11px] text-[var(--text-muted)] font-medium mb-1.5 uppercase tracking-wider">Message Preview</label><textarea readOnly value={message} rows={5} className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-3 text-xs text-[var(--text-primary)] resize-none"/></div>}</div>)}
    {error && <p role="alert" className="text-sm text-amber-600">{error}</p>}
    <div className="flex justify-end gap-3 pt-2">{saved ? <Button onClick={onSaved}>Done</Button> : <><Button variant="ghost" disabled={saving} onClick={onBack}>Cancel</Button><Button variant="gradient" disabled={saving || !date || (contactMade&&!contactNote.trim()) || (kind === 'meeting' && (!time || !location))} onClick={save}>{saving ? 'Saving…' : kind === 'meeting' ? 'Book Meeting' : 'Set Follow Up'}</Button></>}</div>
  </div>;
}
