import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import DocumentsSection from '../components/DocumentsSection';

interface Property {
  id: number;
  address: string;
}

export default function TenantEnquiryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const [enquiry, setEnquiry] = useState<any>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [convertData, setConvertData] = useState({
    property_id: '',
    tenancy_start_date: '',
    tenancy_type: 'AST',
    monthly_rent: ''
  });

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
      setProperties(propertiesData.filter((p: Property) => p.status === 'available'));
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

  const handleStatusChange = async (newStatus: string) => {
    try {
      await api.put(`/api/tenant-enquiries/${id}`, { ...enquiry, status: newStatus });
      setEnquiry({ ...enquiry, status: newStatus });
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  };

  const handleConvert = async () => {
    try {
      const result = await api.post(`/api/tenant-enquiries/${id}/convert`, convertData);
      alert('Enquiry converted to tenant successfully');
      navigate(`/tenants/${result.tenant_id}`);
    } catch (err: any) {
      alert(err.message || 'Failed to convert');
    }
  };

  const handleBookViewing = async () => {
    if (!enquiry.viewing_date || !enquiry.linked_property_id) {
      alert('Please select a viewing date and property');
      return;
    }
    try {
      await api.post('/api/property-viewings', {
        property_id: enquiry.linked_property_id,
        enquiry_id: id,
        viewer_name: `${enquiry.first_name_1} ${enquiry.last_name_1}`,
        viewer_email: enquiry.email_1,
        viewer_phone: enquiry.phone_1,
        viewing_date: enquiry.viewing_date
      });
      await handleStatusChange('viewing_booked');
      alert('Viewing booked');
    } catch (err: any) {
      alert(err.message || 'Failed to book viewing');
    }
  };

  if (loading) return <div className="p-6">Loading...</div>;
  if (!enquiry) return <div className="p-6">Enquiry not found</div>;

  const statusColors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-800',
    viewing_booked: 'bg-purple-100 text-purple-800',
    awaiting_response: 'bg-yellow-100 text-yellow-800',
    onboarding: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    converted: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link to="/tenant-enquiries" className="text-[#102a43] hover:underline mb-2 inline-block">
            ← Back to Enquiries
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {enquiry.first_name_1} {enquiry.last_name_1}
          </h1>
          {enquiry.is_joint_application === 1 && enquiry.first_name_2 && (
            <p className="text-gray-600">& {enquiry.first_name_2} {enquiry.last_name_2}</p>
          )}
        </div>
        <span className={`px-3 py-1 rounded text-sm font-medium ${statusColors[enquiry.status]}`}>
          {enquiry.status.replace(/_/g, ' ').toUpperCase()}
        </span>
      </div>

      {/* Action Buttons */}
      {enquiry.status !== 'converted' && enquiry.status !== 'rejected' && (
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <h3 className="font-medium mb-3">Actions</h3>
          <div className="flex flex-wrap gap-2">
            {enquiry.status === 'new' && (
              <>
                <button
                  onClick={handleBookViewing}
                  className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                >
                  Book Viewing
                </button>
                <button
                  onClick={() => handleStatusChange('awaiting_response')}
                  className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
                >
                  Awaiting Response
                </button>
              </>
            )}
            {enquiry.status === 'viewing_booked' && (
              <button
                onClick={() => handleStatusChange('onboarding')}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Start Onboarding
              </button>
            )}
            {enquiry.status === 'onboarding' && (
              <button
                onClick={() => setShowConvert(true)}
                className="px-4 py-2 bg-[#102a43] text-white rounded hover:bg-[#1a3a5c]"
              >
                Convert to Tenant
              </button>
            )}
            <button
              onClick={() => {
                const reason = prompt('Rejection reason:');
                if (reason !== null) {
                  setEnquiry({ ...enquiry, rejection_reason: reason });
                  handleStatusChange('rejected');
                }
              }}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Main Form */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Applicant 1</h2>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <select
              value={enquiry.title_1 || ''}
              onChange={e => setEnquiry({...enquiry, title_1: e.target.value})}
              className="w-full border rounded px-3 py-2"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
            <input
              type="text"
              value={enquiry.first_name_1 || ''}
              onChange={e => setEnquiry({...enquiry, first_name_1: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
            <input
              type="text"
              value={enquiry.last_name_1 || ''}
              onChange={e => setEnquiry({...enquiry, last_name_1: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={enquiry.email_1 || ''}
              onChange={e => setEnquiry({...enquiry, email_1: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              value={enquiry.phone_1 || ''}
              onChange={e => setEnquiry({...enquiry, phone_1: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
            <input
              type="date"
              value={enquiry.date_of_birth_1 || ''}
              onChange={e => setEnquiry({...enquiry, date_of_birth_1: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Address</label>
            <input
              type="text"
              value={enquiry.current_address_1 || ''}
              onChange={e => setEnquiry({...enquiry, current_address_1: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employment Status</label>
            <select
              value={enquiry.employment_status_1 || ''}
              onChange={e => setEnquiry({...enquiry, employment_status_1: e.target.value})}
              className="w-full border rounded px-3 py-2"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Employer</label>
            <input
              type="text"
              value={enquiry.employer_1 || ''}
              onChange={e => setEnquiry({...enquiry, employer_1: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Annual Income</label>
            <input
              type="number"
              value={enquiry.income_1 || ''}
              onChange={e => setEnquiry({...enquiry, income_1: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="flex items-center mt-6">
              <input
                type="checkbox"
                checked={enquiry.kyc_completed_1 === 1}
                onChange={e => setEnquiry({...enquiry, kyc_completed_1: e.target.checked ? 1 : 0})}
                className="mr-2"
              />
              KYC Completed
            </label>
          </div>
        </div>

        {/* Joint Application */}
        <div className="mb-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={enquiry.is_joint_application === 1}
              onChange={e => setEnquiry({...enquiry, is_joint_application: e.target.checked ? 1 : 0})}
              className="mr-2"
            />
            Joint Application
          </label>
        </div>

        {enquiry.is_joint_application === 1 && (
          <>
            <h2 className="text-lg font-semibold mb-4">Applicant 2</h2>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <select
                  value={enquiry.title_2 || ''}
                  onChange={e => setEnquiry({...enquiry, title_2: e.target.value})}
                  className="w-full border rounded px-3 py-2"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input
                  type="text"
                  value={enquiry.first_name_2 || ''}
                  onChange={e => setEnquiry({...enquiry, first_name_2: e.target.value})}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input
                  type="text"
                  value={enquiry.last_name_2 || ''}
                  onChange={e => setEnquiry({...enquiry, last_name_2: e.target.value})}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={enquiry.email_2 || ''}
                  onChange={e => setEnquiry({...enquiry, email_2: e.target.value})}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={enquiry.phone_2 || ''}
                  onChange={e => setEnquiry({...enquiry, phone_2: e.target.value})}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="flex items-center mt-6">
                  <input
                    type="checkbox"
                    checked={enquiry.kyc_completed_2 === 1}
                    onChange={e => setEnquiry({...enquiry, kyc_completed_2: e.target.checked ? 1 : 0})}
                    className="mr-2"
                  />
                  KYC Completed
                </label>
              </div>
            </div>
          </>
        )}

        {/* Workflow Fields */}
        <h2 className="text-lg font-semibold mb-4">Workflow</h2>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Linked Property</label>
            <select
              value={enquiry.linked_property_id || ''}
              onChange={e => setEnquiry({...enquiry, linked_property_id: e.target.value})}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">Select property...</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.address}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Viewing Date</label>
            <input
              type="date"
              value={enquiry.viewing_date || ''}
              onChange={e => setEnquiry({...enquiry, viewing_date: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Follow-up Date</label>
            <input
              type="date"
              value={enquiry.follow_up_date || ''}
              onChange={e => setEnquiry({...enquiry, follow_up_date: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>

        {/* Notes */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={enquiry.notes || ''}
            onChange={e => setEnquiry({...enquiry, notes: e.target.value})}
            className="w-full border rounded px-3 py-2"
            rows={4}
          />
        </div>

        {enquiry.rejection_reason && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded">
            <h3 className="font-medium text-red-800">Rejection Reason</h3>
            <p className="text-red-700">{enquiry.rejection_reason}</p>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-[#102a43] text-white rounded hover:bg-[#1a3a5c] disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Documents */}
      <DocumentsSection entityType="tenant_enquiry" entityId={parseInt(id!)} />

      {/* Convert Modal */}
      {showConvert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Convert to Tenant</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Property *</label>
                <select
                  value={convertData.property_id}
                  onChange={e => setConvertData({...convertData, property_id: e.target.value})}
                  className="w-full border rounded px-3 py-2"
                  required
                >
                  <option value="">Select property...</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.address}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tenancy Start Date *</label>
                <input
                  type="date"
                  value={convertData.tenancy_start_date}
                  onChange={e => setConvertData({...convertData, tenancy_start_date: e.target.value})}
                  className="w-full border rounded px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tenancy Type</label>
                <select
                  value={convertData.tenancy_type}
                  onChange={e => setConvertData({...convertData, tenancy_type: e.target.value})}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="AST">AST</option>
                  <option value="HMO">HMO</option>
                  <option value="Rolling">Rolling</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Rent (£)</label>
                <input
                  type="number"
                  value={convertData.monthly_rent}
                  onChange={e => setConvertData({...convertData, monthly_rent: e.target.value})}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowConvert(false)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConvert}
                className="px-4 py-2 bg-[#102a43] text-white rounded hover:bg-[#1a3a5c]"
              >
                Convert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
