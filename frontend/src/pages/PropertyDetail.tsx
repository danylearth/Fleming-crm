import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { ArrowLeft, Bed, User, UserCheck, Wrench, Edit2, Save, X, Plus, Phone, Mail, AlertTriangle, CheckCircle, Flame, Zap, FileText, ChevronRight } from 'lucide-react';
import DocumentsSection from '../components/DocumentsSection';

interface Landlord { id: number; name: string; }

const STATUS_CONFIG: Record<string, { label: string; border: string; text: string }> = {
  available:   { label: 'Available',   border: 'border-emerald-300', text: 'text-emerald-700' },
  let:         { label: 'Let',         border: 'border-sky-300',     text: 'text-sky-700' },
  maintenance: { label: 'Maintenance', border: 'border-amber-300',   text: 'text-amber-700' },
};

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
  const [activeTab, setActiveTab] = useState('details');

  useEffect(() => { loadData(); }, [id]);

  const loadData = async () => {
    try {
      const [propertyData, allMaintenance, allLandlords] = await Promise.all([
        api.get(`/api/properties/${id}`), api.get('/api/maintenance'), api.get('/api/landlords')
      ]);
      setProperty(propertyData);
      setLandlords(allLandlords);
      setMaintenance(allMaintenance.filter((m: any) => m.property_id === parseInt(id!)));
      setEditForm({ ...propertyData });
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    try { await api.put(`/api/properties/${id}`, editForm); setEditing(false); loadData(); }
    catch (err: any) { alert(err.message); }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    const timestamp = new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const updatedNotes = property?.notes ? `${property.notes}\n\n[${timestamp}]\n${newNote}` : `[${timestamp}]\n${newNote}`;
    try {
      await api.put(`/api/properties/${id}`, { ...editForm, notes: updatedNotes });
      setShowNoteModal(false); setNewNote(''); loadData();
    } catch (err: any) { alert(err.message); }
  };

  const isExpiringSoon = (date: string | null, days: number = 14) => {
    if (!date) return false;
    const diff = (new Date(date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
    return diff <= days && diff >= 0;
  };
  const isExpired = (date: string | null) => { if (!date) return false; return new Date(date) < new Date(); };

  const priorityConfig: Record<string, { border: string; text: string }> = {
    low: { border: 'border-gray-300', text: 'text-gray-600' },
    medium: { border: 'border-sky-300', text: 'text-sky-700' },
    high: { border: 'border-amber-300', text: 'text-amber-700' },
    urgent: { border: 'border-red-300', text: 'text-red-600' },
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" /></div>;
  if (!property) return <div className="p-6 text-center text-gray-500">Property not found</div>;

  const config = STATUS_CONFIG[property.status] || STATUS_CONFIG.available;
  const alerts: { type: string; status: string }[] = [];
  if (isExpired(property.eicr_expiry_date)) alerts.push({ type: 'EICR', status: 'expired' });
  else if (isExpiringSoon(property.eicr_expiry_date)) alerts.push({ type: 'EICR', status: 'expiring' });
  if (isExpired(property.epc_expiry_date)) alerts.push({ type: 'EPC', status: 'expired' });
  else if (isExpiringSoon(property.epc_expiry_date)) alerts.push({ type: 'EPC', status: 'expiring' });
  if (property.has_gas && isExpired(property.gas_safety_expiry_date)) alerts.push({ type: 'Gas Safety', status: 'expired' });
  else if (property.has_gas && isExpiringSoon(property.gas_safety_expiry_date)) alerts.push({ type: 'Gas Safety', status: 'expiring' });
  if (property.has_end_date && isExpiringSoon(property.tenancy_end_date, 30)) alerts.push({ type: 'Tenancy End', status: 'expiring' });

  const tabs = [
    { id: 'details', label: 'Details' },
    { id: 'compliance', label: 'Compliance' },
    { id: 'maintenance', label: 'Maintenance' },
  ];

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200";

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link to="/properties" className="flex items-center gap-1 hover:text-gray-900"><ArrowLeft className="w-4 h-4" /> Properties</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-900">{property.address}</span>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
            <span className="text-sm font-semibold text-gray-600">{property.address?.charAt(0)}</span>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">{property.address}</h1>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full border bg-white ${config.border} ${config.text}`}>{config.label}</span>
            </div>
            <p className="text-sm text-gray-500">{property.postcode} • {property.property_type} • {property.bedrooms} bed</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editing ? (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
              <Edit2 className="w-4 h-4" /> Edit
            </button>
          ) : (
            <>
              <button onClick={() => { setEditing(false); setEditForm({ ...property }); }} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                <X className="w-4 h-4" /> Cancel
              </button>
              <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800">
                <Save className="w-4 h-4" /> Save
              </button>
            </>
          )}
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg mb-6 bg-gray-50">
          <AlertTriangle className="w-5 h-5 text-gray-500" />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700">Compliance Alerts</p>
            <div className="flex flex-wrap gap-2 mt-1">
              {alerts.map((a, i) => (
                <span key={i} className={`text-xs font-medium px-2.5 py-1 rounded-full border bg-white ${a.status === 'expired' ? 'border-red-300 text-red-600' : 'border-amber-300 text-amber-700'}`}>
                  {a.type} {a.status === 'expired' ? 'EXPIRED' : 'expiring soon'}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-gray-200 mb-6">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {activeTab === 'details' && (
            <>
              {/* Property Details */}
              <div className="border border-gray-200 rounded-lg p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Property Details</h2>
                {editing ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-xs text-gray-500 mb-1">Address</label><input type="text" value={editForm.address||''} onChange={e => setEditForm({...editForm, address: e.target.value})} className={inputCls} /></div>
                      <div><label className="block text-xs text-gray-500 mb-1">Postcode</label><input type="text" value={editForm.postcode||''} onChange={e => setEditForm({...editForm, postcode: e.target.value})} className={inputCls} /></div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div><label className="block text-xs text-gray-500 mb-1">Type</label><select value={editForm.property_type||''} onChange={e => setEditForm({...editForm, property_type: e.target.value})} className={inputCls}><option value="house">House</option><option value="flat">Flat</option><option value="bungalow">Bungalow</option><option value="studio">Studio</option></select></div>
                      <div><label className="block text-xs text-gray-500 mb-1">Bedrooms</label><input type="number" value={editForm.bedrooms||''} onChange={e => setEditForm({...editForm, bedrooms: parseInt(e.target.value)})} className={inputCls} /></div>
                      <div><label className="block text-xs text-gray-500 mb-1">Status</label><select value={editForm.status||''} onChange={e => setEditForm({...editForm, status: e.target.value})} className={inputCls}><option value="available">Available</option><option value="let">Let</option><option value="maintenance">Maintenance</option></select></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-xs text-gray-500 mb-1">Landlord</label><select value={editForm.landlord_id||''} onChange={e => setEditForm({...editForm, landlord_id: e.target.value})} className={inputCls}>{landlords.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
                      <div><label className="block text-xs text-gray-500 mb-1">Council Tax Band</label><select value={editForm.council_tax_band||''} onChange={e => setEditForm({...editForm, council_tax_band: e.target.value})} className={inputCls}><option value="">-</option>{['A','B','C','D','E','F','G','H'].map(b => <option key={b} value={b}>Band {b}</option>)}</select></div>
                    </div>
                    <div className="border-t border-gray-100 pt-3">
                      <label className="flex items-center gap-2 mb-3"><input type="checkbox" checked={editForm.is_leasehold===1} onChange={e => setEditForm({...editForm, is_leasehold: e.target.checked?1:0})} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" /><span className="text-sm">Leasehold Property</span></label>
                      {editForm.is_leasehold===1 && (
                        <div className="grid grid-cols-2 gap-3 ml-6">
                          <div><label className="block text-xs text-gray-500 mb-1">Lease Start</label><input type="date" value={editForm.leasehold_start_date||''} onChange={e => setEditForm({...editForm, leasehold_start_date: e.target.value})} className={inputCls} /></div>
                          <div><label className="block text-xs text-gray-500 mb-1">Lease End</label><input type="date" value={editForm.leasehold_end_date||''} onChange={e => setEditForm({...editForm, leasehold_end_date: e.target.value})} className={inputCls} /></div>
                          <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Leaseholder Info</label><input type="text" value={editForm.leaseholder_info||''} onChange={e => setEditForm({...editForm, leaseholder_info: e.target.value})} className={inputCls} /></div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Type', value: property.property_type },
                      { label: 'Bedrooms', value: property.bedrooms },
                      { label: 'Council Tax', value: property.council_tax_band ? `Band ${property.council_tax_band}` : '-' },
                      { label: 'Tenure', value: property.is_leasehold ? 'Leasehold' : 'Freehold' },
                    ].map(item => (
                      <div key={item.label} className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{item.label}</p>
                        <p className="text-sm font-semibold text-gray-900 capitalize">{item.value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Service & Rent */}
              <div className="border border-gray-200 rounded-lg p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Service & Rent</h2>
                {editing ? (
                  <div className="space-y-3">
                    <div><label className="block text-xs text-gray-500 mb-1">Service Type</label><select value={editForm.service_type||''} onChange={e => setEditForm({...editForm, service_type: e.target.value})} className={inputCls}><option value="">-</option><option value="rent_collection">Rent Collection</option><option value="let_only">Let Only</option><option value="full_management">Full Management</option></select></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-xs text-gray-500 mb-1">Monthly Rent (£)</label><input type="number" value={editForm.rent_amount||''} onChange={e => setEditForm({...editForm, rent_amount: parseFloat(e.target.value)})} className={inputCls} /></div>
                      {(editForm.service_type==='rent_collection'||editForm.service_type==='full_management') && <div><label className="block text-xs text-gray-500 mb-1">Charge %</label><input type="number" value={editForm.charge_percentage||''} onChange={e => setEditForm({...editForm, charge_percentage: parseFloat(e.target.value)})} className={inputCls} /></div>}
                      {editForm.service_type==='let_only' && <div><label className="block text-xs text-gray-500 mb-1">Total Charge (£)</label><input type="number" value={editForm.total_charge||''} onChange={e => setEditForm({...editForm, total_charge: parseFloat(e.target.value)})} className={inputCls} /></div>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-xs text-gray-500 mb-1">Tenancy Start</label><input type="date" value={editForm.tenancy_start_date||''} onChange={e => setEditForm({...editForm, tenancy_start_date: e.target.value})} className={inputCls} /></div>
                      <div><label className="block text-xs text-gray-500 mb-1">Tenancy Type</label><select value={editForm.tenancy_type||''} onChange={e => setEditForm({...editForm, tenancy_type: e.target.value})} className={inputCls}><option value="">-</option><option value="AST">AST</option><option value="HMO">HMO</option><option value="Rolling">Rolling</option><option value="Other">Other</option></select></div>
                    </div>
                    <div>
                      <label className="flex items-center gap-2 mb-2"><input type="checkbox" checked={editForm.has_end_date===1} onChange={e => setEditForm({...editForm, has_end_date: e.target.checked?1:0})} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" /><span className="text-sm">Has End Date</span></label>
                      {editForm.has_end_date===1 && <input type="date" value={editForm.tenancy_end_date||''} onChange={e => setEditForm({...editForm, tenancy_end_date: e.target.value})} className={inputCls} />}
                    </div>
                    <div><label className="block text-xs text-gray-500 mb-1">Rent Review Date</label><input type="date" value={editForm.rent_review_date||''} onChange={e => setEditForm({...editForm, rent_review_date: e.target.value})} className={inputCls} /></div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between"><span className="text-sm text-gray-500">Monthly Rent</span><span className="text-lg font-bold text-gray-900">£{property.rent_amount}</span></div>
                    {property.service_type && <div className="flex items-center justify-between"><span className="text-sm text-gray-500">Service Type</span><span className="text-sm font-medium text-gray-900 capitalize">{property.service_type.replace(/_/g,' ')}</span></div>}
                    {property.charge_percentage && <div className="flex items-center justify-between"><span className="text-sm text-gray-500">Commission</span><span className="text-sm font-medium text-gray-900">{property.charge_percentage}%</span></div>}
                    {property.tenancy_start_date && <div className="flex items-center justify-between"><span className="text-sm text-gray-500">Tenancy Start</span><span className="text-sm font-medium text-gray-900">{new Date(property.tenancy_start_date).toLocaleDateString('en-GB')}</span></div>}
                    {property.has_end_date && property.tenancy_end_date && <div className="flex items-center justify-between"><span className="text-sm text-gray-500">Tenancy End</span><span className="text-sm font-medium text-gray-900">{new Date(property.tenancy_end_date).toLocaleDateString('en-GB')}</span></div>}
                  </div>
                )}
              </div>

              {/* Landlord */}
              <div className="border border-gray-200 rounded-lg p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Landlord</h2>
                <Link to={`/landlords/${property.landlord_id}`} className="flex items-center gap-4 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                    <UserCheck className="w-5 h-5 text-gray-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">{property.landlord_name}</p>
                    <div className="flex gap-4 text-xs text-gray-400">
                      {property.landlord_phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{property.landlord_phone}</span>}
                      {property.landlord_email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{property.landlord_email}</span>}
                    </div>
                  </div>
                </Link>
              </div>

              {/* Current Tenant */}
              {property.current_tenant && (
                <div className="border border-gray-200 rounded-lg p-5">
                  <h2 className="text-sm font-semibold text-gray-900 mb-4">Current Tenant</h2>
                  <Link to={`/tenants/${property.current_tenant_id}`} className="flex items-center gap-4 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center"><User className="w-5 h-5 text-gray-600" /></div>
                    <div><p className="text-sm font-semibold text-gray-900">{property.current_tenant}</p><p className="text-xs text-gray-400">Active tenancy</p></div>
                  </Link>
                </div>
              )}
            </>
          )}

          {activeTab === 'compliance' && (
            <div className="border border-gray-200 rounded-lg p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Compliance</h2>
              {editing ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs text-gray-500 mb-1">EICR Expiry</label><input type="date" value={editForm.eicr_expiry_date||''} onChange={e => setEditForm({...editForm, eicr_expiry_date: e.target.value})} className={inputCls} /></div>
                    <div><label className="block text-xs text-gray-500 mb-1">EPC Grade</label><select value={editForm.epc_grade||''} onChange={e => setEditForm({...editForm, epc_grade: e.target.value})} className={inputCls}><option value="">-</option>{['A','B','C','D','E','F','G','None'].map(g => <option key={g} value={g}>{g}</option>)}</select></div>
                  </div>
                  <div><label className="block text-xs text-gray-500 mb-1">EPC Expiry</label><input type="date" value={editForm.epc_expiry_date||''} onChange={e => setEditForm({...editForm, epc_expiry_date: e.target.value})} className={inputCls} /></div>
                  <div className="border-t border-gray-100 pt-3">
                    <label className="flex items-center gap-2 mb-3"><input type="checkbox" checked={editForm.has_gas===1} onChange={e => setEditForm({...editForm, has_gas: e.target.checked?1:0})} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" /><span className="text-sm">Gas Connection</span></label>
                    {editForm.has_gas===1 && <div><label className="block text-xs text-gray-500 mb-1">Gas Safety Expiry</label><input type="date" value={editForm.gas_safety_expiry_date||''} onChange={e => setEditForm({...editForm, gas_safety_expiry_date: e.target.value})} className={inputCls} /></div>}
                  </div>
                  <div className="border-t border-gray-100 pt-3">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={editForm.proof_of_ownership_received===1} onChange={e => setEditForm({...editForm, proof_of_ownership_received: e.target.checked?1:0})} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" /><span className="text-sm">Proof of Ownership Received</span></label>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {[
                    { icon: Zap, label: 'EICR', date: property.eicr_expiry_date },
                    { icon: FileText, label: 'EPC', date: property.epc_expiry_date, extra: property.epc_grade ? `Grade ${property.epc_grade}` : null },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2"><item.icon className="w-4 h-4 text-gray-400" /><span className="text-sm text-gray-700">{item.label}</span></div>
                      <div className="flex items-center gap-2">
                        {item.extra && <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{item.extra}</span>}
                        {item.date ? (
                          <span className={`text-sm font-medium ${isExpired(item.date) ? 'text-red-600' : isExpiringSoon(item.date) ? 'text-amber-600' : 'text-gray-900'}`}>
                            {isExpired(item.date) ? 'EXPIRED' : new Date(item.date).toLocaleDateString('en-GB')}
                          </span>
                        ) : <span className="text-sm text-gray-300">Not set</span>}
                      </div>
                    </div>
                  ))}
                  {property.has_gas ? (
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2"><Flame className="w-4 h-4 text-gray-400" /><span className="text-sm text-gray-700">Gas Safety</span></div>
                      {property.gas_safety_expiry_date ? (
                        <span className={`text-sm font-medium ${isExpired(property.gas_safety_expiry_date) ? 'text-red-600' : isExpiringSoon(property.gas_safety_expiry_date) ? 'text-amber-600' : 'text-gray-900'}`}>
                          {isExpired(property.gas_safety_expiry_date) ? 'EXPIRED' : new Date(property.gas_safety_expiry_date).toLocaleDateString('en-GB')}
                        </span>
                      ) : <span className="text-sm text-gray-300">Not set</span>}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2"><Flame className="w-4 h-4 text-gray-300" /><span className="text-sm text-gray-400">No Gas</span></div>
                    </div>
                  )}
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-700">Proof of Ownership</span>
                    {property.proof_of_ownership_received ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <span className="text-sm text-gray-300">Not received</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'maintenance' && (
            <div className="border border-gray-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900">Maintenance History</h2>
                <Link to="/maintenance" className="text-xs text-gray-500 hover:text-gray-900">View all →</Link>
              </div>
              {maintenance.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">No maintenance requests</p>
              ) : (
                <div className="space-y-2">
                  {maintenance.slice(0, 5).map(m => {
                    const pc = priorityConfig[m.priority] || priorityConfig.low;
                    return (
                      <div key={m.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Wrench className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-900">{m.title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full border bg-white ${pc.border} ${pc.text}`}>{m.priority}</span>
                          <span className="text-xs text-gray-400">{m.status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <div className="border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Notes</h2>
              <button onClick={() => setShowNoteModal(true)} className="text-xs text-gray-500 hover:text-gray-900 font-medium">+ Add</button>
            </div>
            {editing ? (
              <textarea value={editForm.notes||''} onChange={e => setEditForm({...editForm, notes: e.target.value})} rows={6}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
            ) : property.notes ? (
              <div className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto">{property.notes}</div>
            ) : (
              <p className="text-sm text-gray-400">No notes yet</p>
            )}
          </div>

          <DocumentsSection entityType="property" entityId={parseInt(id!)} title="Documents & Certificates" />
        </div>
      </div>

      {/* Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowNoteModal(false)}>
          <div className="bg-white rounded-lg w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Add Note</h2>
              <button onClick={() => setShowNoteModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5">
              <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Enter your note..." rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 mb-4" autoFocus />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowNoteModal(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                <button onClick={addNote} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">Add Note</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
