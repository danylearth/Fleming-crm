import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';

interface LandlordBDM {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  status: string;
  follow_up_date?: string;
  source?: string;
  notes?: string;
  created_at: string;
}

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-purple-100 text-purple-800',
  follow_up: 'bg-yellow-100 text-yellow-800',
  interested: 'bg-green-100 text-green-800',
  onboarded: 'bg-gray-100 text-gray-800',
  not_interested: 'bg-red-100 text-red-800',
};

const statusLabels: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  follow_up: 'Follow Up',
  interested: 'Interested',
  onboarded: 'Onboarded',
  not_interested: 'Not Interested',
};

export default function LandlordsBDM() {
  const api = useApi();
  const [prospects, setProspects] = useState<LandlordBDM[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('active');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', address: '', source: '', notes: ''
  });

  useEffect(() => {
    loadProspects();
  }, []);

  const loadProspects = async () => {
    try {
      const data = await api.get('/landlords-bdm');
      setProspects(data);
    } catch (err) {
      console.error('Failed to load prospects:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/landlords-bdm', formData);
      setShowForm(false);
      setFormData({ name: '', email: '', phone: '', address: '', source: '', notes: '' });
      loadProspects();
    } catch (err: any) {
      alert(err.message || 'Failed to create prospect');
    }
  };

  const filteredProspects = prospects.filter(p => {
    if (filter === 'active') return !['onboarded', 'not_interested'].includes(p.status);
    if (filter === 'all') return true;
    return p.status === filter;
  });

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Landlords BDM</h1>
          <p className="text-gray-600">Business development - prospective landlords</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-[#102a43] text-white px-4 py-2 rounded hover:bg-[#1a3a5c]"
        >
          + Add Prospect
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {['active', 'new', 'contacted', 'follow_up', 'interested', 'all'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded text-sm ${filter === f ? 'bg-[#102a43] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            {f === 'active' ? 'Active' : f === 'all' ? 'All' : statusLabels[f] || f}
          </button>
        ))}
      </div>

      {/* Pipeline Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {['new', 'contacted', 'follow_up', 'interested'].map(status => {
          const count = prospects.filter(p => p.status === status).length;
          return (
            <div key={status} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[status]}`}>
                  {statusLabels[status]}
                </span>
                <span className="text-2xl font-bold text-gray-700">{count}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Prospects Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Follow Up</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredProspects.map(prospect => (
              <tr key={prospect.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-900">{prospect.name}</div>
                  {prospect.address && (
                    <div className="text-sm text-gray-500">{prospect.address}</div>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-900">{prospect.email}</div>
                  <div className="text-sm text-gray-500">{prospect.phone}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[prospect.status]}`}>
                    {statusLabels[prospect.status]}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {prospect.source || '-'}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {prospect.follow_up_date ? (
                    <span className={new Date(prospect.follow_up_date) <= new Date() ? 'text-red-600 font-medium' : ''}>
                      {new Date(prospect.follow_up_date).toLocaleDateString()}
                    </span>
                  ) : '-'}
                </td>
                <td className="px-6 py-4">
                  <Link
                    to={`/landlords-bdm/${prospect.id}`}
                    className="text-[#102a43] hover:underline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredProspects.length === 0 && (
          <div className="text-center py-8 text-gray-500">No prospects found</div>
        )}
      </div>

      {/* Add Prospect Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Add Prospect</h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={e => setFormData({...formData, phone: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={e => setFormData({...formData, address: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                  <input
                    type="text"
                    value={formData.source}
                    onChange={e => setFormData({...formData, source: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                    placeholder="e.g., Referral, Website, Cold call"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={e => setFormData({...formData, notes: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                    rows={3}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
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
                  Add Prospect
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
