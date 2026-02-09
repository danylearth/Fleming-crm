import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { ArrowLeft, MapPin, Bed, PoundSterling, User, UserCheck, Wrench, Edit2, Save, X, Plus, Phone, Mail } from 'lucide-react';
import { DocumentsSection } from '../components/DocumentsSection';

interface Property {
  id: number;
  landlord_id: number;
  landlord_name: string;
  landlord_phone: string;
  landlord_email: string;
  address: string;
  postcode: string;
  property_type: string;
  bedrooms: number;
  rent_amount: number;
  status: string;
  notes: string;
  current_tenant: string | null;
  current_tenancy_id: number | null;
}

interface MaintenanceRequest {
  id: number;
  title: string;
  priority: string;
  status: string;
  created_at: string;
}

export default function PropertyDetail() {
  const { id } = useParams();
  const api = useApi();
  const [property, setProperty] = useState<Property | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ address: '', postcode: '', property_type: '', bedrooms: 0, rent_amount: 0, status: '', notes: '' });
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [newNote, setNewNote] = useState('');

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [propertyData, allMaintenance] = await Promise.all([
        api.get(`/api/properties/${id}`),
        api.get('/api/maintenance')
      ]);
      setProperty(propertyData);
      setMaintenance(allMaintenance.filter((m: any) => m.property_id === parseInt(id!)));
      setEditForm({
        address: propertyData.address,
        postcode: propertyData.postcode,
        property_type: propertyData.property_type,
        bedrooms: propertyData.bedrooms,
        rent_amount: propertyData.rent_amount,
        status: propertyData.status,
        notes: propertyData.notes || ''
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await api.put(`/api/properties/${id}`, { ...editForm, landlord_id: property?.landlord_id });
      setEditing(false);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    const timestamp = new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const updatedNotes = property?.notes 
      ? `${property.notes}\n\n[${timestamp}]\n${newNote}`
      : `[${timestamp}]\n${newNote}`;
    
    try {
      await api.put(`/api/properties/${id}`, { ...editForm, landlord_id: property?.landlord_id, notes: updatedNotes });
      setShowNoteModal(false);
      setNewNote('');
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const statusColors: Record<string, string> = {
    available: 'bg-green-50 text-green-700 border-green-200',
    let: 'bg-blue-50 text-blue-700 border-blue-200',
    maintenance: 'bg-amber-50 text-amber-700 border-amber-200'
  };

  const priorityColors: Record<string, string> = {
    low: 'bg-gray-100 text-gray-600',
    medium: 'bg-blue-100 text-blue-700',
    high: 'bg-orange-100 text-orange-700',
    urgent: 'bg-red-100 text-red-700'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-navy-200 border-t-navy-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (!property) {
    return <div className="text-center py-12 text-gray-500">Property not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/properties" className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-navy-900">{property.address}</h1>
          <p className="text-gray-500">{property.postcode}</p>
        </div>
        <span className={`px-3 py-1.5 rounded-full text-sm font-medium border ${statusColors[property.status]}`}>
          {property.status}
        </span>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl">
            <Edit2 className="w-4 h-4" /> Edit
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
          {/* Property Details */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold text-navy-900 mb-4">Property Details</h2>
            {editing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <input type="text" value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Postcode</label>
                    <input type="text" value={editForm.postcode} onChange={e => setEditForm({ ...editForm, postcode: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <select value={editForm.property_type} onChange={e => setEditForm({ ...editForm, property_type: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500">
                      <option value="house">House</option>
                      <option value="flat">Flat</option>
                      <option value="bungalow">Bungalow</option>
                      <option value="studio">Studio</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bedrooms</label>
                    <input type="number" value={editForm.bedrooms} onChange={e => setEditForm({ ...editForm, bedrooms: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rent (£/mo)</label>
                    <input type="number" value={editForm.rent_amount} onChange={e => setEditForm({ ...editForm, rent_amount: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500">
                    <option value="available">Available</option>
                    <option value="let">Let</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Type</p>
                  <p className="font-semibold text-navy-900 capitalize">{property.property_type}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Bedrooms</p>
                  <p className="font-semibold text-navy-900 flex items-center gap-1"><Bed className="w-4 h-4" /> {property.bedrooms}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Rent</p>
                  <p className="font-semibold text-navy-900 flex items-center gap-1"><PoundSterling className="w-4 h-4" /> {property.rent_amount}/mo</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Postcode</p>
                  <p className="font-semibold text-navy-900 flex items-center gap-1"><MapPin className="w-4 h-4" /> {property.postcode}</p>
                </div>
              </div>
            )}
          </div>

          {/* Landlord */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold text-navy-900 mb-4">Landlord</h2>
            <Link to={`/landlords/${property.landlord_id}`} className="flex items-center gap-4 p-4 bg-purple-50 rounded-xl hover:bg-purple-100 transition-colors">
              <div className="w-12 h-12 bg-purple-200 rounded-full flex items-center justify-center">
                <UserCheck className="w-6 h-6 text-purple-700" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-navy-900">{property.landlord_name}</p>
                <div className="flex gap-4 text-sm text-gray-500">
                  {property.landlord_phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {property.landlord_phone}</span>}
                  {property.landlord_email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {property.landlord_email}</span>}
                </div>
              </div>
            </Link>
          </div>

          {/* Current Tenant */}
          {property.current_tenant && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="font-semibold text-navy-900 mb-4">Current Tenant</h2>
              <div className="flex items-center gap-4 p-4 bg-green-50 rounded-xl">
                <div className="w-12 h-12 bg-green-200 rounded-full flex items-center justify-center">
                  <User className="w-6 h-6 text-green-700" />
                </div>
                <div>
                  <p className="font-semibold text-navy-900">{property.current_tenant}</p>
                  <p className="text-sm text-gray-500">Active tenancy</p>
                </div>
              </div>
            </div>
          )}

          {/* Maintenance History */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-navy-900">Maintenance History</h2>
              <Link to="/maintenance" className="text-sm text-gold-600 hover:text-gold-700 font-medium">View all →</Link>
            </div>
            {maintenance.length === 0 ? (
              <p className="text-gray-400 text-sm">No maintenance requests</p>
            ) : (
              <div className="space-y-2">
                {maintenance.slice(0, 5).map(m => (
                  <div key={m.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Wrench className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-navy-900">{m.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColors[m.priority]}`}>{m.priority}</span>
                      <span className="text-xs text-gray-400">{m.status}</span>
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
            {property.notes ? (
              <div className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-xl p-4 max-h-64 overflow-y-auto">
                {property.notes}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">No notes yet</p>
            )}
          </div>

          {/* Documents & Certificates */}
          <DocumentsSection entityType="property" entityId={parseInt(id!)} title="Documents & Certificates" />
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
