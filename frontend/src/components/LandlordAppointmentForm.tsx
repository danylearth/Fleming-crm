import { useState, useEffect } from 'react';
import { Button, DatePicker, Input, Select } from './ui';
import { useApi } from '../hooks/useApi';
import { OFFICE_ADDRESS } from '../utils/meetingLocations';

export default function LandlordAppointmentForm({ prospect, kind, onBack, onSaved }: {
  prospect: { id: number; name: string; email: string; phone: string; address: string };
  kind: 'meeting' | 'follow_up'; onBack: () => void; onSaved: () => void;
}) {
  const api = useApi();
  const [requestId] = useState(() => crypto.randomUUID());
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [locationType, setLocationType] = useState('');
  const [otherAddress, setOtherAddress] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [users, setUsers] = useState<{ id: number; name: string; role: string }[]>([]);
  const [sendEmail, setSendEmail] = useState(Boolean(prospect.email));
  const [sendSms, setSendSms] = useState(Boolean(prospect.phone));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/api/users/options').then(setUsers).catch(() => {}); }, [api]);
  const location = locationType === 'office' ? OFFICE_ADDRESS : locationType === 'enquiry' ? prospect.address : otherAddress.trim();
  const message = `Hi ${prospect.name}, ${kind === 'meeting' ? 'your meeting with Fleming Lettings is booked' : 'we will follow up with you'} on ${date ? new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '[date]'}${time ? ` at ${time} (UK time)` : ''}${kind === 'meeting' ? ` at ${location || '[location]'}` : ''}. If you need to rearrange, please contact us on 01902 212 415. Fleming Lettings.`;
  async function save() {
    setSaving(true); setError('');
    try {
      const result = await api.post(`/api/landlords-bdm/${prospect.id}/appointment`, { request_id: requestId, kind, date, time, location, assigned_to: assignedTo || null, send_email: sendEmail, send_sms: sendSms });
      setSaved(true);
      const failures = Object.entries(result.delivery || {}).filter(([key, value]) => ['email', 'sms'].includes(key) && !(value as { success?: boolean }).success).map(([key]) => key);
      if (failures.length || result.delivery?.warning || result.delivery?.pending) setError(result.delivery?.warning || `Booking saved. ${failures.length ? `${failures.join(' and ')} could not be sent.` : 'Communications are still being processed.'} Check the record’s communication history.`);
      else onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save appointment'); }
    finally { setSaving(false); }
  }
  return <div className="space-y-4">
    <h4 className="font-medium">{kind === 'meeting' ? 'Book a Meeting' : 'Set Follow Up'}</h4>
    <Select label="Assign To (Agent)" value={assignedTo} onChange={setAssignedTo} options={[{ value: '', label: 'Unassigned' }, ...users.filter(u => ['admin', 'manager', 'staff'].includes(u.role)).map(u => ({ value: String(u.id), label: u.name }))]} />
    <div className="grid grid-cols-2 gap-3"><DatePicker label="Date *" value={date} onChange={setDate} /><Input label={kind === 'meeting' ? 'Time *' : 'Time (optional)'} type="time" value={time} onChange={setTime} /></div>
    {kind === 'meeting' && <>
      <Select label="Meeting Location *" value={locationType} onChange={setLocationType} options={[{ value: '', label: 'Choose location...' }, { value: 'office', label: 'Office Address' }, ...(prospect.address ? [{ value: 'enquiry', label: 'Enquiry Address' }] : []), { value: 'other', label: 'Other Address' }]} />
      {locationType === 'other' ? <Input label="Address *" value={otherAddress} onChange={setOtherAddress} /> : location && <p className="text-sm text-[var(--text-secondary)]">{location}</p>}
    </>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sendEmail} disabled={!prospect.email || saved} onChange={e => setSendEmail(e.target.checked)} />Send email confirmation {prospect.email && <span className="text-xs">({prospect.email})</span>}</label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sendSms} disabled={!prospect.phone || saved} onChange={e => setSendSms(e.target.checked)} />Send SMS confirmation {prospect.phone && <span className="text-xs">({prospect.phone})</span>}</label>
    {(sendEmail || sendSms) && <div className="rounded-xl bg-[var(--bg-subtle)] p-3 text-sm"><p className="font-medium mb-2">Message Preview</p>{message}</div>}
    {error && <p role="alert" className="text-sm text-amber-600">{error}</p>}
    <div className="flex gap-3">{saved ? <Button onClick={onSaved}>Done</Button> : <><Button variant="ghost" disabled={saving} onClick={onBack}>Back</Button><Button variant="gradient" disabled={saving || !date || (kind === 'meeting' && (!time || !location))} onClick={save}>{saving ? 'Saving…' : kind === 'meeting' ? 'Book Meeting' : 'Set Follow Up'}</Button></>}</div>
  </div>;
}
