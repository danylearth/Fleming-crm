import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import DocumentsSection from '../components/DocumentsSection';
import {
  ArrowLeft, Calendar, Clock, Home, Save, UserPlus, AlertTriangle,
  Mail, Phone, User, CheckCircle, XCircle, Pencil, MoreHorizontal,
  MessageSquare, FileText, ChevronRight
} from 'lucide-react';

interface Property { id: number; address: string; postcode: string; status: string; rent_amount: number; }

const STATUS_CONFIG: Record<string, { label: string; border: string; text: string }> = {
  new:               { label: 'New',               border: 'border-emerald-300', text: 'text-emerald-700' },
  viewing_booked:    { label: 'Viewing Booked',    border: 'border-violet-300',  text: 'text-violet-700' },
  awaiting_response: { label: 'Awaiting Response', border: 'border-amber-300',   text: 'text-amber-700' },
  onboarding:        { label: 'Onboarding',        border: 'border-sky-300',     text: 'text-sky-700' },
  converted:         { label: 'Converted',         border: 'border-gray-300',    text: 'text-gray-600' },
  rejected:          { label: 'Rejected',          border: 'border-red-300',     text: 'text-red-600' },
};

export default function TenantEnquiryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const [enquiry, setEnquiry] = useState<any>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('info');
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [modalData, setModalData] = useState<any>({});

  useEffect(() => { loadData(); }, [id]);

  const loadData = async () => {
    try {
      const [e, p] = await Promise.all([api.get(`/api/tenant-enquiries/${id}`), api.get('/api/properties')]);
      setEnquiry(e); setProperties(p);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try { await api.put(`/api/tenant-enquiries/${id}`, enquiry); } catch (err: any) { alert(err.message || 'Failed'); }
    finally { setSaving(false); }
  };

  // ── Workflow actions ────────────────────────────────────────────────────

  const handleBookViewing = async () => {
    if (!modalData.viewing_date || !modalData.property_id) { alert('Select date and property'); return; }
    try {
      await api.post('/api/property-viewings', { property_id: modalData.property_id, enquiry_id: id,
        viewer_name: `${enquiry.first_name_1} ${enquiry.last_name_1}`, viewer_email: enquiry.email_1,
        viewer_phone: enquiry.phone_1, viewing_date: modalData.viewing_date, viewing_time: modalData.viewing_time });
      await api.put(`/api/tenant-enquiries/${id}`, { ...enquiry, status: 'viewing_booked',
        viewing_date: modalData.viewing_date, linked_property_id: modalData.property_id });
      setActiveModal(null); loadData();
    } catch (err: any) { alert(err.message || 'Failed'); }
  };

  const handleAwaitingResponse = async () => {
    if (!modalData.follow_up_date) { alert('Select follow-up date'); return; }
    try {
      await api.put(`/api/tenant-enquiries/${id}`, { ...enquiry, status: 'awaiting_response',
        follow_up_date: modalData.follow_up_date,
        notes: modalData.notes ? `${enquiry.notes || ''}\n\n[${new Date().toLocaleDateString('en-GB')}] Awaiting: ${modalData.notes}` : enquiry.notes });
      setActiveModal(null); loadData();
    } catch (err: any) { alert(err.message || 'Failed'); }
  };

  const handleStartOnboarding = async () => {
    try {
      await api.put(`/api/tenant-enquiries/${id}`, { ...enquiry, status: 'onboarding', follow_up_date: modalData.follow_up_date || null });
      setActiveModal(null); loadData();
    } catch (err: any) { alert(err.message || 'Failed'); }
  };

  const handleReject = async () => {
    try {
      await api.put(`/api/tenant-enquiries/${id}`, { ...enquiry, status: 'rejected', rejection_reason: modalData.rejection_reason,
        notes: `${enquiry.notes || ''}\n\n[${new Date().toLocaleDateString('en-GB')}] REJECTED: ${modalData.rejection_reason}` });
      setActiveModal(null); loadData();
    } catch (err: any) { alert(err.message || 'Failed'); }
  };

  const handleConvertToTenant = async () => {
    if (!enquiry.linked_property_id) { alert('Link a property first'); return; }
    if (!modalData.tenancy_start_date) { alert('Enter tenancy start date'); return; }
    try {
      const result = await api.post(`/api/tenant-enquiries/${id}/convert`, {
        property_id: enquiry.linked_property_id, tenancy_start_date: modalData.tenancy_start_date,
        tenancy_type: modalData.tenancy_type || 'AST', monthly_rent: modalData.monthly_rent || 0 });
      navigate(`/tenants/${result.tenant_id}`);
    } catch (err: any) { alert(err.message || 'Failed'); }
  };

  const handleReactivate = async () => {
    try {
      await api.put(`/api/tenant-enquiries/${id}`, { ...enquiry, status: 'new', rejection_reason: null,
        notes: `${enquiry.notes || ''}\n\n[${new Date().toLocaleDateString('en-GB')}] Reactivated` });
      loadData();
    } catch (err: any) { alert(err.message || 'Failed'); }
  };

  // ── Loading / Error ───────────────────────────────────────────────────

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" /></div>;
  if (!enquiry) return <div className="p-6 text-center text-gray-500">Enquiry not found</div>;

  const config = STATUS_CONFIG[enquiry.status] || STATUS_CONFIG.new;
  const linkedProperty = properties.find(p => p.id === enquiry.linked_property_id);
  const isActive = !['rejected', 'converted'].includes(enquiry.status);
  const name = `${enquiry.first_name_1} ${enquiry.last_name_1}`;
  const initials = `${enquiry.first_name_1?.[0] || ''}${enquiry.last_name_1?.[0] || ''}`.toUpperCase();

  const tabs = [
    { id: 'info', label: 'Applicant Info' },
    { id: 'activity', label: 'Activity' },
    { id: 'notes', label: 'Notes' },
  ];

  // ── Build activity/footprints from notes ──────────────────────────────

  const activityItems = (enquiry.notes || '').split('\n\n')
    .filter((n: string) => n.startsWith('['))
    .map((n: string, i: number) => {
      const match = n.match(/\[(\d{2}\/\d{2}\/\d{4})\]\s*(.*)/);
      return match ? { id: i, date: match[1], text: match[2] } : null;
    }).filter(Boolean).reverse();

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link to="/tenant-enquiries" className="flex items-center gap-1 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4" /> Enquiries
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-900">{name}</span>
        </div>
        <p className="text-xs text-gray-400">
          Created {new Date(enquiry.created_at).toLocaleDateString('en-GB')}
        </p>
      </div>

      {/* Contact header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
            <span className="text-sm font-semibold text-gray-600">{initials}</span>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">{name}</h1>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full border bg-white ${config.border} ${config.text}`}>
                {config.label}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              Enquiry {enquiry.is_joint_application === 1 && enquiry.first_name_2 ? `(Joint with ${enquiry.first_name_2} ${enquiry.last_name_2})` : ''}
              {linkedProperty ? ` • ${linkedProperty.address}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            <Mail className="w-4 h-4" /> Mail
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            <Phone className="w-4 h-4" /> Call
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-gray-200 mb-6">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >{tab.label}</button>
        ))}
      </div>

      {/* Rejected banner */}
      {enquiry.status === 'rejected' && (
        <div className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg mb-6 bg-gray-50">
          <AlertTriangle className="w-5 h-5 text-gray-500" />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700">Rejected{enquiry.rejection_reason ? `: ${enquiry.rejection_reason}` : ''}</p>
          </div>
          <button onClick={handleReactivate} className="text-sm font-medium text-gray-900 hover:underline">Reactivate</button>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — Contact info + Activity */}
        <div className="lg:col-span-2 space-y-6">

          {/* ── INFO TAB ──────────────────────────────────────────────── */}
          {activeTab === 'info' && (
            <>
              {/* Applicant 1 */}
              <div className="border border-gray-200 rounded-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-900">Applicant 1</h2>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={enquiry.kyc_completed_1 === 1}
                      onChange={e => setEnquiry({...enquiry, kyc_completed_1: e.target.checked ? 1 : 0})}
                      className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" />
                    <span className="text-xs font-medium text-gray-600">KYC</span>
                  </label>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { label: 'Title', key: 'title_1', type: 'select', options: ['', 'Mr', 'Mrs', 'Miss', 'Ms', 'Dr'] },
                    { label: 'First Name', key: 'first_name_1' },
                    { label: 'Last Name', key: 'last_name_1' },
                    { label: 'Email', key: 'email_1', type: 'email' },
                    { label: 'Phone', key: 'phone_1', type: 'tel' },
                    { label: 'Date of Birth', key: 'date_of_birth_1', type: 'date' },
                    { label: 'Current Address', key: 'current_address_1', span: 3 },
                    { label: 'Employment', key: 'employment_status_1', type: 'select', options: ['', 'Employed', 'Self-Employed', 'Unemployed', 'Student', 'Retired'] },
                    { label: 'Employer', key: 'employer_1' },
                    { label: 'Annual Income (£)', key: 'income_1', type: 'number' },
                  ].map(f => (
                    <div key={f.key} className={f.span ? `col-span-2 md:col-span-${f.span}` : ''}>
                      <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                      {f.type === 'select' ? (
                        <select value={enquiry[f.key] || ''} onChange={e => setEnquiry({...enquiry, [f.key]: e.target.value})}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200">
                          {f.options!.map(o => <option key={o} value={o}>{o || '-'}</option>)}
                        </select>
                      ) : (
                        <input type={f.type || 'text'} value={enquiry[f.key] || ''}
                          onChange={e => setEnquiry({...enquiry, [f.key]: e.target.value})}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Joint toggle */}
              <div className="border border-gray-200 rounded-lg p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={enquiry.is_joint_application === 1}
                    onChange={e => setEnquiry({...enquiry, is_joint_application: e.target.checked ? 1 : 0})}
                    className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" />
                  <span className="text-sm font-medium text-gray-900">Joint Application</span>
                </label>
              </div>

              {/* Applicant 2 */}
              {enquiry.is_joint_application === 1 && (
                <div className="border border-gray-200 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-gray-900">Applicant 2</h2>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={enquiry.kyc_completed_2 === 1}
                        onChange={e => setEnquiry({...enquiry, kyc_completed_2: e.target.checked ? 1 : 0})}
                        className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" />
                      <span className="text-xs font-medium text-gray-600">KYC</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      { label: 'Title', key: 'title_2', type: 'select', options: ['', 'Mr', 'Mrs', 'Miss', 'Ms', 'Dr'] },
                      { label: 'First Name', key: 'first_name_2' },
                      { label: 'Last Name', key: 'last_name_2' },
                      { label: 'Email', key: 'email_2', type: 'email' },
                      { label: 'Phone', key: 'phone_2', type: 'tel' },
                      { label: 'Date of Birth', key: 'date_of_birth_2', type: 'date' },
                      { label: 'Current Address', key: 'current_address_2', span: 3 },
                      { label: 'Employment', key: 'employment_status_2', type: 'select', options: ['', 'Employed', 'Self-Employed', 'Unemployed', 'Student', 'Retired'] },
                      { label: 'Employer', key: 'employer_2' },
                      { label: 'Annual Income (£)', key: 'income_2', type: 'number' },
                    ].map(f => (
                      <div key={f.key} className={f.span ? `col-span-2 md:col-span-${f.span}` : ''}>
                        <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                        {f.type === 'select' ? (
                          <select value={enquiry[f.key] || ''} onChange={e => setEnquiry({...enquiry, [f.key]: e.target.value})}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200">
                            {f.options!.map(o => <option key={o} value={o}>{o || '-'}</option>)}
                          </select>
                        ) : (
                          <input type={f.type || 'text'} value={enquiry[f.key] || ''}
                            onChange={e => setEnquiry({...enquiry, [f.key]: e.target.value})}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── ACTIVITY TAB ──────────────────────────────────────────── */}
          {activeTab === 'activity' && (
            <div className="border border-gray-200 rounded-lg p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">Activity Log</h2>
              {activityItems.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">No activity recorded yet</p>
              ) : (
                <div className="space-y-4">
                  {activityItems.map((item: any) => (
                    <div key={item.id} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-700">{item.text}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{item.date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── NOTES TAB ─────────────────────────────────────────────── */}
          {activeTab === 'notes' && (
            <div className="border border-gray-200 rounded-lg p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Notes</h2>
              <textarea value={enquiry.notes || ''} onChange={e => setEnquiry({...enquiry, notes: e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" rows={10}
                placeholder="Add notes..." />
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-5">
          {/* Workflow actions */}
          {isActive && (
            <div className="border border-gray-200 rounded-lg p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Actions</h2>
              <div className="space-y-2">
                {enquiry.status === 'new' && (
                  <>
                    <ActionBtn label="Book Viewing" icon={Calendar} onClick={() => { setModalData({}); setActiveModal('viewing'); }} />
                    <ActionBtn label="Awaiting Response" icon={Clock} onClick={() => { setModalData({}); setActiveModal('awaiting'); }} />
                    <ActionBtn label="Start Onboarding" icon={CheckCircle} onClick={() => { setModalData({}); setActiveModal('onboarding'); }} />
                  </>
                )}
                {enquiry.status === 'viewing_booked' && (
                  <>
                    <ActionBtn label="Start Onboarding" icon={CheckCircle} onClick={() => { setModalData({}); setActiveModal('onboarding'); }} />
                    <ActionBtn label="Awaiting Response" icon={Clock} onClick={() => { setModalData({}); setActiveModal('awaiting'); }} />
                  </>
                )}
                {enquiry.status === 'awaiting_response' && (
                  <>
                    <ActionBtn label="Book Viewing" icon={Calendar} onClick={() => { setModalData({}); setActiveModal('viewing'); }} />
                    <ActionBtn label="Start Onboarding" icon={CheckCircle} onClick={() => { setModalData({}); setActiveModal('onboarding'); }} />
                  </>
                )}
                {enquiry.status === 'onboarding' && (
                  <ActionBtn label="Convert to Tenant" icon={UserPlus} onClick={() => { setModalData({ tenancy_type: 'AST' }); setActiveModal('convert'); }} />
                )}
                <ActionBtn label="Reject" icon={XCircle} onClick={() => { setModalData({}); setActiveModal('reject'); }} variant="danger" />
              </div>

              {enquiry.viewing_date && enquiry.status === 'viewing_booked' && (
                <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
                  <Calendar className="w-3.5 h-3.5 inline mr-1.5" />
                  Viewing: <strong>{new Date(enquiry.viewing_date).toLocaleDateString('en-GB')}</strong>
                  {linkedProperty && <> at {linkedProperty.address}</>}
                </div>
              )}
              {enquiry.follow_up_date && ['awaiting_response', 'onboarding'].includes(enquiry.status) && (
                <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
                  <Clock className="w-3.5 h-3.5 inline mr-1.5" />
                  Follow-up: <strong>{new Date(enquiry.follow_up_date).toLocaleDateString('en-GB')}</strong>
                </div>
              )}
            </div>
          )}

          {/* Linked property */}
          <div className="border border-gray-200 rounded-lg p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Property</h2>
            <select value={enquiry.linked_property_id || ''} onChange={e => setEnquiry({...enquiry, linked_property_id: parseInt(e.target.value) || null})}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200">
              <option value="">Select property...</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.address}, {p.postcode} - £{p.rent_amount}/mo</option>)}
            </select>
            {linkedProperty && (
              <Link to={`/properties/${linkedProperty.id}`} className="block mt-2 text-xs text-gray-500 hover:text-gray-900">View property →</Link>
            )}
          </div>

          {/* Documents */}
          <DocumentsSection entityType="tenant_enquiry" entityId={parseInt(id!)} />

          {/* Application status */}
          <div className="border border-gray-200 rounded-lg p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Application Status</h2>
            <div className="space-y-2.5">
              <StatusRow label="KYC (Applicant 1)" done={enquiry.kyc_completed_1 === 1} />
              {enquiry.is_joint_application === 1 && (
                <StatusRow label="KYC (Applicant 2)" done={enquiry.kyc_completed_2 === 1} />
              )}
              <StatusRow label="Property Linked" done={!!enquiry.linked_property_id} />
              <StatusRow label="Documents" done={false} />
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-gray-700">Completion</span>
                <span className="font-semibold text-gray-900">{getCompletion(enquiry)}%</span>
              </div>
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-gray-900 rounded-full transition-all" style={{ width: `${getCompletion(enquiry)}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {activeModal === 'viewing' && (
        <Modal title="Book Viewing" onClose={() => setActiveModal(null)}>
          <div className="space-y-3">
            <Field label="Property *">
              <select value={modalData.property_id || ''} onChange={e => setModalData({...modalData, property_id: parseInt(e.target.value)})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200">
                <option value="">Select...</option>
                {properties.filter(p => p.status === 'available').map(p => <option key={p.id} value={p.id}>{p.address}, {p.postcode}</option>)}
              </select>
            </Field>
            <Field label="Viewing Date *">
              <input type="date" value={modalData.viewing_date || ''} onChange={e => setModalData({...modalData, viewing_date: e.target.value})} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
            </Field>
            <Field label="Time">
              <input type="time" value={modalData.viewing_time || ''} onChange={e => setModalData({...modalData, viewing_time: e.target.value})} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
            </Field>
          </div>
          <ModalActions onCancel={() => setActiveModal(null)} onConfirm={handleBookViewing} label="Book Viewing" />
        </Modal>
      )}

      {activeModal === 'awaiting' && (
        <Modal title="Awaiting Response" onClose={() => setActiveModal(null)}>
          <div className="space-y-3">
            <Field label="Follow-up Date *">
              <input type="date" value={modalData.follow_up_date || ''} onChange={e => setModalData({...modalData, follow_up_date: e.target.value})} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
            </Field>
            <Field label="Note">
              <textarea value={modalData.notes || ''} onChange={e => setModalData({...modalData, notes: e.target.value})} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" rows={3} placeholder="What are we waiting for?" />
            </Field>
          </div>
          <ModalActions onCancel={() => setActiveModal(null)} onConfirm={handleAwaitingResponse} label="Set Follow-up" />
        </Modal>
      )}

      {activeModal === 'onboarding' && (
        <Modal title="Start Onboarding" onClose={() => setActiveModal(null)}>
          <p className="text-sm text-gray-500 mb-3">Move to onboarding stage.</p>
          <Field label="Follow-up Date (optional)">
            <input type="date" value={modalData.follow_up_date || ''} onChange={e => setModalData({...modalData, follow_up_date: e.target.value})} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
          </Field>
          <ModalActions onCancel={() => setActiveModal(null)} onConfirm={handleStartOnboarding} label="Start Onboarding" />
        </Modal>
      )}

      {activeModal === 'reject' && (
        <Modal title="Reject Enquiry" onClose={() => setActiveModal(null)}>
          <p className="text-sm text-gray-500 mb-3">This will archive the enquiry. Can be reactivated later.</p>
          <Field label="Reason">
            <textarea value={modalData.rejection_reason || ''} onChange={e => setModalData({...modalData, rejection_reason: e.target.value})} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" rows={3} />
          </Field>
          <ModalActions onCancel={() => setActiveModal(null)} onConfirm={handleReject} label="Reject" danger />
        </Modal>
      )}

      {activeModal === 'convert' && (
        <Modal title="Convert to Tenant" onClose={() => setActiveModal(null)}>
          <div className="space-y-3">
            <Field label="Tenancy Start Date *">
              <input type="date" value={modalData.tenancy_start_date || ''} onChange={e => setModalData({...modalData, tenancy_start_date: e.target.value})} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
            </Field>
            <Field label="Type">
              <select value={modalData.tenancy_type || 'AST'} onChange={e => setModalData({...modalData, tenancy_type: e.target.value})} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200">
                <option value="AST">AST</option><option value="HMO">HMO</option><option value="Rolling">Rolling</option><option value="Other">Other</option>
              </select>
            </Field>
            <Field label="Monthly Rent (£)">
              <input type="number" value={modalData.monthly_rent || ''} onChange={e => setModalData({...modalData, monthly_rent: e.target.value})} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
            </Field>
          </div>
          <ModalActions onCancel={() => setActiveModal(null)} onConfirm={handleConvertToTenant} label="Convert" />
        </Modal>
      )}
    </div>
  );
}

// ── Helper components ───────────────────────────────────────────────────────

function ActionBtn({ label, icon: Icon, onClick, variant }: { label: string; icon: any; onClick: () => void; variant?: string }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      variant === 'danger' ? 'text-red-600 hover:bg-red-50 border border-red-200' : 'text-gray-700 hover:bg-gray-50 border border-gray-200'
    }`}>
      <Icon className="w-4 h-4" />{label}
    </button>
  );
}

function StatusRow({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      {done ? (
        <CheckCircle className="w-4 h-4 text-emerald-500" />
      ) : (
        <XCircle className="w-4 h-4 text-gray-300" />
      )}
    </div>
  );
}

function getCompletion(e: any) {
  let total = 3, done = 0;
  if (e.kyc_completed_1 === 1) done++;
  if (e.linked_property_id) done++;
  if (e.is_joint_application === 1) { total++; if (e.kyc_completed_2 === 1) done++; }
  if (e.first_name_1 && e.email_1 && e.phone_1) done++;
  return Math.round((done / total) * 100);
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XCircle className="w-4 h-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-gray-500 mb-1">{label}</label>{children}</div>;
}

function ModalActions({ onCancel, onConfirm, label, danger }: { onCancel: () => void; onConfirm: () => void; label: string; danger?: boolean }) {
  return (
    <div className="flex justify-end gap-2 mt-5">
      <button onClick={onCancel} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
      <button onClick={onConfirm} className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-900 hover:bg-gray-800'}`}>{label}</button>
    </div>
  );
}
