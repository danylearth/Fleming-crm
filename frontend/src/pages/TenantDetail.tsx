import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { ArrowLeft, Mail, Phone, AlertCircle, Home, Edit2, Save, X, Plus, CheckCircle, XCircle, User, ChevronRight } from 'lucide-react';
import DocumentsSection from '../components/DocumentsSection';

interface Property { id: number; address: string; rent_amount: number; }

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
  const [activeTab, setActiveTab] = useState('applicant');

  useEffect(() => { loadData(); }, [id]);

  const loadData = async () => {
    try {
      const [tenantData, allProperties] = await Promise.all([api.get(`/api/tenants/${id}`), api.get('/api/properties')]);
      setTenant(tenantData); setProperties(allProperties); setEditForm({ ...tenantData });
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    try { await api.put(`/api/tenants/${id}`, editForm); setEditing(false); loadData(); }
    catch (err: any) { alert(err.message); }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    const timestamp = new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const updatedNotes = tenant?.notes ? `${tenant.notes}\n\n[${timestamp}]\n${newNote}` : `[${timestamp}]\n${newNote}`;
    try {
      await api.put(`/api/tenants/${id}`, { ...editForm, notes: updatedNotes });
      setShowNoteModal(false); setNewNote(''); loadData();
    } catch (err: any) { alert(err.message); }
  };

  const calculateCompletion = () => {
    if (!tenant) return 0;
    const checks = [
      tenant.holding_deposit_received, tenant.application_forms_completed, tenant.kyc_completed_1,
      tenant.nok_name, tenant.property_id, tenant.tenancy_start_date,
      !tenant.guarantor_required || tenant.guarantor_kyc_completed,
      !tenant.guarantor_required || tenant.guarantor_deed_received,
      !tenant.is_joint_tenancy || tenant.kyc_completed_2,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" /></div>;
  if (!tenant) return <div className="text-center py-12 text-gray-500">Tenant not found</div>;

  const completion = calculateCompletion();
  const initials = tenant.name?.charAt(0)?.toUpperCase() || '?';
  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200";
  const tabs = [
    { id: 'applicant', label: 'Applicant Info' },
    { id: 'tenancy', label: 'Tenancy' },
    { id: 'guarantor', label: 'Guarantor' },
  ];

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link to="/tenants" className="flex items-center gap-1 hover:text-gray-900"><ArrowLeft className="w-4 h-4" /> Tenants</Link>
          <ChevronRight className="w-3 h-3" /><span className="text-gray-900">{tenant.name}</span>
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
              <h1 className="text-xl font-bold text-gray-900">{tenant.name}</h1>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full border bg-white ${completion === 100 ? 'border-emerald-300 text-emerald-700' : 'border-amber-300 text-amber-700'}`}>
                {completion}% Complete
              </span>
            </div>
            <p className="text-sm text-gray-500">Tenant{tenant.property_address ? ` • ${tenant.property_address}` : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editing ? (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
              <Edit2 className="w-4 h-4" /> Edit
            </button>
          ) : (
            <>
              <button onClick={() => { setEditing(false); setEditForm({...tenant}); }} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"><X className="w-4 h-4" /> Cancel</button>
              <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800"><Save className="w-4 h-4" /> Save</button>
            </>
          )}
        </div>
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
          {activeTab === 'applicant' && (
            <>
              {/* Applicant 1 */}
              <div className="border border-gray-200 rounded-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-900">Applicant 1</h2>
                  {tenant.kyc_completed_1 ? (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-emerald-300 text-emerald-700 bg-white">KYC ✓</span>
                  ) : (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-red-300 text-red-600 bg-white">KYC Pending</span>
                  )}
                </div>
                {editing ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div><label className="block text-xs text-gray-500 mb-1">Title</label><select value={editForm.title_1||''} onChange={e => setEditForm({...editForm, title_1: e.target.value})} className={inputCls}><option value="">-</option><option value="Mr">Mr</option><option value="Mrs">Mrs</option><option value="Miss">Miss</option><option value="Ms">Ms</option><option value="Dr">Dr</option></select></div>
                      <div><label className="block text-xs text-gray-500 mb-1">First Name</label><input type="text" value={editForm.first_name_1||''} onChange={e => setEditForm({...editForm, first_name_1: e.target.value})} className={inputCls} /></div>
                      <div><label className="block text-xs text-gray-500 mb-1">Last Name</label><input type="text" value={editForm.last_name_1||''} onChange={e => setEditForm({...editForm, last_name_1: e.target.value})} className={inputCls} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-xs text-gray-500 mb-1">Email</label><input type="email" value={editForm.email||''} onChange={e => setEditForm({...editForm, email: e.target.value})} className={inputCls} /></div>
                      <div><label className="block text-xs text-gray-500 mb-1">Phone</label><input type="tel" value={editForm.phone||''} onChange={e => setEditForm({...editForm, phone: e.target.value})} className={inputCls} /></div>
                    </div>
                    <div><label className="block text-xs text-gray-500 mb-1">Date of Birth</label><input type="date" value={editForm.date_of_birth_1||''} onChange={e => setEditForm({...editForm, date_of_birth_1: e.target.value})} className={inputCls} /></div>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={editForm.kyc_completed_1===1} onChange={e => setEditForm({...editForm, kyc_completed_1: e.target.checked?1:0})} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" /><span className="text-sm">KYC Completed</span></label>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-3 text-sm"><User className="w-4 h-4 text-gray-400" /><span className="font-medium text-gray-900">{tenant.title_1} {tenant.first_name_1} {tenant.last_name_1}</span></div>
                    {tenant.email && <div className="flex items-center gap-3 text-sm text-gray-600"><Mail className="w-4 h-4 text-gray-400" />{tenant.email}</div>}
                    {tenant.phone && <div className="flex items-center gap-3 text-sm text-gray-600"><Phone className="w-4 h-4 text-gray-400" />{tenant.phone}</div>}
                    {tenant.date_of_birth_1 && <div className="text-xs text-gray-400">DOB: {new Date(tenant.date_of_birth_1).toLocaleDateString('en-GB')}</div>}
                  </div>
                )}
              </div>

              {/* Joint Tenancy */}
              <div className="border border-gray-200 rounded-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-900">Joint Tenancy</h2>
                  {editing && (
                    <label className="flex items-center gap-2"><input type="checkbox" checked={editForm.is_joint_tenancy===1} onChange={e => setEditForm({...editForm, is_joint_tenancy: e.target.checked?1:0})} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" /><span className="text-xs text-gray-600">Joint</span></label>
                  )}
                </div>
                {(editing ? editForm.is_joint_tenancy : tenant.is_joint_tenancy) ? (
                  editing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-3">
                        <div><label className="block text-xs text-gray-500 mb-1">Title</label><select value={editForm.title_2||''} onChange={e => setEditForm({...editForm, title_2: e.target.value})} className={inputCls}><option value="">-</option><option value="Mr">Mr</option><option value="Mrs">Mrs</option><option value="Miss">Miss</option><option value="Ms">Ms</option></select></div>
                        <div><label className="block text-xs text-gray-500 mb-1">First Name</label><input type="text" value={editForm.first_name_2||''} onChange={e => setEditForm({...editForm, first_name_2: e.target.value})} className={inputCls} /></div>
                        <div><label className="block text-xs text-gray-500 mb-1">Last Name</label><input type="text" value={editForm.last_name_2||''} onChange={e => setEditForm({...editForm, last_name_2: e.target.value})} className={inputCls} /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-xs text-gray-500 mb-1">Email</label><input type="email" value={editForm.email_2||''} onChange={e => setEditForm({...editForm, email_2: e.target.value})} className={inputCls} /></div>
                        <div><label className="block text-xs text-gray-500 mb-1">Phone</label><input type="tel" value={editForm.phone_2||''} onChange={e => setEditForm({...editForm, phone_2: e.target.value})} className={inputCls} /></div>
                      </div>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={editForm.kyc_completed_2===1} onChange={e => setEditForm({...editForm, kyc_completed_2: e.target.checked?1:0})} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" /><span className="text-sm">KYC Completed</span></label>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 text-sm"><User className="w-4 h-4 text-gray-400" /><span className="font-medium text-gray-900">{tenant.title_2} {tenant.first_name_2} {tenant.last_name_2}</span></div>
                        {tenant.kyc_completed_2 ? <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-emerald-300 text-emerald-700 bg-white">KYC ✓</span> : <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-red-300 text-red-600 bg-white">KYC Pending</span>}
                      </div>
                      {tenant.email_2 && <div className="text-sm text-gray-600 ml-7">{tenant.email_2}</div>}
                      {tenant.phone_2 && <div className="text-sm text-gray-600 ml-7">{tenant.phone_2}</div>}
                    </div>
                  )
                ) : <p className="text-sm text-gray-400">Single tenancy - no joint applicant</p>}
              </div>

              {/* Next of Kin */}
              <div className="border border-gray-200 rounded-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-900">Next of Kin</h2>
                  {!tenant.nok_name && !editing && <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-amber-300 text-amber-700 bg-white">Missing</span>}
                </div>
                {editing ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs text-gray-500 mb-1">Name</label><input type="text" value={editForm.nok_name||''} onChange={e => setEditForm({...editForm, nok_name: e.target.value})} className={inputCls} /></div>
                    <div><label className="block text-xs text-gray-500 mb-1">Relationship</label><input type="text" value={editForm.nok_relationship||''} onChange={e => setEditForm({...editForm, nok_relationship: e.target.value})} className={inputCls} /></div>
                    <div><label className="block text-xs text-gray-500 mb-1">Phone</label><input type="tel" value={editForm.nok_phone||''} onChange={e => setEditForm({...editForm, nok_phone: e.target.value})} className={inputCls} /></div>
                    <div><label className="block text-xs text-gray-500 mb-1">Email</label><input type="email" value={editForm.nok_email||''} onChange={e => setEditForm({...editForm, nok_email: e.target.value})} className={inputCls} /></div>
                  </div>
                ) : tenant.nok_name ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 text-sm"><AlertCircle className="w-4 h-4 text-gray-400" /><span className="font-medium text-gray-900">{tenant.nok_name}</span>{tenant.nok_relationship && <span className="text-gray-400">({tenant.nok_relationship})</span>}</div>
                    {tenant.nok_phone && <div className="text-sm text-gray-600 ml-7">{tenant.nok_phone}</div>}
                    {tenant.nok_email && <div className="text-sm text-gray-600 ml-7">{tenant.nok_email}</div>}
                  </div>
                ) : <p className="text-sm text-gray-400">No next of kin recorded</p>}
              </div>
            </>
          )}

          {activeTab === 'tenancy' && (
            <div className="border border-gray-200 rounded-lg p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Tenancy Details</h2>
              {editing ? (
                <div className="space-y-3">
                  <div><label className="block text-xs text-gray-500 mb-1">Property</label><select value={editForm.property_id||''} onChange={e => setEditForm({...editForm, property_id: e.target.value})} className={inputCls}><option value="">Select property...</option>{properties.map(p => <option key={p.id} value={p.id}>{p.address}</option>)}</select></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs text-gray-500 mb-1">Start Date</label><input type="date" value={editForm.tenancy_start_date||''} onChange={e => setEditForm({...editForm, tenancy_start_date: e.target.value})} className={inputCls} /></div>
                    <div><label className="block text-xs text-gray-500 mb-1">Tenancy Type</label><select value={editForm.tenancy_type||''} onChange={e => setEditForm({...editForm, tenancy_type: e.target.value})} className={inputCls}><option value="">-</option><option value="AST">AST</option><option value="HMO">HMO</option><option value="Rolling">Rolling</option><option value="Other">Other</option></select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="flex items-center gap-2 mb-2"><input type="checkbox" checked={editForm.has_end_date===1} onChange={e => setEditForm({...editForm, has_end_date: e.target.checked?1:0})} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" /><span className="text-sm">Has End Date</span></label>
                      {editForm.has_end_date===1 && <input type="date" value={editForm.tenancy_end_date||''} onChange={e => setEditForm({...editForm, tenancy_end_date: e.target.value})} className={inputCls} />}
                    </div>
                    <div><label className="block text-xs text-gray-500 mb-1">Monthly Rent (£)</label><input type="number" value={editForm.monthly_rent||''} onChange={e => setEditForm({...editForm, monthly_rent: e.target.value})} className={inputCls} /></div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {tenant.property_address ? (
                    <Link to={`/properties/${tenant.property_id}`} className="flex items-center gap-3 text-sm text-gray-600 hover:text-gray-900"><Home className="w-4 h-4 text-gray-400" />{tenant.property_address}</Link>
                  ) : <p className="text-sm text-gray-400">No property linked</p>}
                  {tenant.tenancy_start_date && <div className="text-sm text-gray-600">Start: {new Date(tenant.tenancy_start_date).toLocaleDateString('en-GB')}{tenant.tenancy_type && ` • ${tenant.tenancy_type}`}</div>}
                  {tenant.has_end_date && tenant.tenancy_end_date && <div className="text-sm text-gray-600">End: {new Date(tenant.tenancy_end_date).toLocaleDateString('en-GB')}</div>}
                  {tenant.monthly_rent && <div className="text-lg font-bold text-gray-900">£{tenant.monthly_rent}/month</div>}
                </div>
              )}
            </div>
          )}

          {activeTab === 'guarantor' && (
            <div className="border border-gray-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900">Guarantor</h2>
                {editing && <label className="flex items-center gap-2"><input type="checkbox" checked={editForm.guarantor_required===1} onChange={e => setEditForm({...editForm, guarantor_required: e.target.checked?1:0})} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" /><span className="text-xs text-gray-600">Required</span></label>}
              </div>
              {(editing ? editForm.guarantor_required : tenant.guarantor_required) ? (
                editing ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-xs text-gray-500 mb-1">Name</label><input type="text" value={editForm.guarantor_name||''} onChange={e => setEditForm({...editForm, guarantor_name: e.target.value})} className={inputCls} /></div>
                      <div><label className="block text-xs text-gray-500 mb-1">Phone</label><input type="tel" value={editForm.guarantor_phone||''} onChange={e => setEditForm({...editForm, guarantor_phone: e.target.value})} className={inputCls} /></div>
                    </div>
                    <div><label className="block text-xs text-gray-500 mb-1">Address</label><input type="text" value={editForm.guarantor_address||''} onChange={e => setEditForm({...editForm, guarantor_address: e.target.value})} className={inputCls} /></div>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={editForm.guarantor_kyc_completed===1} onChange={e => setEditForm({...editForm, guarantor_kyc_completed: e.target.checked?1:0})} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" /><span className="text-sm">KYC</span></label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={editForm.guarantor_deed_received===1} onChange={e => setEditForm({...editForm, guarantor_deed_received: e.target.checked?1:0})} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" /><span className="text-sm">Deed</span></label>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="text-sm font-medium text-gray-900">{tenant.guarantor_name || 'Name not recorded'}</div>
                    {tenant.guarantor_address && <div className="text-sm text-gray-600">{tenant.guarantor_address}</div>}
                    {tenant.guarantor_phone && <div className="text-sm text-gray-600">{tenant.guarantor_phone}</div>}
                    <div className="flex gap-2 mt-2">
                      {tenant.guarantor_kyc_completed ? <span className="text-xs px-2 py-0.5 rounded-full border border-emerald-300 text-emerald-700 bg-white">KYC ✓</span> : <span className="text-xs px-2 py-0.5 rounded-full border border-red-300 text-red-600 bg-white">KYC Pending</span>}
                      {tenant.guarantor_deed_received ? <span className="text-xs px-2 py-0.5 rounded-full border border-emerald-300 text-emerald-700 bg-white">Deed ✓</span> : <span className="text-xs px-2 py-0.5 rounded-full border border-red-300 text-red-600 bg-white">Deed Pending</span>}
                    </div>
                  </div>
                )
              ) : <p className="text-sm text-gray-400">No guarantor required</p>}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Application Status */}
          <div className="border border-gray-200 rounded-lg p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Application Status</h2>
            {editing ? (
              <div className="space-y-3">
                <label className="flex items-center gap-2"><input type="checkbox" checked={editForm.holding_deposit_received===1} onChange={e => setEditForm({...editForm, holding_deposit_received: e.target.checked?1:0})} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" /><span className="text-sm">Holding Deposit Received</span></label>
                {editForm.holding_deposit_received===1 && (
                  <div className="ml-6 grid grid-cols-2 gap-2">
                    <input type="number" placeholder="Amount" value={editForm.holding_deposit_amount||''} onChange={e => setEditForm({...editForm, holding_deposit_amount: e.target.value})} className={inputCls} />
                    <input type="date" value={editForm.holding_deposit_date||''} onChange={e => setEditForm({...editForm, holding_deposit_date: e.target.value})} className={inputCls} />
                  </div>
                )}
                <label className="flex items-center gap-2"><input type="checkbox" checked={editForm.application_forms_completed===1} onChange={e => setEditForm({...editForm, application_forms_completed: e.target.checked?1:0})} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" /><span className="text-sm">Application Forms Completed</span></label>
              </div>
            ) : (
              <div className="space-y-2.5">
                {[
                  { label: 'Holding Deposit', done: tenant.holding_deposit_received, extra: tenant.holding_deposit_received ? `£${tenant.holding_deposit_amount||'?'}` : null },
                  { label: 'Application Forms', done: tenant.application_forms_completed },
                  { label: 'KYC (Applicant 1)', done: tenant.kyc_completed_1 },
                  ...(tenant.is_joint_tenancy===1 ? [{ label: 'KYC (Applicant 2)', done: tenant.kyc_completed_2 }] : []),
                  { label: 'Next of Kin', done: !!tenant.nok_name },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{item.label}</span>
                    <div className="flex items-center gap-2">
                      {item.extra && <span className="text-xs text-gray-500">{item.extra}</span>}
                      {item.done ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-gray-300" />}
                    </div>
                  </div>
                ))}
                <div className="pt-3 border-t border-gray-100">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium text-gray-700">Completion</span>
                    <span className="font-semibold text-gray-900">{completion}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gray-900 rounded-full transition-all" style={{ width: `${completion}%` }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Notes</h2>
              <button onClick={() => setShowNoteModal(true)} className="text-xs text-gray-500 hover:text-gray-900 font-medium">+ Add</button>
            </div>
            {editing ? (
              <textarea value={editForm.notes||''} onChange={e => setEditForm({...editForm, notes: e.target.value})} rows={6}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
            ) : tenant.notes ? (
              <div className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto">{tenant.notes}</div>
            ) : <p className="text-sm text-gray-400">No notes yet</p>}
          </div>

          <DocumentsSection entityType="tenant" entityId={parseInt(id!)} />
        </div>
      </div>

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
