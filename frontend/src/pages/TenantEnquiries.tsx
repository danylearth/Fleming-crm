import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { UserPlus, Calendar, Clock, CheckCircle, XCircle, Search, Filter, Users } from 'lucide-react';

interface TenantEnquiry {
  id: number;
  title_1: string;
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
  linked_property_id?: number;
  property_address?: string;
  created_at: string;
  kyc_completed_1: number;
  kyc_completed_2: number;
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: any }> = {
  new: { label: 'New', color: 'text-blue-700', bgColor: 'bg-blue-50 border-blue-200', icon: UserPlus },
  viewing_booked: { label: 'Viewing Booked', color: 'text-purple-700', bgColor: 'bg-purple-50 border-purple-200', icon: Calendar },
  awaiting_response: { label: 'Awaiting Response', color: 'text-amber-700', bgColor: 'bg-amber-50 border-amber-200', icon: Clock },
  onboarding: { label: 'Onboarding', color: 'text-green-700', bgColor: 'bg-green-50 border-green-200', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'text-red-700', bgColor: 'bg-red-50 border-red-200', icon: XCircle },
  converted: { label: 'Converted', color: 'text-gray-700', bgColor: 'bg-gray-50 border-gray-200', icon: Users },
};

export default function TenantEnquiries() {
  const api = useApi();
  const [enquiries, setEnquiries] = useState<TenantEnquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'queue' | 'all' | 'archived'>('queue');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title_1: '', first_name_1: '', last_name_1: '', email_1: '', phone_1: '',
    date_of_birth_1: '', current_address_1: '', employment_status_1: '', employer_1: '', income_1: '',
    is_joint_application: false,
    title_2: '', first_name_2: '', last_name_2: '', email_2: '', phone_2: '',
    date_of_birth_2: '', current_address_2: '', employment_status_2: '', employer_2: '', income_2: '',
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
        date_of_birth_2: '', current_address_2: '', employment_status_2: '', employer_2: '', income_2: '',
        notes: ''
      });
      loadEnquiries();
    } catch (err: any) {
      alert(err.message || 'Failed to create enquiry');
    }
  };

  // Get today's date for comparison
  const today = new Date().toISOString().split('T')[0];

  // Filter logic for workflow queue
  const getQueueEnquiries = () => {
    return enquiries.filter(e => {
      // Excluded statuses
      if (['rejected', 'converted'].includes(e.status)) return false;
      
      // New enquiries always show
      if (e.status === 'new') return true;
      
      // Onboarding always shows (unless has future follow-up)
      if (e.status === 'onboarding') {
        if (e.follow_up_date && e.follow_up_date > today) return false;
        return true;
      }
      
      // Viewing booked - show on/after viewing date
      if (e.status === 'viewing_booked') {
        if (!e.viewing_date) return true;
        return e.viewing_date <= today;
      }
      
      // Awaiting response - show on/after follow-up date
      if (e.status === 'awaiting_response') {
        if (!e.follow_up_date) return true;
        return e.follow_up_date <= today;
      }
      
      return true;
    });
  };

  const getArchivedEnquiries = () => {
    return enquiries.filter(e => e.status === 'rejected');
  };

  const filteredEnquiries = (() => {
    let list: TenantEnquiry[];
    
    if (view === 'queue') {
      list = getQueueEnquiries();
    } else if (view === 'archived') {
      list = getArchivedEnquiries();
    } else {
      list = enquiries;
    }
    
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(e => 
        e.first_name_1?.toLowerCase().includes(s) ||
        e.last_name_1?.toLowerCase().includes(s) ||
        e.email_1?.toLowerCase().includes(s) ||
        e.phone_1?.includes(s)
      );
    }
    
    return list;
  })();

  // Pipeline counts for queue view
  const pipelineCounts = {
    new: getQueueEnquiries().filter(e => e.status === 'new').length,
    viewing_booked: getQueueEnquiries().filter(e => e.status === 'viewing_booked').length,
    awaiting_response: getQueueEnquiries().filter(e => e.status === 'awaiting_response').length,
    onboarding: getQueueEnquiries().filter(e => e.status === 'onboarding').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-navy-200 border-t-navy-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Tenant Enquiries</h1>
          <p className="text-gray-500">Prospective tenants from website applications</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-navy-600 hover:bg-navy-700 text-white font-medium rounded-xl transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Add Enquiry
        </button>
      </div>

      {/* View Toggle & Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setView('queue')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === 'queue' ? 'bg-white text-navy-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Work Queue ({getQueueEnquiries().length})
          </button>
          <button
            onClick={() => setView('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === 'all' ? 'bg-white text-navy-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            All ({enquiries.length})
          </button>
          <button
            onClick={() => setView('archived')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === 'archived' ? 'bg-white text-navy-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Archived ({getArchivedEnquiries().length})
          </button>
        </div>
        
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-navy-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Pipeline Cards (only in queue view) */}
      {view === 'queue' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {(['new', 'viewing_booked', 'awaiting_response', 'onboarding'] as const).map(status => {
            const config = statusConfig[status];
            const Icon = config.icon;
            const count = pipelineCounts[status];
            
            return (
              <div
                key={status}
                className={`bg-white rounded-2xl border ${config.bgColor} p-4`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${config.bgColor} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${config.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-navy-900">{count}</p>
                    <p className="text-sm text-gray-500">{config.label}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Enquiries List */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {filteredEnquiries.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="font-semibold text-navy-900 mb-1">No enquiries found</h3>
            <p className="text-gray-500 text-sm">
              {view === 'queue' ? 'No enquiries require attention right now' : 'No matching enquiries'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredEnquiries.map(enquiry => {
              const config = statusConfig[enquiry.status];
              const Icon = config.icon;
              
              return (
                <Link
                  key={enquiry.id}
                  to={`/tenant-enquiries/${enquiry.id}`}
                  className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className={`w-10 h-10 rounded-xl ${config.bgColor} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${config.color}`} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-navy-900">
                        {enquiry.title_1} {enquiry.first_name_1} {enquiry.last_name_1}
                      </p>
                      {enquiry.is_joint_application === 1 && enquiry.first_name_2 && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          Joint
                        </span>
                      )}
                      {enquiry.kyc_completed_1 === 1 && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                          KYC ✓
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-500">
                      <span>{enquiry.email_1}</span>
                      <span>•</span>
                      <span>{enquiry.phone_1}</span>
                    </div>
                  </div>
                  
                  <div className="text-right flex-shrink-0">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}>
                      {config.label}
                    </span>
                    {enquiry.viewing_date && enquiry.status === 'viewing_booked' && (
                      <p className="text-xs text-gray-500 mt-1">
                        Viewing: {new Date(enquiry.viewing_date).toLocaleDateString('en-GB')}
                      </p>
                    )}
                    {enquiry.follow_up_date && ['awaiting_response', 'onboarding'].includes(enquiry.status) && (
                      <p className="text-xs text-gray-500 mt-1">
                        Follow-up: {new Date(enquiry.follow_up_date).toLocaleDateString('en-GB')}
                      </p>
                    )}
                    {enquiry.property_address && (
                      <p className="text-xs text-gray-500 mt-1 truncate max-w-[200px]">
                        {enquiry.property_address}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Enquiry Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-navy-900">Add Tenant Enquiry</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6">
              {/* Applicant 1 */}
              <div className="mb-6">
                <h3 className="font-semibold text-navy-900 mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 bg-navy-100 text-navy-700 rounded-full text-sm flex items-center justify-center">1</span>
                  Primary Applicant
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <select
                    value={formData.title_1}
                    onChange={e => setFormData({...formData, title_1: e.target.value})}
                    className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500"
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
                    className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Last Name *"
                    value={formData.last_name_1}
                    onChange={e => setFormData({...formData, last_name_1: e.target.value})}
                    className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500"
                    required
                  />
                  <input
                    type="email"
                    placeholder="Email *"
                    value={formData.email_1}
                    onChange={e => setFormData({...formData, email_1: e.target.value})}
                    className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500"
                    required
                  />
                  <input
                    type="tel"
                    placeholder="Phone *"
                    value={formData.phone_1}
                    onChange={e => setFormData({...formData, phone_1: e.target.value})}
                    className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500"
                    required
                  />
                  <input
                    type="date"
                    placeholder="Date of Birth"
                    value={formData.date_of_birth_1}
                    onChange={e => setFormData({...formData, date_of_birth_1: e.target.value})}
                    className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500"
                  />
                  <input
                    type="text"
                    placeholder="Current Address"
                    value={formData.current_address_1}
                    onChange={e => setFormData({...formData, current_address_1: e.target.value})}
                    className="col-span-2 md:col-span-3 border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500"
                  />
                  <select
                    value={formData.employment_status_1}
                    onChange={e => setFormData({...formData, employment_status_1: e.target.value})}
                    className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500"
                  >
                    <option value="">Employment Status</option>
                    <option value="Employed">Employed</option>
                    <option value="Self-Employed">Self-Employed</option>
                    <option value="Unemployed">Unemployed</option>
                    <option value="Student">Student</option>
                    <option value="Retired">Retired</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Employer"
                    value={formData.employer_1}
                    onChange={e => setFormData({...formData, employer_1: e.target.value})}
                    className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500"
                  />
                  <input
                    type="number"
                    placeholder="Annual Income (£)"
                    value={formData.income_1}
                    onChange={e => setFormData({...formData, income_1: e.target.value})}
                    className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500"
                  />
                </div>
              </div>

              {/* Joint Application Toggle */}
              <div className="mb-6">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_joint_application}
                    onChange={e => setFormData({...formData, is_joint_application: e.target.checked})}
                    className="w-5 h-5 rounded border-gray-300 text-navy-600 focus:ring-navy-500"
                  />
                  <span className="font-medium text-navy-900">Joint Application</span>
                </label>
              </div>

              {/* Applicant 2 */}
              {formData.is_joint_application && (
                <div className="mb-6">
                  <h3 className="font-semibold text-navy-900 mb-4 flex items-center gap-2">
                    <span className="w-6 h-6 bg-navy-100 text-navy-700 rounded-full text-sm flex items-center justify-center">2</span>
                    Second Applicant
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <select
                      value={formData.title_2}
                      onChange={e => setFormData({...formData, title_2: e.target.value})}
                      className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500"
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
                      className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500"
                    />
                    <input
                      type="text"
                      placeholder="Last Name"
                      value={formData.last_name_2}
                      onChange={e => setFormData({...formData, last_name_2: e.target.value})}
                      className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={formData.email_2}
                      onChange={e => setFormData({...formData, email_2: e.target.value})}
                      className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500"
                    />
                    <input
                      type="tel"
                      placeholder="Phone"
                      value={formData.phone_2}
                      onChange={e => setFormData({...formData, phone_2: e.target.value})}
                      className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500"
                    />
                    <input
                      type="date"
                      placeholder="Date of Birth"
                      value={formData.date_of_birth_2}
                      onChange={e => setFormData({...formData, date_of_birth_2: e.target.value})}
                      className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500"
                    />
                    <input
                      type="text"
                      placeholder="Current Address"
                      value={formData.current_address_2}
                      onChange={e => setFormData({...formData, current_address_2: e.target.value})}
                      className="col-span-2 md:col-span-3 border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500"
                    />
                    <select
                      value={formData.employment_status_2}
                      onChange={e => setFormData({...formData, employment_status_2: e.target.value})}
                      className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500"
                    >
                      <option value="">Employment Status</option>
                      <option value="Employed">Employed</option>
                      <option value="Self-Employed">Self-Employed</option>
                      <option value="Unemployed">Unemployed</option>
                      <option value="Student">Student</option>
                      <option value="Retired">Retired</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Employer"
                      value={formData.employer_2}
                      onChange={e => setFormData({...formData, employer_2: e.target.value})}
                      className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500"
                    />
                    <input
                      type="number"
                      placeholder="Annual Income (£)"
                      value={formData.income_2}
                      onChange={e => setFormData({...formData, income_2: e.target.value})}
                      className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500"
                    />
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="mb-6">
                <textarea
                  placeholder="Notes"
                  value={formData.notes}
                  onChange={e => setFormData({...formData, notes: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-navy-500"
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-6 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-navy-600 text-white rounded-xl hover:bg-navy-700 font-medium"
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
