import { useState, useEffect, useCallback, useRef, type ReactNode, Component, type ErrorInfo } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import {
  UserPlus, Calendar, Clock, CheckCircle, XCircle, Search, Users,
  Mail, Phone, ShieldCheck, ChevronDown, ChevronRight, GripVertical,
  Home, Eye, Building2, X as XIcon, Check, LayoutGrid, List, Filter,
  ChevronLeft
} from 'lucide-react';

// ── Error Boundary ──────────────────────────────────────────────────────────

class EnquiryErrorBoundary extends Component<{children: ReactNode}, {error: Error | null}> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('EnquiryPage crash:', error, info); }
  render() {
    if (this.state.error) return (
      <div className="p-8 bg-red-50 rounded-xl m-4">
        <h2 className="text-red-700 font-bold text-lg mb-2">Page Error</h2>
        <pre className="text-red-600 text-sm whitespace-pre-wrap">{this.state.error.message}{'\n'}{this.state.error.stack}</pre>
      </div>
    );
    return this.props.children;
  }
}

// ── Types ───────────────────────────────────────────────────────────────────

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

type ColumnStatus = 'new' | 'viewing_booked' | 'awaiting_response' | 'onboarding' | 'converted' | 'rejected';

// ── Status config ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; border: string; text: string }> = {
  new:               { label: 'New',               border: 'border-emerald-300', text: 'text-emerald-700' },
  viewing_booked:    { label: 'Viewing Booked',    border: 'border-violet-300',  text: 'text-violet-700' },
  awaiting_response: { label: 'Awaiting Response', border: 'border-amber-300',   text: 'text-amber-700' },
  onboarding:        { label: 'Onboarding',        border: 'border-sky-300',     text: 'text-sky-700' },
  converted:         { label: 'Converted',         border: 'border-gray-300',    text: 'text-gray-600' },
  rejected:          { label: 'Rejected',          border: 'border-red-300',     text: 'text-red-600' },
};

// ── Kanban column config ────────────────────────────────────────────────────

const COLUMNS: {
  status: ColumnStatus; label: string; icon: typeof UserPlus; collapsed?: boolean;
}[] = [
  { status: 'new',               label: 'New',               icon: UserPlus },
  { status: 'viewing_booked',    label: 'Viewing Booked',    icon: Eye },
  { status: 'awaiting_response', label: 'Awaiting Response', icon: Clock },
  { status: 'onboarding',        label: 'Onboarding',        icon: CheckCircle },
  { status: 'converted',         label: 'Converted',         icon: Users },
  { status: 'rejected',          label: 'Rejected',          icon: XCircle, collapsed: true },
];

// ── Wrapper ─────────────────────────────────────────────────────────────────

export default function TenantEnquiriesWrapper() {
  return <EnquiryErrorBoundary><TenantEnquiriesPage /></EnquiryErrorBoundary>;
}

// ── Main Component ──────────────────────────────────────────────────────────

function TenantEnquiriesPage() {
  const api = useApi();
  const [enquiries, setEnquiries] = useState<TenantEnquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('list');
  const [showForm, setShowForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<ColumnStatus | null>(null);
  const [collapsedCols, setCollapsedCols] = useState<Set<ColumnStatus>>(
    () => new Set(COLUMNS.filter(c => c.collapsed).map(c => c.status))
  );
  const perPage = 10;

  // Form state
  const emptyForm = {
    title_1: '', first_name_1: '', last_name_1: '', email_1: '', phone_1: '',
    date_of_birth_1: '', current_address_1: '', employment_status_1: '', employer_1: '', income_1: '',
    is_joint_application: false,
    title_2: '', first_name_2: '', last_name_2: '', email_2: '', phone_2: '',
    date_of_birth_2: '', current_address_2: '', employment_status_2: '', employer_2: '', income_2: '',
    notes: ''
  };
  const [formData, setFormData] = useState(emptyForm);

  const loadEnquiries = useCallback(async () => {
    try {
      const data = await api.get('/api/tenant-enquiries');
      setEnquiries(data);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { loadEnquiries(); }, []);

  // ── Filters ─────────────────────────────────────────────────────────────

  const uniqueProperties = Array.from(
    new Map(
      enquiries.filter(e => e.linked_property_id && e.property_address)
        .map(e => [e.linked_property_id!, e.property_address!])
    )
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const filtered = enquiries.filter(e => {
    if (propertyFilter === 'unlinked') { if (e.linked_property_id) return false; }
    else if (propertyFilter !== 'all') { if (String(e.linked_property_id) !== propertyFilter) return false; }
    if (search) {
      const s = search.toLowerCase();
      return e.first_name_1?.toLowerCase().includes(s) || e.last_name_1?.toLowerCase().includes(s) ||
        e.email_1?.toLowerCase().includes(s) || e.phone_1?.includes(s) || e.property_address?.toLowerCase().includes(s);
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);
  const byStatus = (status: ColumnStatus) => filtered.filter(e => e.status === status);

  const activeFilterCount = (propertyFilter !== 'all' ? 1 : 0);

  // ── Selection ─────────────────────────────────────────────────────────────

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paged.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(paged.map(e => e.id)));
  };

  // ── Drag & Drop ───────────────────────────────────────────────────────────

  const onDragStart = (e: React.DragEvent, id: number) => { setDragId(id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(id)); };
  const onDragOver = (e: React.DragEvent, status: ColumnStatus) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(status); };
  const onDragLeave = () => setDragOver(null);
  const onDrop = async (e: React.DragEvent, newStatus: ColumnStatus) => {
    e.preventDefault(); setDragOver(null);
    const id = Number(e.dataTransfer.getData('text/plain'));
    if (!id) return;
    const enquiry = enquiries.find(en => en.id === id);
    if (!enquiry || enquiry.status === newStatus) { setDragId(null); return; }
    setEnquiries(prev => prev.map(en => en.id === id ? { ...en, status: newStatus } : en));
    setDragId(null);
    try { await api.put(`/api/tenant-enquiries/${id}`, { status: newStatus }); }
    catch { setEnquiries(prev => prev.map(en => en.id === id ? { ...en, status: enquiry.status } : en)); }
  };
  const onDragEnd = () => { setDragId(null); setDragOver(null); };
  const toggleCollapsed = (status: ColumnStatus) => {
    setCollapsedCols(prev => { const next = new Set(prev); if (next.has(status)) next.delete(status); else next.add(status); return next; });
  };

  // ── Form submit ───────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/tenant-enquiries', formData);
      setShowForm(false); setFormData(emptyForm); loadEnquiries();
    } catch (err: any) { alert(err.message || 'Failed to create enquiry'); }
  };

  // ── Loading / Error ───────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="p-8 bg-red-50 rounded-xl">
      <h2 className="text-red-700 font-bold text-lg mb-2">Failed to load enquiries</h2>
      <p className="text-red-600">{error}</p>
      <button onClick={() => { setError(null); setLoading(true); loadEnquiries(); }} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg">Retry</button>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb + title */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Contacts</p>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Enquiries</h1>
            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {filtered.length} Enquiries
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            + Add Enquiry
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-gray-200 mb-4">
        <button
          onClick={() => setViewMode('list')}
          className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${
            viewMode === 'list' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          List View
        </button>
        <button
          onClick={() => setViewMode('kanban')}
          className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${
            viewMode === 'kanban' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Kanban
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <PropertyFilterDropdown
            value={propertyFilter}
            onChange={v => { setPropertyFilter(v); setCurrentPage(1); }}
            properties={uniqueProperties}
            activeCount={activeFilterCount}
          />
          {/* View toggles */}
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${viewMode === 'list' ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-2 ${viewMode === 'kanban' ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── LIST VIEW ─────────────────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <div className="flex-1 flex flex-col">
          <div className="border border-gray-200 rounded-lg overflow-hidden flex-1">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50">
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={paged.length > 0 && selectedIds.size === paged.length}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Property</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-16">
                      <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-500">No enquiries found</p>
                      <p className="text-xs text-gray-400 mt-1">Try adjusting your filters</p>
                    </td>
                  </tr>
                ) : paged.map(enquiry => {
                  const status = STATUS_CONFIG[enquiry.status] || STATUS_CONFIG.new;
                  const name = `${enquiry.first_name_1} ${enquiry.last_name_1}`;
                  const initials = `${enquiry.first_name_1?.[0] || ''}${enquiry.last_name_1?.[0] || ''}`.toUpperCase();
                  return (
                    <tr key={enquiry.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <td className="w-10 px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(enquiry.id)}
                          onChange={() => toggleSelect(enquiry.id)}
                          className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/tenant-enquiries/${enquiry.id}`} className="flex items-center gap-3 group">
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-semibold text-gray-600">{initials}</span>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 group-hover:text-navy-600">{name}</p>
                            {enquiry.is_joint_application === 1 && (
                              <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">Joint</span>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-700">{enquiry.email_1}</p>
                        <p className="text-xs text-gray-400">{enquiry.phone_1}</p>
                      </td>
                      <td className="px-4 py-3">
                        {enquiry.property_address ? (
                          <span className="text-sm text-gray-700">{enquiry.property_address}</span>
                        ) : (
                          <span className="text-sm text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${status.border} ${status.text} bg-white`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(enquiry.created_at).toLocaleDateString('en-GB')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-8 h-8 text-sm font-medium rounded-lg ${
                    page === currentPage
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── KANBAN VIEW ───────────────────────────────────────────────────── */}
      {viewMode === 'kanban' && (
        <div className="flex-1 overflow-x-auto overflow-y-hidden pb-2">
          <div className="flex gap-4 h-full min-w-max">
            {COLUMNS.map(col => {
              const items = byStatus(col.status);
              const isCollapsed = collapsedCols.has(col.status);
              const isDragTarget = dragOver === col.status && dragId !== null;
              const Icon = col.icon;

              if (isCollapsed) {
                return (
                  <div key={col.status} className="flex-shrink-0 w-12 cursor-pointer"
                    onClick={() => toggleCollapsed(col.status)}
                    onDragOver={e => onDragOver(e, col.status)} onDragLeave={onDragLeave}
                    onDrop={e => { toggleCollapsed(col.status); onDrop(e, col.status); }}
                  >
                    <div className={`h-full rounded-xl border-2 border-dashed flex flex-col items-center pt-4 gap-2 transition-colors ${
                      isDragTarget ? 'border-gray-400 bg-gray-100' : 'border-gray-200 bg-gray-50/60'
                    }`}>
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                      <span className="text-xs font-semibold text-gray-500 [writing-mode:vertical-lr]">{col.label} ({items.length})</span>
                    </div>
                  </div>
                );
              }

              return (
                <div key={col.status}
                  className={`flex-shrink-0 w-72 flex flex-col rounded-xl border transition-colors ${
                    isDragTarget ? 'border-gray-400 bg-gray-50' : 'border-gray-200 bg-gray-50/40'
                  }`}
                  onDragOver={e => onDragOver(e, col.status)} onDragLeave={onDragLeave}
                  onDrop={e => onDrop(e, col.status)}
                >
                  <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-semibold text-gray-800">{col.label}</span>
                      <span className="text-xs font-medium text-gray-500 bg-gray-200/60 px-1.5 py-0.5 rounded">{items.length}</span>
                    </div>
                    {(col.status === 'rejected' || col.status === 'converted') && (
                      <button onClick={() => toggleCollapsed(col.status)} className="text-gray-400 hover:text-gray-600">
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-0">
                    {items.length === 0 && <div className="text-center py-8 text-gray-400 text-xs">No enquiries</div>}
                    {items.map(enquiry => (
                      <KanbanCard key={enquiry.id} enquiry={enquiry} columnStatus={col.status}
                        isDragging={dragId === enquiry.id} onDragStart={onDragStart} onDragEnd={onDragEnd} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ADD ENQUIRY MODAL ─────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Add Tenant Enquiry</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 bg-gray-100 text-gray-700 rounded-full text-sm flex items-center justify-center">1</span>
                  Primary Applicant
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <select value={formData.title_1} onChange={e => setFormData({...formData, title_1: e.target.value})} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none">
                    <option value="">Title</option>
                    <option value="Mr">Mr</option><option value="Mrs">Mrs</option><option value="Miss">Miss</option><option value="Ms">Ms</option><option value="Dr">Dr</option>
                  </select>
                  <input type="text" placeholder="First Name *" value={formData.first_name_1} onChange={e => setFormData({...formData, first_name_1: e.target.value})} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" required />
                  <input type="text" placeholder="Last Name *" value={formData.last_name_1} onChange={e => setFormData({...formData, last_name_1: e.target.value})} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" required />
                  <input type="email" placeholder="Email *" value={formData.email_1} onChange={e => setFormData({...formData, email_1: e.target.value})} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" required />
                  <input type="tel" placeholder="Phone *" value={formData.phone_1} onChange={e => setFormData({...formData, phone_1: e.target.value})} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" required />
                  <input type="date" value={formData.date_of_birth_1} onChange={e => setFormData({...formData, date_of_birth_1: e.target.value})} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" />
                  <input type="text" placeholder="Current Address" value={formData.current_address_1} onChange={e => setFormData({...formData, current_address_1: e.target.value})} className="col-span-2 md:col-span-3 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" />
                  <select value={formData.employment_status_1} onChange={e => setFormData({...formData, employment_status_1: e.target.value})} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none">
                    <option value="">Employment Status</option>
                    <option value="Employed">Employed</option><option value="Self-Employed">Self-Employed</option><option value="Unemployed">Unemployed</option><option value="Student">Student</option><option value="Retired">Retired</option>
                  </select>
                  <input type="text" placeholder="Employer" value={formData.employer_1} onChange={e => setFormData({...formData, employer_1: e.target.value})} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" />
                  <input type="number" placeholder="Annual Income (£)" value={formData.income_1} onChange={e => setFormData({...formData, income_1: e.target.value})} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" />
                </div>
              </div>
              <div className="mb-6">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={formData.is_joint_application} onChange={e => setFormData({...formData, is_joint_application: e.target.checked})} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" />
                  <span className="font-medium text-gray-900 text-sm">Joint Application</span>
                </label>
              </div>
              {formData.is_joint_application && (
                <div className="mb-6">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <span className="w-6 h-6 bg-gray-100 text-gray-700 rounded-full text-sm flex items-center justify-center">2</span>
                    Second Applicant
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <select value={formData.title_2} onChange={e => setFormData({...formData, title_2: e.target.value})} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none">
                      <option value="">Title</option><option value="Mr">Mr</option><option value="Mrs">Mrs</option><option value="Miss">Miss</option><option value="Ms">Ms</option><option value="Dr">Dr</option>
                    </select>
                    <input type="text" placeholder="First Name" value={formData.first_name_2} onChange={e => setFormData({...formData, first_name_2: e.target.value})} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" />
                    <input type="text" placeholder="Last Name" value={formData.last_name_2} onChange={e => setFormData({...formData, last_name_2: e.target.value})} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" />
                    <input type="email" placeholder="Email" value={formData.email_2} onChange={e => setFormData({...formData, email_2: e.target.value})} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" />
                    <input type="tel" placeholder="Phone" value={formData.phone_2} onChange={e => setFormData({...formData, phone_2: e.target.value})} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" />
                    <input type="date" value={formData.date_of_birth_2} onChange={e => setFormData({...formData, date_of_birth_2: e.target.value})} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" />
                    <input type="text" placeholder="Current Address" value={formData.current_address_2} onChange={e => setFormData({...formData, current_address_2: e.target.value})} className="col-span-2 md:col-span-3 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" />
                    <select value={formData.employment_status_2} onChange={e => setFormData({...formData, employment_status_2: e.target.value})} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none">
                      <option value="">Employment Status</option><option value="Employed">Employed</option><option value="Self-Employed">Self-Employed</option><option value="Unemployed">Unemployed</option><option value="Student">Student</option><option value="Retired">Retired</option>
                    </select>
                    <input type="text" placeholder="Employer" value={formData.employer_2} onChange={e => setFormData({...formData, employer_2: e.target.value})} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" />
                    <input type="number" placeholder="Annual Income (£)" value={formData.income_2} onChange={e => setFormData({...formData, income_2: e.target.value})} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" />
                  </div>
                </div>
              )}
              <div className="mb-6">
                <textarea placeholder="Notes" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-200 focus:outline-none" rows={3} />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium">Create Enquiry</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Kanban Card ─────────────────────────────────────────────────────────────

function KanbanCard({
  enquiry, columnStatus, isDragging, onDragStart, onDragEnd,
}: {
  enquiry: TenantEnquiry; columnStatus: ColumnStatus; isDragging: boolean;
  onDragStart: (e: React.DragEvent, id: number) => void; onDragEnd: () => void;
}) {
  const name = `${enquiry.title_1 ? enquiry.title_1 + ' ' : ''}${enquiry.first_name_1} ${enquiry.last_name_1}`;
  const initials = `${enquiry.first_name_1?.[0] || ''}${enquiry.last_name_1?.[0] || ''}`.toUpperCase();

  return (
    <div draggable onDragStart={e => onDragStart(e, enquiry.id)} onDragEnd={onDragEnd}
      className={`bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing group ${isDragging ? 'opacity-40 scale-95' : ''}`}
    >
      <Link to={`/tenant-enquiries/${enquiry.id}`} className="block p-3" draggable={false}>
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-semibold text-gray-600">{initials}</span>
          </div>
          <span className="text-sm font-semibold text-gray-900 truncate">{name}</span>
        </div>
        {enquiry.property_address && (
          <p className="text-xs text-gray-500 mb-2 flex items-center gap-1.5">
            <Home className="w-3 h-3 text-gray-400" />
            {enquiry.property_address}
          </p>
        )}
        <div className="space-y-0.5 text-xs text-gray-400">
          <div className="flex items-center gap-1.5 truncate">
            <Mail className="w-3 h-3" />{enquiry.email_1}
          </div>
          <div className="flex items-center gap-1.5">
            <Phone className="w-3 h-3" />{enquiry.phone_1}
          </div>
        </div>
      </Link>
    </div>
  );
}

// ── Property Filter Dropdown ────────────────────────────────────────────────

function PropertyFilterDropdown({
  value, onChange, properties, activeCount,
}: {
  value: string; onChange: (v: string) => void; properties: [number, string][]; activeCount: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const options = [
    { value: 'all', label: 'All Properties' },
    { value: 'unlinked', label: 'No Property Linked' },
    ...properties.map(([id, address]) => ({ value: String(id), label: address })),
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
      >
        <Filter className="w-4 h-4" />
        {activeCount > 0 && (
          <span className="w-5 h-5 flex items-center justify-center text-[10px] font-bold bg-gray-900 text-white rounded">
            {activeCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          {options.map(opt => (
            <button key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                value === opt.value ? 'bg-gray-50 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt.label}
              {value === opt.value && <Check className="w-4 h-4 float-right text-gray-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
