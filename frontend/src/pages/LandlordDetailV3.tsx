import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { GlassCard, Button, Input, Avatar, SectionHeader, EmptyState, Card } from '../components/v3';
import DocumentUpload from '../components/v3/DocumentUpload';
import { useApi } from '../hooks/useApi';
import { Pencil, Save, X, Mail, Phone, MapPin, Building2, Calendar, ShieldCheck, Megaphone, StickyNote, UserCircle } from 'lucide-react';
import { getPropertyImage } from '../utils/propertyImages';

interface Landlord {
  id: number; name: string; email: string; phone: string; address: string; notes: string;
  alt_email: string; date_of_birth: string; home_address: string;
  marketing_post: number; marketing_email: number; marketing_phone: number; marketing_sms: number;
  kyc_completed: number; property_count: number;
}
interface Property {
  id: number; address: string; landlord_id: number; type?: string; status?: string;
}

function ReadField({ icon: Icon, label, value }: { icon?: any; label: string; value: string | React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {Icon && (
        <div className="w-9 h-9 rounded-xl bg-[var(--bg-hover)] flex items-center justify-center shrink-0">
          <Icon size={16} className="text-[var(--text-muted)]" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs text-[var(--text-muted)]">{label}</p>
        <p className="text-sm">{value || '—'}</p>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-colors ${
        checked
          ? 'bg-[var(--accent-orange)]/10 border-[var(--accent-orange)]/30 text-[var(--accent-orange)]'
          : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-muted)]'
      } ${disabled ? 'opacity-60 cursor-default' : 'cursor-pointer hover:border-[var(--accent-orange)]/20'}`}
    >
      <div className={`w-4 h-4 rounded-md border flex items-center justify-center ${
        checked ? 'bg-[var(--accent-orange)] border-[var(--accent-orange)]' : 'border-[var(--border-input)]'
      }`}>
        {checked && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5L4.5 7.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </div>
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

export default function LandlordDetailV3() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const [landlord, setLandlord] = useState<Landlord | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', address: '', notes: '',
    alt_email: '', date_of_birth: '', home_address: '',
    marketing_post: false, marketing_email: false, marketing_phone: false, marketing_sms: false,
    kyc_completed: false,
  });
  const [saving, setSaving] = useState(false);
  const [notesInput, setNotesInput] = useState('');
  const [notes, setNotes] = useState<{ id: string; text: string; author: string; created_at: string }[]>([]);

  const populateForm = (l: Landlord) => setForm({
    name: l.name || '', email: l.email || '', phone: l.phone || '', address: l.address || '',
    notes: '', alt_email: l.alt_email || '', date_of_birth: l.date_of_birth || '', home_address: l.home_address || '',
    marketing_post: !!l.marketing_post, marketing_email: !!l.marketing_email,
    marketing_phone: !!l.marketing_phone, marketing_sms: !!l.marketing_sms,
    kyc_completed: !!l.kyc_completed,
  });

  const parseNotes = (raw: string) => {
    try { return JSON.parse(raw || '[]'); } catch { return raw ? [{ id: '1', text: raw, author: 'System', created_at: '' }] : []; }
  };

  useEffect(() => {
    (async () => {
      try {
        const [l, props] = await Promise.all([
          api.get(`/api/landlords/${id}`),
          api.get('/api/properties'),
        ]);
        setLandlord(l);
        populateForm(l);
        setNotes(parseNotes(l.notes));
        setProperties(props.filter((p: Property) => p.landlord_id === Number(id)));
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        notes: JSON.stringify(notes),
      };
      await api.put(`/api/landlords/${id}`, payload);
      const updated = await api.get(`/api/landlords/${id}`);
      setLandlord(updated);
      populateForm(updated);
      setNotes(parseNotes(updated.notes));
      setEditing(false);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const addNote = async () => {
    if (!notesInput.trim()) return;
    const newNote = { id: Date.now().toString(), text: notesInput.trim(), author: 'You', created_at: new Date().toISOString() };
    const updated = [...notes, newNote];
    setNotes(updated);
    setNotesInput('');
    try {
      await api.put(`/api/landlords/${id}`, { ...form, notes: JSON.stringify(updated) });
    } catch (e) { console.error(e); }
  };

  if (loading) return <V3Layout title="Loading..."><div className="p-8 text-[var(--text-muted)] text-sm">Loading...</div></V3Layout>;
  if (!landlord) return <V3Layout title="Not Found"><div className="p-8 text-[var(--text-muted)]">Landlord not found</div></V3Layout>;

  return (
    <V3Layout breadcrumb={[{ label: 'Landlords', to: '/v3/landlords' }, { label: landlord.name }]}>
      <div className="p-4 md:p-8 space-y-6 md:space-y-8">
        {/* Hero */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-orange-500/20 via-pink-500/20 to-purple-500/20 border border-[var(--border-color)]">
          <div className="p-4 md:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-4 md:gap-6">
            <Avatar name={landlord.name} size="xl" />
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{landlord.name}</h1>
                {landlord.kyc_completed ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg px-2 py-0.5">
                    <ShieldCheck size={12} /> KYC Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg px-2 py-0.5">
                    <ShieldCheck size={12} /> KYC Pending
                  </span>
                )}
              </div>
              <p className="text-[var(--text-secondary)] text-sm mt-1">{properties.length} {properties.length === 1 ? 'property' : 'properties'} managed</p>
            </div>
            <div className="flex gap-2">
              <Button variant={editing ? 'ghost' : 'outline'} onClick={() => {
                if (editing) { setEditing(false); populateForm(landlord); }
                else setEditing(true);
              }}>
                {editing ? <><X size={14} className="mr-2" />Cancel</> : <><Pencil size={14} className="mr-2" />Edit</>}
              </Button>
              {editing && (
                <Button variant="gradient" onClick={handleSave} disabled={saving}>
                  <Save size={14} className="mr-2" />{saving ? 'Saving...' : 'Save'}
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left column — 3/5 */}
          <div className="lg:col-span-3 space-y-6">
            {/* Contact Information */}
            <GlassCard className="p-6">
              <SectionHeader title="Contact Information" />
              {editing ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="Full Name" value={form.name} onChange={v => setForm({ ...form, name: v })} />
                  <Input label="Date of Birth" value={form.date_of_birth} onChange={v => setForm({ ...form, date_of_birth: v })} type="date" />
                  <Input label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} type="email" />
                  <Input label="Alternative Email" value={form.alt_email} onChange={v => setForm({ ...form, alt_email: v })} type="email" />
                  <Input label="Phone" value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
                  <Input label="Home Address" value={form.home_address} onChange={v => setForm({ ...form, home_address: v })} />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ReadField icon={UserCircle} label="Full Name" value={landlord.name} />
                  <ReadField icon={Calendar} label="Date of Birth" value={landlord.date_of_birth} />
                  <ReadField icon={Mail} label="Email" value={landlord.email} />
                  <ReadField icon={Mail} label="Alternative Email" value={landlord.alt_email} />
                  <ReadField icon={Phone} label="Phone" value={landlord.phone} />
                  <ReadField icon={MapPin} label="Home Address" value={landlord.home_address} />
                </div>
              )}
            </GlassCard>

            {/* Properties */}
            <GlassCard className="p-6">
              <SectionHeader title="Properties" />
              {properties.length === 0 ? (
                <EmptyState message="No properties linked" />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {properties.map(p => (
                    <Card key={p.id} hover onClick={() => navigate(`/v3/properties/${p.id}`)} className="overflow-hidden">
                      <img src={getPropertyImage(p.id, 400, 160)} alt={p.address} className="h-24 w-full object-cover" loading="lazy" />
                      <div className="p-3">
                        <p className="text-sm font-medium truncate">{p.address}</p>
                        {p.type && <p className="text-xs text-[var(--text-muted)]">{p.type}</p>}
                        {p.status && (
                          <span className={`inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-md ${
                            p.status === 'available' ? 'bg-emerald-500/10 text-emerald-400' :
                            p.status === 'let' ? 'bg-blue-500/10 text-blue-400' :
                            'bg-[var(--bg-hover)] text-[var(--text-muted)]'
                          }`}>{p.status}</span>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </GlassCard>

            {/* Marketing Preferences */}
            <GlassCard className="p-6">
              <SectionHeader title="Marketing Preferences" />
              <div className="flex flex-wrap gap-3">
                <Toggle label="Post" checked={editing ? form.marketing_post : !!landlord.marketing_post} onChange={v => setForm({ ...form, marketing_post: v })} disabled={!editing} />
                <Toggle label="Email" checked={editing ? form.marketing_email : !!landlord.marketing_email} onChange={v => setForm({ ...form, marketing_email: v })} disabled={!editing} />
                <Toggle label="Telephone" checked={editing ? form.marketing_phone : !!landlord.marketing_phone} onChange={v => setForm({ ...form, marketing_phone: v })} disabled={!editing} />
                <Toggle label="SMS" checked={editing ? form.marketing_sms : !!landlord.marketing_sms} onChange={v => setForm({ ...form, marketing_sms: v })} disabled={!editing} />
              </div>
            </GlassCard>

            {/* KYC */}
            <GlassCard className="p-6">
              <SectionHeader title="KYC Compliance" />
              <div className="flex items-center gap-4">
                <Toggle label="KYC Completed" checked={editing ? form.kyc_completed : !!landlord.kyc_completed} onChange={v => setForm({ ...form, kyc_completed: v })} disabled={!editing} />
                {!landlord.kyc_completed && !editing && (
                  <p className="text-xs text-amber-400">Identity verification pending</p>
                )}
              </div>
            </GlassCard>

            {/* Documents */}
            <DocumentUpload entityType="landlord" entityId={landlord.id} />
          </div>

          {/* Right column — 2/5 */}
          <div className="lg:col-span-2 space-y-6">
            {/* Notes */}
            <GlassCard className="p-6">
              <SectionHeader title="Notes" />
              <div className="space-y-3">
                {notes.length === 0 && <p className="text-sm text-[var(--text-muted)]">No notes yet</p>}
                {notes.map(n => (
                  <div key={n.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--bg-hover)] flex items-center justify-center shrink-0 mt-0.5">
                      <StickyNote size={14} className="text-[var(--text-muted)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{n.text}</p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                        {n.author}{n.created_at ? ` · ${new Date(n.created_at).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2 mt-2">
                  <input value={notesInput} onChange={e => setNotesInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addNote()}
                    placeholder="Add a note..."
                    className="flex-1 bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-orange)]/40 transition-colors" />
                  <Button variant="gradient" onClick={addNote} disabled={!notesInput.trim()}>Add</Button>
                </div>
              </div>
            </GlassCard>

            {/* Activity Timeline */}
            <GlassCard className="p-6">
              <SectionHeader title="Activity Timeline" />
              <p className="text-xs text-[var(--text-muted)]">Coming soon</p>
            </GlassCard>
          </div>
        </div>
      </div>
    </V3Layout>
  );
}
