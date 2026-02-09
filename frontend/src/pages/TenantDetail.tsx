import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { ArrowLeft, Mail, Phone, AlertCircle, Home, Edit2, Save, X, Plus } from 'lucide-react';
import { DocumentsSection } from '../components/DocumentsSection';

interface Tenant {
  id: number;
  name: string;
  email: string;
  phone: string;
  emergency_contact: string;
  notes: string;
  current_property: string | null;
}

interface Tenancy {
  id: number;
  address: string;
  postcode: string;
  rent_amount: number;
  start_date: string;
  end_date: string | null;
  status: string;
}

export default function TenantDetail() {
  const { id } = useParams();
  const api = useApi();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenancies, setTenancies] = useState<Tenancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', emergency_contact: '', notes: '' });
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [newNote, setNewNote] = useState('');

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [tenantData, allTenancies] = await Promise.all([
        api.get(`/api/tenants/${id}`),
        api.get('/api/tenancies')
      ]);
      setTenant(tenantData);
      setTenancies(allTenancies.filter((t: any) => t.tenant_id === parseInt(id!)));
      setEditForm({
        name: tenantData.name,
        email: tenantData.email || '',
        phone: tenantData.phone || '',
        emergency_contact: tenantData.emergency_contact || '',
        notes: tenantData.notes || ''
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await api.put(`/api/tenants/${id}`, editForm);
      setEditing(false);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    const timestamp = new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const updatedNotes = tenant?.notes 
      ? `${tenant.notes}\n\n[${timestamp}]\n${newNote}`
      : `[${timestamp}]\n${newNote}`;
    
    try {
      await api.put(`/api/tenants/${id}`, { ...editForm, notes: updatedNotes });
      setShowNoteModal(false);
      setNewNote('');
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-navy-200 border-t-navy-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (!tenant) {
    return <div className="text-center py-12 text-gray-500">Tenant not found</div>;
  }

  const activeTenancy = tenancies.find(t => t.status === 'active');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/tenants" className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-navy-900">{tenant.name}</h1>
          <p className="text-gray-500">Tenant {activeTenancy ? `• ${activeTenancy.address}` : ''}</p>
        </div>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl">
              <X className="w-4 h-4" /> Cancel
            </button>
            <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-navy-900 text-white rounded-xl hover:bg-navy-800">
              <Save className="w-4 h-4" /> Save
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact Details */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold text-navy-900 mb-4">Contact Details</h2>
            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input type="tel" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact</label>
                  <input type="text" value={editForm.emergency_contact} onChange={e => setEditForm({ ...editForm, emergency_contact: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500" />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {tenant.email && (
                  <div className="flex items-center gap-3 text-gray-600">
                    <Mail className="w-5 h-5 text-gray-400" />
                    <a href={`mailto:${tenant.email}`} className="hover:text-gold-600">{tenant.email}</a>
                  </div>
                )}
                {tenant.phone && (
                  <div className="flex items-center gap-3 text-gray-600">
                    <Phone className="w-5 h-5 text-gray-400" />
                    <a href={`tel:${tenant.phone}`} className="hover:text-gold-600">{tenant.phone}</a>
                  </div>
                )}
                {tenant.emergency_contact && (
                  <div className="flex items-center gap-3 text-gray-600">
                    <AlertCircle className="w-5 h-5 text-red-400" />
                    <span>Emergency: {tenant.emergency_contact}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tenancy History */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold text-navy-900 mb-4">Tenancy History</h2>
            {tenancies.length === 0 ? (
              <p className="text-gray-400 text-sm">No tenancy records</p>
            ) : (
              <div className="space-y-3">
                {tenancies.map(tenancy => (
                  <div key={tenancy.id} className={`p-4 rounded-xl ${tenancy.status === 'active' ? 'bg-green-50 border border-green-100' : 'bg-gray-50'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Home className={`w-5 h-5 ${tenancy.status === 'active' ? 'text-green-600' : 'text-gray-400'}`} />
                        <div>
                          <p className="font-medium text-navy-900">{tenancy.address}</p>
                          <p className="text-sm text-gray-500">{tenancy.postcode} • £{tenancy.rent_amount}/mo</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${tenancy.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                          {tenancy.status}
                        </span>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(tenancy.start_date).toLocaleDateString('en-GB')} - {tenancy.end_date ? new Date(tenancy.end_date).toLocaleDateString('en-GB') : 'Present'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - Notes & Documents */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-navy-900">Notes</h2>
              <button onClick={() => setShowNoteModal(true)} className="flex items-center gap-1 text-sm text-gold-600 hover:text-gold-700 font-medium">
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
            {tenant.notes ? (
              <div className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-xl p-4 max-h-64 overflow-y-auto">
                {tenant.notes}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">No notes yet</p>
            )}
          </div>

          {/* KYC Documents */}
          <DocumentsSection entityType="tenant" entityId={parseInt(id!)} />
        </div>
      </div>

      {/* Add Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-navy-900">Add Note</h2>
              <button onClick={() => setShowNoteModal(false)} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-5 h-5" /></button>
            </div>
            <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Enter your note..." rows={4}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500 mb-4" autoFocus />
            <div className="flex gap-3">
              <button onClick={() => setShowNoteModal(false)} className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50">Cancel</button>
              <button onClick={addNote} className="flex-1 py-2.5 bg-navy-900 text-white font-medium rounded-xl hover:bg-navy-800">Add Note</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
