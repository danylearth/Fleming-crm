import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { ArrowLeft, ChevronRight, Save, Calendar, CheckCircle, XCircle, UserPlus, Phone as PhoneIcon, Clock } from 'lucide-react';
import DocumentsSection from '../components/DocumentsSection';

const STATUS_CONFIG: Record<string, { label: string; border: string; text: string }> = {
  new:             { label: 'New',             border: 'border-emerald-300', text: 'text-emerald-700' },
  contacted:       { label: 'Contacted',       border: 'border-violet-300',  text: 'text-violet-700' },
  follow_up:       { label: 'Follow Up',       border: 'border-amber-300',   text: 'text-amber-700' },
  interested:      { label: 'Interested',      border: 'border-sky-300',     text: 'text-sky-700' },
  onboarded:       { label: 'Onboarded',       border: 'border-gray-300',    text: 'text-gray-600' },
  not_interested:  { label: 'Not Interested',  border: 'border-red-300',     text: 'text-red-600' },
};

export default function LandlordBDMDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const [prospect, setProspect] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('details');

  useEffect(() => { loadProspect(); }, [id]);

  const loadProspect = async () => {
    try { setProspect(await api.get(`/api/landlords-bdm/${id}`)); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try { await api.put(`/api/landlords-bdm/${id}`, prospect); }
    catch (err: any) { alert(err.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleStatusChange = async (newStatus: string) => {
    try { await api.put(`/api/landlords-bdm/${id}`, { ...prospect, status: newStatus }); setProspect({ ...prospect, status: newStatus }); }
    catch (err: any) { alert(err.message || 'Failed'); }
  };

  const handleConvert = async () => {
    if (!confirm('Convert this prospect to a full landlord record?')) return;
    try {
      const result = await api.post(`/api/landlords-bdm/${id}/convert`, {});
      navigate(`/landlords/${result.landlord_id}`);
    } catch (err: any) { alert(err.message || 'Failed to convert'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" /></div>;
  if (!prospect) return <div className="p-6 text-center text-gray-500">Prospect not found</div>;

  const config = STATUS_CONFIG[prospect.status] || STATUS_CONFIG.new;
  const initials = prospect.name?.charAt(0)?.toUpperCase() || '?';
  const isActive = !['onboarded', 'not_interested'].includes(prospect.status);
  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200";
  const tabs = [{ id: 'details', label: 'Contact Details' }, { id: 'followup', label: 'Follow Up' }];

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link to="/landlords-bdm" className="flex items-center gap-1 hover:text-gray-900"><ArrowLeft className="w-4 h-4" /> BDM</Link>
          <ChevronRight className="w-3 h-3" /><span className="text-gray-900">{prospect.name}</span>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
            <span className="text-sm font-semibold text-gray-600">{initials}</span>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">{prospect.name}</h1>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full border bg-white ${config.border} ${config.text}`}>{config.label}</span>
            </div>
            <p className="text-sm text-gray-500">{prospect.address || 'No address'}</p>
          </div>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50">
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-gray-200 mb-6">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {activeTab === 'details' && (
            <div className="border border-gray-200 rounded-lg p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Contact Details</h2>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">Name *</label><input type="text" value={prospect.name||''} onChange={e => setProspect({...prospect, name: e.target.value})} className={inputCls} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Email</label><input type="email" value={prospect.email||''} onChange={e => setProspect({...prospect, email: e.target.value})} className={inputCls} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Phone</label><input type="tel" value={prospect.phone||''} onChange={e => setProspect({...prospect, phone: e.target.value})} className={inputCls} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Source</label><input type="text" value={prospect.source||''} onChange={e => setProspect({...prospect, source: e.target.value})} className={inputCls} placeholder="e.g., Referral" /></div>
                <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Address</label><input type="text" value={prospect.address||''} onChange={e => setProspect({...prospect, address: e.target.value})} className={inputCls} /></div>
              </div>
            </div>
          )}

          {activeTab === 'followup' && (
            <div className="border border-gray-200 rounded-lg p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Follow Up</h2>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div><label className="block text-xs text-gray-500 mb-1">Status</label>
                  <select value={prospect.status||'new'} onChange={e => setProspect({...prospect, status: e.target.value})} className={inputCls}>
                    {Object.entries(STATUS_CONFIG).map(([value, cfg]) => <option key={value} value={value}>{cfg.label}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs text-gray-500 mb-1">Follow Up Date</label><input type="date" value={prospect.follow_up_date||''} onChange={e => setProspect({...prospect, follow_up_date: e.target.value})} className={inputCls} /></div>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">Notes</label><textarea value={prospect.notes||''} onChange={e => setProspect({...prospect, notes: e.target.value})} className={inputCls} rows={4} /></div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {isActive && (
            <div className="border border-gray-200 rounded-lg p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Actions</h2>
              <div className="space-y-2">
                {prospect.status === 'new' && (
                  <button onClick={() => handleStatusChange('contacted')} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 border border-gray-200">
                    <PhoneIcon className="w-4 h-4" /> Mark Contacted
                  </button>
                )}
                {['new', 'contacted'].includes(prospect.status) && (
                  <button onClick={() => handleStatusChange('follow_up')} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 border border-gray-200">
                    <Clock className="w-4 h-4" /> Schedule Follow Up
                  </button>
                )}
                {['contacted', 'follow_up'].includes(prospect.status) && (
                  <button onClick={() => handleStatusChange('interested')} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 border border-gray-200">
                    <CheckCircle className="w-4 h-4" /> Mark Interested
                  </button>
                )}
                {prospect.status === 'interested' && (
                  <button onClick={handleConvert} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-white bg-gray-900 hover:bg-gray-800">
                    <UserPlus className="w-4 h-4" /> Convert to Landlord
                  </button>
                )}
                <button onClick={() => handleStatusChange('not_interested')} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 border border-red-200">
                  <XCircle className="w-4 h-4" /> Not Interested
                </button>
              </div>
            </div>
          )}

          <DocumentsSection entityType="landlord_bdm" entityId={parseInt(id!)} />
        </div>
      </div>
    </div>
  );
}
