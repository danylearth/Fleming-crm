import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { Button, Avatar, SearchBar, EmptyState, Input, Select } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { getPropertyImage } from '../utils/propertyImages';
import { Plus, X, GripVertical, Clock, Eye, CheckCircle, XCircle, UserPlus, LayoutGrid, List } from 'lucide-react';

interface EnquiryRaw {
  id: number;
  first_name_1?: string;
  last_name_1?: string;
  email_1?: string;
  phone_1?: string;
  status: string;
  created_at: string;
  updated_at?: string;
  linked_property_id?: number;
  property_address?: string;
  income_1?: number;
  employment_status_1?: string;
  is_joint_application?: number;
  kyc_completed_1?: number;
  notes?: string;
}

interface Property {
  id: number;
  address: string;
  postcode?: string;
  rent_amount?: number;
  bedrooms?: number;
  property_type?: string;
}

const COLUMNS = [
  { key: 'new', label: 'New', icon: Plus, color: 'from-blue-500 to-cyan-500', dotColor: 'bg-blue-500' },
  { key: 'viewing_booked', label: 'Viewing Booked', icon: Eye, color: 'from-purple-500 to-violet-500', dotColor: 'bg-purple-500' },
  { key: 'awaiting_response', label: 'Awaiting Response', icon: Clock, color: 'from-amber-500 to-orange-500', dotColor: 'bg-amber-500' },
  { key: 'onboarding', label: 'Onboarding', icon: UserPlus, color: 'from-green-500 to-emerald-500', dotColor: 'bg-green-500' },
  { key: 'converted', label: 'Converted', icon: CheckCircle, color: 'from-emerald-500 to-teal-500', dotColor: 'bg-emerald-500' },
  { key: 'rejected', label: 'Rejected', icon: XCircle, color: 'from-red-500 to-rose-500', dotColor: 'bg-red-500' },
];

function formatTime(d: string) {
  const date = new Date(d);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function EnquiryCard({ enquiry, property, onStatusChange, onClick }: {
  enquiry: EnquiryRaw;
  property?: Property;
  onStatusChange: (id: number, status: string) => void;
  onClick: () => void;
}) {
  const name = [enquiry.first_name_1, enquiry.last_name_1].filter(Boolean).join(' ') || 'Unknown';
  const hasProperty = !!property;

  return (
    <div
      onClick={onClick}
      className="group bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] overflow-hidden cursor-pointer hover:border-[var(--border-input)] hover:brightness-110 transition-all"
    >
      {/* Property Image */}
      {hasProperty ? (
        <div className="relative h-28 overflow-hidden">
          <img
            src={getPropertyImage(property!.id, 400, 200)}
            alt={property!.address}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute bottom-2 left-3 right-3">
            <p className="text-xs text-white/90 font-medium truncate">{property!.address}</p>
            {property!.rent_amount && (
              <p className="text-[10px] text-white/60">£{property!.rent_amount}/mo{property!.bedrooms ? ` · ${property!.bedrooms} bed` : ''}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="h-16 bg-gradient-to-br from-[var(--bg-hover)] to-[var(--bg-subtle)] flex items-center justify-center">
          <span className="text-xs text-[var(--text-muted)]">No property linked</span>
        </div>
      )}

      {/* Card Body */}
      <div className="p-3.5">
        <div className="flex items-center gap-2.5 mb-2">
          <Avatar name={name} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{name}</p>
            <p className="text-[10px] text-[var(--text-muted)]">{formatTime(enquiry.created_at)}</p>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {enquiry.employment_status_1 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--bg-hover)] text-[var(--text-secondary)]">
              {enquiry.employment_status_1}
            </span>
          )}
          {enquiry.income_1 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--bg-hover)] text-[var(--text-secondary)]">
              £{(enquiry.income_1 / 1000).toFixed(0)}k/yr
            </span>
          )}
          {enquiry.is_joint_application ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-pink-500/15 text-pink-400">
              Joint
            </span>
          ) : null}
          {enquiry.kyc_completed_1 ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400">
              KYC ✓
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function EnquiriesKanbanV3() {
  const api = useApi();
  const navigate = useNavigate();
  const [enquiries, setEnquiries] = useState<EnquiryRaw[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', email: '', phone: '', status: 'new' });
  const [dragItem, setDragItem] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const [enq, props] = await Promise.all([
        api.get('/api/tenant-enquiries'),
        api.get('/api/properties').catch(() => []),
      ]);
      setEnquiries(Array.isArray(enq) ? enq : []);
      setProperties(Array.isArray(props) ? props : []);
    } catch { }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: number, status: string) => {
    try {
      await api.put(`/api/tenant-enquiries/${id}`, { status });
      setEnquiries(prev => prev.map(e => e.id === id ? { ...e, status } : e));
    } catch { }
  };

  const addEnquiry = async () => {
    const [firstName, ...lastParts] = addForm.name.trim().split(' ');
    try {
      await api.post('/api/tenant-enquiries', {
        first_name_1: firstName || '', last_name_1: lastParts.join(' ') || '',
        email_1: addForm.email, phone_1: addForm.phone, status: addForm.status,
      });
      setShowAdd(false);
      setAddForm({ name: '', email: '', phone: '', status: 'new' });
      await load();
    } catch { }
  };

  const filtered = enquiries.filter(e => {
    if (!search) return true;
    const name = `${e.first_name_1 || ''} ${e.last_name_1 || ''}`.toLowerCase();
    return name.includes(search.toLowerCase()) || (e.email_1 || '').toLowerCase().includes(search.toLowerCase());
  });

  const propMap = new Map(properties.map(p => [p.id, p]));

  return (
    <V3Layout title="Enquiries" breadcrumb={[{ label: 'Enquiries' }]}>
      <div className="flex flex-col h-full">
        {/* Top Bar */}
        <div className="flex items-center gap-3 px-4 md:px-6 py-3 border-b border-[var(--border-subtle)] shrink-0">
          <div className="flex-1 max-w-sm">
            <SearchBar value={search} onChange={setSearch} placeholder="Search enquiries..." />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/v3/enquiries')}
              className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              title="List view"
            >
              <List size={18} />
            </button>
            <button
              className="p-2 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] transition-colors"
              title="Kanban view"
            >
              <LayoutGrid size={18} />
            </button>
          </div>
          <Button variant="gradient" size="sm" onClick={() => setShowAdd(true)}>
            <Plus size={14} className="mr-1.5" /> Add
          </Button>
        </div>

        {/* Kanban Board */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-[var(--border-input)] border-t-orange-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex gap-4 p-4 md:p-6 h-full min-w-max">
              {COLUMNS.map(col => {
                const colEnquiries = filtered.filter(e => e.status === col.key);
                const Icon = col.icon;
                return (
                  <div
                    key={col.key}
                    className="w-[280px] shrink-0 flex flex-col"
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                    onDrop={e => {
                      e.preventDefault();
                      const id = parseInt(e.dataTransfer.getData('text/plain'));
                      if (id && !isNaN(id)) updateStatus(id, col.key);
                    }}
                  >
                    {/* Column Header */}
                    <div className="flex items-center gap-2.5 mb-3 px-1">
                      <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${col.color} flex items-center justify-center`}>
                        <Icon size={14} className="text-white" />
                      </div>
                      <span className="text-sm font-semibold">{col.label}</span>
                      <span className="ml-auto text-xs text-[var(--text-muted)] bg-[var(--bg-hover)] px-2 py-0.5 rounded-full">
                        {colEnquiries.length}
                      </span>
                    </div>

                    {/* Cards */}
                    <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-4">
                      {colEnquiries.length === 0 ? (
                        <div className="flex items-center justify-center h-24 rounded-2xl border-2 border-dashed border-[var(--border-subtle)] text-[var(--text-muted)] text-xs">
                          Drop here
                        </div>
                      ) : (
                        colEnquiries.map(e => (
                          <div
                            key={e.id}
                            draggable
                            onDragStart={ev => {
                              ev.dataTransfer.setData('text/plain', String(e.id));
                              setDragItem(e.id);
                            }}
                            onDragEnd={() => setDragItem(null)}
                            className={dragItem === e.id ? 'opacity-50' : ''}
                          >
                            <EnquiryCard
                              enquiry={e}
                              property={e.linked_property_id ? propMap.get(e.linked_property_id) : undefined}
                              onStatusChange={updateStatus}
                              onClick={() => navigate('/v3/enquiries', { state: { selectedId: e.id } })}
                            />
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Add Modal */}
        {showAdd && (
          <div className="fixed inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAdd(false)}>
            <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-input)] w-full max-w-[480px] p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold">New Enquiry</h3>
                <button onClick={() => setShowAdd(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <Input label="Name" value={addForm.name} onChange={v => setAddForm(p => ({ ...p, name: v }))} placeholder="Full name" />
                <Input label="Email" value={addForm.email} onChange={v => setAddForm(p => ({ ...p, email: v }))} placeholder="email@example.com" type="email" />
                <Input label="Phone" value={addForm.phone} onChange={v => setAddForm(p => ({ ...p, phone: v }))} placeholder="Phone number" />
                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
                  <Button variant="gradient" onClick={addEnquiry} disabled={!addForm.name || !addForm.email}>Add Enquiry</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </V3Layout>
  );
}
