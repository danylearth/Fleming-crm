import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import {
  UserPlus, Eye, Clock, CheckCircle, Users, XCircle, Search,
  Plus, MoreHorizontal, Phone, Mail, Home, Calendar, ChevronRight,
  ArrowUpRight, GripVertical, MessageSquare
} from 'lucide-react';

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

const COLUMNS: { status: ColumnStatus; label: string; icon: typeof UserPlus; color: string }[] = [
  { status: 'new',               label: 'New',         icon: UserPlus,    color: 'bg-emerald-500' },
  { status: 'viewing_booked',    label: 'Viewing',     icon: Eye,         color: 'bg-violet-500' },
  { status: 'awaiting_response', label: 'Awaiting',    icon: Clock,       color: 'bg-amber-500' },
  { status: 'onboarding',        label: 'Onboarding',  icon: CheckCircle, color: 'bg-sky-500' },
  { status: 'converted',         label: 'Converted',   icon: Users,       color: 'bg-gray-400' },
  { status: 'rejected',          label: 'Rejected',    icon: XCircle,     color: 'bg-red-400' },
];

export default function EnquiriesV2() {
  const api = useApi();
  const [enquiries, setEnquiries] = useState<TenantEnquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<ColumnStatus | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/tenant-enquiries');
      setEnquiries(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [api]);

  useEffect(() => { load(); }, []);

  const filtered = enquiries.filter(e => {
    if (!search) return true;
    const s = search.toLowerCase();
    return e.first_name_1?.toLowerCase().includes(s) || e.last_name_1?.toLowerCase().includes(s) ||
      e.email_1?.toLowerCase().includes(s) || e.property_address?.toLowerCase().includes(s);
  });

  const byStatus = (status: ColumnStatus) => filtered.filter(e => e.status === status);

  const handleDragStart = (id: number) => setDragId(id);
  const handleDragOver = (e: React.DragEvent, status: ColumnStatus) => {
    e.preventDefault();
    setDragOver(status);
  };
  const handleDrop = async (status: ColumnStatus) => {
    if (dragId === null) return;
    const enquiry = enquiries.find(e => e.id === dragId);
    if (!enquiry || enquiry.status === status) { setDragId(null); setDragOver(null); return; }

    // Optimistic update
    setEnquiries(prev => prev.map(e => e.id === dragId ? { ...e, status } : e));
    setDragId(null);
    setDragOver(null);

    try {
      await api.put(`/api/tenant-enquiries/${dragId}`, { ...enquiry, status });
    } catch {
      setEnquiries(prev => prev.map(e => e.id === dragId ? { ...e, status: enquiry.status } : e));
    }
  };

  const totalByStatus = COLUMNS.map(c => ({ ...c, count: byStatus(c.status).length }));
  const totalEnquiries = filtered.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-gray-200/40" style={{ background: '#f6f7f3' }}>
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Enquiries</h1>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-200/60 text-gray-600">{totalEnquiries}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search applicants..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 text-sm bg-white border border-gray-200/60 rounded-xl w-64 focus:outline-none focus:ring-2 focus:ring-gray-200 font-[Lufga]"
            />
          </div>
          <Link to="/tenant-enquiries"
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-500 border border-gray-200/60 rounded-xl hover:bg-white transition-colors">
            List view <ArrowUpRight className="w-3 h-3" />
          </Link>
          <button className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#2a2a2a] rounded-xl hover:bg-[#1a1a1a] transition-colors">
            <Plus className="w-3.5 h-3.5" /> New Enquiry
          </button>
        </div>
      </div>

      {/* Pipeline summary strip */}
      <div className="flex items-center gap-6 px-8 py-3 border-b border-gray-200/40 bg-white/50">
        {totalByStatus.map(col => (
          <div key={col.status} className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${col.color}`} />
            <span className="text-xs text-gray-500">{col.label}</span>
            <span className="text-xs font-bold text-gray-900">{col.count}</span>
          </div>
        ))}
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 p-6 h-full min-w-max">
          {COLUMNS.map(col => {
            const cards = byStatus(col.status);
            const isOver = dragOver === col.status;
            return (
              <div
                key={col.status}
                className={`w-72 flex flex-col rounded-2xl transition-colors ${
                  isOver ? 'bg-gray-100/80' : 'bg-transparent'
                }`}
                onDragOver={e => handleDragOver(e, col.status)}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => handleDrop(col.status)}
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-3 py-2.5 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{col.label}</span>
                    <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{cards.length}</span>
                  </div>
                  <button className="text-gray-300 hover:text-gray-500">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Cards */}
                <div className="flex-1 space-y-2.5 px-1 overflow-y-auto pb-4">
                  {cards.map(enquiry => (
                    <EnquiryCard key={enquiry.id} enquiry={enquiry} onDragStart={handleDragStart} />
                  ))}
                  {cards.length === 0 && (
                    <div className="flex items-center justify-center py-12">
                      <p className="text-xs text-gray-300">No enquiries</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EnquiryCard({ enquiry, onDragStart }: { enquiry: TenantEnquiry; onDragStart: (id: number) => void }) {
  const name = `${enquiry.first_name_1 || ''} ${enquiry.last_name_1 || ''}`.trim() || 'Unknown';
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const daysAgo = Math.floor((Date.now() - new Date(enquiry.created_at).getTime()) / 86400000);
  const hasViewing = !!enquiry.viewing_date;
  const viewingStr = hasViewing ? new Date(enquiry.viewing_date!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;

  return (
    <Link
      to={`/tenant-enquiries/${enquiry.id}`}
      draggable
      onDragStart={() => onDragStart(enquiry.id)}
      className="block bg-white rounded-xl border border-gray-200/60 p-4 hover:border-gray-300 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing group"
    >
      {/* Top row: avatar + name + menu */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <span className="text-[10px] font-semibold text-gray-600">{initials}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 leading-tight">{name}</p>
            {enquiry.is_joint_application ? (
              <p className="text-[10px] text-gray-400">Joint · {enquiry.first_name_2} {enquiry.last_name_2}</p>
            ) : (
              <p className="text-[10px] text-gray-400">{daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}</p>
            )}
          </div>
        </div>
        <button className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.preventDefault()}>
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Property */}
      {enquiry.property_address && (
        <div className="flex items-center gap-1.5 mb-2.5">
          <Home className="w-3 h-3 text-gray-300" />
          <p className="text-xs text-gray-500 truncate">{enquiry.property_address}</p>
        </div>
      )}

      {/* Bottom row: contact + viewing */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {enquiry.email_1 && (
            <div className="w-6 h-6 rounded-lg bg-gray-50 flex items-center justify-center" title={enquiry.email_1}>
              <Mail className="w-3 h-3 text-gray-400" />
            </div>
          )}
          {enquiry.phone_1 && (
            <div className="w-6 h-6 rounded-lg bg-gray-50 flex items-center justify-center" title={enquiry.phone_1}>
              <Phone className="w-3 h-3 text-gray-400" />
            </div>
          )}
          {enquiry.kyc_completed_1 === 1 && (
            <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center" title="KYC verified">
              <CheckCircle className="w-3 h-3 text-emerald-500" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasViewing && (
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-violet-400" />
              <span className="text-[10px] font-medium text-violet-600">{viewingStr}</span>
            </div>
          )}
          {enquiry.is_joint_application === 1 && (
            <div className="flex -space-x-1">
              <div className="w-5 h-5 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center">
                <span className="text-[7px] font-bold text-gray-500">{enquiry.first_name_1?.[0]}</span>
              </div>
              <div className="w-5 h-5 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center">
                <span className="text-[7px] font-bold text-gray-500">{enquiry.first_name_2?.[0]}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
