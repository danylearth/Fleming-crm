import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { ArrowLeft, Mail, Phone, MapPin, Building2, Edit2, Save, X, Plus, CheckCircle, XCircle } from 'lucide-react';
import DocumentsSection from '../components/DocumentsSection';

interface Landlord {
  id: number;
  name: string;
  email: string;
  phone: string;
  alt_email: string;
  date_of_birth: string;
  home_address: string;
  marketing_post: number;
  marketing_email: number;
  marketing_phone: number;
  marketing_sms: number;
  kyc_completed: number;
  notes: string;
  property_count: number;
}

interface Property {
  id: number;
  landlord_id: number;
  address: string;
  postcode: string;
  rent_amount: number;
  status: string;
  current_tenant: string | null;
}

export default function LandlordDetail() {
  const { id } = useParams();
  const api = useApi();
  const [landlord, setLandlord] = useState<Landlord | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [newNote, setNewNote] = useState('');

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [landlordData, allProperties] = await Promise.all([
        api.get(`/api/landlords/${id}`),
        api.get('/api/properties')
      ]);
      setLandlord(landlordData);
      setProperties(allProperties.filter((p: Property) => p.landlord_id === parseInt(id!)));
      setEditForm({
        name: landlordData.name || '',
        email: landlordData.email || '',
        phone: landlordData.phone || '',
        alt_email: landlordData.alt_email || '',
        date_of_birth: landlordData.date_of_birth || '',
        home_address: landlordData.home_address || '',
        marketing_post: landlordData.marketing_post || 0,
        marketing_email: landlordData.marketing_email || 0,
        marketing_phone: landlordData.marketing_phone || 0,
        marketing_sms: landlordData.marketing_sms || 0,
        kyc_completed: landlordData.kyc_completed || 0,
        notes: landlordData.notes || ''
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await api.put(`/api/landlords/${id}`, editForm);
      setEditing(false);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    const timestamp = new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const updatedNotes = landlord?.notes 
      ? `${landlord.notes}\n\n[${timestamp}]\n${newNote}`
      : `[${timestamp}]\n${newNote}`;
    
    try {
      await api.put(`/api/landlords/${id}`, { ...editForm, notes: updatedNotes });
      setShowNoteModal(false);
      setNewNote('');
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const statusColors: Record<string, string> = {
    available: 'bg-green-50 text-green-700',
    let: 'bg-blue-50 text-blue-700',
    maintenance: 'bg-amber-50 text-amber-700'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-navy-200 border-t-navy-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (!landlord) {
    return <div className="text-center py-12 text-gray-500">Landlord not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/landlords" className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-navy-900">{landlord.name}</h1>
            {landlord.kyc_completed ? (
              <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                <CheckCircle className="w-3 h-3" /> KYC
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
                <XCircle className="w-3 h-3" /> KYC Pending
              </span>
            )}
          </div>
          <p className="text-gray-500">Landlord • {properties.length} properties</p>
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
            <button
              onClick={() => setEditing(false)}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-navy-900 text-white rounded-xl hover:bg-navy-800"
            >
              <Save className="w-4 h-4" />
              Save
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={editForm.date_of_birth}
                      onChange={e => setEditForm({ ...editForm, date_of_birth: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Alternative Email</label>
                    <input
                      type="email"
                      value={editForm.alt_email}
                      onChange={e => setEditForm({ ...editForm, alt_email: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Home Address</label>
                  <input
                    type="text"
                    value={editForm.home_address}
                    onChange={e => setEditForm({ ...editForm, home_address: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {landlord.email && (
                  <div className="flex items-center gap-3 text-gray-600">
                    <Mail className="w-5 h-5 text-gray-400" />
                    <a href={`mailto:${landlord.email}`} className="hover:text-gold-600">{landlord.email}</a>
                  </div>
                )}
                {landlord.alt_email && (
                  <div className="flex items-center gap-3 text-gray-600">
                    <Mail className="w-5 h-5 text-gray-400" />
                    <a href={`mailto:${landlord.alt_email}`} className="hover:text-gold-600">{landlord.alt_email} (alt)</a>
                  </div>
                )}
                {landlord.phone && (
                  <div className="flex items-center gap-3 text-gray-600">
                    <Phone className="w-5 h-5 text-gray-400" />
                    <a href={`tel:${landlord.phone}`} className="hover:text-gold-600">{landlord.phone}</a>
                  </div>
                )}
                {landlord.home_address && (
                  <div className="flex items-center gap-3 text-gray-600">
                    <MapPin className="w-5 h-5 text-gray-400" />
                    <span>{landlord.home_address}</span>
                  </div>
                )}
                {landlord.date_of_birth && (
                  <div className="text-sm text-gray-500">
                    DOB: {new Date(landlord.date_of_birth).toLocaleDateString('en-GB')}
                  </div>
                )}
                {!landlord.email && !landlord.phone && !landlord.home_address && (
                  <p className="text-gray-400 text-sm">No contact details added</p>
                )}
              </div>
            )}
          </div>

          {/* KYC & Marketing */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold text-navy-900 mb-4">KYC & Marketing Preferences</h2>
            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editForm.kyc_completed === 1}
                      onChange={e => setEditForm({ ...editForm, kyc_completed: e.target.checked ? 1 : 0 })}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <span className="font-medium">KYC Completed</span>
                  </label>
                </div>
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-3">Marketing Preferences</p>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editForm.marketing_post === 1}
                        onChange={e => setEditForm({ ...editForm, marketing_post: e.target.checked ? 1 : 0 })}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <span>Post</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editForm.marketing_email === 1}
                        onChange={e => setEditForm({ ...editForm, marketing_email: e.target.checked ? 1 : 0 })}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <span>Email</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editForm.marketing_phone === 1}
                        onChange={e => setEditForm({ ...editForm, marketing_phone: e.target.checked ? 1 : 0 })}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <span>Phone</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editForm.marketing_sms === 1}
                        onChange={e => setEditForm({ ...editForm, marketing_sms: e.target.checked ? 1 : 0 })}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <span>SMS</span>
                    </label>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  {landlord.kyc_completed ? (
                    <span className="flex items-center gap-2 text-green-700">
                      <CheckCircle className="w-5 h-5" /> KYC Completed
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 text-red-600">
                      <XCircle className="w-5 h-5" /> KYC Pending
                    </span>
                  )}
                </div>
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Marketing Preferences</p>
                  <div className="flex flex-wrap gap-2">
                    {landlord.marketing_post ? <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">Post</span> : null}
                    {landlord.marketing_email ? <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">Email</span> : null}
                    {landlord.marketing_phone ? <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">Phone</span> : null}
                    {landlord.marketing_sms ? <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">SMS</span> : null}
                    {!landlord.marketing_post && !landlord.marketing_email && !landlord.marketing_phone && !landlord.marketing_sms && (
                      <span className="text-gray-400 text-sm">No marketing consent</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Properties */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-navy-900">Properties</h2>
              <Link to="/properties" className="text-sm text-gold-600 hover:text-gold-700 font-medium">
                Add property →
              </Link>
            </div>
            {properties.length === 0 ? (
              <p className="text-gray-400 text-sm">No properties linked to this landlord</p>
            ) : (
              <div className="space-y-3">
                {properties.map(property => (
                  <Link
                    key={property.id}
                    to={`/properties/${property.id}`}
                    className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-navy-900">{property.address}</p>
                      <p className="text-sm text-gray-500">{property.postcode} • £{property.rent_amount}/mo</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[property.status]}`}>
                      {property.status}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold text-navy-900 mb-4">Summary</h2>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-500">Total Properties</span>
                <span className="font-semibold text-navy-900">{properties.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Currently Let</span>
                <span className="font-semibold text-navy-900">{properties.filter(p => p.status === 'let').length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Available</span>
                <span className="font-semibold text-navy-900">{properties.filter(p => p.status === 'available').length}</span>
              </div>
              <div className="flex justify-between border-t pt-4">
                <span className="text-gray-500">Monthly Rent</span>
                <span className="font-semibold text-green-600">
                  £{properties.filter(p => p.status === 'let').reduce((sum, p) => sum + p.rent_amount, 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-navy-900">Notes</h2>
              <button
                onClick={() => setShowNoteModal(true)}
                className="flex items-center gap-1 text-sm text-gold-600 hover:text-gold-700 font-medium"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
            {editing ? (
              <textarea
                value={editForm.notes}
                onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                rows={6}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500 text-sm"
              />
            ) : landlord.notes ? (
              <div className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-xl p-4 max-h-64 overflow-y-auto">
                {landlord.notes}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">No notes yet</p>
            )}
          </div>

          {/* KYC Documents */}
          <DocumentsSection entityType="landlord" entityId={parseInt(id!)} />
        </div>
      </div>

      {/* Add Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-navy-900">Add Note</h2>
              <button onClick={() => setShowNoteModal(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>
            <textarea
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              placeholder="Enter your note..."
              rows={4}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500 mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowNoteModal(false)}
                className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={addNote}
                className="flex-1 py-2.5 bg-navy-900 text-white font-medium rounded-xl hover:bg-navy-800"
              >
                Add Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
