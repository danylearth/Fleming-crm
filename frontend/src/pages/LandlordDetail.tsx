import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { GlassCard, Button, Input, Select, Avatar, SectionHeader, EmptyState, Card, DatePicker } from '../components/v3';
import DocumentUpload from '../components/v3/DocumentUpload';
import ActivityTimeline from '../components/v3/ActivityTimeline';
import AddressAutocomplete from '../components/v3/AddressAutocomplete';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { Pencil, Save, X, Mail, Phone, MapPin, Building2, Calendar, ShieldCheck, Megaphone, StickyNote, UserCircle, Plus, Search, ChevronDown, Briefcase, Trash2, RotateCcw } from 'lucide-react';
import { getPropertyImage } from '../utils/propertyImages';

interface Landlord {
  id: number; name: string; email: string; phone: string; address: string; notes: string;
  alt_email: string; date_of_birth: string; home_address: string; company_number: string;
  entity_type: string; // 'individual' | 'company' | 'trust'
  marketing_post: number; marketing_email: number; marketing_phone: number; marketing_sms: number;
  kyc_completed: number; property_count: number; referral_source: string;
}
interface Property {
  id: number; address: string; landlord_id: number; type?: string; status?: string; notes?: string;
}
interface Director {
  id: number; landlord_id: number; name: string; email: string; phone: string;
  date_of_birth: string; role: string; kyc_completed: number; notes: string;
  created_at: string; updated_at: string; archived: number;
}
interface DirectorOf {
  id: number; name: string; email: string; phone: string; role: string; director_id: number;
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

export default function LandlordDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const { user } = useAuth();
  const [landlord, setLandlord] = useState<Landlord | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [directors, setDirectors] = useState<Director[]>([]);
  const [archivedDirectors, setArchivedDirectors] = useState<Director[]>([]);
  const [directorTab, setDirectorTab] = useState<'active' | 'archived'>('active');
  const [directorOf, setDirectorOf] = useState<DirectorOf[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', notes: '',
    alt_email: '', date_of_birth: '', home_address: '', company_number: '', referral_source: '',
    entity_type: 'individual',
    marketing_post: false, marketing_email: false, marketing_phone: false, marketing_sms: false,
    kyc_completed: false,
  });
  const [saving, setSaving] = useState(false);
  const [notesInput, setNotesInput] = useState('');
  const [notes, setNotes] = useState<{ id: string; text: string; author: string; created_at: string }[]>([]);
  const [notesFilter, setNotesFilter] = useState<'all' | 'landlord' | string>('all'); // 'all', 'landlord', or property ID
  const [propertyNotes, setPropertyNotes] = useState<Record<number, { id: string; text: string; author: string; created_at: string }[]>>({});
  const [showAddProp, setShowAddProp] = useState(false);
  const [propMode, setPropMode] = useState<'create' | 'link'>('create');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [propSaving, setPropSaving] = useState(false);
  const [propForm, setPropForm] = useState({
    landlord_id: '', address: '', postcode: '', property_type: 'house', bedrooms: '1',
    rent_amount: '', status: 'to_let', service_type: '', council_tax_band: '', has_gas: false,
  });
  const [showAddDirector, setShowAddDirector] = useState(false);
  const [directorForm, setDirectorForm] = useState({
    name: '', email: '', phone: '', date_of_birth: '', role: '', kyc_completed: false, notes: ''
  });
  const [directorSaving, setDirectorSaving] = useState(false);

  const populateForm = (l: Landlord) => setForm({
    name: l.name || '', email: l.email || '', phone: l.phone || '',
    notes: '', alt_email: l.alt_email || '', date_of_birth: l.date_of_birth || '', home_address: l.home_address || '',
    company_number: l.company_number || '', referral_source: l.referral_source || '',
    entity_type: l.entity_type || 'individual',
    marketing_post: !!l.marketing_post, marketing_email: !!l.marketing_email,
    marketing_phone: !!l.marketing_phone, marketing_sms: !!l.marketing_sms,
    kyc_completed: !!l.kyc_completed,
  });

  const parseNotes = (raw: string) => {
    try { return JSON.parse(raw || '[]'); } catch { return raw ? [{ id: '1', text: raw, author: 'System', created_at: '' }] : []; }
  };

  const loadDetail = async () => {
    try {
      const [l, props, dirs, archivedDirs, dirOf] = await Promise.all([
        api.get(`/api/landlords/${id}`),
        api.get(`/api/landlords/${id}/properties`),
        api.get(`/api/landlords/${id}/directors?archived=false`).catch(() => []),
        api.get(`/api/landlords/${id}/directors?archived=true`).catch(() => []),
        api.get(`/api/landlords/${id}/director-of`).catch(() => []),
      ]);
      setLandlord(l);
      populateForm(l);
      setNotes(parseNotes(l.notes));
      setProperties(props);
      setDirectors(dirs);
      setArchivedDirectors(archivedDirs);
      setDirectorOf(dirOf);

      // Parse property notes
      const propNotesMap: Record<number, any[]> = {};
      props.forEach((p: Property) => {
        propNotesMap[p.id] = parseNotes(p.notes || '');
      });
      setPropertyNotes(propNotesMap);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    (async () => {
      await loadDetail();
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
    const noteText = notesInput.trim();
    const newNote = { id: Date.now().toString(), text: noteText, author: user?.email || 'Unknown', created_at: new Date().toISOString() };
    setNotesInput('');

    try {
      // If filter is set to a specific property, add note to that property
      if (notesFilter !== 'all' && notesFilter !== 'landlord') {
        const propId = parseInt(notesFilter);
        const property = properties.find(p => p.id === propId);
        if (property) {
          const currentPropNotes = propertyNotes[propId] || [];
          const updatedPropNotes = [...currentPropNotes, newNote];
          await api.put(`/api/properties/${propId}`, { notes: JSON.stringify(updatedPropNotes) });
          api.post('/api/activity', { action: 'note_added', entity_type: 'property', entity_id: propId, changes: { text: noteText } }).catch(() => {});
        }
      } else {
        // Add note to landlord
        const updated = [...notes, newNote];
        await api.put(`/api/landlords/${id}`, { ...form, notes: JSON.stringify(updated) });
        api.post('/api/activity', { action: 'note_added', entity_type: 'landlord', entity_id: Number(id), changes: { text: noteText } }).catch(() => {});
      }
      // Reload the data to show the new note
      await loadDetail();
    } catch (e) { console.error(e); }
  };

  const addDirector = async () => {
    if (!directorForm.name.trim()) return;
    setDirectorSaving(true);
    try {
      await api.post(`/api/landlords/${id}/directors`, directorForm);
      setShowAddDirector(false);
      setDirectorForm({ name: '', email: '', phone: '', date_of_birth: '', role: '', kyc_completed: false, notes: '' });
      await loadDetail();
    } catch (e) {
      console.error(e);
      alert('Failed to add director');
    }
    setDirectorSaving(false);
  };

  const deleteDirector = async (directorId: number) => {
    if (!confirm('Are you sure you want to archive this director? They will be moved to the Archived tab.')) return;
    try {
      await api.delete(`/api/directors/${directorId}`);
      await loadDetail();
    } catch (e) {
      console.error(e);
      alert('Failed to archive director');
    }
  };

  const reinstateDirector = async (directorId: number, directorName: string) => {
    if (!confirm(`Restore ${directorName} as an active director?`)) return;
    try {
      await api.post(`/api/directors/${directorId}/reinstate`, {});
      await loadDetail();
    } catch (e) {
      console.error(e);
      alert('Failed to reinstate director');
    }
  };

  // Get filtered notes based on current filter
  const getFilteredNotes = () => {
    if (notesFilter === 'all') {
      const allNotes = [
        ...notes.map(n => ({ ...n, source: 'landlord' as const })),
        ...Object.entries(propertyNotes).flatMap(([propId, propNotes]) =>
          propNotes.map(n => ({ ...n, source: 'property' as const, propertyId: parseInt(propId) }))
        )
      ];
      return allNotes.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    } else if (notesFilter === 'landlord') {
      return notes.map(n => ({ ...n, source: 'landlord' as const }));
    } else {
      const propId = parseInt(notesFilter);
      return (propertyNotes[propId] || []).map(n => ({ ...n, source: 'property' as const, propertyId: propId }));
    }
  };

  const filteredNotes = getFilteredNotes();

  if (loading) return <Layout title="Loading..."><div className="p-8 text-[var(--text-muted)] text-sm">Loading...</div></Layout>;
  if (!landlord) return <Layout title="Not Found"><div className="p-8 text-[var(--text-muted)]">Landlord not found</div></Layout>;

  return (
    <Layout breadcrumb={[{ label: 'Landlords', to: '/landlords' }, { label: landlord.name }]}>
      <div className="p-4 md:p-8 space-y-6 md:space-y-8">
        {/* Hero */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-orange-500/20 via-pink-500/20 to-purple-500/20 border border-[var(--border-color)]">
          <div className="p-4 md:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-4 md:gap-6">
            <Avatar name={landlord.name} size="xl" />
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold">{landlord.name}</h1>
                {landlord.entity_type === 'company' && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg px-2 py-0.5">
                    <Building2 size={12} /> Limited Company
                  </span>
                )}
                {landlord.entity_type === 'trust' && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-lg px-2 py-0.5">
                    <Building2 size={12} /> Trust
                  </span>
                )}
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
              {/* Subtitle removed per client feedback */}
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column — 2/3 */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact Information */}
            <GlassCard className={`p-6 ${editing ? 'relative z-10 overflow-visible' : ''}`}>
              <SectionHeader title="Contact Information" />
              {(() => {
                const isCompany = form.entity_type === 'company' || landlord.entity_type === 'company';
                return editing ? (
                  <div className="space-y-4">
                    <Select label="Entity Type" value={form.entity_type} onChange={v => setForm({ ...form, entity_type: v })}
                      options={[{ value: 'individual', label: 'Individual' }, { value: 'company', label: 'Limited Company' }, { value: 'trust', label: 'Trust' }]} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input label={isCompany ? "Company Name" : "Full Name"} value={form.name} onChange={v => setForm({ ...form, name: v })} />
                      {isCompany ? (
                        <Input label="Company Number" value={form.company_number} onChange={v => setForm({ ...form, company_number: v })} />
                      ) : (
                        <DatePicker label="Date of Birth" value={form.date_of_birth} onChange={v => setForm({ ...form, date_of_birth: v })} />
                      )}
                      <Input label={isCompany ? "Company Email" : "Email"} value={form.email} onChange={v => setForm({ ...form, email: v })} type="email" />
                      <Input label="Alternative Email" value={form.alt_email} onChange={v => setForm({ ...form, alt_email: v })} type="email" />
                      <Input label={isCompany ? "Office Phone" : "Phone"} value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
                      <AddressAutocomplete label={isCompany ? "Registered Address" : "Home Address"} value={form.home_address} onChange={v => setForm({ ...form, home_address: v })} />
                      <Select label="Referral Source" value={form.referral_source} onChange={v => setForm({ ...form, referral_source: v })}
                        options={[{ value: '', label: 'Select...' }, { value: 'Website', label: 'Website' }, { value: 'Word of Mouth', label: 'Word of Mouth' }, { value: 'Social Media', label: 'Social Media' }, { value: 'Rightmove', label: 'Rightmove' }, { value: 'Zoopla', label: 'Zoopla' }, { value: 'Referral', label: 'Referral' }, { value: 'Walk-in', label: 'Walk-in' }, { value: 'Other', label: 'Other' }]} />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ReadField icon={isCompany ? Building2 : UserCircle} label={isCompany ? "Company Name" : "Full Name"} value={landlord.name} />
                    {isCompany ? (
                      <ReadField icon={Building2} label="Company Number" value={landlord.company_number} />
                    ) : (
                      <ReadField icon={Calendar} label="Date of Birth" value={landlord.date_of_birth} />
                    )}
                    <ReadField icon={Mail} label={isCompany ? "Company Email" : "Email"} value={landlord.email} />
                    <ReadField icon={Mail} label="Alternative Email" value={landlord.alt_email} />
                    <ReadField icon={Phone} label={isCompany ? "Office Phone" : "Phone"} value={landlord.phone} />
                    <ReadField icon={MapPin} label={isCompany ? "Registered Address" : "Home Address"} value={landlord.home_address} />
                    <ReadField icon={Megaphone} label="Referral Source" value={landlord.referral_source} />
                  </div>
                );
              })()}
            </GlassCard>

            {/* Properties */}
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <SectionHeader title="Properties" />
                <Button variant="outline" size="sm" onClick={async () => {
                  setPropForm(f => ({ ...f, landlord_id: String(id) }));
                  setPropMode('create');
                  setSelectedPropertyId('');
                  // Load all properties for the dropdown
                  try {
                    const props = await api.get('/api/properties');
                    setAllProperties(props);
                  } catch (e) {
                    console.error('Failed to load properties:', e);
                  }
                  setShowAddProp(true);
                }}>
                  <Plus size={14} className="mr-1.5" /> Add Property
                </Button>
              </div>
              {properties.length === 0 ? (
                <EmptyState message="No properties linked" />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {properties.map(p => (
                    <Card key={p.id} hover onClick={() => navigate(`/properties/${p.id}`)} className="overflow-hidden">
                      <img src={getPropertyImage(p.id, 400, 160)} alt={p.address} className="h-24 w-full object-cover" loading="lazy" />
                      <div className="p-3">
                        <p className="text-sm font-medium truncate">{p.address}</p>
                        {p.type && <p className="text-xs text-[var(--text-muted)]">{p.type}</p>}
                        {p.status && (
                          <span className={`inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-md ${
                            p.status === 'to_let' ? 'bg-emerald-500/10 text-emerald-400' :
                            p.status === 'let_agreed' ? 'bg-blue-500/10 text-blue-400' :
                            p.status === 'full_management' ? 'bg-purple-500/10 text-purple-400' :
                            p.status === 'rent_collection' ? 'bg-amber-500/10 text-amber-400' :
                            'bg-[var(--bg-hover)] text-[var(--text-muted)]'
                          }`}>{p.status === 'to_let' ? 'To Let' : p.status === 'let_agreed' ? 'Let Agreed' : p.status === 'full_management' ? 'Full Mgmt' : p.status === 'rent_collection' ? 'Rent Collection' : p.status}</span>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </GlassCard>

            {/* Directors (Limited Company Only) */}
            {(directors.length > 0 || archivedDirectors.length > 0 || landlord.entity_type === 'company' || landlord.company_number) && (
              <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <SectionHeader title="Company Directors" />
                  <Button variant="outline" size="sm" onClick={() => setShowAddDirector(true)}>
                    <Plus size={14} className="mr-1.5" /> Add Director
                  </Button>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 bg-[var(--bg-input)] rounded-xl p-1 border border-[var(--border-input)] mb-4">
                  <button
                    type="button"
                    onClick={() => setDirectorTab('active')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      directorTab === 'active'
                        ? 'bg-[var(--text-primary)] text-[var(--bg-page)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}>
                    Active ({directors.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirectorTab('archived')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      directorTab === 'archived'
                        ? 'bg-[var(--text-primary)] text-[var(--bg-page)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}>
                    Archived ({archivedDirectors.length})
                  </button>
                </div>

                <div className="space-y-3">
                  {(directorTab === 'active' ? directors : archivedDirectors).map(d => (
                    <div key={d.id} className="p-4 bg-[var(--bg-hover)] rounded-lg">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <UserCircle size={16} className="text-[var(--text-muted)]" />
                            <p className="font-medium">{d.name}</p>
                            {directorTab === 'archived' && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-gray-500/10 text-gray-400">
                                Archived
                              </span>
                            )}
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                              d.kyc_completed === 1
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-amber-500/10 text-amber-400'
                            }`}>
                              {d.kyc_completed === 1 ? 'KYC Verified' : 'KYC Pending'}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-[var(--text-muted)] ml-6">
                            {d.email && (
                              <div className="flex items-center gap-1.5">
                                <Mail size={12} />
                                <span>{d.email}</span>
                              </div>
                            )}
                            {d.phone && (
                              <div className="flex items-center gap-1.5">
                                <Phone size={12} />
                                <span>{d.phone}</span>
                              </div>
                            )}
                            {d.role && (
                              <div className="flex items-center gap-1.5">
                                <Briefcase size={12} />
                                <span>{d.role}</span>
                              </div>
                            )}
                            {d.date_of_birth && (
                              <div className="flex items-center gap-1.5">
                                <Calendar size={12} />
                                <span>{d.date_of_birth}</span>
                              </div>
                            )}
                          </div>
                          {d.notes && (
                            <p className="text-xs text-[var(--text-muted)] mt-2 ml-6">{d.notes}</p>
                          )}
                        </div>
                        {directorTab === 'active' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteDirector(d.id)}
                            className="text-amber-400 hover:text-amber-300"
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                        {directorTab === 'archived' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => reinstateDirector(d.id, d.name)}
                            className="text-green-400 hover:text-green-300"
                          >
                            <RotateCcw size={14} />
                          </Button>
                        )}
                      </div>

                      {/* Admin KYC approval for directors */}
                      {user?.role === 'admin' && d.kyc_completed === 0 && directorTab === 'active' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            if (!confirm(`Approve KYC for ${d.name}? This will mark their identity as verified.`)) return;
                            try {
                              await api.put(`/api/directors/${d.id}`, { ...d, kyc_completed: 1 });
                              await loadDetail();
                            } catch (e) {
                              console.error('Failed to approve director KYC:', e);
                              alert('Failed to approve KYC');
                            }
                          }}
                          className="w-full mt-2"
                        >
                          <ShieldCheck size={14} className="mr-2" />
                          Approve Director KYC (Admin)
                        </Button>
                      )}
                    </div>
                    ))}
                </div>
              </GlassCard>
            )}

            {/* Director Of (Companies where this person is a director) */}
            {directorOf.length > 0 && (
              <GlassCard className="p-6">
                <div className="mb-4">
                  <SectionHeader title="Director Of" />
                  <p className="text-xs text-[var(--text-muted)] mt-1">Companies where {landlord?.name} serves as a director</p>
                </div>
                <div className="space-y-3">
                  {directorOf.map(company => (
                    <div
                      key={company.id}
                      onClick={() => navigate(`/landlords/${company.id}`)}
                      className="flex items-center justify-between p-4 bg-[var(--bg-hover)] rounded-lg cursor-pointer hover:bg-[var(--bg-subtle)] transition-colors group">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-10 h-10 rounded-xl bg-[var(--accent-orange)]/10 flex items-center justify-center shrink-0">
                          <Briefcase size={18} className="text-[var(--accent-orange)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{company.name}</p>
                            {company.role && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400">
                                {company.role}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] mt-1">
                            {company.email && (
                              <div className="flex items-center gap-1">
                                <Mail size={11} />
                                <span>{company.email}</span>
                              </div>
                            )}
                            {company.phone && (
                              <div className="flex items-center gap-1">
                                <Phone size={11} />
                                <span>{company.phone}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}

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
              <div className="space-y-4">
                {/* Company KYC Status */}
                {directors.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          landlord.kyc_completed ? 'bg-emerald-500/20' : 'bg-amber-500/20'
                        }`}>
                          <ShieldCheck size={18} className={landlord.kyc_completed ? 'text-emerald-400' : 'text-amber-400'} />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Company Verification</p>
                          <p className="text-xs text-[var(--text-muted)]">Companies House screenshot required</p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        landlord.kyc_completed
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {landlord.kyc_completed ? 'Verified' : 'Pending'}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] pl-13">
                      Upload Companies House confirmation showing company number and registered address
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        landlord.kyc_completed ? 'bg-emerald-500/20' : 'bg-amber-500/20'
                      }`}>
                        <ShieldCheck size={18} className={landlord.kyc_completed ? 'text-emerald-400' : 'text-amber-400'} />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Identity Verification</p>
                        <p className="text-xs text-[var(--text-muted)]">Individual KYC verification</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      landlord.kyc_completed
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {landlord.kyc_completed ? 'Verified' : 'Pending'}
                    </span>
                  </div>
                )}

                {/* Admin approval button */}
                {user?.role === 'admin' && !landlord.kyc_completed && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (!confirm('Approve KYC for this landlord? This action will mark their identity as verified.')) return;
                      try {
                        await api.put(`/api/landlords/${id}`, { ...landlord, kyc_completed: true });
                        const updated = await api.get(`/api/landlords/${id}`);
                        setLandlord(updated);
                        populateForm(updated);
                      } catch (e) {
                        console.error('Failed to approve KYC:', e);
                        alert('Failed to approve KYC');
                      }
                    }}
                    className="w-full"
                  >
                    <ShieldCheck size={14} className="mr-2" />
                    Approve KYC (Admin)
                  </Button>
                )}
              </div>
            </GlassCard>

            {/* Documents */}
            <DocumentUpload entityType="landlord" entityId={landlord.id} />
          </div>

          {/* Right column — 1/3 */}
          <div className="lg:col-span-1 space-y-6">
            {/* Notes */}
            <GlassCard className="p-6">
              <SectionHeader title="Notes" />

              {/* Filter Tabs */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <button
                  onClick={() => setNotesFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    notesFilter === 'all'
                      ? 'bg-[var(--text-primary)] text-[var(--bg-page)]'
                      : 'bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  All ({notes.length + Object.values(propertyNotes).flat().length})
                </button>
                <button
                  onClick={() => setNotesFilter('landlord')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    notesFilter === 'landlord'
                      ? 'bg-[var(--text-primary)] text-[var(--bg-page)]'
                      : 'bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  Landlord ({notes.length})
                </button>
                {properties.map(prop => (
                  <button
                    key={prop.id}
                    onClick={() => setNotesFilter(prop.id.toString())}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      notesFilter === prop.id.toString()
                        ? 'bg-[var(--text-primary)] text-[var(--bg-page)]'
                        : 'bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    {prop.address.length > 30 ? prop.address.substring(0, 30) + '...' : prop.address} ({propertyNotes[prop.id]?.length || 0})
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {filteredNotes.length === 0 && <p className="text-sm text-[var(--text-muted)]">No notes yet</p>}
                {filteredNotes.map((n: any) => (
                  <div key={n.id + '-' + n.source} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--bg-hover)] flex items-center justify-center shrink-0 mt-0.5">
                      <StickyNote size={14} className="text-[var(--text-muted)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{n.text}</p>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <p className="text-[10px] text-[var(--text-muted)]">
                          {n.author}{n.created_at ? ` · ${new Date(n.created_at).toLocaleDateString()}` : ''}
                        </p>
                        {n.source === 'property' && n.propertyId && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400">
                            {properties.find(p => p.id === n.propertyId)?.address || 'Property'}
                          </span>
                        )}
                        {n.source === 'landlord' && notesFilter === 'all' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400">
                            Landlord
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2 mt-2">
                  <input value={notesInput} onChange={e => setNotesInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addNote()}
                    placeholder={`Add a note to ${notesFilter === 'landlord' ? 'landlord' : notesFilter === 'all' ? 'landlord' : 'property'}...`}
                    className="flex-1 bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-orange)]/40 transition-colors" />
                  <Button variant="gradient" onClick={addNote} disabled={!notesInput.trim()}>Add</Button>
                </div>
              </div>
            </GlassCard>

            {/* Activity Timeline */}
            <GlassCard className="p-6">
              <SectionHeader title="Activity Timeline" />
              <ActivityTimeline entityType="landlord" entityId={landlord.id} />
            </GlassCard>
          </div>
        </div>
        {/* Add Property Modal */}
        {showAddProp && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-[var(--overlay-bg)] backdrop-blur-sm" onClick={() => setShowAddProp(false)}>
            <div className="bg-[var(--bg-card)] border border-[var(--border-input)] rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-lg space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Add Property</h2>
                <button onClick={() => setShowAddProp(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center gap-1 bg-[var(--bg-input)] rounded-xl p-1 border border-[var(--border-input)]">
                <button
                  type="button"
                  onClick={() => setPropMode('create')}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    propMode === 'create'
                      ? 'bg-[var(--text-primary)] text-[var(--bg-page)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}>
                  Create New
                </button>
                <button
                  type="button"
                  onClick={() => setPropMode('link')}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    propMode === 'link'
                      ? 'bg-[var(--text-primary)] text-[var(--bg-page)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}>
                  Link Existing
                </button>
              </div>

              {/* Landlord locked */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Landlord</label>
                <div className="bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] opacity-70">
                  {landlord?.name}
                </div>
              </div>

              {propMode === 'link' ? (
                /* Link Existing Property */
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Select Property *</label>
                  <Select
                    value={selectedPropertyId}
                    onChange={(v: string) => setSelectedPropertyId(v)}
                    options={[
                      { value: '', label: 'Select a property...' },
                      ...allProperties
                        .filter(p => !properties.some(lp => lp.id === p.id)) // Exclude already linked properties
                        .map(p => ({ value: String(p.id), label: p.address || 'Unknown Address' }))
                    ]}
                  />
                  {selectedPropertyId && (
                    <p className="text-xs text-[var(--text-muted)] mt-2">
                      This will link the selected property to {landlord?.name}
                    </p>
                  )}
                </div>
              ) : (
                /* Create New Property Form */
                <div className="space-y-4">
                  <AddressAutocomplete label="Address *" value={propForm.address} onChange={(v: string) => setPropForm(f => ({ ...f, address: v }))}
                    onSelect={p => { if (p.postcode) setPropForm(f => ({ ...f, postcode: p.postcode || f.postcode })); }}
                    placeholder="Property address" />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Postcode" value={propForm.postcode} onChange={(v: string) => setPropForm(f => ({ ...f, postcode: v }))} placeholder="e.g. SW1A 1AA" />
                    <Input label="Rent (£/month)" value={propForm.rent_amount} onChange={(v: string) => setPropForm(f => ({ ...f, rent_amount: v }))} placeholder="0" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Select label="Type" value={propForm.property_type} onChange={(v: string) => setPropForm(f => ({ ...f, property_type: v }))}
                      options={[{ value: 'house', label: 'House' }, { value: 'flat', label: 'Flat' }, { value: 'bungalow', label: 'Bungalow' }, { value: 'studio', label: 'Studio' }, { value: 'hmo', label: 'HMO' }]} />
                    <Input label="Bedrooms" value={propForm.bedrooms} onChange={(v: string) => setPropForm(f => ({ ...f, bedrooms: v }))} placeholder="1" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Select label="Status" value={propForm.status} onChange={(v: string) => setPropForm(f => ({ ...f, status: v }))}
                      options={[{ value: 'to_let', label: 'To Let' }, { value: 'let_agreed', label: 'Let Agreed' }, { value: 'full_management', label: 'Full Management' }, { value: 'rent_collection', label: 'Rent Collection' }]} />
                    <Select label="Service Type" value={propForm.service_type} onChange={(v: string) => setPropForm(f => ({ ...f, service_type: v }))}
                      options={[{ value: '', label: 'Select...' }, { value: 'full_management', label: 'Full Management' }, { value: 'rent_collection', label: 'Rent Collection' }, { value: 'let_only', label: 'Let Only' }]} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Select label="Council Tax Band" value={propForm.council_tax_band} onChange={(v: string) => setPropForm(f => ({ ...f, council_tax_band: v }))}
                      options={[{ value: '', label: 'Select...' }, ...['A','B','C','D','E','F','G','H'].map(b => ({ value: b, label: `Band ${b}` }))]} />
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Gas Supply</label>
                      <button type="button" onClick={() => setPropForm(f => ({ ...f, has_gas: !f.has_gas }))}
                        className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-colors w-full ${
                          propForm.has_gas
                            ? 'bg-[var(--accent-orange)]/10 border-[var(--accent-orange)]/30 text-[var(--accent-orange)]'
                            : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                        }`}>
                        <div className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                          propForm.has_gas ? 'bg-[var(--accent-orange)] border-[var(--accent-orange)]' : 'border-[var(--border-input)]'
                        }`}>
                          {propForm.has_gas && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5L4.5 7.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <span className="text-sm">Has Gas</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="ghost" onClick={() => setShowAddProp(false)}>Cancel</Button>
                {propMode === 'link' ? (
                  <Button variant="gradient" disabled={propSaving || !selectedPropertyId} onClick={async () => {
                    setPropSaving(true);
                    try {
                      // Link existing property to landlord via property_landlords junction table
                      await api.post('/api/property-landlords', {
                        property_id: Number(selectedPropertyId),
                        landlord_id: Number(id),
                        is_primary: 1,
                        ownership_entity_type: 'individual'
                      });
                      setShowAddProp(false);
                      await loadDetail();
                    } catch (e) {
                      console.error(e);
                      alert('Failed to link property');
                    }
                    setPropSaving(false);
                  }}>
                    {propSaving ? 'Linking...' : 'Link Property'}
                  </Button>
                ) : (
                  <Button variant="gradient" disabled={propSaving || !propForm.address} onClick={async () => {
                    setPropSaving(true);
                    try {
                      const res = await api.post('/api/properties', {
                        ...propForm,
                        landlord_id: Number(id),
                        bedrooms: Number(propForm.bedrooms),
                        rent_amount: Number(propForm.rent_amount) || 0,
                        has_gas: propForm.has_gas,
                      });
                      setShowAddProp(false);
                      navigate(`/properties/${res.id}`);
                    } catch (e) { console.error(e); }
                    setPropSaving(false);
                  }}>
                    {propSaving ? 'Creating...' : 'Create Property'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Add Director Modal */}
        {showAddDirector && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddDirector(false)}>
            <div className="bg-[var(--bg-elevated)] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)] px-6 py-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Add Director / Contact Person</h2>
                <button onClick={() => setShowAddDirector(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <Input
                  label="Full Name *"
                  value={directorForm.name}
                  onChange={(v: string) => setDirectorForm({ ...directorForm, name: v })}
                  placeholder="John Smith"
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Email"
                    type="email"
                    value={directorForm.email}
                    onChange={(v: string) => setDirectorForm({ ...directorForm, email: v })}
                    placeholder="john@example.com"
                  />
                  <Input
                    label="Phone"
                    value={directorForm.phone}
                    onChange={(v: string) => setDirectorForm({ ...directorForm, phone: v })}
                    placeholder="07123 456789"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Date of Birth"
                    type="date"
                    value={directorForm.date_of_birth}
                    onChange={(v: string) => setDirectorForm({ ...directorForm, date_of_birth: v })}
                  />
                  <Input
                    label="Role/Position"
                    value={directorForm.role}
                    onChange={(v: string) => setDirectorForm({ ...directorForm, role: v })}
                    placeholder="Director, Shareholder, etc."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">KYC Completed</label>
                  <button
                    type="button"
                    onClick={() => setDirectorForm({ ...directorForm, kyc_completed: !directorForm.kyc_completed })}
                    className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-colors ${
                      directorForm.kyc_completed
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                      directorForm.kyc_completed ? 'bg-emerald-500 border-emerald-500' : 'border-[var(--border-input)]'
                    }`}>
                      {directorForm.kyc_completed && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5L4.5 7.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <span className="text-sm">KYC Complete</span>
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Notes</label>
                  <textarea
                    value={directorForm.notes}
                    onChange={(e) => setDirectorForm({ ...directorForm, notes: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-[var(--border-input)] bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-orange)]/50 resize-none"
                    rows={3}
                    placeholder="Additional information..."
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setShowAddDirector(false)}>Cancel</Button>
                  <Button
                    variant="gradient"
                    disabled={directorSaving || !directorForm.name.trim()}
                    onClick={addDirector}
                  >
                    {directorSaving ? 'Adding...' : 'Add Director'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
