import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { GlassCard, Input, Select, SectionHeader } from './ui';
import SectionEditButton from './ui/SectionEditButton';
import { landlordIntakeSections } from '../utils/landlordIntakeFields';
import { useApi } from '../hooks/useApi';

export default function LandlordIntakeSections({ id, data, onSaved }: { id: number; data?: Record<string, unknown> | null; onSaved: () => void }) {
  const api = useApi();
  const [editing, setEditing] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const supplied = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== '';
  const registration = String(data?.registration_type || '').toLowerCase();
  const sections = landlordIntakeSections.filter(section => {
    const hasData = section.fields.some(f => supplied(data?.[f.key]));
    if (section.title === 'Joint Landlord') return registration === 'joint' || hasData;
    if (section.title === 'Company Details') return registration.includes('company') || hasData;
    if (section.title === 'Current Tenancy') return String(data?.alreadyLet).toLowerCase() === 'yes' || hasData;
    return ['Registration', 'Landlord/Company Contact', 'Property Details'].includes(section.title) || hasData;
  });
  async function save() {
    setSaving(true); setError('');
    try {
      await api.put(`/api/landlords-bdm/${id}`, { intake_data: draft });
      setEditing(''); onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save'); }
    finally { setSaving(false); }
  }
  return <>{sections.map(section => <GlassCard key={section.title} className="p-6">
    <div className="flex items-center justify-between gap-3 mb-3"><SectionHeader title={section.title} icon={<Building2 size={16}/>} />{!section.readonly && <SectionEditButton label={section.title} editing={editing === section.title} disabled={Boolean(editing) && editing !== section.title} saving={saving} onEdit={() => { setEditing(section.title); setDraft(Object.fromEntries(section.fields.map(f => [f.key, String(data?.[f.key] ?? '')]))); setError(''); }} onSave={save} onCancel={() => {setEditing('');setError('');}} />}</div>
    {section.readonly && <p className="text-xs text-[var(--text-muted)] mb-4">Original form submission. Current communication permissions are managed separately.</p>}
    {section.title === 'Certificates Reported by Landlord' && <p className="text-xs text-[var(--text-muted)] mb-4">These are the landlord’s answers. Uploaded evidence still needs to be checked.</p>}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{section.fields.map(f => {
      const value = data?.[f.key];
      return <div key={f.key} className={f.multiline ? 'sm:col-span-2' : ''}>{editing === section.title ? f.options ? <Select label={f.label} value={draft[f.key] || ''} onChange={v => setDraft({...draft, [f.key]: v})} options={[{value:'',label:'Not supplied'}, ...Array.from(new Set([...f.options, ...(draft[f.key] ? [draft[f.key]] : [])])).map(v => ({value:v,label:v}))]}/> : f.multiline ? <label className="block text-sm">{f.label}<textarea className="mt-1 w-full rounded-xl border border-[var(--border-input)] bg-[var(--bg-input)] p-3" rows={3} value={draft[f.key] || ''} onChange={e => setDraft({...draft,[f.key]:e.target.value})}/></label> : <Input label={f.label} value={draft[f.key] || ''} onChange={v=>setDraft({...draft,[f.key]:v})}/> : <><p className="text-xs text-[var(--text-muted)]">{f.label}</p><p className="text-sm whitespace-pre-wrap break-words">{value === undefined || value === null || value === '' ? 'Not supplied' : typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value)}</p></>}</div>;
    })}</div>{editing === section.title && error && <p role="alert" className="mt-3 text-sm text-red-500">{error}</p>}
  </GlassCard>)}</>;
}
