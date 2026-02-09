import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { ArrowLeft, Mail, Phone, AlertCircle, Home, Edit2, Save, X, Plus, CheckCircle, XCircle, User } from 'lucide-react';
import DocumentsSection from '../components/DocumentsSection';

interface Property {
  id: number;
  address: string;
  rent_amount: number;
}

export default function TenantDetail() {
  const { id } = useParams();
  const api = useApi();
  const [tenant, setTenant] = useState<any>(null);
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
      const [tenantData, allProperties] = await Promise.all([
        api.get(`/api/tenants/${id}`),
        api.get('/api/properties')
      ]);
      setTenant(tenantData);
      setProperties(allProperties);
      setEditForm({ ...tenantData });
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

  // Calculate completion percentage
  const calculateCompletion = () => {
    if (!tenant) return 0;
    const checks = [
      tenant.holding_deposit_received,
      tenant.application_forms_completed,
      tenant.kyc_completed_1,
      tenant.nok_name,
      tenant.property_id,
      tenant.tenancy_start_date,
      !tenant.guarantor_required || tenant.guarantor_kyc_completed,
      !tenant.guarantor_required || tenant.guarantor_deed_received,
      !tenant.is_joint_tenancy || tenant.kyc_completed_2,
    ];
    const completed = checks.filter(Boolean).length;
    return Math.round((completed / checks.length) * 100);
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

  const completion = calculateCompletion();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/tenants" className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-navy-900">{tenant.name}</h1>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${completion === 100 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {completion}% Complete
            </span>
          </div>
          <p className="text-gray-500">Tenant {tenant.property_address ? `• ${tenant.property_address}` : ''}</p>
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
            <button onClick={() => { setEditing(false); setEditForm({ ...tenant }); }} className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl">
              <X className="w-4 h-4" /> Cancel
            </button>
            <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-navy-900 text-white rounded-xl hover:bg-navy-800">
              <Save className="w-4 h-4" /> Save
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Applicant 1 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-navy-900">Applicant 1</h2>
              {tenant.kyc_completed_1 ? (
                <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                  <CheckCircle className="w-3 h-3" /> KYC
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
                  <XCircle className="w-3 h-3" /> KYC Pending
                </span>
              )}
            </div>
            {editing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                    <select value={editForm.title_1 || ''} onChange={e => setEditForm({ ...editForm, title_1: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                      <option value="">-</option>
                      <option value="Mr">Mr</option>
                      <option value="Mrs">Mrs</option>
                      <option value="Miss">Miss</option>
                      <option value="Ms">Ms</option>
                      <option value="Dr">Dr</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                    <input type="text" value={editForm.first_name_1 || ''} onChange={e => setEditForm({ ...editForm, first_name_1: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                    <input type="text" value={editForm.last_name_1 || ''} onChange={e => setEditForm({ ...editForm, last_name_1: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" value={editForm.email || ''} onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input type="tel" value={editForm.phone || ''} onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                  <input type="date" value={editForm.date_of_birth_1 || ''} onChange={e => setEditForm({ ...editForm, date_of_birth_1: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={editForm.kyc_completed_1 === 1} onChange={e => setEditForm({ ...editForm, kyc_completed_1: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4 rounded border-gray-300" />
                  <span>KYC Completed</span>
                </label>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-gray-400" />
                  <span className="font-medium">{tenant.title_1} {tenant.first_name_1} {tenant.last_name_1}</span>
                </div>
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
                {tenant.date_of_birth_1 && (
                  <div className="text-sm text-gray-500">DOB: {new Date(tenant.date_of_birth_1).toLocaleDateString('en-GB')}</div>
                )}
              </div>
            )}
          </div>

          {/* Joint Tenancy - Applicant 2 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-navy-900">Joint Tenancy</h2>
              {editing && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={editForm.is_joint_tenancy === 1} onChange={e => setEditForm({ ...editForm, is_joint_tenancy: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4 rounded border-gray-300" />
                  <span className="text-sm">Joint Tenancy</span>
                </label>
              )}
            </div>
            {(editing ? editForm.is_joint_tenancy : tenant.is_joint_tenancy) ? (
              editing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                      <select value={editForm.title_2 || ''} onChange={e => setEditForm({ ...editForm, title_2: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                        <option value="">-</option>
                        <option value="Mr">Mr</option>
                        <option value="Mrs">Mrs</option>
                        <option value="Miss">Miss</option>
                        <option value="Ms">Ms</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                      <input type="text" value={editForm.first_name_2 || ''} onChange={e => setEditForm({ ...editForm, first_name_2: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                      <input type="text" value={editForm.last_name_2 || ''} onChange={e => setEditForm({ ...editForm, last_name_2: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input type="email" value={editForm.email_2 || ''} onChange={e => setEditForm({ ...editForm, email_2: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                      <input type="tel" value={editForm.phone_2 || ''} onChange={e => setEditForm({ ...editForm, phone_2: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                    </div>
                  </div>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={editForm.kyc_completed_2 === 1} onChange={e => setEditForm({ ...editForm, kyc_completed_2: e.target.checked ? 1 : 0 })}
                      className="w-4 h-4 rounded border-gray-300" />
                    <span>KYC Completed</span>
                  </label>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-gray-400" />
                      <span className="font-medium">{tenant.title_2} {tenant.first_name_2} {tenant.last_name_2}</span>
                    </div>
                    {tenant.kyc_completed_2 ? (
                      <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                        <CheckCircle className="w-3 h-3" /> KYC
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
                        <XCircle className="w-3 h-3" /> KYC Pending
                      </span>
                    )}
                  </div>
                  {tenant.email_2 && <div className="text-sm text-gray-600">{tenant.email_2}</div>}
                  {tenant.phone_2 && <div className="text-sm text-gray-600">{tenant.phone_2}</div>}
                </div>
              )
            ) : (
              <p className="text-gray-400 text-sm">Single tenancy - no joint applicant</p>
            )}
          </div>

          {/* Next of Kin */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-navy-900">Next of Kin</h2>
              {!tenant.nok_name && !editing && (
                <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">Missing</span>
              )}
            </div>
            {editing ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input type="text" value={editForm.nok_name || ''} onChange={e => setEditForm({ ...editForm, nok_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Relationship</label>
                  <input type="text" value={editForm.nok_relationship || ''} onChange={e => setEditForm({ ...editForm, nok_relationship: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input type="tel" value={editForm.nok_phone || ''} onChange={e => setEditForm({ ...editForm, nok_phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={editForm.nok_email || ''} onChange={e => setEditForm({ ...editForm, nok_email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
              </div>
            ) : tenant.nok_name ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                  <span className="font-medium">{tenant.nok_name}</span>
                  {tenant.nok_relationship && <span className="text-gray-500">({tenant.nok_relationship})</span>}
                </div>
                {tenant.nok_phone && <div className="text-sm text-gray-600 ml-8">{tenant.nok_phone}</div>}
                {tenant.nok_email && <div className="text-sm text-gray-600 ml-8">{tenant.nok_email}</div>}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">No next of kin recorded</p>
            )}
          </div>

          {/* Guarantor */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-navy-900">Guarantor</h2>
              {editing && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={editForm.guarantor_required === 1} onChange={e => setEditForm({ ...editForm, guarantor_required: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4 rounded border-gray-300" />
                  <span className="text-sm">Guarantor Required</span>
                </label>
              )}
            </div>
            {(editing ? editForm.guarantor_required : tenant.guarantor_required) ? (
              editing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                      <input type="text" value={editForm.guarantor_name || ''} onChange={e => setEditForm({ ...editForm, guarantor_name: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                      <input type="tel" value={editForm.guarantor_phone || ''} onChange={e => setEditForm({ ...editForm, guarantor_phone: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <input type="text" value={editForm.guarantor_address || ''} onChange={e => setEditForm({ ...editForm, guarantor_address: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                  </div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={editForm.guarantor_kyc_completed === 1} onChange={e => setEditForm({ ...editForm, guarantor_kyc_completed: e.target.checked ? 1 : 0 })}
                        className="w-4 h-4 rounded border-gray-300" />
                      <span>KYC Completed</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={editForm.guarantor_deed_received === 1} onChange={e => setEditForm({ ...editForm, guarantor_deed_received: e.target.checked ? 1 : 0 })}
                        className="w-4 h-4 rounded border-gray-300" />
                      <span>Deed Received</span>
                    </label>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="font-medium">{tenant.guarantor_name || 'Name not recorded'}</div>
                  {tenant.guarantor_address && <div className="text-sm text-gray-600">{tenant.guarantor_address}</div>}
                  {tenant.guarantor_phone && <div className="text-sm text-gray-600">{tenant.guarantor_phone}</div>}
                  <div className="flex gap-2 mt-2">
                    {tenant.guarantor_kyc_completed ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">KYC ✓</span>
                    ) : (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">KYC Pending</span>
                    )}
                    {tenant.guarantor_deed_received ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Deed ✓</span>
                    ) : (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">Deed Pending</span>
                    )}
                  </div>
                </div>
              )
            ) : (
              <p className="text-gray-400 text-sm">No guarantor required</p>
            )}
          </div>

          {/* Tenancy Details */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold text-navy-900 mb-4">Tenancy Details</h2>
            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
                  <select value={editForm.property_id || ''} onChange={e => setEditForm({ ...editForm, property_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                    <option value="">Select property...</option>
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>{p.address}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-2 mb-2">
                      <input type="checkbox" checked={editForm.has_end_date === 1} onChange={e => setEditForm({ ...editForm, has_end_date: e.target.checked ? 1 : 0 })}
                        className="w-4 h-4 rounded border-gray-300" />
                      <span className="text-sm">Has End Date</span>
                    </label>
                    {editForm.has_end_date === 1 && (
                      <input type="date" value={editForm.tenancy_end_date || ''} onChange={e => setEditForm({ ...editForm, tenancy_end_date: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Rent (£)</label>
                    <input type="number" value={editForm.monthly_rent || ''} onChange={e => setEditForm({ ...editForm, monthly_rent: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {tenant.property_address ? (
                  <Link to={`/properties/${tenant.property_id}`} className="flex items-center gap-3 text-gray-600 hover:text-gold-600">
                    <Home className="w-5 h-5 text-gray-400" />
                    <span>{tenant.property_address}</span>
                  </Link>
                ) : (
                  <p className="text-gray-400 text-sm">No property linked</p>
                )}
                {tenant.tenancy_start_date && (
                  <div className="text-sm text-gray-600">
                    Start: {new Date(tenant.tenancy_start_date).toLocaleDateString('en-GB')}
                    {tenant.tenancy_type && ` • ${tenant.tenancy_type}`}
                  </div>
                )}
                {tenant.has_end_date && tenant.tenancy_end_date && (
                  <div className="text-sm text-gray-600">
                    End: {new Date(tenant.tenancy_end_date).toLocaleDateString('en-GB')}
                  </div>
                )}
                {tenant.monthly_rent && (
                  <div className="text-lg font-semibold text-green-600">£{tenant.monthly_rent}/month</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Application Status */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold text-navy-900 mb-4">Application Status</h2>
            {editing ? (
              <div className="space-y-3">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={editForm.holding_deposit_received === 1} onChange={e => setEditForm({ ...editForm, holding_deposit_received: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4 rounded border-gray-300" />
                  <span>Holding Deposit Received</span>
                </label>
                {editForm.holding_deposit_received === 1 && (
                  <div className="ml-6 grid grid-cols-2 gap-2">
                    <input type="number" placeholder="Amount" value={editForm.holding_deposit_amount || ''} onChange={e => setEditForm({ ...editForm, holding_deposit_amount: e.target.value })}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    <input type="date" value={editForm.holding_deposit_date || ''} onChange={e => setEditForm({ ...editForm, holding_deposit_date: e.target.value })}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                )}
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={editForm.application_forms_completed === 1} onChange={e => setEditForm({ ...editForm, application_forms_completed: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4 rounded border-gray-300" />
                  <span>Application Forms Completed</span>
                </label>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Holding Deposit</span>
                  {tenant.holding_deposit_received ? (
                    <span className="text-green-600 font-medium">
                      £{tenant.holding_deposit_amount || '?'} ✓
                    </span>
                  ) : (
                    <span className="text-gray-400">Not received</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Application Forms</span>
                  {tenant.application_forms_completed ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-gray-300" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">KYC (Applicant 1)</span>
                  {tenant.kyc_completed_1 ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-gray-300" />
                  )}
                </div>
                {tenant.is_joint_tenancy === 1 && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">KYC (Applicant 2)</span>
                    {tenant.kyc_completed_2 ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-gray-300" />
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Next of Kin</span>
                  {tenant.nok_name ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-gray-300" />
                  )}
                </div>
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">Completion</span>
                    <span className="text-sm font-bold">{completion}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className={`h-2 rounded-full ${completion === 100 ? 'bg-green-500' : 'bg-yellow-500'}`} style={{ width: `${completion}%` }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
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
            ) : tenant.notes ? (
              <div className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-xl p-4 max-h-64 overflow-y-auto">
                {tenant.notes}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">No notes yet</p>
            )}
          </div>

          {/* Documents */}
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
