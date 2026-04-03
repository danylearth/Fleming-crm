import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { Button, Avatar, SearchBar, EmptyState, Input, Select, DatePicker } from '../components/v3';
import { useApi } from '../hooks/useApi';
import { getPropertyImage } from '../utils/propertyImages';
import {
  Plus, X, XCircle, LayoutGrid, List,
  ChevronDown, ArrowRight, Archive, CalendarDays, Building2, Search
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import {
  NewIcon, BookingIcon, AwaitingIcon, OnboardingIcon, ConvertedIcon
} from '../components/v3/icons/FlemingIcons';

interface EnquiryRaw {
  id: number;
  first_name_1?: string; last_name_1?: string;
  email_1?: string; phone_1?: string;
  status: string; created_at: string; updated_at?: string;
  linked_property_id?: number; property_address?: string;
  income_1?: number; employment_status_1?: string;
  is_joint_application?: number; joint_partner_id?: number; kyc_completed_1?: number;
  follow_up_date?: string; viewing_date?: string;
  notes?: string; rejection_reason?: string;
}

interface Property {
  id: number; address: string; postcode?: string;
  rent_amount?: number; bedrooms?: number; property_type?: string;
}

const COLUMNS = [
  { key: 'new', label: 'New', icon: NewIcon, color: 'from-blue-500 to-cyan-500' },
  { key: 'viewing_booked', label: 'Viewing Booked', icon: BookingIcon, color: 'from-purple-500 to-violet-500' },
  { key: 'awaiting_response', label: 'Awaiting Response', icon: AwaitingIcon, color: 'from-amber-500 to-orange-500' },
  { key: 'onboarding', label: 'Onboarding', icon: OnboardingIcon, color: 'from-green-500 to-emerald-500' },
  { key: 'converted', label: 'Converted', icon: ConvertedIcon, color: 'from-emerald-500 to-teal-500' },
];

function formatTime(d: string) {
  const date = new Date(d);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function isToday(d: string) {
  const date = new Date(d);
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function isFuture(d?: string | null) {
  if (!d) return false;
  const date = new Date(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date > today;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isPastOrToday(d?: string | null) {
  if (!d) return true;
  const date = new Date(d);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return date <= today;
}

// ─── Action Modal ───
function ActionModal({ enquiry, properties, onClose, onAction }: {
  enquiry: EnquiryRaw;
  properties: Property[];
  onClose: () => void;
  onAction: (id: number, action: string, data: Record<string, string | number | null>) => Promise<void>;
}) {
  const name = [enquiry.first_name_1, enquiry.last_name_1].filter(Boolean).join(' ') || 'Unknown';
  const [mode, setMode] = useState<'choose' | 'viewing' | 'awaiting' | 'onboarding' | 'reject'>('choose');
  const [propertyId, setPropertyId] = useState(enquiry.linked_property_id?.toString() || '');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      switch (mode) {
        case 'viewing':
          await onAction(enquiry.id, 'viewing_booked', {
            linked_property_id: propertyId ? Number(propertyId) : null,
            viewing_date: date,
            viewing_time: time,
          });
          break;
        case 'awaiting':
          await onAction(enquiry.id, 'awaiting_response', { follow_up_date: date });
          break;
        case 'onboarding':
          await onAction(enquiry.id, 'onboarding', { follow_up_date: date || null });
          break;
        case 'reject':
          await onAction(enquiry.id, 'rejected', { rejection_reason: reason });
          break;
      }
      onClose();
    } catch { /* action failed */ }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-input)] w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <Avatar name={name} size="md" />
            <div>
              <h3 className="text-lg font-bold">{name}</h3>
              <p className="text-xs text-[var(--text-muted)]">Update workflow</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
        </div>

        {mode === 'choose' ? (
          <div className="space-y-2">
            <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-3">Progress</p>
            <button onClick={() => setMode('viewing')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors text-left">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center">
                <BookingIcon size={14} className="text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Book Viewing</p>
                <p className="text-xs text-[var(--text-muted)]">Select date, time & property</p>
              </div>
              <ArrowRight size={14} className="text-[var(--text-muted)]" />
            </button>
            <button onClick={() => setMode('awaiting')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors text-left">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                <AwaitingIcon size={14} className="text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Awaiting Client Response</p>
                <p className="text-xs text-[var(--text-muted)]">Set follow-up date — disappears until then</p>
              </div>
              <ArrowRight size={14} className="text-[var(--text-muted)]" />
            </button>
            <button onClick={() => setMode('onboarding')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors text-left">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                <OnboardingIcon size={14} className="text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Start Onboarding</p>
                <p className="text-xs text-[var(--text-muted)]">Optional follow-up date</p>
              </div>
              <ArrowRight size={14} className="text-[var(--text-muted)]" />
            </button>

            <div className="h-px bg-[var(--border-subtle)] my-3" />
            <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-2">Archive</p>
            <button onClick={() => setMode('reject')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 transition-colors text-left">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center">
                <XCircle size={14} className="text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-red-400">Reject & Archive</p>
                <p className="text-xs text-[var(--text-muted)]">Removes from queue, stays searchable</p>
              </div>
              <ArrowRight size={14} className="text-[var(--text-muted)]" />
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Back */}
            <button onClick={() => setMode('choose')} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1">
              ← Back
            </button>

            {mode === 'viewing' && (
              <>
                <Select label="Link to Property" value={propertyId} onChange={setPropertyId}
                  options={[{ value: '', label: 'Select property...' }, ...properties.map(p => ({
                    value: String(p.id), label: `${p.address}${p.postcode ? `, ${p.postcode}` : ''}${p.rent_amount ? ` — £${p.rent_amount}/mo` : ''}`
                  }))]} />
                <DatePicker label="Viewing Date" value={date} onChange={setDate} />
                <Input label="Viewing Time" value={time} onChange={setTime} type="time" />
                <p className="text-xs text-[var(--text-muted)]">
                  Creates a Property Viewing. Card disappears from queue and reappears on the viewing date.
                </p>
              </>
            )}

            {mode === 'awaiting' && (
              <>
                <DatePicker label="Follow-up Date" value={date} onChange={setDate} />
                <p className="text-xs text-[var(--text-muted)]">
                  Card disappears from the queue and reappears on this date.
                </p>
              </>
            )}

            {mode === 'onboarding' && (
              <>
                <DatePicker label="Follow-up Date (optional)" value={date} onChange={setDate} />
                <p className="text-xs text-[var(--text-muted)]">
                  {date ? 'Card will disappear and reappear on this date.' : 'Card stays visible in the Onboarding column.'}
                </p>
              </>
            )}

            {mode === 'reject' && (
              <>
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1.5 font-medium">Reason (optional)</label>
                  <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none resize-none"
                    placeholder="Reason for rejection..." />
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  Record will be archived but kept on file for future reference.
                </p>
              </>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button
                variant={mode === 'reject' ? 'outline' : 'gradient'}
                onClick={handleSubmit}
                disabled={loading || (mode === 'viewing' && (!date || !propertyId)) || (mode === 'awaiting' && !date)}
                className={mode === 'reject' ? 'border-red-500/50 text-red-400 hover:bg-red-500/10' : ''}
              >
                {loading ? 'Saving...' : mode === 'reject' ? 'Reject & Archive' : 'Confirm'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Enquiry Card ───
function EnquiryCard({ enquiry, property, onAction }: {
  enquiry: EnquiryRaw; property?: Property; onAction: () => void;
}) {
  const name = [enquiry.first_name_1, enquiry.last_name_1].filter(Boolean).join(' ') || 'Unknown';
  const hasProperty = !!property;
  const hasFollowUp = enquiry.follow_up_date && isToday(enquiry.follow_up_date);
  const hasViewing = enquiry.viewing_date && isToday(enquiry.viewing_date);

  return (
    <div className="group bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] overflow-hidden hover:border-[var(--border-input)] hover:brightness-110 transition-all">
      {/* Returning today indicator */}
      {(hasFollowUp || hasViewing) && (
        <div className="bg-gradient-to-r from-orange-500 to-pink-500 px-3 py-1 flex items-center gap-1.5">
          <CalendarDays size={11} className="text-white" />
          <span className="text-[10px] text-white font-medium">
            {hasViewing ? 'Viewing today' : 'Follow-up today'}
          </span>
        </div>
      )}

      {/* Property Image */}
      {hasProperty ? (
        <div className="relative h-28 overflow-hidden">
          <img src={getPropertyImage(property!.id, 400, 200)} alt={property!.address}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute bottom-2 left-3 right-3">
            <p className="text-xs text-white/90 font-medium truncate">{property!.address}</p>
            {property!.rent_amount && (
              <p className="text-[10px] text-white/60">£{property!.rent_amount}/mo{property!.bedrooms ? ` · ${property!.bedrooms} bed` : ''}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="h-14 bg-gradient-to-br from-[var(--bg-hover)] to-[var(--bg-subtle)] flex items-center justify-center">
          <span className="text-[10px] text-[var(--text-muted)]">No property linked</span>
        </div>
      )}

      {/* Body */}
      <div className="p-3.5">
        <div className="flex items-center gap-2.5 mb-2">
          <Avatar name={name} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{name}</p>
            <p className="text-[10px] text-[var(--text-muted)]">{formatTime(enquiry.created_at)}</p>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-3">
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
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-pink-500/15 text-pink-400">Joint</span>
          ) : null}
          {enquiry.kyc_completed_1 ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400">KYC ✓</span>
          ) : null}
          {enquiry.viewing_date && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/15 text-purple-400">
              👁 {new Date(enquiry.viewing_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
          )}
          {enquiry.follow_up_date && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-400">
              ↻ {new Date(enquiry.follow_up_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>

        {/* Action Button */}
        <button onClick={e => { e.stopPropagation(); onAction(); }}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] transition-colors text-[var(--text-secondary)]">
          <ArrowRight size={12} /> Progress / Reject
        </button>
      </div>
    </div>
  );
}

// ─── Property Dropdown ───
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PropertyDropdown({ properties, value, onChange, enquiries, linkedPropertyIds, propMap }: {
  properties: Property[];
  value: string;
  onChange: (v: string) => void;
  enquiries: EnquiryRaw[];
  linkedPropertyIds: Set<number>;
  propMap: Map<number, Property>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedProp = value ? propMap.get(Number(value)) : null;
  const label = selectedProp ? selectedProp.address : 'All Properties';

  const filtered = properties.filter(p =>
    !search || p.address.toLowerCase().includes(search.toLowerCase()) || (p.postcode || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 pl-3.5 pr-3 py-2.5 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-sm text-[var(--text-primary)] hover:border-[var(--border-input)] transition-colors min-w-[220px]">
        <Building2 size={14} className="text-[var(--text-muted)] shrink-0" />
        <span className="flex-1 text-left truncate">{label}</span>
        {value && (
          <span className="text-[10px] bg-gradient-to-r from-orange-500 to-pink-500 text-white px-1.5 py-0.5 rounded-full font-medium shrink-0">
            {enquiries.filter(e => e.linked_property_id === Number(value) && e.status !== 'rejected').length}
          </span>
        )}
        <ChevronDown size={14} className={`text-[var(--text-muted)] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-[320px] bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl shadow-2xl shadow-black/30 z-50 overflow-hidden">
          {/* Search */}
          <div className="p-2.5 border-b border-[var(--border-subtle)]">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search properties..."
                autoFocus
                className="w-full pl-8 pr-3 py-2 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-input)] transition-colors"
              />
            </div>
          </div>

          {/* Options */}
          <div className="max-h-[300px] overflow-y-auto py-1.5">
            {/* All Properties */}
            <button onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors ${
                !value ? 'bg-[var(--bg-subtle)]' : ''
              }`}>
              <div className="w-8 h-8 rounded-lg bg-[var(--bg-hover)] flex items-center justify-center shrink-0">
                <Building2 size={14} className="text-[var(--text-muted)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">All Properties</p>
                <p className="text-[10px] text-[var(--text-muted)]">{enquiries.filter(e => e.status !== 'rejected').length} active enquiries</p>
              </div>
              {!value && <div className="w-2 h-2 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 shrink-0" />}
            </button>

            {filtered.length === 0 && search && (
              <p className="text-xs text-[var(--text-muted)] text-center py-4">No properties found</p>
            )}

            {filtered.map(p => {
              const count = enquiries.filter(e => e.linked_property_id === p.id && e.status !== 'rejected').length;
              const isSelected = value === String(p.id);
              return (
                <button key={p.id} onClick={() => { onChange(String(p.id)); setOpen(false); setSearch(''); }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors ${
                    isSelected ? 'bg-[var(--bg-subtle)]' : ''
                  }`}>
                  <img
                    src={getPropertyImage(p.id, 64, 64)}
                    alt={p.address}
                    className="w-8 h-8 rounded-lg object-cover shrink-0"
                    loading="lazy"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.address}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {p.postcode}{p.rent_amount ? ` · £${p.rent_amount}/mo` : ''}{p.bedrooms ? ` · ${p.bedrooms} bed` : ''}
                    </p>
                  </div>
                  {count > 0 && (
                    <span className="text-[10px] bg-[var(--bg-hover)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded-full font-medium shrink-0">
                      {count}
                    </span>
                  )}
                  {isSelected && <div className="w-2 h-2 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───
export default function EnquiriesKanban() {
  const api = useApi();
  const navigate = useNavigate();
  const [enquiries, setEnquiries] = useState<EnquiryRaw[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPropId, setFilterPropId] = useState<string>('');
  const [showArchive, setShowArchive] = useState(false);
  const [actionEnquiry, setActionEnquiry] = useState<EnquiryRaw | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', email: '', phone: '' });

  const load = async () => {
    try {
      const [enq, props] = await Promise.all([
        api.get('/api/tenant-enquiries'),
        api.get('/api/properties').catch(() => []),
      ]);
      setEnquiries(Array.isArray(enq) ? enq : []);
      setProperties(Array.isArray(props) ? props : []);
    } catch { /* fetch failed */ }
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const propMap = useMemo(() => new Map(properties.map(p => [p.id, p])), [properties]);

  const handleAction = async (id: number, status: string, data: Record<string, string | number | null>) => {
    const payload: Record<string, string | number | null> = { status, ...data };

    // If booking a viewing, also create a property viewing record
    if (status === 'viewing_booked' && data.linked_property_id && data.viewing_date) {
      const enq = enquiries.find(e => e.id === id);
      const name = [enq?.first_name_1, enq?.last_name_1].filter(Boolean).join(' ');
      try {
        await api.post('/api/property-viewings', {
          property_id: data.linked_property_id,
          enquiry_id: id,
          viewer_name: name,
          viewer_email: enq?.email_1 || '',
          viewer_phone: enq?.phone_1 || '',
          viewing_date: data.viewing_date,
          viewing_time: data.viewing_time || '10:00',
        });
      } catch (e) { console.error(e); }
    }

    // Update the enquiry
    await api.put(`/api/tenant-enquiries/${id}`, payload);
    setEnquiries(prev => prev.map(e => e.id === id ? { ...e, ...payload } : e));
  };

  const addEnquiry = async () => {
    const [firstName, ...lastParts] = addForm.name.trim().split(' ');
    try {
      await api.post('/api/tenant-enquiries', {
        first_name_1: firstName || '', last_name_1: lastParts.join(' ') || '',
        email_1: addForm.email, phone_1: addForm.phone, status: 'new',
      });
      setShowAdd(false);
      setAddForm({ name: '', email: '', phone: '' });
      await load();
    } catch { /* add enquiry failed */ }
  };

  // Filter logic:
  // - Rejected → archive (hidden from kanban unless showArchive)
  // - Future follow_up_date → hidden (reappears on that date)
  // - Future viewing_date for viewing_booked → hidden (reappears on viewing date)
  // - Property filter applies
  const visibleEnquiries = useMemo(() => {
    return enquiries.filter(e => {
      // Search filter
      if (search) {
        const name = `${e.first_name_1 || ''} ${e.last_name_1 || ''}`.toLowerCase();
        if (!name.includes(search.toLowerCase()) && !(e.email_1 || '').toLowerCase().includes(search.toLowerCase())) return false;
      }

      // Property filter
      if (filterPropId && e.linked_property_id !== Number(filterPropId)) return false;

      // Rejected → only show in archive
      if (e.status === 'rejected') return showArchive;
      if (showArchive) return e.status === 'rejected';

      // Hide cards with future follow-up dates
      if (e.status === 'awaiting_response' && isFuture(e.follow_up_date)) return false;

      // Hide viewing_booked with future viewing dates
      if (e.status === 'viewing_booked' && isFuture(e.viewing_date)) return false;

      // Hide onboarding with future follow-up
      if (e.status === 'onboarding' && e.follow_up_date && isFuture(e.follow_up_date)) return false;

      return true;
    });
  }, [enquiries, search, filterPropId, showArchive]);

  // Properties that have enquiries linked
  const linkedPropertyIds = useMemo(() => {
    const ids = new Set<number>();
    enquiries.forEach(e => { if (e.linked_property_id) ids.add(e.linked_property_id); });
    return ids;
  }, [enquiries]);

  return (
    <Layout title="Enquiries" breadcrumb={[{ label: 'Enquiries' }]}>
      <div className="flex flex-col h-full">
        {/* Top Bar */}
        <div className="flex items-center gap-3 px-4 md:px-6 py-3 border-b border-[var(--border-subtle)] shrink-0 flex-wrap">
          {/* Property Filter — Custom Dropdown */}
          <PropertyDropdown
            properties={properties}
            value={filterPropId}
            onChange={setFilterPropId}
            enquiries={enquiries}
            linkedPropertyIds={linkedPropertyIds}
            propMap={propMap}
          />

          <div className="flex-1 max-w-xs">
            <SearchBar value={search} onChange={setSearch} placeholder="Search..." />
          </div>

          {/* Archive toggle */}
          <button onClick={() => setShowArchive(!showArchive)}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition-colors ${
              showArchive
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}>
            <Archive size={14} />
            {showArchive ? 'Showing Archived' : 'Archive'}
            {!showArchive && (
              <span className="bg-[var(--bg-hover)] px-1.5 py-0.5 rounded-full text-[10px]">
                {enquiries.filter(e => e.status === 'rejected').length}
              </span>
            )}
          </button>

          <div className="flex items-center gap-1 ml-auto">
            <button onClick={() => navigate('/enquiries')}
              className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors" title="List view">
              <List size={18} />
            </button>
            <button className="p-2 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)]" title="Kanban view">
              <LayoutGrid size={18} />
            </button>
          </div>

          <Button variant="gradient" size="sm" onClick={() => setShowAdd(true)}>
            <Plus size={14} className="mr-1.5" /> Add
          </Button>
        </div>

        {/* Board */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-[var(--border-input)] border-t-orange-500 rounded-full animate-spin" />
          </div>
        ) : showArchive ? (
          /* Archive View */
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="flex items-center gap-3 mb-4">
              <Archive size={18} className="text-red-400" />
              <h3 className="text-lg font-semibold">Archived Enquiries</h3>
              <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-hover)] px-2 py-0.5 rounded-full">
                {visibleEnquiries.length}
              </span>
            </div>
            {visibleEnquiries.length === 0 ? (
              <EmptyState message="No archived enquiries" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {visibleEnquiries.map(e => (
                  <div key={e.id} className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] p-4 opacity-75">
                    <div className="flex items-center gap-2.5 mb-2">
                      <Avatar name={[e.first_name_1, e.last_name_1].filter(Boolean).join(' ')} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{[e.first_name_1, e.last_name_1].filter(Boolean).join(' ')}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">{e.email_1}</p>
                      </div>
                    </div>
                    {e.rejection_reason && (
                      <p className="text-xs text-[var(--text-muted)] mt-2 italic">"{e.rejection_reason}"</p>
                    )}
                    <p className="text-[10px] text-[var(--text-muted)] mt-2">Rejected {e.updated_at ? formatTime(e.updated_at) : ''}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Kanban */
          <DragDropContext onDragEnd={(result: DropResult) => {
            const { draggableId, destination, source } = result;
            if (!destination || destination.droppableId === source.droppableId) return;
            const id = parseInt(draggableId);
            const enq = enquiries.find(eq => eq.id === id);
            if (enq) setActionEnquiry(enq);
          }}>
            <div className="flex-1 overflow-x-auto overflow-y-hidden">
              <div className="flex gap-4 p-4 md:p-6 h-full min-w-max">
                {COLUMNS.map(col => {
                  const colEnquiries = visibleEnquiries.filter(e => e.status === col.key);
                  const Icon = col.icon;
                  return (
                    <div key={col.key} className="w-[280px] shrink-0 flex flex-col">
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

                      {/* Droppable area */}
                      <Droppable droppableId={col.key}>
                        {(provided, snapshot) => (
                          <div ref={provided.innerRef} {...provided.droppableProps}
                            className={`flex-1 overflow-y-auto space-y-3 pr-1 pb-4 min-h-[100px] rounded-xl transition-colors ${snapshot.isDraggingOver ? 'bg-[var(--accent-orange)]/5 ring-1 ring-[var(--accent-orange)]/20' : ''}`}>
                            {colEnquiries.length === 0 && !snapshot.isDraggingOver ? (
                              <div className="flex items-center justify-center h-24 rounded-2xl border-2 border-dashed border-[var(--border-subtle)] text-[var(--text-muted)] text-xs">
                                {col.key === 'new' ? 'No new enquiries' : 'Drop here'}
                              </div>
                            ) : (
                              colEnquiries.map((e, index) => (
                                <Draggable key={e.id} draggableId={String(e.id)} index={index}>
                                  {(provided, snapshot) => (
                                    <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
                                      style={provided.draggableProps.style}
                                      className={`${snapshot.isDragging ? 'ring-2 ring-[var(--accent-orange)]/40 shadow-lg rounded-2xl' : ''}`}>
                                      <EnquiryCard
                                        enquiry={e}
                                        property={e.linked_property_id ? propMap.get(e.linked_property_id) : undefined}
                                        onAction={() => setActionEnquiry(e)}
                                      />
                                    </div>
                                  )}
                                </Draggable>
                              ))
                            )}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  );
                })}
              </div>
            </div>
          </DragDropContext>
        )}

        {/* Action Modal */}
        {actionEnquiry && (
          <ActionModal
            enquiry={actionEnquiry}
            properties={properties}
            onClose={() => setActionEnquiry(null)}
            onAction={handleAction}
          />
        )}

        {/* Add Modal */}
        {showAdd && (
          <div className="fixed inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAdd(false)}>
            <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-input)] w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
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
    </Layout>
  );
}
