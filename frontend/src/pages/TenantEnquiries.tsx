import { useState, useEffect, useCallback, type ErrorInfo, Component, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import {
  UserPlus, Calendar, Clock, CheckCircle, XCircle, Search, Users,
  Mail, Phone, ShieldCheck, ChevronDown, ChevronRight, GripVertical,
  Home, Eye
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

// ── Column config ───────────────────────────────────────────────────────────

const COLUMNS: {
  status: ColumnStatus;
  label: string;
  icon: typeof UserPlus;
  accent: string;       // text color
  headerBg: string;     // header pill bg
  colBg: string;        // column background
  dropBorder: string;   // border when drag-over
  collapsed?: boolean;
}[] = [
  { status: 'new',               label: 'New',               icon: UserPlus,    accent: 'text-blue-700',   headerBg: 'bg-blue-100',   colBg: 'bg-blue-50/40',   dropBorder: 'border-blue-400' },
  { status: 'viewing_booked',    label: 'Viewing Booked',    icon: Eye,         accent: 'text-purple-700', headerBg: 'bg-purple-100', colBg: 'bg-purple-50/40', dropBorder: 'border-purple-400' },
  { status: 'awaiting_response', label: 'Awaiting Response', icon: Clock,       accent: 'text-amber-700',  headerBg: 'bg-amber-100',  colBg: 'bg-amber-50/40',  dropBorder: 'border-amber-400' },
  { status: 'onboarding',        label: 'Onboarding',        icon: CheckCircle, accent: 'text-green-700',  headerBg: 'bg-green-100',  colBg: 'bg-green-50/40',  dropBorder: 'border-green-400' },
  { status: 'converted',         label: 'Converted',         icon: Users,       accent: 'text-gray-600',   headerBg: 'bg-gray-100',   colBg: 'bg-gray-50/40',   dropBorder: 'border-gray-400' },
  { status: 'rejected',          label: 'Rejected',          icon: XCircle,     accent: 'text-red-600',    headerBg: 'bg-red-100',    colBg: 'bg-red-50/40',    dropBorder: 'border-red-400', collapsed: true },
];

// ── Wrapper (default export) ────────────────────────────────────────────────

export default function TenantEnquiriesWrapper() {
  return <EnquiryErrorBoundary><TenantEnquiriesKanban /></EnquiryErrorBoundary>;
}

// ── Main Component ──────────────────────────────────────────────────────────

function TenantEnquiriesKanban() {
  const api = useApi();
  const [enquiries, setEnquiries] = useState<TenantEnquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<ColumnStatus | null>(null);
  const [collapsedCols, setCollapsedCols] = useState<Set<ColumnStatus>>(
    () => new Set(COLUMNS.filter(c => c.collapsed).map(c => c.status))
  );

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
      console.error('Failed to load enquiries:', err);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { loadEnquiries(); }, []);

  // ── Search filter ───────────────────────────────────────────────────────

  const filtered = search
    ? enquiries.filter(e => {
        const s = search.toLowerCase();
        return (
          e.first_name_1?.toLowerCase().includes(s) ||
          e.last_name_1?.toLowerCase().includes(s) ||
          e.email_1?.toLowerCase().includes(s) ||
          e.phone_1?.includes(s) ||
          e.property_address?.toLowerCase().includes(s)
        );
      })
    : enquiries;

  const byStatus = (status: ColumnStatus) => filtered.filter(e => e.status === status);

  // ── Drag & Drop ─────────────────────────────────────────────────────────

  const onDragStart = (e: React.DragEvent, id: number) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(id));
  };

  const onDragOver = (e: React.DragEvent, status: ColumnStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(status);
  };

  const onDragLeave = () => { setDragOver(null); };

  const onDrop = async (e: React.DragEvent, newStatus: ColumnStatus) => {
    e.preventDefault();
    setDragOver(null);
    const id = Number(e.dataTransfer.getData('text/plain'));
    if (!id) return;
    const enquiry = enquiries.find(en => en.id === id);
    if (!enquiry || enquiry.status === newStatus) { setDragId(null); return; }

    // Optimistic update
    setEnquiries(prev => prev.map(en => en.id === id ? { ...en, status: newStatus } : en));
    setDragId(null);

    try {
      await api.put(`/api/tenant-enquiries/${id}`, { status: newStatus });
    } catch (err: any) {
      // Revert on failure
      setEnquiries(prev => prev.map(en => en.id === id ? { ...en, status: enquiry.status } : en));
      console.error('Failed to update status:', err);
    }
  };

  const onDragEnd = () => { setDragId(null); setDragOver(null); };

  // ── Toggle collapsed column ─────────────────────────────────────────────

  const toggleCollapsed = (status: ColumnStatus) => {
    setCollapsedCols(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  };

  // ── Form submit ─────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/tenant-enquiries', formData);
      setShowForm(false);
      setFormData(emptyForm);
      loadEnquiries();
    } catch (err: any) {
      alert(err.message || 'Failed to create enquiry');
    }
  };

  // ── Loading / Error states ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-navy-200 border-t-navy-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-red-50 rounded-xl">
        <h2 className="text-red-700 font-bold text-lg mb-2">Failed to load enquiries</h2>
        <p className="text-red-600">{error}</p>
        <button onClick={() => { setError(null); setLoading(true); loadEnquiries(); }} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg">Retry</button>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Tenant Enquiries</h1>
          <p className="text-gray-500 text-sm">Drag cards between columns to update status</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search enquiries…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-navy-500 focus:border-transparent text-sm w-56"
            />
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-navy-600 hover:bg-navy-700 text-white font-medium rounded-xl transition-colors text-sm"
          >
            <UserPlus className="w-4 h-4" />
            Add Enquiry
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden pb-2">
        <div className="flex gap-4 h-full min-w-max">
          {COLUMNS.map(col => {
            const items = byStatus(col.status);
            const isCollapsed = collapsedCols.has(col.status);
            const isDragTarget = dragOver === col.status && dragId !== null;
            const Icon = col.icon;

            if (isCollapsed) {
              return (
                <div
                  key={col.status}
                  className="flex-shrink-0 w-12 cursor-pointer"
                  onClick={() => toggleCollapsed(col.status)}
                  onDragOver={e => onDragOver(e, col.status)}
                  onDragLeave={onDragLeave}
                  onDrop={e => { toggleCollapsed(col.status); onDrop(e, col.status); }}
                >
                  <div className={`h-full rounded-xl border-2 border-dashed flex flex-col items-center pt-4 gap-2 transition-colors ${
                    isDragTarget ? `${col.dropBorder} ${col.colBg}` : 'border-gray-200 bg-gray-50/60'
                  }`}>
                    <ChevronRight className={`w-4 h-4 ${col.accent}`} />
                    <span className={`text-xs font-semibold ${col.accent} [writing-mode:vertical-lr]`}>
                      {col.label} ({items.length})
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={col.status}
                className={`flex-shrink-0 w-72 flex flex-col rounded-xl border-2 transition-colors ${
                  isDragTarget ? `${col.dropBorder} ${col.colBg}` : `border-transparent ${col.colBg}`
                }`}
                onDragOver={e => onDragOver(e, col.status)}
                onDragLeave={onDragLeave}
                onDrop={e => onDrop(e, col.status)}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg ${col.headerBg} flex items-center justify-center`}>
                      <Icon className={`w-4 h-4 ${col.accent}`} />
                    </div>
                    <span className="text-sm font-semibold text-gray-800">{col.label}</span>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${col.headerBg} ${col.accent}`}>
                      {items.length}
                    </span>
                  </div>
                  {(col.status === 'rejected' || col.status === 'converted') && (
                    <button onClick={() => toggleCollapsed(col.status)} className="text-gray-400 hover:text-gray-600">
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-0">
                  {items.length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-xs">No enquiries</div>
                  )}
                  {items.map(enquiry => (
                    <EnquiryCard
                      key={enquiry.id}
                      enquiry={enquiry}
                      isDragging={dragId === enquiry.id}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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
                  <select value={formData.title_1} onChange={e => setFormData({...formData, title_1: e.target.value})} className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500">
                    <option value="">Title</option>
                    <option value="Mr">Mr</option><option value="Mrs">Mrs</option><option value="Miss">Miss</option><option value="Ms">Ms</option><option value="Dr">Dr</option>
                  </select>
                  <input type="text" placeholder="First Name *" value={formData.first_name_1} onChange={e => setFormData({...formData, first_name_1: e.target.value})} className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500" required />
                  <input type="text" placeholder="Last Name *" value={formData.last_name_1} onChange={e => setFormData({...formData, last_name_1: e.target.value})} className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500" required />
                  <input type="email" placeholder="Email *" value={formData.email_1} onChange={e => setFormData({...formData, email_1: e.target.value})} className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500" required />
                  <input type="tel" placeholder="Phone *" value={formData.phone_1} onChange={e => setFormData({...formData, phone_1: e.target.value})} className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500" required />
                  <input type="date" value={formData.date_of_birth_1} onChange={e => setFormData({...formData, date_of_birth_1: e.target.value})} className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500" />
                  <input type="text" placeholder="Current Address" value={formData.current_address_1} onChange={e => setFormData({...formData, current_address_1: e.target.value})} className="col-span-2 md:col-span-3 border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500" />
                  <select value={formData.employment_status_1} onChange={e => setFormData({...formData, employment_status_1: e.target.value})} className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500">
                    <option value="">Employment Status</option>
                    <option value="Employed">Employed</option><option value="Self-Employed">Self-Employed</option><option value="Unemployed">Unemployed</option><option value="Student">Student</option><option value="Retired">Retired</option>
                  </select>
                  <input type="text" placeholder="Employer" value={formData.employer_1} onChange={e => setFormData({...formData, employer_1: e.target.value})} className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500" />
                  <input type="number" placeholder="Annual Income (£)" value={formData.income_1} onChange={e => setFormData({...formData, income_1: e.target.value})} className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500" />
                </div>
              </div>
              {/* Joint Toggle */}
              <div className="mb-6">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={formData.is_joint_application} onChange={e => setFormData({...formData, is_joint_application: e.target.checked})} className="w-5 h-5 rounded border-gray-300 text-navy-600 focus:ring-navy-500" />
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
                    <select value={formData.title_2} onChange={e => setFormData({...formData, title_2: e.target.value})} className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500">
                      <option value="">Title</option>
                      <option value="Mr">Mr</option><option value="Mrs">Mrs</option><option value="Miss">Miss</option><option value="Ms">Ms</option><option value="Dr">Dr</option>
                    </select>
                    <input type="text" placeholder="First Name" value={formData.first_name_2} onChange={e => setFormData({...formData, first_name_2: e.target.value})} className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500" />
                    <input type="text" placeholder="Last Name" value={formData.last_name_2} onChange={e => setFormData({...formData, last_name_2: e.target.value})} className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500" />
                    <input type="email" placeholder="Email" value={formData.email_2} onChange={e => setFormData({...formData, email_2: e.target.value})} className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500" />
                    <input type="tel" placeholder="Phone" value={formData.phone_2} onChange={e => setFormData({...formData, phone_2: e.target.value})} className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500" />
                    <input type="date" value={formData.date_of_birth_2} onChange={e => setFormData({...formData, date_of_birth_2: e.target.value})} className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500" />
                    <input type="text" placeholder="Current Address" value={formData.current_address_2} onChange={e => setFormData({...formData, current_address_2: e.target.value})} className="col-span-2 md:col-span-3 border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500" />
                    <select value={formData.employment_status_2} onChange={e => setFormData({...formData, employment_status_2: e.target.value})} className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500">
                      <option value="">Employment Status</option>
                      <option value="Employed">Employed</option><option value="Self-Employed">Self-Employed</option><option value="Unemployed">Unemployed</option><option value="Student">Student</option><option value="Retired">Retired</option>
                    </select>
                    <input type="text" placeholder="Employer" value={formData.employer_2} onChange={e => setFormData({...formData, employer_2: e.target.value})} className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500" />
                    <input type="number" placeholder="Annual Income (£)" value={formData.income_2} onChange={e => setFormData({...formData, income_2: e.target.value})} className="border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-navy-500" />
                  </div>
                </div>
              )}
              {/* Notes */}
              <div className="mb-6">
                <textarea placeholder="Notes" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-navy-500" rows={3} />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium">Cancel</button>
                <button type="submit" className="px-6 py-2.5 bg-navy-600 text-white rounded-xl hover:bg-navy-700 font-medium">Create Enquiry</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Card Component ──────────────────────────────────────────────────────────

function EnquiryCard({
  enquiry,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  enquiry: TenantEnquiry;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, id: number) => void;
  onDragEnd: () => void;
}) {
  const name = `${enquiry.title_1 ? enquiry.title_1 + ' ' : ''}${enquiry.first_name_1} ${enquiry.last_name_1}`;

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, enquiry.id)}
      onDragEnd={onDragEnd}
      className={`bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing group ${
        isDragging ? 'opacity-40 scale-95' : ''
      }`}
    >
      <Link to={`/tenant-enquiries/${enquiry.id}`} className="block p-3" draggable={false}>
        {/* Name row */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <GripVertical className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-gray-900 truncate">{name}</span>
        </div>

        {/* Property — prominent */}
        <div className={`flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg mb-2 ${
          enquiry.property_address
            ? 'bg-navy-50 text-navy-700'
            : 'bg-gray-50 text-gray-400 border border-dashed border-gray-200'
        }`}>
          <Home className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate font-medium">{enquiry.property_address || 'No property linked'}</span>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1 mb-2">
          {enquiry.is_joint_application === 1 && (
            <span className="text-[10px] font-medium bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">Joint</span>
          )}
          {enquiry.kyc_completed_1 === 1 && (
            <span className="text-[10px] font-medium bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <ShieldCheck className="w-3 h-3" />KYC
            </span>
          )}
          {enquiry.is_joint_application === 1 && enquiry.kyc_completed_2 === 1 && (
            <span className="text-[10px] font-medium bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <ShieldCheck className="w-3 h-3" />KYC 2
            </span>
          )}
        </div>

        {/* Contact */}
        <div className="space-y-0.5 text-xs text-gray-500">
          <div className="flex items-center gap-1.5 truncate">
            <Mail className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{enquiry.email_1}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Phone className="w-3 h-3 flex-shrink-0" />
            <span>{enquiry.phone_1}</span>
          </div>
        </div>

        {/* Dates */}
        <div className="mt-2 space-y-0.5">
          {enquiry.viewing_date && (
            <div className="flex items-center gap-1.5 text-xs text-purple-600">
              <Calendar className="w-3 h-3 flex-shrink-0" />
              <span>Viewing: {new Date(enquiry.viewing_date).toLocaleDateString('en-GB')}</span>
            </div>
          )}
          {enquiry.follow_up_date && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600">
              <Clock className="w-3 h-3 flex-shrink-0" />
              <span>Follow-up: {new Date(enquiry.follow_up_date).toLocaleDateString('en-GB')}</span>
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
