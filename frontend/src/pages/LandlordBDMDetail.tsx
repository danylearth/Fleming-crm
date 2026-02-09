import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import DocumentsSection from '../components/DocumentsSection';

export default function LandlordBDMDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const [prospect, setProspect] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProspect();
  }, [id]);

  const loadProspect = async () => {
    try {
      const data = await api.get(`/api/landlords-bdm/${id}`);
      setProspect(data);
    } catch (err) {
      console.error('Failed to load prospect:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/api/landlords-bdm/${id}`, prospect);
      alert('Saved successfully');
    } catch (err: any) {
      alert(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await api.put(`/api/landlords-bdm/${id}`, { ...prospect, status: newStatus });
      setProspect({ ...prospect, status: newStatus });
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  };

  const handleConvert = async () => {
    if (!confirm('Convert this prospect to a full landlord record?')) return;
    try {
      const result = await api.post(`/api/landlords-bdm/${id}/convert`, {});
      alert('Prospect converted to landlord successfully');
      navigate(`/landlords/${result.landlord_id}`);
    } catch (err: any) {
      alert(err.message || 'Failed to convert');
    }
  };

  if (loading) return <div className="p-6">Loading...</div>;
  if (!prospect) return <div className="p-6">Prospect not found</div>;

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

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link to="/landlords-bdm" className="text-[#102a43] hover:underline mb-2 inline-block">
            ← Back to BDM
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{prospect.name}</h1>
          <p className="text-gray-600">{prospect.address || 'No address'}</p>
        </div>
        <span className={`px-3 py-1 rounded text-sm font-medium ${statusColors[prospect.status]}`}>
          {statusLabels[prospect.status]}
        </span>
      </div>

      {/* Action Buttons */}
      {prospect.status !== 'onboarded' && prospect.status !== 'not_interested' && (
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <h3 className="font-medium mb-3">Actions</h3>
          <div className="flex flex-wrap gap-2">
            {prospect.status === 'new' && (
              <button
                onClick={() => handleStatusChange('contacted')}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
              >
                Mark Contacted
              </button>
            )}
            {['new', 'contacted'].includes(prospect.status) && (
              <button
                onClick={() => handleStatusChange('follow_up')}
                className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
              >
                Schedule Follow Up
              </button>
            )}
            {['contacted', 'follow_up'].includes(prospect.status) && (
              <button
                onClick={() => handleStatusChange('interested')}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Mark Interested
              </button>
            )}
            {prospect.status === 'interested' && (
              <button
                onClick={handleConvert}
                className="px-4 py-2 bg-[#102a43] text-white rounded hover:bg-[#1a3a5c]"
              >
                Convert to Landlord
              </button>
            )}
            <button
              onClick={() => handleStatusChange('not_interested')}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Not Interested
            </button>
          </div>
        </div>
      )}

      {/* Main Form */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Contact Details</h2>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              value={prospect.name || ''}
              onChange={e => setProspect({...prospect, name: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={prospect.email || ''}
              onChange={e => setProspect({...prospect, email: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              value={prospect.phone || ''}
              onChange={e => setProspect({...prospect, phone: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <input
              type="text"
              value={prospect.source || ''}
              onChange={e => setProspect({...prospect, source: e.target.value})}
              className="w-full border rounded px-3 py-2"
              placeholder="e.g., Referral, Website, Cold call"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input
              type="text"
              value={prospect.address || ''}
              onChange={e => setProspect({...prospect, address: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>

        <h2 className="text-lg font-semibold mb-4">Follow Up</h2>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={prospect.status || 'new'}
              onChange={e => setProspect({...prospect, status: e.target.value})}
              className="w-full border rounded px-3 py-2"
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Follow Up Date</label>
            <input
              type="date"
              value={prospect.follow_up_date || ''}
              onChange={e => setProspect({...prospect, follow_up_date: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={prospect.notes || ''}
            onChange={e => setProspect({...prospect, notes: e.target.value})}
            className="w-full border rounded px-3 py-2"
            rows={4}
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-[#102a43] text-white rounded hover:bg-[#1a3a5c] disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Documents */}
      <DocumentsSection entityType="landlord_bdm" entityId={parseInt(id!)} />
    </div>
  );
}
