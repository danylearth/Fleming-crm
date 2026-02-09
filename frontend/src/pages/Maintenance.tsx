import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { Wrench, Plus, X, AlertTriangle, Clock, CheckCircle2, Search } from 'lucide-react';

interface MaintenanceRequest {
  id: number;
  property_id: number;
  reported_by: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  contractor: string;
  cost: number;
  notes: string;
  address: string;
  landlord_name: string;
  created_at: string;
}

interface Property {
  id: number;
  address: string;
}

export default function Maintenance() {
  const api = useApi();
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [formData, setFormData] = useState({
    property_id: '', reported_by: '', title: '', description: '', priority: 'medium'
  });
  const [editData, setEditData] = useState({
    status: '', contractor: '', cost: '', notes: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [reqs, props] = await Promise.all([
        api.get('/api/maintenance'),
        api.get('/api/properties')
      ]);
      setRequests(reqs);
      setProperties(props);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/maintenance', {
        ...formData,
        property_id: parseInt(formData.property_id)
      });
      setShowModal(false);
      setFormData({ property_id: '', reported_by: '', title: '', description: '', priority: 'medium' });
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdate = async (id: number) => {
    try {
      await api.put(`/api/maintenance/${id}`, {
        ...editData,
        cost: editData.cost ? parseFloat(editData.cost) : null
      });
      setEditingId(null);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const startEdit = (req: MaintenanceRequest) => {
    setEditingId(req.id);
    setEditData({
      status: req.status,
      contractor: req.contractor || '',
      cost: req.cost?.toString() || '',
      notes: req.notes || ''
    });
  };

  const filtered = requests.filter(r => {
    const matchesSearch = r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.address.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || r.status === filter;
    return matchesSearch && matchesFilter;
  });

  const priorityColors: Record<string, string> = {
    low: 'bg-gray-100 text-gray-700',
    medium: 'bg-blue-100 text-blue-700',
    high: 'bg-orange-100 text-orange-700',
    urgent: 'bg-red-100 text-red-700'
  };

  const statusColors: Record<string, string> = {
    open: 'bg-red-50 text-red-700',
    in_progress: 'bg-amber-50 text-amber-700',
    completed: 'bg-green-50 text-green-700',
    closed: 'bg-gray-50 text-gray-600'
  };

  const StatusIcon = ({ status }: { status: string }) => {
    switch (status) {
      case 'open': return <AlertTriangle className="w-4 h-4" />;
      case 'in_progress': return <Clock className="w-4 h-4" />;
      default: return <CheckCircle2 className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-navy-200 border-t-navy-900 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Maintenance</h1>
          <p className="text-gray-500 mt-1">{requests.filter(r => r.status === 'open').length} open requests</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-navy-900 hover:bg-navy-800 text-white font-medium rounded-xl transition-all"
        >
          <Plus className="w-4 h-4" />
          Log Issue
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search maintenance..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
          />
        </div>
        <div className="flex gap-2">
          {['all', 'open', 'in_progress', 'completed'].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                filter === s 
                  ? 'bg-navy-900 text-white' 
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s === 'all' ? 'All' : s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="font-semibold text-navy-900 mb-1">No maintenance requests</h3>
          <p className="text-gray-500 text-sm">All clear! No issues to report.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(req => (
            <div key={req.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              {editingId === req.id ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <select
                        value={editData.status}
                        onChange={e => setEditData({ ...editData, status: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Contractor</label>
                      <input
                        type="text"
                        value={editData.contractor}
                        onChange={e => setEditData({ ...editData, contractor: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cost (£)</label>
                      <input
                        type="number"
                        value={editData.cost}
                        onChange={e => setEditData({ ...editData, cost: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                      <input
                        type="text"
                        value={editData.notes}
                        onChange={e => setEditData({ ...editData, notes: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdate(req.id)}
                      className="px-4 py-2 bg-navy-900 text-white rounded-lg text-sm"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    req.priority === 'urgent' ? 'bg-red-100' :
                    req.priority === 'high' ? 'bg-orange-100' :
                    'bg-gray-100'
                  }`}>
                    <Wrench className={`w-5 h-5 ${
                      req.priority === 'urgent' ? 'text-red-600' :
                      req.priority === 'high' ? 'text-orange-600' :
                      'text-gray-600'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-navy-900">{req.title}</h3>
                        <p className="text-sm text-gray-500 mt-0.5">{req.address}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${priorityColors[req.priority]}`}>
                          {req.priority}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 ${statusColors[req.status]}`}>
                          <StatusIcon status={req.status} />
                          {req.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mt-2">{req.description}</p>
                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                      <span>Reported: {new Date(req.created_at).toLocaleDateString('en-GB')}</span>
                      {req.reported_by && <span>By: {req.reported_by}</span>}
                      {req.contractor && <span>Contractor: {req.contractor}</span>}
                      {req.cost && <span>Cost: £{req.cost}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => startEdit(req)}
                    className="text-sm text-gold-600 hover:text-gold-700 font-medium"
                  >
                    Update
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-navy-900">Log Maintenance Issue</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1.5">Property *</label>
                <select
                  value={formData.property_id}
                  onChange={e => setFormData({ ...formData, property_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                  required
                >
                  <option value="">Select property...</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.address}</option>
                  ))}
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-1.5">Reported By</label>
                  <input
                    type="text"
                    value={formData.reported_by}
                    onChange={e => setFormData({ ...formData, reported_by: e.target.value })}
                    placeholder="Tenant name or 'Inspection'"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-1.5">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={e => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1.5">Issue Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Leaking tap in bathroom"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1.5">Description *</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  placeholder="Describe the issue in detail..."
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                  required
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-navy-900 text-white font-medium rounded-xl hover:bg-navy-800"
                >
                  Log Issue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
