import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import {
  Briefcase, Search, UserPlus, MessageSquare, Star, FileText,
  Trophy, XCircle, Building2, User, Globe, Calendar
} from 'lucide-react';

interface BDMRecord {
  id: number;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  status: string;
  notes: string;
  source: string;
  created_at: string;
}

type ColumnStatus = 'new' | 'contacted' | 'interested' | 'proposal_sent' | 'won' | 'lost';

const COLUMNS: { status: ColumnStatus; label: string; icon: typeof UserPlus; color: string }[] = [
  { status: 'new',           label: 'New',           icon: UserPlus,       color: 'bg-emerald-500' },
  { status: 'contacted',     label: 'Contacted',     icon: MessageSquare,  color: 'bg-sky-500' },
  { status: 'interested',    label: 'Interested',    icon: Star,           color: 'bg-amber-500' },
  { status: 'proposal_sent', label: 'Proposal Sent', icon: FileText,       color: 'bg-violet-500' },
  { status: 'won',           label: 'Won',           icon: Trophy,         color: 'bg-green-500' },
  { status: 'lost',          label: 'Lost',          icon: XCircle,        color: 'bg-red-400' },
];

export default function BDMV2() {
  const api = useApi();
  const [records, setRecords] = useState<BDMRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<ColumnStatus | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/landlords-bdm');
      setRecords(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [api]);

  useEffect(() => { load(); }, []);

  const filtered = records.filter(r => {
    if (!search) return true;
    const s = search.toLowerCase();
    return r.company_name?.toLowerCase().includes(s) ||
      r.contact_name?.toLowerCase().includes(s) ||
      r.source?.toLowerCase().includes(s);
  });

  const byStatus = (status: ColumnStatus) => filtered.filter(r => r.status === status);

  const handleDrop = async (status: ColumnStatus) => {
    if (dragId === null) return;
    const record = records.find(r => r.id === dragId);
    if (!record || record.status === status) { setDragId(null); setDragOver(null); return; }
    setRecords(prev => prev.map(r => r.id === dragId ? { ...r, status } : r));
    setDragId(null);
    setDragOver(null);
    try {
      await api.put(`/api/landlords-bdm/${dragId}`, { status });
    } catch { load(); }
  };

  const fmt = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#f6f7f3] font-[Lufga]">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-[#2a2a2a] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen bg-[#f6f7f3] font-[Lufga] overflow-hidden">
      {/* Header */}
      <div className="px-8 pt-8 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center">
            <Briefcase size={18} className="text-orange-600" />
          </div>
          <h1 className="text-lg font-semibold text-[#2a2a2a]">BDM Pipeline</h1>
          <span className="text-sm text-gray-400">{records.length} leads</span>
        </div>
        <div className="relative max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search leads..."
            className="w-full pl-9 pr-4 py-2.5 bg-white rounded-xl border border-gray-200/60 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
          />
        </div>
      </div>

      {/* Kanban */}
      <div className="flex-1 flex gap-4 px-8 pb-8 overflow-x-auto">
        {COLUMNS.map(col => {
          const items = byStatus(col.status);
          const Icon = col.icon;
          return (
            <div
              key={col.status}
              className={`flex-1 min-w-[220px] flex flex-col rounded-2xl border transition-colors ${
                dragOver === col.status ? 'border-orange-300 bg-orange-50/30' : 'border-gray-200/60 bg-white/50'
              }`}
              onDragOver={e => { e.preventDefault(); setDragOver(col.status); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => handleDrop(col.status)}
            >
              {/* Column header */}
              <div className="flex items-center gap-2 p-4 pb-2">
                <div className={`w-2 h-2 rounded-full ${col.color}`} />
                <span className="text-sm font-semibold text-[#2a2a2a]">{col.label}</span>
                <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{items.length}</span>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
                {items.map(r => (
                  <div
                    key={r.id}
                    draggable
                    onDragStart={() => setDragId(r.id)}
                    onDragEnd={() => { setDragId(null); setDragOver(null); }}
                    className={`bg-white rounded-xl border border-gray-200/60 p-3.5 cursor-grab active:cursor-grabbing transition-opacity ${
                      dragId === r.id ? 'opacity-40' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <Building2 size={14} className="text-gray-400 mt-0.5 shrink-0" />
                      <p className="text-sm font-medium text-[#2a2a2a] leading-tight">{r.company_name || 'Unnamed'}</p>
                    </div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <User size={12} className="text-gray-300" />
                      <span className="text-xs text-gray-500">{r.contact_name || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      {r.source && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Globe size={10} /> {r.source}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-gray-400 ml-auto">
                        <Calendar size={10} /> {fmt(r.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
