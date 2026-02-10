import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import DocumentsSection from '../components/DocumentsSection';
import { ArrowLeft, CheckCircle, XCircle, Calendar, Clock, Home, Save, UserPlus, AlertTriangle } from 'lucide-react';

interface Property {
  id: number;
  address: string;
  postcode: string;
  status: string;
  rent_amount: number;
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  new: { label: 'New', color: 'text-blue-700', bgColor: 'bg-blue-50 border-blue-200' },
  viewing_booked: { label: 'Viewing Booked', color: 'text-purple-700', bgColor: 'bg-purple-50 border-purple-200' },
  awaiting_response: { label: 'Awaiting Response', color: 'text-amber-700', bgColor: 'bg-amber-50 border-amber-200' },
  onboarding: { label: 'Onboarding', color: 'text-green-700', bgColor: 'bg-green-50 border-green-200' },
  rejected: { label: 'Rejected/Archived', color: 'text-red-700', bgColor: 'bg-red-50 border-red-200' },
  converted: { label: 'Converted to Tenant', color: 'text-gray-700', bgColor: 'bg-gray-50 border-gray-200' },
};

export default function TenantEnquiryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const [enquiry, setEnquiry] = useState<any>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [modalData, setModalData] = useState<any>({});

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [enquiryData, propertiesData] = await Promise.all([
        api.get(`/api/tenant-enquiries/${id}`),
        api.get('/api/properties')
      ]);
      setEnquiry(enquiryData);
      setProperties(propertiesData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/api/tenant-enquiries/${id}`, enquiry);
      alert('Saved successfully');
    } catch (err: any) {
      alert(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Progress Actions
  const handleBookViewing = async () => {
    if (!modalData.viewing_date || !modalData.property_id) {
      alert('Please select a viewing date and property');
      return;
    }
    try {
      // Create property viewing record
      await api.post('/api/property-viewings', {
        property_id: modalData.property_id,
        enquiry_id: id,
        viewer_name: `${enquiry.first_name_1} ${enquiry.last_name_1}`,
        viewer_email: enquiry.email_1,
        viewer_phone: enquiry.phone_1,
        viewing_date: modalData.viewing_date,
        viewing_time: modalData.viewing_time
      });
      
      // Update enquiry
      await api.put(`/api/tenant-enquiries/${id}`, {
        ...enquiry,
        status: 'viewing_booked',
        viewing_date: modalData.viewing_date,
        linked_property_id: modalData.property_id
      });
      
      setActiveModal(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to book viewing');
    }
  };

  const handleAwaitingResponse = async () => {
    if (!modalData.follow_up_date) {
      alert('Please select a follow-up date');
      return;
    }
    try {
      await api.put(`/api/tenant-enquiries/${id}`, {
        ...enquiry,
        status: 'awaiting_response',
        follow_up_date: modalData.follow_up_date,
        notes: modalData.notes ? `${enquiry.notes || ''}\n\n[${new Date().toLocaleDateString('en-GB')}] Awaiting response: ${modalData.notes}` : enquiry.notes
      });
      setActiveModal(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update');
    }
  };

  const handleStartOnboarding = async () => {
    try {
      await api.put(`/api/tenant-enquiries/${id}`, {
        ...enquiry,
        status: 'onboarding',
        follow_up_date: modalData.follow_up_date || null
      });
      setActiveModal(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to start onboarding');
    }
  };

  const handleReject = async () => {
    try {
      await api.put(`/api/tenant-enquiries/${id}`, {
        ...enquiry,
        status: 'rejected',
        rejection_reason: modalData.rejection_reason,
        notes: `${enquiry.notes || ''}\n\n[${new Date().toLocaleDateString('en-GB')}] REJECTED: ${modalData.rejection_reason}`
      });
      setActiveModal(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to reject');
    }
  };

  const handleConvertToTenant = async () => {
    // Validation
    if (!enquiry.linked_property_id) {
      alert('Please link a property before converting');
      return;
    }
    if (!modalData.tenancy_start_date) {
      alert('Please enter a tenancy start date');
      return;
    }
    
    try {
      const result = await api.post(`/api/tenant-enquiries/${id}/convert`, {
        property_id: enquiry.linked_property_id,
        tenancy_start_date: modalData.tenancy_start_date,
        tenancy_type: modalData.tenancy_type || 'AST',
        monthly_rent: modalData.monthly_rent || 0
      });
      alert('Successfully converted to tenant!');
      navigate(`/tenants/${result.tenant_id}`);
    } catch (err: any) {
      alert(err.message || 'Failed to convert');
    }
  };

  const handleReactivate = async () => {
    try {
      await api.put(`/api/tenant-enquiries/${id}`, {
        ...enquiry,
        status: 'new',
        rejection_reason: null,
        notes: `${enquiry.notes || ''}\n\n[${new Date().toLocaleDateString('en-GB')}] Reactivated from archive`
      });
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to reactivate');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-navy-200 border-t-navy-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!enquiry) {
    return <div className="p-6 text-center text-gray-500">Enquiry not found</div>;
  }

  const config = statusConfig[enquiry.status];
  const linkedProperty = properties.find(p => p.id === enquiry.linked_property_id);
  const isActive = !['rejected', 'converted'].includes(enquiry.status);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link to="/tenant-enquiries" className="p-2 hover:bg-gray-100 rounded-xl transition-colors mt-1">
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-navy-900">
              {enquiry.title_1} {enquiry.first_name_1} {enquiry.last_name_1}
            </h1>
            {enquiry.is_joint_application === 1 && enquiry.first_name_2 && (
              <span className="text-lg text-gray-500">
                & {enquiry.title_2} {enquiry.first_name_2} {enquiry.last_name_2}
              </span>
            )}
            <span className={`px-3 py-1 rounded-full text-sm font-medium border ${config.bgColor} ${config.color}`}>
              {config.label}
            </span>
          </div>
          <p className="text-gray-500 mt-1">
            Enquiry submitted {new Date(enquiry.created_at).toLocaleDateString('en-GB')}
          </p>
        </div>
        
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2.5 bg-navy-600 hover:bg-navy-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Action Panel */}
      {isActive && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-navy-900 mb-4">Workflow Actions</h2>
          <div className="flex flex-wrap gap-3">
            {/* Progress Actions */}
            {enquiry.status === 'new' && (
              <>
                <button
                  onClick={() => { setModalData({}); setActiveModal('viewing'); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium"
                >
                  <Calendar className="w-4 h-4" />
                  Book Viewing
                </button>
                <button
                  onClick={() => { setModalData({}); setActiveModal('awaiting'); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-medium"
                >
                  <Clock className="w-4 h-4" />
                  Awaiting Response
                </button>
                <button
                  onClick={() => { setModalData({}); setActiveModal('onboarding'); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium"
                >
                  <CheckCircle className="w-4 h-4" />
                  Start Onboarding
                </button>
              </>
            )}
            
            {enquiry.status === 'viewing_booked' && (
              <>
                <button
                  onClick={() => { setModalData({}); setActiveModal('onboarding'); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium"
                >
                  <CheckCircle className="w-4 h-4" />
                  Start Onboarding
                </button>
                <button
                  onClick={() => { setModalData({}); setActiveModal('awaiting'); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-medium"
                >
                  <Clock className="w-4 h-4" />
                  Awaiting Response
                </button>
              </>
            )}
            
            {enquiry.status === 'awaiting_response' && (
              <>
                <button
                  onClick={() => { setModalData({}); setActiveModal('viewing'); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium"
                >
                  <Calendar className="w-4 h-4" />
                  Book Viewing
                </button>
                <button
                  onClick={() => { setModalData({}); setActiveModal('onboarding'); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium"
                >
                  <CheckCircle className="w-4 h-4" />
                  Start Onboarding
                </button>
              </>
            )}
            
            {enquiry.status === 'onboarding' && (
              <button
                onClick={() => { setModalData({ tenancy_type: 'AST' }); setActiveModal('convert'); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-navy-600 hover:bg-navy-700 text-white rounded-xl font-medium"
              >
                <UserPlus className="w-4 h-4" />
                Convert to Tenant
              </button>
            )}
            
            {/* Reject Action (always available when active) */}
            <button
              onClick={() => { setModalData({}); setActiveModal('reject'); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium ml-auto"
            >
              <XCircle className="w-4 h-4" />
              Reject
            </button>
          </div>
          
          {/* Current workflow info */}
          {enquiry.viewing_date && enquiry.status === 'viewing_booked' && (
            <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-xl flex items-center gap-3">
              <Calendar className="w-5 h-5 text-purple-600" />
              <span className="text-purple-700">
                Viewing scheduled for <strong>{new Date(enquiry.viewing_date).toLocaleDateString('en-GB')}</strong>
                {linkedProperty && <> at <strong>{linkedProperty.address}</strong></>}
              </span>
            </div>
          )}
          
          {enquiry.follow_up_date && ['awaiting_response', 'onboarding'].includes(enquiry.status) && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-600" />
              <span className="text-amber-700">
                Follow-up scheduled for <strong>{new Date(enquiry.follow_up_date).toLocaleDateString('en-GB')}</strong>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Archived/Rejected Banner */}
      {enquiry.status === 'rejected' && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-800">This enquiry has been rejected/archived</h3>
              {enquiry.rejection_reason && (
                <p className="text-red-700 mt-1">Reason: {enquiry.rejection_reason}</p>
              )}
              <button
                onClick={handleReactivate}
                className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium"
              >
                Reactivate Enquiry
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Applicant 1 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-navy-900">Primary Applicant</h2>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={enquiry.kyc_completed_1 === 1}
                  onChange={e => setEnquiry({...enquiry, kyc_completed_1: e.target.checked ? 1 : 0})}
                  className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <span className="text-sm font-medium text-gray-700">KYC Verified</span>
              </label>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
                <select
                  value={enquiry.title_1 || ''}
                  onChange={e => setEnquiry({...enquiry, title_1: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-navy-500"
                >
                  <option value="">-</option>
                  <option value="Mr">Mr</option>
                  <option value="Mrs">Mrs</option>
                  <option value="Miss">Miss</option>
                  <option value="Ms">Ms</option>
                  <option value="Dr">Dr</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">First Name</label>
                <input
                  type="text"
                  value={enquiry.first_name_1 || ''}
                  onChange={e => setEnquiry({...enquiry, first_name_1: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-navy-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Last Name</label>
                <input
                  type="text"
                  value={enquiry.last_name_1 || ''}
                  onChange={e => setEnquiry({...enquiry, last_name_1: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-navy-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <input
                  type="email"
                  value={enquiry.email_1 || ''}
                  onChange={e => setEnquiry({...enquiry, email_1: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-navy-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                <input
                  type="tel"
                  value={enquiry.phone_1 || ''}
                  onChange={e => setEnquiry({...enquiry, phone_1: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-navy-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Date of Birth</label>
                <input
                  type="date"
                  value={enquiry.date_of_birth_1 || ''}
                  onChange={e => setEnquiry({...enquiry, date_of_birth_1: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-navy-500"
                />
              </div>
              <div className="col-span-2 md:col-span-3">
                <label className="block text-xs font-medium text-gray-500 mb-1">Current Address</label>
                <input
                  type="text"
                  value={enquiry.current_address_1 || ''}
                  onChange={e => setEnquiry({...enquiry, current_address_1: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-navy-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Employment</label>
                <select
                  value={enquiry.employment_status_1 || ''}
                  onChange={e => setEnquiry({...enquiry, employment_status_1: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-navy-500"
                >
                  <option value="">-</option>
                  <option value="Employed">Employed</option>
                  <option value="Self-Employed">Self-Employed</option>
                  <option value="Unemployed">Unemployed</option>
                  <option value="Student">Student</option>
                  <option value="Retired">Retired</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Employer</label>
                <input
                  type="text"
                  value={enquiry.employer_1 || ''}
                  onChange={e => setEnquiry({...enquiry, employer_1: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-navy-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Annual Income (£)</label>
                <input
                  type="number"
                  value={enquiry.income_1 || ''}
                  onChange={e => setEnquiry({...enquiry, income_1: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-navy-500"
                />
              </div>
            </div>
          </div>

          {/* Joint Application Toggle */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enquiry.is_joint_application === 1}
                onChange={e => setEnquiry({...enquiry, is_joint_application: e.target.checked ? 1 : 0})}
                className="w-5 h-5 rounded border-gray-300 text-navy-600 focus:ring-navy-500"
              />
              <span className="font-medium text-navy-900">Joint Application</span>
            </label>
          </div>

          {/* Applicant 2 */}
          {enquiry.is_joint_application === 1 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-navy-900">Second Applicant</h2>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={enquiry.kyc_completed_2 === 1}
                    onChange={e => setEnquiry({...enquiry, kyc_completed_2: e.target.checked ? 1 : 0})}
                    className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm font-medium text-gray-700">KYC Verified</span>
                </label>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
                  <select
                    value={enquiry.title_2 || ''}
                    onChange={e => setEnquiry({...enquiry, title_2: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-navy-500"
                  >
                    <option value="">-</option>
                    <option value="Mr">Mr</option>
                    <option value="Mrs">Mrs</option>
                    <option value="Miss">Miss</option>
                    <option value="Ms">Ms</option>
                    <option value="Dr">Dr</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">First Name</label>
                  <input
                    type="text"
                    value={enquiry.first_name_2 || ''}
                    onChange={e => setEnquiry({...enquiry, first_name_2: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-navy-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={enquiry.last_name_2 || ''}
                    onChange={e => setEnquiry({...enquiry, last_name_2: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-navy-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                  <input
                    type="email"
                    value={enquiry.email_2 || ''}
                    onChange={e => setEnquiry({...enquiry, email_2: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-navy-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={enquiry.phone_2 || ''}
                    onChange={e => setEnquiry({...enquiry, phone_2: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-navy-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={enquiry.date_of_birth_2 || ''}
                    onChange={e => setEnquiry({...enquiry, date_of_birth_2: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-navy-500"
                  />
                </div>
                <div className="col-span-2 md:col-span-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Current Address</label>
                  <input
                    type="text"
                    value={enquiry.current_address_2 || ''}
                    onChange={e => setEnquiry({...enquiry, current_address_2: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-navy-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Employment</label>
                  <select
                    value={enquiry.employment_status_2 || ''}
                    onChange={e => setEnquiry({...enquiry, employment_status_2: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-navy-500"
                  >
                    <option value="">-</option>
                    <option value="Employed">Employed</option>
                    <option value="Self-Employed">Self-Employed</option>
                    <option value="Unemployed">Unemployed</option>
                    <option value="Student">Student</option>
                    <option value="Retired">Retired</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Employer</label>
                  <input
                    type="text"
                    value={enquiry.employer_2 || ''}
                    onChange={e => setEnquiry({...enquiry, employer_2: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-navy-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Annual Income (£)</label>
                  <input
                    type="number"
                    value={enquiry.income_2 || ''}
                    onChange={e => setEnquiry({...enquiry, income_2: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-navy-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold text-navy-900 mb-4">Notes</h2>
            <textarea
              value={enquiry.notes || ''}
              onChange={e => setEnquiry({...enquiry, notes: e.target.value})}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-navy-500"
              rows={6}
              placeholder="Add notes about this enquiry..."
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Linked Property */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold text-navy-900 mb-4 flex items-center gap-2">
              <Home className="w-4 h-4" />
              Linked Property
            </h2>
            <select
              value={enquiry.linked_property_id || ''}
              onChange={e => setEnquiry({...enquiry, linked_property_id: parseInt(e.target.value) || null})}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-navy-500"
            >
              <option value="">Select property...</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>
                  {p.address}, {p.postcode} - £{p.rent_amount}/mo
                </option>
              ))}
            </select>
            {linkedProperty && (
              <Link
                to={`/properties/${linkedProperty.id}`}
                className="block mt-3 text-sm text-navy-600 hover:underline"
              >
                View property →
              </Link>
            )}
          </div>

          {/* KYC Documents */}
          <DocumentsSection entityType="tenant_enquiry" entityId={parseInt(id!)} />
        </div>
      </div>

      {/* Modals */}
      {activeModal === 'viewing' && (
        <Modal title="Book Viewing" onClose={() => setActiveModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property *</label>
              <select
                value={modalData.property_id || ''}
                onChange={e => setModalData({...modalData, property_id: parseInt(e.target.value)})}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-navy-500"
              >
                <option value="">Select property...</option>
                {properties.filter(p => p.status === 'available').map(p => (
                  <option key={p.id} value={p.id}>{p.address}, {p.postcode}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Viewing Date *</label>
              <input
                type="date"
                value={modalData.viewing_date || ''}
                onChange={e => setModalData({...modalData, viewing_date: e.target.value})}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-navy-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Viewing Time</label>
              <input
                type="time"
                value={modalData.viewing_time || ''}
                onChange={e => setModalData({...modalData, viewing_time: e.target.value})}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-navy-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setActiveModal(null)} className="px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
            <button onClick={handleBookViewing} className="px-4 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700">Book Viewing</button>
          </div>
        </Modal>
      )}

      {activeModal === 'awaiting' && (
        <Modal title="Awaiting Client Response" onClose={() => setActiveModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Follow-up Date *</label>
              <input
                type="date"
                value={modalData.follow_up_date || ''}
                onChange={e => setModalData({...modalData, follow_up_date: e.target.value})}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-navy-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
              <textarea
                value={modalData.notes || ''}
                onChange={e => setModalData({...modalData, notes: e.target.value})}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-navy-500"
                rows={3}
                placeholder="What are we waiting for?"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setActiveModal(null)} className="px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
            <button onClick={handleAwaitingResponse} className="px-4 py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600">Set Follow-up</button>
          </div>
        </Modal>
      )}

      {activeModal === 'onboarding' && (
        <Modal title="Start Onboarding" onClose={() => setActiveModal(null)}>
          <p className="text-gray-600 mb-4">
            Move this enquiry to onboarding stage. You can optionally set a follow-up date.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Follow-up Date (optional)</label>
            <input
              type="date"
              value={modalData.follow_up_date || ''}
              onChange={e => setModalData({...modalData, follow_up_date: e.target.value})}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-navy-500"
            />
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setActiveModal(null)} className="px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
            <button onClick={handleStartOnboarding} className="px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700">Start Onboarding</button>
          </div>
        </Modal>
      )}

      {activeModal === 'reject' && (
        <Modal title="Reject Enquiry" onClose={() => setActiveModal(null)}>
          <p className="text-gray-600 mb-4">
            This will archive the enquiry. It can be reactivated later if needed.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rejection Reason</label>
            <textarea
              value={modalData.rejection_reason || ''}
              onChange={e => setModalData({...modalData, rejection_reason: e.target.value})}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-navy-500"
              rows={3}
              placeholder="Why is this being rejected?"
            />
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setActiveModal(null)} className="px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
            <button onClick={handleReject} className="px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700">Reject & Archive</button>
          </div>
        </Modal>
      )}

      {activeModal === 'convert' && (
        <Modal title="Convert to Tenant" onClose={() => setActiveModal(null)}>
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
              Make sure KYC is complete and a property is linked before converting.
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tenancy Start Date *</label>
              <input
                type="date"
                value={modalData.tenancy_start_date || ''}
                onChange={e => setModalData({...modalData, tenancy_start_date: e.target.value})}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-navy-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tenancy Type</label>
              <select
                value={modalData.tenancy_type || 'AST'}
                onChange={e => setModalData({...modalData, tenancy_type: e.target.value})}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-navy-500"
              >
                <option value="AST">AST (Assured Shorthold Tenancy)</option>
                <option value="HMO">HMO</option>
                <option value="Rolling">Rolling</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Rent (£)</label>
              <input
                type="number"
                value={modalData.monthly_rent || ''}
                onChange={e => setModalData({...modalData, monthly_rent: e.target.value})}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-navy-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setActiveModal(null)} className="px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
            <button onClick={handleConvertToTenant} className="px-4 py-2.5 bg-navy-600 text-white rounded-xl hover:bg-navy-700">Convert to Tenant</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Modal Component
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-navy-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
