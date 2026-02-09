import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';

interface TenantEnquiry {
  id: number;
  first_name_1: string;
  last_name_1: string;
  email_1: string;
  phone_1: string;
  is_joint_application: number;
  first_name_2?: string;
  last_name_2?: string;
  status: string;
  viewing_date?: string;
  follow_up_date?: string;
  property_address?: string;
  created_at: string;
}

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  viewing_booked: 'bg-purple-100 text-purple-800',
  awaiting_response: 'bg-yellow-100 text-yellow-800',
  onboarding: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  converted: 'bg-gray-100 text-gray-800',
};

const statusLabels: Record<string, string> = {
  new: 'New',
  viewing_booked: 'Viewing Booked',
  awaiting_response: 'Awaiting Response',
  onboarding: 'Onboarding',
  rejected: 'Rejected',
  converted: 'Converted',
};

export default function TenantEnquiries() {
  const api = useApi();
  const [enquiries, setEnquiries] = useState<TenantEnquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('active');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title_1: '', first_name_1: '', last_name_1: '', email_1: '', phone_1: '',
    date_of_birth_1: '', current_address_1: '', employment_status_1: '', employer_1: '', income_1: '',
    is_joint_application: false,
    title_2: '', first_name_2: '', last_name_2: '', email_2: '', phone_2: '',
    notes: ''
  });

  useEffect(() => {
    loadEnquiries();
  }, []);

  const loadEnquiries = async () => {
    try {
      const data = await api.get('/api/tenant-enquiries');
      setEnquiries(data);
    } catch (err) {
      console.error('Failed to load enquiries:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/tenant-enquiries', formData);
      setShowForm(false);
      setFormData({
        title_1: '', first_name_1: '', last_name_1: '', email_1: '', phone_1: '',
        date_of_birth_1: '', current_address_1: '', employment_status_1: '', employer_1: '', income_1: '',
        is_joint_application: false,
        title_2: '', first_name_2: '', last_name_2: '', email_2: '', phone_2: '',
        notes: ''
      });
      loadEnquiries();
    } catch (err: any) {
      alert(err.message || 'Failed to create enquiry');
    }
  };

  const filteredEnquiries = enquiries.filter(e => {
    if (filter === 'active') return !['rejected', 'converted'].includes(e.status);
    if (filter === 'all') return true;
    return e.status === filter;
  });

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenant Enquiries</h1>
          <p className="text-gray-600">Prospective tenants from website applications</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-[#102a43] text-white px-4 py-2 rounded hover:bg-[#1a3a5c]"
        >
          + Add Enquiry
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {['active', 'new', 'viewing_booked', 'awaiting_response', 'onboarding', 'all'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded text-sm ${filter === f ? 'bg-[#102a43] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            {f === 'active' ? 'Active' : f === 'all' ? 'All' : statusLabels[f] || f}
          </button>
        ))}
      </div>

      {/* Pipeline View */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {['new', 'viewing_booked', 'awaiting_response', 'onboarding'].map(status => {
          const count = enquiries.filter(e => e.status === status).length;
          return (
            <div key={status} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-2">
                <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[status]}`}>
                  {statusLabels[status]}
                </span>
                <span className="text-2xl font-bold text-gray-700">{count}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Enquiries Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Applicant</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Property</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredEnquiries.map(enquiry => (
              <tr key={enquiry.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-900">
                    {enquiry.first_name_1} {enquiry.last_name_1}
                  </div>
                  {enquiry.is_joint_application === 1 && enquiry.first_name_2 && (
                    <div className="text-sm text-gray-500">
                      + {enquiry.first_name_2} {enquiry.last_name_2}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-900">{enquiry.email_1}</div>
                  <div className="text-sm text-gray-500">{enquiry.phone_1}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[enquiry.status]}`}>
                    {statusLabels[enquiry.status]}
                  </span>
                  {enquiry.viewing_date && (
                    <div className="text-xs text-gray-500 mt-1">
                      Viewing: {new Date(enquiry.viewing_date).toLocaleDateString()}
                    </div>
                  )}
                  {enquiry.follow_up_date && (
                    <div className="text-xs text-gray-500 mt-1">
                      Follow-up: {new Date(enquiry.follow_up_date).toLocaleDateString()}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {enquiry.property_address || '-'}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(enquiry.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4">
                  <Link
                    to={`/tenant-enquiries/${enquiry.id}`}
                    className="text-[#102a43] hover:underline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredEnquiries.length === 0 && (
          <div className="text-center py-8 text-gray-500">No enquiries found</div>
        )}
      </div>

      {/* Add Enquiry Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Add Tenant Enquiry</h2>
            <form onSubmit={handleSubmit}>
              <h3 className="font-medium text-gray-700 mb-2">Applicant 1</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <select
                  value={formData.title_1}
                  onChange={e => setFormData({...formData, title_1: e.target.value})}
                  className="border rounded px-3 py-2"
                >
                  <option value="">Title</option>
                  <option value="Mr">Mr</option>
                  <option value="Mrs">Mrs</option>
                  <option value="Miss">Miss</option>
                  <option value="Ms">Ms</option>
                  <option value="Dr">Dr</option>
                </select>
                <input
                  type="text"
                  placeholder="First Name *"
                  value={formData.first_name_1}
                  onChange={e => setFormData({...formData, first_name_1: e.target.value})}
                  className="border rounded px-3 py-2"
                  required
                />
                <input
                  type="text"
                  placeholder="Last Name *"
                  value={formData.last_name_1}
                  onChange={e => setFormData({...formData, last_name_1: e.target.value})}
                  className="border rounded px-3 py-2"
                  required
                />
                <input
                  type="email"
                  placeholder="Email *"
                  value={formData.email_1}
                  onChange={e => setFormData({...formData, email_1: e.target.value})}
                  className="border rounded px-3 py-2"
                  required
                />
                <input
                  type="tel"
                  placeholder="Phone"
                  value={formData.phone_1}
                  onChange={e => setFormData({...formData, phone_1: e.target.value})}
                  className="border rounded px-3 py-2"
                />
                <input
                  type="date"
                  placeholder="Date of Birth"
                  value={formData.date_of_birth_1}
                  onChange={e => setFormData({...formData, date_of_birth_1: e.target.value})}
                  className="border rounded px-3 py-2"
                />
              </div>

              <div className="mb-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_joint_application}
                    onChange={e => setFormData({...formData, is_joint_application: e.target.checked})}
                    className="mr-2"
                  />
                  Joint Application
                </label>
              </div>

              {formData.is_joint_application && (
                <>
                  <h3 className="font-medium text-gray-700 mb-2">Applicant 2</h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <select
                      value={formData.title_2}
                      onChange={e => setFormData({...formData, title_2: e.target.value})}
                      className="border rounded px-3 py-2"
                    >
                      <option value="">Title</option>
                      <option value="Mr">Mr</option>
                      <option value="Mrs">Mrs</option>
                      <option value="Miss">Miss</option>
                      <option value="Ms">Ms</option>
                      <option value="Dr">Dr</option>
                    </select>
                    <input
                      type="text"
                      placeholder="First Name"
                      value={formData.first_name_2}
                      onChange={e => setFormData({...formData, first_name_2: e.target.value})}
                      className="border rounded px-3 py-2"
                    />
                    <input
                      type="text"
                      placeholder="Last Name"
                      value={formData.last_name_2}
                      onChange={e => setFormData({...formData, last_name_2: e.target.value})}
                      className="border rounded px-3 py-2"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={formData.email_2}
                      onChange={e => setFormData({...formData, email_2: e.target.value})}
                      className="border rounded px-3 py-2"
                    />
                    <input
                      type="tel"
                      placeholder="Phone"
                      value={formData.phone_2}
                      onChange={e => setFormData({...formData, phone_2: e.target.value})}
                      className="border rounded px-3 py-2"
                    />
                  </div>
                </>
              )}

              <div className="mb-4">
                <textarea
                  placeholder="Notes"
                  value={formData.notes}
                  onChange={e => setFormData({...formData, notes: e.target.value})}
                  className="border rounded px-3 py-2 w-full"
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#102a43] text-white rounded hover:bg-[#1a3a5c]"
                >
                  Create Enquiry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
