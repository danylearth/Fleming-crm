import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { ArrowLeft, MapPin, Bed, PoundSterling, User, UserCheck, Wrench, Edit2, Save, X, Plus, Phone, Mail, AlertTriangle, CheckCircle, Calendar, Flame, Zap, FileText } from 'lucide-react';
import DocumentsSection from '../components/DocumentsSection';

interface Landlord {
  id: number;
  name: string;
}

export default function PropertyDetail() {
  const { id } = useParams();
  const api = useApi();
  const [property, setProperty] = useState<any>(null);
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [maintenance, setMaintenance] = useState<any[]>([]);
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
      const [propertyData, allMaintenance, allLandlords] = await Promise.all([
        api.get(`/api/properties/${id}`),
        api.get('/api/maintenance'),
        api.get('/api/landlords')
      ]);
      setProperty(propertyData);
      setLandlords(allLandlords);
      setMaintenance(allMaintenance.filter((m: any) => m.property_id === parseInt(id!)));
      setEditForm({ ...propertyData });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await api.put(`/api/properties/${id}`, editForm);
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
      await api.put(`/api/properties/${id}`, { ...editForm, notes: updatedNotes });
      setShowNoteModal(false);
      setNewNote('');
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Check if date is within alert window
  const isExpiringSoon = (date: string | null, days: number = 14) => {
    if (!date) return false;
    const expiry = new Date(date);
    const today = new Date();
    const diff = (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff <= days && diff >= 0;
  };

  const isExpired = (date: string | null) => {
    if (!date) return false;
    return new Date(date) < new Date();
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

  // Build compliance alerts
  const alerts = [];
  if (isExpired(property.eicr_expiry_date)) alerts.push({ type: 'EICR', status: 'expired' });
  else if (isExpiringSoon(property.eicr_expiry_date)) alerts.push({ type: 'EICR', status: 'expiring' });
  if (isExpired(property.epc_expiry_date)) alerts.push({ type: 'EPC', status: 'expired' });
  else if (isExpiringSoon(property.epc_expiry_date)) alerts.push({ type: 'EPC', status: 'expiring' });
  if (property.has_gas && isExpired(property.gas_safety_expiry_date)) alerts.push({ type: 'Gas Safety', status: 'expired' });
  else if (property.has_gas && isExpiringSoon(property.gas_safety_expiry_date)) alerts.push({ type: 'Gas Safety', status: 'expiring' });
  if (property.has_end_date && isExpiringSoon(property.tenancy_end_date, 30)) alerts.push({ type: 'Tenancy End', status: 'expiring' });

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
            <button onClick={() => { setEditing(false); setEditForm({ ...property }); }} className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl">
              <X className="w-4 h-4" /> Cancel
            </button>
            <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-navy-900 text-white rounded-xl hover:bg-navy-800">
              <Save className="w-4 h-4" /> Save
            </button>
          </div>
        )}
      </div>

      {/* Alerts Banner */}
      {alerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-800 font-medium mb-2">
            <AlertTriangle className="w-5 h-5" />
            Compliance Alerts
          </div>
          <div className="flex flex-wrap gap-2">
            {alerts.map((alert, i) => (
              <span key={i} className={`px-3 py-1 rounded-full text-sm font-medium ${alert.status === 'expired' ? 'bg-red-200 text-red-800' : 'bg-yellow-200 text-yellow-800'}`}>
                {alert.type} {alert.status === 'expired' ? 'EXPIRED' : 'expiring soon'}
              </span>
            ))}
          </div>
        </div>
      )}

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
                    <input type="text" value={editForm.address || ''} onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Postcode</label>
                    <input type="text" value={editForm.postcode || ''} onChange={e => setEditForm({ ...editForm, postcode: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <select value={editForm.property_type || ''} onChange={e => setEditForm({ ...editForm, property_type: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                      <option value="house">House</option>
                      <option value="flat">Flat</option>
                      <option value="bungalow">Bungalow</option>
                      <option value="studio">Studio</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bedrooms</label>
                    <input type="number" value={editForm.bedrooms || ''} onChange={e => setEditForm({ ...editForm, bedrooms: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select value={editForm.status || ''} onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                      <option value="available">Available</option>
                      <option value="let">Let</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Landlord</label>
                    <select value={editForm.landlord_id || ''} onChange={e => setEditForm({ ...editForm, landlord_id: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                      {landlords.map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Council Tax Band</label>
                    <select value={editForm.council_tax_band || ''} onChange={e => setEditForm({ ...editForm, council_tax_band: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                      <option value="">-</option>
                      {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(b => (
                        <option key={b} value={b}>Band {b}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="border-t pt-4 mt-4">
                  <label className="flex items-center gap-2 mb-3">
                    <input type="checkbox" checked={editForm.is_leasehold === 1} onChange={e => setEditForm({ ...editForm, is_leasehold: e.target.checked ? 1 : 0 })}
                      className="w-4 h-4 rounded border-gray-300" />
                    <span>Leasehold Property</span>
                  </label>
                  {editForm.is_leasehold === 1 && (
                    <div className="grid grid-cols-2 gap-4 ml-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Lease Start</label>
                        <input type="date" value={editForm.leasehold_start_date || ''} onChange={e => setEditForm({ ...editForm, leasehold_start_date: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Lease End</label>
                        <input type="date" value={editForm.leasehold_end_date || ''} onChange={e => setEditForm({ ...editForm, leasehold_end_date: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Leaseholder Info</label>
                        <input type="text" value={editForm.leaseholder_info || ''} onChange={e => setEditForm({ ...editForm, leaseholder_info: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                      </div>
                    </div>
                  )}
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
                  <p className="text-xs text-gray-500 mb-1">Council Tax</p>
                  <p className="font-semibold text-navy-900">Band {property.council_tax_band || '-'}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Tenure</p>
                  <p className="font-semibold text-navy-900">{property.is_leasehold ? 'Leasehold' : 'Freehold'}</p>
                </div>
              </div>
            )}
          </div>

          {/* Service & Rent */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold text-navy-900 mb-4">Service & Rent</h2>
            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Service Type</label>
                  <select value={editForm.service_type || ''} onChange={e => setEditForm({ ...editForm, service_type: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                    <option value="">-</option>
                    <option value="rent_collection">Rent Collection</option>
                    <option value="let_only">Let Only</option>
                    <option value="full_management">Full Management</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Rent (£)</label>
                    <input type="number" value={editForm.rent_amount || ''} onChange={e => setEditForm({ ...editForm, rent_amount: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                  </div>
                  {(editForm.service_type === 'rent_collection' || editForm.service_type === 'full_management') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Charge %</label>
                      <input type="number" value={editForm.charge_percentage || ''} onChange={e => setEditForm({ ...editForm, charge_percentage: parseFloat(e.target.value) })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                    </div>
                  )}
                  {editForm.service_type === 'let_only' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Total Charge (£)</label>
                      <input type="number" value={editForm.total_charge || ''} onChange={e => setEditForm({ ...editForm, total_charge: parseFloat(e.target.value) })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tenancy Start</label>
                    <input type="date" value={editForm.tenancy_start_date || ''} onChange={e => setEditForm({ ...editForm, tenancy_start_date: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tenancy Type</label>
                    <select value={editForm.tenancy_type || ''} onChange={e => setEditForm({ ...editForm, tenancy_type: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                      <option value="">-</option>
                      <option value="AST">AST</option>
                      <option value="HMO">HMO</option>
                      <option value="Rolling">Rolling</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-2 mb-2">
                    <input type="checkbox" checked={editForm.has_end_date === 1} onChange={e => setEditForm({ ...editForm, has_end_date: e.target.checked ? 1 : 0 })}
                      className="w-4 h-4 rounded border-gray-300" />
                    <span>Has End Date</span>
                  </label>
                  {editForm.has_end_date === 1 && (
                    <input type="date" value={editForm.tenancy_end_date || ''} onChange={e => setEditForm({ ...editForm, tenancy_end_date: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rent Review Date</label>
                  <input type="date" value={editForm.rent_review_date || ''} onChange={e => setEditForm({ ...editForm, rent_review_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Monthly Rent</span>
                  <span className="text-2xl font-bold text-green-600">£{property.rent_amount}</span>
                </div>
                {property.service_type && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Service Type</span>
                    <span className="font-medium capitalize">{property.service_type.replace(/_/g, ' ')}</span>
                  </div>
                )}
                {property.charge_percentage && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Commission</span>
                    <span className="font-medium">{property.charge_percentage}%</span>
                  </div>
                )}
                {property.tenancy_start_date && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Tenancy Start</span>
                    <span className="font-medium">{new Date(property.tenancy_start_date).toLocaleDateString('en-GB')}</span>
                  </div>
                )}
                {property.has_end_date && property.tenancy_end_date && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Tenancy End</span>
                    <span className={`font-medium ${isExpiringSoon(property.tenancy_end_date, 30) ? 'text-red-600' : ''}`}>
                      {new Date(property.tenancy_end_date).toLocaleDateString('en-GB')}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Compliance */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold text-navy-900 mb-4">Compliance</h2>
            {editing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">EICR Expiry</label>
                    <input type="date" value={editForm.eicr_expiry_date || ''} onChange={e => setEditForm({ ...editForm, eicr_expiry_date: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">EPC Grade</label>
                    <select value={editForm.epc_grade || ''} onChange={e => setEditForm({ ...editForm, epc_grade: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                      <option value="">-</option>
                      {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'None'].map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">EPC Expiry</label>
                  <input type="date" value={editForm.epc_expiry_date || ''} onChange={e => setEditForm({ ...editForm, epc_expiry_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
                <div className="border-t pt-4">
                  <label className="flex items-center gap-2 mb-3">
                    <input type="checkbox" checked={editForm.has_gas === 1} onChange={e => setEditForm({ ...editForm, has_gas: e.target.checked ? 1 : 0 })}
                      className="w-4 h-4 rounded border-gray-300" />
                    <span>Gas Connection</span>
                  </label>
                  {editForm.has_gas === 1 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Gas Safety Expiry</label>
                      <input type="date" value={editForm.gas_safety_expiry_date || ''} onChange={e => setEditForm({ ...editForm, gas_safety_expiry_date: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                    </div>
                  )}
                </div>
                <div className="border-t pt-4">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={editForm.proof_of_ownership_received === 1} onChange={e => setEditForm({ ...editForm, proof_of_ownership_received: e.target.checked ? 1 : 0 })}
                      className="w-4 h-4 rounded border-gray-300" />
                    <span>Proof of Ownership Received</span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-blue-500" />
                    <span>EICR</span>
                  </div>
                  {property.eicr_expiry_date ? (
                    <span className={`font-medium ${isExpired(property.eicr_expiry_date) ? 'text-red-600' : isExpiringSoon(property.eicr_expiry_date) ? 'text-yellow-600' : 'text-green-600'}`}>
                      {isExpired(property.eicr_expiry_date) ? 'EXPIRED' : new Date(property.eicr_expiry_date).toLocaleDateString('en-GB')}
                    </span>
                  ) : (
                    <span className="text-gray-400">Not set</span>
                  )}
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-green-500" />
                    <span>EPC</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {property.epc_grade && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-sm font-medium">Grade {property.epc_grade}</span>}
                    {property.epc_expiry_date ? (
                      <span className={`font-medium ${isExpired(property.epc_expiry_date) ? 'text-red-600' : isExpiringSoon(property.epc_expiry_date) ? 'text-yellow-600' : ''}`}>
                        {isExpired(property.epc_expiry_date) ? 'EXPIRED' : new Date(property.epc_expiry_date).toLocaleDateString('en-GB')}
                      </span>
                    ) : (
                      <span className="text-gray-400">Not set</span>
                    )}
                  </div>
                </div>
                {property.has_gas ? (
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Flame className="w-5 h-5 text-orange-500" />
                      <span>Gas Safety</span>
                    </div>
                    {property.gas_safety_expiry_date ? (
                      <span className={`font-medium ${isExpired(property.gas_safety_expiry_date) ? 'text-red-600' : isExpiringSoon(property.gas_safety_expiry_date) ? 'text-yellow-600' : 'text-green-600'}`}>
                        {isExpired(property.gas_safety_expiry_date) ? 'EXPIRED' : new Date(property.gas_safety_expiry_date).toLocaleDateString('en-GB')}
                      </span>
                    ) : (
                      <span className="text-gray-400">Not set</span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Flame className="w-5 h-5 text-gray-300" />
                      <span className="text-gray-400">No Gas</span>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span>Proof of Ownership</span>
                  {property.proof_of_ownership_received ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <span className="text-gray-400">Not received</span>
                  )}
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
              <Link to={`/tenants/${property.current_tenant_id}`} className="flex items-center gap-4 p-4 bg-green-50 rounded-xl hover:bg-green-100 transition-colors">
                <div className="w-12 h-12 bg-green-200 rounded-full flex items-center justify-center">
                  <User className="w-6 h-6 text-green-700" />
                </div>
                <div>
                  <p className="font-semibold text-navy-900">{property.current_tenant}</p>
                  <p className="text-sm text-gray-500">Active tenancy</p>
                </div>
              </Link>
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
            {editing ? (
              <textarea value={editForm.notes || ''} onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                rows={6} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm" />
            ) : property.notes ? (
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
