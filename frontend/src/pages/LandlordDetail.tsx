import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { ArrowLeft, Mail, Phone, MapPin, Edit2, Save, X, Plus, CheckCircle, XCircle, ChevronRight } from 'lucide-react';
import DocumentsSection from '../components/DocumentsSection';

interface Landlord {
  id: number; name: string; email: string; phone: string; alt_email: string; date_of_birth: string;
  address: string; marketing_post: number; marketing_email: number; marketing_phone: number;
  marketing_sms: number; kyc_completed: number; notes: string; property_count: number;
}

export default function LandlordDetail() {
  const { id } = useParams();
  const api = useApi();
  const [landlord, setLandlord] = useState<Landlord | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [activeTab, setActiveTab] = useState('contact');

  useEffect(() => { loadData(); }, [id]);

  const loadData = async () => {
    try {
      const data = await api.get(`/api/landlords/${id}`);
      setLandlord(data);
      setEditForm({
        name: data.name||'', email: data.email||'', phone: data.phone||'', alt_email: data.alt_email||'',
        date_of_birth: data.date_of_birth||'', address: data.address||'',
        marketing_post: data.marketing_post||0, marketing_email: data.marketing_email||0,
        marketing_phone: data.marketing_phone||0, marketing_sms: data.marketing_sms||0,
        kyc_completed: data.kyc_completed||0, notes: data.notes||''
      });
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    try { await api.put(`/api/landlords/${id}`, editForm); setEditing(false); loadData(); }
    catch (err: any) { alert(err.message); }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    const timestamp = new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const updatedNotes = landlord?.notes ? `${landlord.notes}\n\n[${timestamp}]\n${newNote}` : `[${timestamp}]\n${newNote}`;
    try {
      await api.put(`/api/landlords/${id}`, { ...editForm, notes: updatedNotes });
      setShowNoteModal(false); setNewNote(''); loadData();
    } catch (err: any) { alert(err.message); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" /></div>;
  if (!landlord) return <div className="text-center py-12 text-gray-500">Landlord not found</div>;

  const initials = landlord.name.charAt(0).toUpperCase();
  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200";
  const tabs = [{ id: 'contact', label: 'Contact Details' }, { id: 'kyc', label: 'KYC & Marketing' }];

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link to="/landlords" className="flex items-center gap-1 hover:text-gray-900"><ArrowLeft className="w-4 h-4" /> Landlords</Link>
          <ChevronRight className="w-3 h-3" /><span className="text-gray-900">{landlord.name}</span>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
            <span className="text-sm font-semibold text-gray-600">{initials}</span>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">{landlord.name}</h1>
              {landlord.kyc_completed ? (
                <span className="text-xs font-medium px-2.5 py-1 rounded-full border border-emerald-300 text-emerald-700 bg-white">KYC ✓</span>
              ) : (
                <span className="text-xs font-medium px-2.5 py-1 rounded-full border border-red-300 text-red-600 bg-white">KYC Pending</span>
              )}
            </div>
            <p className="text-sm text-gray-500">Landlord • {landlord.property_count} properties</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editing ? (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
              <Edit2 className="w-4 h-4" /> Edit
            </button>
          ) : (
            <>
              <button onClick={() => setEditing(false)} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"><X className="w-4 h-4" /> Cancel</button>
              <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800"><Save className="w-4 h-4" /> Save</button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-gray-200 mb-6">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {activeTab === 'contact' && (
            <div className="border border-gray-200 rounded-lg p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Contact Details</h2>
              {editing ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs text-gray-500 mb-1">Name *</label><input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className={inputCls} /></div>
                    <div><label className="block text-xs text-gray-500 mb-1">Date of Birth</label><input type="date" value={editForm.date_of_birth} onChange={e => setEditForm({...editForm, date_of_birth: e.target.value})} className={inputCls} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs text-gray-500 mb-1">Email</label><input type="email" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} className={inputCls} /></div>
                    <div><label className="block text-xs text-gray-500 mb-1">Alt Email</label><input type="email" value={editForm.alt_email} onChange={e => setEditForm({...editForm, alt_email: e.target.value})} className={inputCls} /></div>
                  </div>
                  <div><label className="block text-xs text-gray-500 mb-1">Phone</label><input type="tel" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} className={inputCls} /></div>
                  <div><label className="block text-xs text-gray-500 mb-1">Address</label><input type="text" value={editForm.address} onChange={e => setEditForm({...editForm, address: e.target.value})} className={inputCls} /></div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {landlord.email && <div className="flex items-center gap-3 text-sm text-gray-600"><Mail className="w-4 h-4 text-gray-400" />{landlord.email}</div>}
                  {landlord.alt_email && <div className="flex items-center gap-3 text-sm text-gray-600"><Mail className="w-4 h-4 text-gray-400" />{landlord.alt_email} (alt)</div>}
                  {landlord.phone && <div className="flex items-center gap-3 text-sm text-gray-600"><Phone className="w-4 h-4 text-gray-400" />{landlord.phone}</div>}
                  {landlord.address && <div className="flex items-center gap-3 text-sm text-gray-600"><MapPin className="w-4 h-4 text-gray-400" />{landlord.address}</div>}
                  {landlord.date_of_birth && <div className="text-xs text-gray-400">DOB: {new Date(landlord.date_of_birth).toLocaleDateString('en-GB')}</div>}
                  {!landlord.email && !landlord.phone && !landlord.address && <p className="text-sm text-gray-400">No contact details added</p>}
                </div>
              )}
            </div>
          )}

          {activeTab === 'kyc' && (
            <div className="border border-gray-200 rounded-lg p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">KYC & Marketing Preferences</h2>
              {editing ? (
                <div className="space-y-4">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={editForm.kyc_completed===1} onChange={e => setEditForm({...editForm, kyc_completed: e.target.checked?1:0})} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" /><span className="text-sm font-medium">KYC Completed</span></label>
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Marketing Preferences</p>
                    <div className="grid grid-cols-2 gap-3">
                      {['post', 'email', 'phone', 'sms'].map(ch => (
                        <label key={ch} className="flex items-center gap-2">
                          <input type="checkbox" checked={editForm[`marketing_${ch}`]===1} onChange={e => setEditForm({...editForm, [`marketing_${ch}`]: e.target.checked?1:0})} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" />
                          <span className="text-sm capitalize">{ch}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    {landlord.kyc_completed ? (
                      <span className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle className="w-4 h-4" /> KYC Completed</span>
                    ) : (
                      <span className="flex items-center gap-2 text-sm text-red-600"><XCircle className="w-4 h-4" /> KYC Pending</span>
                    )}
                  </div>
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Marketing Preferences</p>
                    <div className="flex flex-wrap gap-2">
                      {landlord.marketing_post ? <span className="text-xs px-2 py-1 rounded-full border border-gray-200 text-gray-600">Post</span> : null}
                      {landlord.marketing_email ? <span className="text-xs px-2 py-1 rounded-full border border-gray-200 text-gray-600">Email</span> : null}
                      {landlord.marketing_phone ? <span className="text-xs px-2 py-1 rounded-full border border-gray-200 text-gray-600">Phone</span> : null}
                      {landlord.marketing_sms ? <span className="text-xs px-2 py-1 rounded-full border border-gray-200 text-gray-600">SMS</span> : null}
                      {!landlord.marketing_post && !landlord.marketing_email && !landlord.marketing_phone && !landlord.marketing_sms && (
                        <span className="text-sm text-gray-400">No marketing consent</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <div className="border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Notes</h2>
              <button onClick={() => setShowNoteModal(true)} className="text-xs text-gray-500 hover:text-gray-900 font-medium">+ Add</button>
            </div>
            {editing ? (
              <textarea value={editForm.notes} onChange={e => setEditForm({...editForm, notes: e.target.value})} rows={6}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
            ) : landlord.notes ? (
              <div className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto">{landlord.notes}</div>
            ) : (
              <p className="text-sm text-gray-400">No notes yet</p>
            )}
          </div>
          <DocumentsSection entityType="landlord" entityId={parseInt(id!)} />
        </div>
      </div>

      {showNoteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowNoteModal(false)}>
          <div className="bg-white rounded-lg w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Add Note</h2>
              <button onClick={() => setShowNoteModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5">
              <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Enter your note..." rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 mb-4" autoFocus />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowNoteModal(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                <button onClick={addNote} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">Add Note</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
