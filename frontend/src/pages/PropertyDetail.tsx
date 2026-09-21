import { usePermissions } from '../hooks/usePermissions';
import PropertyInsurance from '../components/PropertyInsurance';
import DeleteNoteButton from '../components/DeleteNoteButton';
import TenancyEndModal from '../components/ui/TenancyEndModal';
import PropertyInventory from '../components/PropertyInventory';
import { useRecordAddress } from '../hooks/useRecordAddress';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { Card, GlassCard, Button, ProgressRing, SectionHeader, EmptyState, Avatar, Tag, Input, Select, DatePicker, PricePaidData } from '../components/ui';
import DocumentUpload from '../components/ui/DocumentUpload';
import ActivityTimeline from '../components/ui/ActivityTimeline';

import RentPayments from '../components/ui/RentPayments';
import PropertyExpenses from '../components/PropertyExpenses';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { getPropertyImage, getPropertyPlaceholder } from '../utils/propertyImages';
import { activePropertyTenants, type PropertyTenant } from '../utils/propertyTenants';
import {
  User, Building2, Briefcase, KeyRound, Landmark, Users, ShieldCheck, ListChecks, History,
  CheckCircle2, Clock, ChevronRight, Pencil, Save, X,
  AlertTriangle, Plus, Wrench, Trash2, StickyNote, Eye
} from 'lucide-react';

interface PropertyDetail {
  id: number; address: string; address_line_2?: string; city?: string; postcode: string; rent_amount: number;
  status: string; landlord_name: string; landlord_id?: number; landlord_type?: 'internal' | 'external';
  landlord_phone?: string; landlord_email?: string;
  current_tenant: string | null; current_tenant_id?: number; tenant_id?: number;
  current_tenant_email?: string | null; current_tenant_phone?: string | null;
  bedrooms: number; property_type: string;
  // Management
  service_type: string | null; charge_percentage: number | null; total_charge: number | null;
  council_tax_band: string | null; epc_grade: string | null;
  rent_review_date: string | null; onboarded_date: string | null;
  proof_of_ownership_received: number;
  // Leasehold
  is_leasehold: number; leasehold_start_date: string | null;
  leasehold_end_date: string | null; leaseholder_info: string | null;
  leasehold_issued_by: string | null; leasehold_email: string | null;
  leasehold_phone: string | null; leasehold_reference: string | null;
  leasehold_notes: string | null;
  leasehold_portal_url: string | null; leasehold_portal_username: string | null;
  leasehold_portal_password_set: boolean;
  has_management_company: number | null; management_company_name: string | null;
  management_company_email: string | null; management_company_phone: string | null;
  management_company_reference: string | null; management_company_notes: string | null;
  management_company_portal_url: string | null; management_company_portal_username: string | null;
  management_company_portal_password_set: boolean;
  // Tenancy
  has_live_tenancy: number; tenancy_start_date: string | null;
  tenancy_type: string | null; has_end_date: number; tenancy_end_date: string | null;
  // Compliance
  eicr_expiry_date: string | null; epc_expiry_date: string | null;
  gas_safety_commissioned_date?:string|null; gas_safety_expiry_date: string | null; has_gas: number;
  notes: string | null;
  amenities: string | null;
  key_colour_code: string | null;
  compliance?:{items:{docType:string;hasDocument:boolean;ready:boolean;reason:string|null}[]};
  image_url?: string | null;
}

interface Task {
  id: number; title: string; status: string; priority: string; due_date: string;
  property_id?: number; description?: string; task_type?: string;
  assigned_to?: number; assigned_to_name?: string; notes?: string;
}

interface MaintenanceRecord {
  id: number; title: string; status: string; priority: string; description: string;
  property_id: number; created_at: string; address?: string;
}

interface User {
  id: number; name: string; email: string; role: string;
}

interface PropertyLandlord {
  id: number; name: string; email: string; phone: string;
  link_id: number; is_primary: number; ownership_percentage: number | null;
  ownership_entity_type: 'individual' | 'company';
  company_number?: string;
}

interface Director {
  id: number; name: string; email: string; phone: string;
  role: string; kyc_completed: number;
}

interface Landlord {
  id: number; name: string; email: string; phone: string;
  company_number?: string;
}

const STATUS_COLORS: Record<string, string> = {
  let: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  to_let: 'bg-red-500/20 text-red-400 border-red-500/30',
  let_agreed: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
  full_management: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  rent_collection: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};
const STATUS_LABELS: Record<string, string> = {
  let: 'Let', to_let: 'To Let', let_agreed: 'Let Agreed', full_management: 'Full Management', rent_collection: 'Rent Collection',
};
const EPC_COLORS: Record<string, string> = {
  A: 'bg-emerald-500 text-white', B: 'bg-emerald-400 text-white', C: 'bg-lime-500 text-white',
  D: 'bg-yellow-500 text-black', E: 'bg-amber-500 text-white', F: 'bg-orange-500 text-white', G: 'bg-red-500 text-white',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-blue-500/20 text-blue-400',
  medium: 'bg-amber-500/20 text-amber-400',
  high: 'bg-red-500/20 text-red-400',
};
const PRIORITY_LABELS: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' };
const TASK_TYPES = ['manual', 'viewing', 'follow_up', 'document', 'maintenance', 'onboarding', 'compliance', 'other'];

function ReadField({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value || '—'}</p>
    </div>
  );
}

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!checked)}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
        checked ? 'bg-[var(--accent-orange)]/10 border-[var(--accent-orange)]/30 text-[var(--accent-orange)]' : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-muted)]'
      } ${disabled ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}>
      <div className={`w-4 h-4 rounded-md border flex items-center justify-center ${checked ? 'bg-[var(--accent-orange)] border-[var(--accent-orange)]' : 'border-[var(--border-input)]'}`}>
        {checked && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5L4.5 7.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </div>
      {label}
    </button>
  );
}

export default function PropertyDetail() {
  const {canAccessFinance}=usePermissions();

  const api = useApi();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { confirmAction: confirmCrmAction } = useNotifications();
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const id = useRecordAddress('properties', property?.address);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const [saving, setSaving] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [form, setForm] = useState<Record<string, any>>({});
  const [showAddTask, setShowAddTask] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    assigned_to: '',
    priority: 'medium',
    due_date: '',
    task_type: 'manual'
  });

  // Task detail modal state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [, setTaskDetailLoading] = useState(false);

  // Maintenance creation state
  const [showAddMaintenance, setShowAddMaintenance] = useState(false);
  const [maintenanceForm, setMaintenanceForm] = useState({
    title: '', description: '', category: 'other', priority: 'medium',assigned_to:'',follow_up_date:'',due_date:''
  });

  // Landlords state
  const [propertyLandlords, setPropertyLandlords] = useState<PropertyLandlord[]>([]);
  const [allLandlords, setAllLandlords] = useState<Landlord[]>([]);
  const [showAddLandlord, setShowAddLandlord] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'add' | 'remove' | 'setPrimary'; data: Record<string, unknown> } | null>(null);
  const [landlordSearch, setLandlordSearch] = useState('');
  const [, setSelectedLandlordId] = useState<number | null>(null);
  const [ownershipEntityType, setOwnershipEntityType] = useState<'individual' | 'company'>('individual');

  // Directors state (for company landlords)
  const [landlordDirectors, setLandlordDirectors] = useState<Record<number, Director[]>>({});

  // Notes state
  const [notes, setNotes] = useState<{ id: string; text: string; author: string; created_at: string }[]>([]);
  const [landlordNotes, setLandlordNotes] = useState<{ id: string; text: string; author: string; created_at: string }[]>([]);
  const [notesFilter, setNotesFilter] = useState<'property' | 'landlord' | string>('property');
  const [tenantNotes, setTenantNotes] = useState<Record<number, { id: string; text: string; author: string; created_at: string }[]>>({});
  const [notesInput, setNotesInput] = useState('');

  // Tenant state
  const [allTenants, setAllTenants] = useState<PropertyTenant[]>([]);
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [tenantModalMode, setTenantModalMode] = useState<'select' | 'create'>('select');
  const [tenantSearch, setTenantSearch] = useState('');
  const [showPreviousTenancies, setShowPreviousTenancies] = useState(false);
  const [revealedPortalPasswords, setRevealedPortalPasswords] = useState<Record<string, string>>({});
  const [revealingPortalPassword, setRevealingPortalPassword] = useState<string | null>(null);
  const [newTenantForm, setNewTenantForm] = useState({
    first_name_1: '',
    last_name_1: '',
    email_1: '',
    phone_1: '',
  });

  const populateForm = (p: PropertyDetail) => setForm({
    landlord_id: p.landlord_id, address: p.address || '', address_line_2: p.address_line_2 || '', city: p.city || '', postcode: p.postcode || '',
    rent_amount: String(p.rent_amount || ''), bedrooms: String(p.bedrooms || ''),
    property_type: p.property_type || 'house', status: p.status || 'to_let',
    service_type: p.service_type || '', charge_percentage: String(p.charge_percentage ?? ''),
    total_charge: String(p.total_charge ?? ''), council_tax_band: p.council_tax_band || '',
    epc_grade: p.epc_grade || '', rent_review_date: p.rent_review_date || '',
    onboarded_date: p.onboarded_date || '', proof_of_ownership_received: !!p.proof_of_ownership_received,
    is_leasehold: !!p.is_leasehold, leasehold_start_date: p.leasehold_start_date || '',
    leasehold_end_date: p.leasehold_end_date || '', leaseholder_info: p.leaseholder_info || '',
    leasehold_issued_by: p.leasehold_issued_by || '', leasehold_email: p.leasehold_email || '',
    leasehold_phone: p.leasehold_phone || '', leasehold_reference: p.leasehold_reference || '',
    leasehold_notes: p.leasehold_notes || '',
    leasehold_portal_url: p.leasehold_portal_url || '',
    leasehold_portal_username: p.leasehold_portal_username || '',
    leasehold_portal_password: '',
    has_management_company: !!p.has_management_company,
    management_company_name: p.management_company_name || '',
    management_company_email: p.management_company_email || '',
    management_company_phone: p.management_company_phone || '',
    management_company_reference: p.management_company_reference || '',
    management_company_notes: p.management_company_notes || '',
    management_company_portal_url: p.management_company_portal_url || '',
    management_company_portal_username: p.management_company_portal_username || '',
    management_company_portal_password: '',
    has_live_tenancy: !!p.has_live_tenancy, tenancy_start_date: p.tenancy_start_date || '',
    tenancy_type: p.tenancy_type || '', has_end_date: !!p.has_end_date,
    tenancy_end_date: p.tenancy_end_date || '',
    eicr_expiry_date: p.eicr_expiry_date || '', epc_expiry_date: p.epc_expiry_date || '',
    gas_safety_commissioned_date:p.gas_safety_commissioned_date || '', has_gas: !!p.has_gas, gas_safety_expiry_date: p.gas_safety_expiry_date || '',
    amenities: p.amenities || '',
    key_colour_code: p.key_colour_code || '',
  });

  const parseNotes = (raw: string | null) => {
    try { return JSON.parse(raw || '[]'); } catch { return raw ? [{ id: '1', text: raw, author: 'System', created_at: '' }] : []; }
  };

  const loadDetail = async () => {
    try {
      const [prop, tks, maint, usrs, propLandlords, landlords, tenants] = await Promise.all([
        api.get(`/api/properties/${id}`),
        api.get('/api/tasks').catch(() => []),
        api.get('/api/maintenance').catch(() => []),
        api.get('/api/users/options').catch(() => []),
        api.get(`/api/properties/${id}/landlords`).catch(() => []),
        api.get('/api/landlords').catch(() => []),
        api.get('/api/tenants').catch(() => []),
      ]);
      setProperty(prop);
      if (!editingRef.current) populateForm(prop);
      setPropertyLandlords(propLandlords);
      setAllLandlords(landlords);
      setAllTenants(Array.isArray(tenants) ? tenants : []);
      const linkedTenantNotes: Record<number, { id: string; text: string; author: string; created_at: string }[]> = {};
      (Array.isArray(tenants) ? tenants : []).filter(tenant => tenant.property_id === Number(id)).forEach(tenant => {
        linkedTenantNotes[tenant.id] = parseNotes(tenant.notes || '');
      });
      setTenantNotes(linkedTenantNotes);

      // Fetch directors for company landlords
      const companyLandlords = (Array.isArray(propLandlords) ? propLandlords : []).filter(
        (l: PropertyLandlord) => l.ownership_entity_type === 'company'
      );
      if (companyLandlords.length > 0) {
        const directorsMap: Record<number, Director[]> = {};
        await Promise.all(companyLandlords.map(async (l: PropertyLandlord) => {
          try {
            const dirs = await api.get(`/api/landlords/${l.id}/directors`);
            directorsMap[l.id] = Array.isArray(dirs) ? dirs : [];
          } catch { directorsMap[l.id] = []; }
        }));
        setLandlordDirectors(directorsMap);
      }
      setTasks(Array.isArray(tks) ? tks : []);
      setMaintenance(Array.isArray(maint) ? maint.filter((m: MaintenanceRecord) => m.property_id === Number(id)) : []);
      setUsers(Array.isArray(usrs) ? usrs : []);

      // Parse property notes
      setNotes(parseNotes(prop.notes));

      // Fetch landlord notes if we have a landlord
      if (prop.landlord_id) {
        try {
          const landlord = await api.get(`/api/landlords/${prop.landlord_id}`);
          setLandlordNotes(parseNotes(landlord.notes));
        } catch {
          setLandlordNotes([]);
        }
      }
    } catch { /* Silently ignore */ }
  };

  useEffect(() => {
    loadDetail().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Clean up form data: convert types, empty strings to null for dates
      const cleanDate = (v: string) => v && v.trim() ? v.trim() : null;
      const payload: Record<string, unknown> = {
        ...form,
        rent_amount: parseFloat(form.rent_amount) || 0,
        bedrooms: parseInt(form.bedrooms) || 0,
        charge_percentage: form.charge_percentage ? parseFloat(form.charge_percentage) : null,
        total_charge: form.total_charge ? parseFloat(form.total_charge) : null,
        // Dates: send null not empty string
        rent_review_date: cleanDate(form.rent_review_date),
        onboarded_date: cleanDate(form.onboarded_date),
        leasehold_start_date: cleanDate(form.leasehold_start_date),
        leasehold_end_date: cleanDate(form.leasehold_end_date),
        tenancy_start_date: cleanDate(form.tenancy_start_date),
        tenancy_end_date: cleanDate(form.tenancy_end_date),
        eicr_expiry_date: cleanDate(form.eicr_expiry_date),
        epc_expiry_date: cleanDate(form.epc_expiry_date),
        gas_safety_expiry_date: cleanDate(form.gas_safety_expiry_date),
        gas_safety_commissioned_date: cleanDate(form.gas_safety_commissioned_date),
        // Strings: send null not empty string for optional fields
        council_tax_band: form.council_tax_band || null,
        epc_grade: form.epc_grade || null,
        service_type: form.service_type || null,
        leaseholder_info: form.leaseholder_info || null,
        leasehold_issued_by: form.leasehold_issued_by || null,
        leasehold_email: form.leasehold_email || null,
        leasehold_phone: form.leasehold_phone || null,
        leasehold_reference: form.leasehold_reference || null,
        leasehold_notes: form.leasehold_notes || null,
        leasehold_portal_url: form.leasehold_portal_url || null,
        leasehold_portal_username: form.leasehold_portal_username || null,
        management_company_name: form.management_company_name || null,
        management_company_email: form.management_company_email || null,
        management_company_phone: form.management_company_phone || null,
        management_company_reference: form.management_company_reference || null,
        management_company_notes: form.management_company_notes || null,
        management_company_portal_url: form.management_company_portal_url || null,
        management_company_portal_username: form.management_company_portal_username || null,
      };
      if (!form.leasehold_portal_password) delete payload.leasehold_portal_password;
      if (!form.management_company_portal_password) delete payload.management_company_portal_password;
      await api.put(`/api/properties/${id}`, payload);
      const updated = await api.get(`/api/properties/${id}`);
      setProperty(updated);
      populateForm(updated);
      setRevealedPortalPasswords({});
      setEditing(false);
    } catch (e: unknown) {
      console.error('Save error:', e);
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      alert(`Failed to save: ${err.response?.data?.error || err.message || 'Unknown error'}`);
    }
    setSaving(false);
  };

  const cancelEdit = () => { setEditing(false); if (property) populateForm(property); };

  const revealPortalPassword = async (kind: 'leasehold' | 'management-company') => {
    if (revealedPortalPasswords[kind]) {
      setRevealedPortalPasswords(current => ({ ...current, [kind]: '' }));
      return;
    }
    setRevealingPortalPassword(kind);
    try {
      const result = await api.get(`/api/properties/${id}/portal-credentials/${kind}`);
      setRevealedPortalPasswords(current => ({ ...current, [kind]: result.password }));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Portal password could not be revealed');
    }
    setRevealingPortalPassword(null);
  };

  const daysUntil = (d: string | null) => {
    if (!d) return null;
    return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const compliancePercent = (d: string | null) => {
    if (!d) return 0;
    const days = daysUntil(d)!;
    return days >= 0 ? 100 : 0;
  };

  const overallCompliance = () => {
    const source=editing?form:property;
    const requirements=[['EPC',source?.epc_expiry_date],['EICR',source?.eicr_expiry_date],...(source?.has_gas?[['Gas Safety Certificate',source.gas_safety_expiry_date]]:[])];
    return Math.round(requirements.filter(([type,date])=>compliancePercent(date||null)===100&&property?.compliance?.items.some(i=>i.docType===type&&i.hasDocument)).length/requirements.length*100);
  };

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const addTask = async () => {
    try {
      console.log('Creating task with data:', {
        ...taskForm,
        entity_type: 'property',
        entity_id: property?.id
      });

      const response = await api.post('/api/tasks', {
        ...taskForm,
        entity_type: 'property',
        entity_id: property?.id
      });

      console.log('Task created successfully:', response);

      // Reload all property data including the new task
      await loadDetail();
      // Reset form and close modal
      setTaskForm({
        title: '',
        description: '',
        assigned_to: '',
        priority: 'medium',
        due_date: '',
        task_type: 'manual'
      });
      setShowAddTask(false);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      console.error('Failed to create task:', err);
      console.error('Error response:', err.response?.data);
      alert(`Failed to create task: ${err.response?.data?.error || err.message || 'Unknown error'}`);
    }
  };

  const openTaskDetail = async (taskId: number) => {
    setTaskDetailLoading(true);
    try {
      const detail = await api.get(`/api/tasks/${taskId}`);
      setSelectedTask(detail);
    } catch {
      alert('Failed to load task details');
    } finally {
      setTaskDetailLoading(false);
    }
  };

  const updateTaskStatus = async (taskId: number, newStatus: string) => {
    try {
      await api.put(`/api/tasks/${taskId}`, { status: newStatus });
      setSelectedTask((prev: Task | null) => prev ? { ...prev, status: newStatus } : prev);
      await loadDetail();
    } catch {
      alert('Failed to update task status');
    }
  };

  const addMaintenance = async () => {
    if (!maintenanceForm.title || !maintenanceForm.description) return;
    try {
      const primaryLandlord = propertyLandlords.find(l => l.is_primary === 1);
      await api.post('/api/maintenance', {
        ...maintenanceForm,
        property_id: property?.id,
        landlord_id: primaryLandlord?.id || property?.landlord_id,
        reporter_type: 'agent',
        reporter_name: user?.name || user?.email,
      });
      await loadDetail();
      setMaintenanceForm({ title: '', description: '', category: 'other', priority: 'medium',assigned_to:'',follow_up_date:'',due_date:'' });
      setShowAddMaintenance(false);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      alert(`Failed to report issue: ${err.response?.data?.error || err.message || 'Unknown error'}`);
    }
  };

  const addNote = async () => {
    if (!notesInput.trim() || !property) return;
    const noteText = notesInput.trim();
    const newNote = { id: Date.now().toString(), text: noteText, author: user?.email || 'Unknown', created_at: new Date().toISOString() };
    setNotesInput('');

    try {
      if (notesFilter === 'property') {
        // Add note to property
        const updated = [...notes, newNote];
        await api.put(`/api/properties/${id}`, { notes: JSON.stringify(updated) });
        api.post('/api/activity', { action: 'note_added', entity_type: 'property', entity_id: Number(id), changes: { text: noteText } }).catch(() => {});
      } else if (notesFilter === 'landlord' && property.landlord_id) {
        // Add note to landlord
        const updated = [...landlordNotes, newNote];
        await api.put(`/api/landlords/${property.landlord_id}`, { notes: JSON.stringify(updated) });
        api.post('/api/activity', { action: 'note_added', entity_type: 'landlord', entity_id: property.landlord_id, changes: { text: noteText } }).catch(() => {});
      } else if (notesFilter.startsWith('tenant-')) {
        const tenantId = Number(notesFilter.replace('tenant-', ''));
        const updated = [...(tenantNotes[tenantId] || []), newNote];
        await api.patch(`/api/tenants/${tenantId}/notes`, { notes: JSON.stringify(updated) });
        api.post('/api/activity', { action: 'note_added', entity_type: 'tenant', entity_id: tenantId, changes: { text: noteText } }).catch(() => {});
      }
      await loadDetail();
    } catch (e) { console.error(e); }
  };

  // Landlord management handlers
  const handleAddLandlord = (landlordId: number) => {
    setPendingAction({ type: 'add', data: { landlordId, ownershipEntityType } });
    setShowConfirmModal(true);
  };

  const handleRemoveLandlord = (linkId: number, landlordName: string) => {
    setPendingAction({ type: 'remove', data: { linkId, landlordName } });
    setShowConfirmModal(true);
  };

  const handleSetPrimary = (linkId: number, landlordName: string) => {
    setPendingAction({ type: 'setPrimary', data: { linkId, landlordName } });
    setShowConfirmModal(true);
  };

  const confirmAction = async () => {
    if (!pendingAction) return;

    try {
      if (pendingAction.type === 'add') {
        await api.post(`/api/properties/${id}/landlords`, {
          landlord_id: pendingAction.data.landlordId,
          is_primary: propertyLandlords.length === 0 ? 1 : 0,
          ownership_entity_type: pendingAction.data.ownershipEntityType
        });
      } else if (pendingAction.type === 'remove') {
        await api.delete(`/api/property-landlords/${pendingAction.data.linkId}`);
      } else if (pendingAction.type === 'setPrimary') {
        await api.put(`/api/property-landlords/${pendingAction.data.linkId}`, {
          is_primary: 1
        });
      }

      await loadDetail();
      setShowConfirmModal(false);
      setShowAddLandlord(false);
      setPendingAction(null);
      setSelectedLandlordId(null);
      setLandlordSearch('');
      setOwnershipEntityType('individual'); // Reset to default
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      console.error('Failed to manage landlord:', err);
      alert(err.response?.data?.error || 'Failed to update property landlords');
    }
  };

  // Tenant management handlers
  const handleLinkTenant = async (tenantId: number) => {
    try {
      await api.put(`/api/properties/${id}`, {
        tenant_id: tenantId
      });
      await loadDetail();
      setShowTenantModal(false);
      setTenantSearch('');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      console.error('Failed to link tenant:', err);
      alert(err.response?.data?.error || 'Failed to link tenant to property');
    }
  };

  const handleCreateAndLinkTenant = async () => {
    try {
      // Create new tenant
      const newTenant = await api.post('/api/tenants', newTenantForm);
      // Link to property
      await api.put(`/api/properties/${id}`, {
        tenant_id: newTenant.id
      });
      await loadDetail();
      setShowTenantModal(false);
      setNewTenantForm({
        first_name_1: '',
        last_name_1: '',
        email_1: '',
        phone_1: '',
      });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      console.error('Failed to create tenant:', err);
      alert(err.response?.data?.error || 'Failed to create tenant');
    }
  };

  const [inventoryRefresh,setInventoryRefresh]=useState(0);
  const [showEndTenancy,setShowEndTenancy]=useState(false);
  const handleRemoveTenant = () => {setShowEndTenancy(true);};


  if (loading) {
    return (
      <Layout title="Property" breadcrumb={[{ label: 'Properties', to: '/properties' }, { label: 'Loading...' }]}>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-[var(--border-input)] border-t-orange-500 rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!property) {
    return (
      <Layout title="Property" breadcrumb={[{ label: 'Properties', to: '/properties' }, { label: 'Not Found' }]}>
        <EmptyState message="Property not found" />
      </Layout>
    );
  }

  const propertyTasks = tasks.filter(t => t.property_id === property.id).slice(0, 5);
  const isToLet = property.status === 'to_let';
  const statusColor = STATUS_COLORS[property.status] || 'bg-[var(--bg-hover)] text-[var(--text-muted)]';
  const statusLbl = STATUS_LABELS[property.status] || property.status;
  const linkedTenants = allTenants.filter(tenant => tenant.property_id === property.id);
  const activeLinkedTenants = activePropertyTenants(allTenants, property.id);
  const scheduledTenants = linkedTenants.filter(tenant => tenant.status === 'scheduled');
  const previousTenants = linkedTenants.filter(tenant => tenant.status === 'inactive');
  const currentTenants = activeLinkedTenants.length > 0
    ? activeLinkedTenants
    : property.current_tenant
      ? [{
          id: property.current_tenant_id || property.tenant_id || 0,
          name: property.current_tenant,
          email: property.current_tenant_email || undefined,
          phone: property.current_tenant_phone || undefined,
        }]
      : [];
  const displayedNotes = notesFilter === 'property'
    ? notes
    : notesFilter === 'landlord'
      ? landlordNotes
      : tenantNotes[Number(notesFilter.replace('tenant-', ''))] || [];

  // Compliance reminders (expiring within 30 days)
  const reminders: { label: string; days: number }[] = [];
  const eicrDays = daysUntil(property.eicr_expiry_date);
  if (eicrDays !== null && eicrDays <= 30) reminders.push({ label: 'EICR', days: eicrDays });
  const epcDays = daysUntil(property.epc_expiry_date);
  if (epcDays !== null && epcDays <= 30) reminders.push({ label: 'EPC', days: epcDays });
  if (property.has_gas) {
    const gasDays = daysUntil(property.gas_safety_expiry_date);
    if (gasDays !== null && gasDays <= 30) reminders.push({ label: 'Gas Safety', days: gasDays });
  }

  return (
    <Layout title="" breadcrumb={[{ label: 'Properties', to: '/properties' }, { label: property.address }]}>
      <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
        {/* Hero */}
        <div className="relative h-48 sm:h-56 md:h-64 rounded-xl sm:rounded-2xl overflow-hidden border border-[var(--border-subtle)]">
          <img src={getPropertyImage(property.id, 1200, 400, `${property.address}, ${property.postcode}`, property.image_url, property.landlord_name)} alt={property.address}
            className="absolute inset-0 w-full h-full object-cover" loading="lazy"
            onError={event => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = getPropertyPlaceholder(property.id, 1200, 400, property.landlord_name);
            }} />
          <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-black/70 to-transparent">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] sm:text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor}`}>{statusLbl}</span>
            </div>
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-white line-clamp-1">{property.address}</h1>
            <p className="text-white/60 text-xs sm:text-sm">{property.postcode}</p>
          </div>
          <div className="absolute top-3 right-3 sm:top-4 sm:right-4 flex gap-2">
            {user?.role === 'admin' && <Button size="sm" variant="outline" className="!bg-red-600 !border-red-600 !text-white" onClick={async () => {
              if (!await confirmCrmAction(`Remove ${property.address}? Properties with tenancy or contract history will be archived; otherwise linked data will be permanently deleted.`, 'Delete / Archive Property')) return;
              try { await api.post(`/api/properties/${property.id}/remove`, {}); navigate('/properties'); } catch (e) { alert(e instanceof Error ? e.message : 'Could not delete property'); }
            }}>Delete / Archive</Button>}
            {editing ? (
              <>
                <Button variant="ghost" size="sm" onClick={cancelEdit} className="bg-black/40 backdrop-blur-sm text-white text-xs sm:text-sm">
                  <X size={14} className="mr-0 sm:mr-1" /> <span className="hidden sm:inline">Cancel</span>
                </Button>
                <Button variant="gradient" size="sm" onClick={handleSave} disabled={saving} className="text-xs sm:text-sm">
                  <Save size={14} className="mr-0 sm:mr-1" /> <span className="hidden sm:inline">{saving ? 'Saving...' : 'Save'}</span>
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="bg-black/40 backdrop-blur-sm text-white text-xs sm:text-sm">
                <Pencil size={14} className="mr-0 sm:mr-1" /> <span className="hidden sm:inline">Edit</span>
              </Button>
            )}
          </div>
        </div>

        {/* Tenant Banner — always visible */}
        <div className={`rounded-xl sm:rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 ${
          currentTenants.length > 0
            ? 'bg-gradient-to-r from-[var(--accent-orange)]/10 to-transparent border-[var(--accent-orange)]/30'
            : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)]'
        }`}>
          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0 ${
            currentTenants.length > 0 ? 'bg-[var(--accent-orange)]/20 text-[var(--accent-orange)]' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'
          }`}>
            <User size={20} />
          </div>
          {currentTenants.length > 0 ? (
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[var(--text-muted)] mb-1">{currentTenants.length > 1 ? 'Current Tenants' : 'Current Tenant'}</p>
              <div className="space-y-1.5">
                {currentTenants.map(tenant => (
                  <div key={tenant.id || tenant.name} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <p className="text-base sm:text-lg font-semibold">{tenant.name}</p>
                    <div className="flex flex-wrap items-center gap-x-3 text-xs text-[var(--text-secondary)]">
                      {(tenant.email || tenant.email_1) && <span>{tenant.email || tenant.email_1}</span>}
                      {(tenant.phone || tenant.phone_1) && <span>{tenant.phone || tenant.phone_1}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[var(--text-muted)] mb-0.5">Tenant</p>
              <p className="text-sm text-[var(--text-secondary)]">No tenant assigned to this property</p>
            </div>
          )}
          <div className="shrink-0 flex gap-2">
            {currentTenants.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {currentTenants.map(tenant => tenant.id ? (
                  <Button key={tenant.id} variant="outline" size="sm" onClick={() => navigate(`/tenants/${tenant.id}`)}>
                    View {currentTenants.length > 1 ? tenant.first_name_1 || tenant.name.split(' ')[0] : 'Tenant'} <ChevronRight size={14} className="ml-1" />
                  </Button>
                ) : null)}
              </div>
            ) : (
              <Button variant="gradient" size="sm" onClick={() => { setShowTenantModal(true); setTenantModalMode('select'); }}>
                <Plus size={14} className="mr-1" /> Assign Tenant
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN — 2/3 */}
          <div className="lg:col-span-2 space-y-6">
            {/* Details */}
            <GlassCard className="p-4 sm:p-6">
              <SectionHeader title="Details" icon={<Building2 size={16} />} />
              {editing ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    <Input label="Address line 1 *" value={form.address} onChange={address => setForm({...form,address})} />
                    <Input label="Address line 2 (optional)" value={form.address_line_2} onChange={address_line_2 => setForm({...form,address_line_2})} />
                    <Input label="Town / City *" value={form.city} onChange={city => setForm({...form,city})} />
                    <Input label="Postcode *" value={form.postcode} onChange={postcode => setForm({...form,postcode})} />
                    <Input label="Rent (£/mo)" value={form.rent_amount} onChange={(v: string) => setForm({ ...form, rent_amount: v })} />
                    <Select label="Type" value={form.property_type} onChange={(v: string) => setForm({ ...form, property_type: v })}
                      options={[{ value: 'house', label: 'House' }, { value: 'flat', label: 'Flat' }, { value: 'bungalow', label: 'Bungalow' }, { value: 'studio', label: 'Studio' }, { value: 'hmo', label: 'HMO' }]} />
                    <Input label="Bedrooms" value={form.bedrooms} onChange={(v: string) => setForm({ ...form, bedrooms: v })} />
                    <Select label="Status" value={form.status} onChange={(v: string) => setForm({ ...form, status: v })}
                      options={[{ value: 'to_let', label: 'To Let' }, { value: 'let_agreed', label: 'Let Agreed' }]} />
                    {property.landlord_type === 'internal' && <Input label="Key Colour Code" value={form.key_colour_code} onChange={(v: string) => setForm({ ...form, key_colour_code: v })} placeholder="e.g. Pink / Blue" />}
                  </div>
                  <div className="mt-4">
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">
                      Features
                    </label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {['Garden', 'Driveway', 'Parking', 'Garage', 'Balcony', 'Patio', 'Furnished', 'Part Furnished', 'Dishwasher', 'Washing Machine', 'Dryer', 'WiFi', 'Central Heating', 'Double Glazing', 'CCTV', 'Security Alarm', 'EV Charging', 'Pets Allowed', 'Storage'].map((amenity) => {
                        const isSelected = form.amenities?.toLowerCase().includes(amenity.toLowerCase());
                        return (
                          <button
                            key={amenity}
                            type="button"
                            onClick={() => {
                              const currentAmenities = form.amenities || '';
                              if (isSelected) {
                                // Remove the amenity
                                const regex = new RegExp(`\\b${amenity}\\b,?\\s*`, 'gi');
                                const updated = currentAmenities.replace(regex, '').replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '').trim();
                                setForm({ ...form, amenities: updated });
                              } else {
                                // Add the amenity
                                const updated = currentAmenities ? `${currentAmenities}, ${amenity}` : amenity;
                                setForm({ ...form, amenities: updated });
                              }
                            }}
                            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
                              isSelected
                                ? 'bg-[var(--accent-orange)]/15 border-[var(--accent-orange)]/50 text-[var(--accent-orange)]'
                                : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-orange)]/30'
                            }`}
                          >
                            {amenity}
                          </button>
                        );
                      })}
                    </div>
                    <textarea
                      value={form.amenities || ''}
                      onChange={(e) => setForm({ ...form, amenities: e.target.value })}
                      placeholder="Add custom amenities or features..."
                      className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] resize-none"
                      rows={2}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                    <ReadField label="Type" value={<span className="capitalize">{property.property_type}</span>} />
                    <ReadField label="Bedrooms" value={String(property.bedrooms)} />
                    <ReadField label="Rent" value={`£${property.rent_amount?.toLocaleString()}/mo`} />
                    <ReadField label="Postcode" value={property.postcode} />
                    <ReadField label="Status" value={
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusColor}`}>{statusLbl}</span>
                    } />
                    {property.landlord_type === 'internal' && <ReadField label="Key Colour Code" value={property.key_colour_code} />}
                  </div>
                  {!!property.amenities && (
                    <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
                      <p className="text-xs text-[var(--text-muted)] mb-1.5">Features</p>
                      <p className="text-sm whitespace-pre-wrap">{property.amenities}</p>
                    </div>
                  )}
                </>
              )}
            </GlassCard>

            {/* Management */}
            <GlassCard className="p-4 sm:p-6">
              <SectionHeader title="Management" icon={<Briefcase size={16} />} />
              {(editing?form.has_gas:property.has_gas)?<div className="mb-4">{editing?<DatePicker label="Gas Safety Commissioned Date" value={form.gas_safety_commissioned_date} onChange={v=>setForm(f=>({...f,gas_safety_commissioned_date:v}))}/>:<ReadField label="Gas Safety Commissioned" value={formatDate(property.gas_safety_commissioned_date || null)}/>}</div>:null}
              {editing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {property.landlord_type !== 'internal' && <Select label="Service Type *" value={form.service_type} onChange={(v: string) => setForm({ ...form, service_type: v })}
                    options={[{ value: '', label: 'Select...' }, { value: 'full_management', label: 'Full Management' }, { value: 'rent_collection', label: 'Rent Collection' }, { value: 'let_only', label: 'Let Only' }]} />
                  }
                  {property.landlord_type !== 'internal' && <Input label="Charge (%)" value={form.charge_percentage} onChange={(v: string) => setForm({ ...form, charge_percentage: v })} placeholder="e.g. 10" />}
                  {property.landlord_type !== 'internal' && <Input label="Total Charge (£)" value={form.total_charge} onChange={(v: string) => setForm({ ...form, total_charge: v })} />}
                  <Select label="Council Tax Band" value={form.council_tax_band} onChange={(v: string) => setForm({ ...form, council_tax_band: v })}
                    options={[{ value: '', label: 'Select...' }, { value: 'TBC', label: 'TBC' }, ...['A','B','C','D','E','F','G','H'].map(b => ({ value: b, label: `Band ${b}` }))]} />
                  <Select label="EPC Grade" value={form.epc_grade} onChange={(v: string) => setForm({ ...form, epc_grade: v })}
                    options={[{ value: '', label: 'Select...' }, ...['A','B','C','D','E','F','G'].map(g => ({ value: g, label: `Grade ${g}` }))]} />
                  {form.postcode && (
                    <div className="col-span-full flex gap-2">
                      <button type="button" onClick={async () => {
                        try {
                          const data = await api.get(`/api/epc-lookup?postcode=${encodeURIComponent(form.postcode)}`);

                          if (data && data.length > 0) {
                            // Try to match by address, or use first result
                            const match = data.find((cert: { address?: string; current_rating?: string; lodgement_date?: string; inspection_date?: string }) =>
                              cert.address?.toLowerCase().replace(/[^a-z0-9]/g,'').startsWith(form.address.split(',')[0].toLowerCase().replace(/[^a-z0-9]/g,''))
                            );
                            if(!match){alert('No unambiguous certificate matches this property address. Check the government service and enter the correct certificate manually.');return;}

                            const updates: Record<string, string> = {};

                            // Set EPC grade
                            if (match.current_rating) {
                              updates.epc_grade = match.current_rating;
                            }

                            // Calculate expiry date (EPC certificates are valid for 10 years)
                            const dateField = match.lodgement_date || match.inspection_date;
                            if (dateField) {
                              const lodgementDate = new Date(dateField);
                              const expiryDate = new Date(lodgementDate);
                              expiryDate.setUTCFullYear(expiryDate.getUTCFullYear() + 10);
                              expiryDate.setUTCDate(expiryDate.getUTCDate()-1);
                              updates.epc_expiry_date = expiryDate.toISOString().split('T')[0];
                            }

                            setForm(f => ({ ...f, ...updates }));
                          } else {
                            alert('No EPC data found for this postcode. Try entering the data manually.');
                          }
                        } catch (error) {
                          alert(error instanceof Error ? error.message : 'EPC lookup unavailable. Enter certificate details manually.');
                        }
                      }} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors">
                        Sync EPC Data
                      </button>
                      <button type="button" onClick={async () => {
                        try {
                          const data = await api.get(`/api/council-tax-lookup?postcode=${encodeURIComponent(form.postcode)}`);
                          if (data.length > 0 && data[0].band) {
                            setForm(f => ({ ...f, council_tax_band: data[0].band }));
                          } else {
                            alert('No council tax data found for this postcode.');
                          }
                        } catch {
                          alert('Failed to fetch council tax data. The API may not be configured.');
                        }
                      }} className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors">
                        Auto-fetch Council Tax
                      </button>
                    </div>
                  )}
                  <DatePicker label="Rent Review Date" value={form.rent_review_date} onChange={(v: string) => setForm({ ...form, rent_review_date: v })} />
                  <DatePicker label="Onboarded Date" value={form.onboarded_date} onChange={(v: string) => setForm({ ...form, onboarded_date: v })} />
                  <div className="flex flex-wrap gap-2 col-span-full">
                    <Toggle label="Proof of Ownership" checked={form.proof_of_ownership_received} onChange={v => setForm({ ...form, proof_of_ownership_received: v })} />
                    <Toggle label="Has Gas" checked={form.has_gas} onChange={v => setForm({ ...form, has_gas: v })} />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                  {property.landlord_type !== 'internal' && <ReadField label="Service Type" value={
                    property.service_type === 'full_management' ? 'Full Management' :
                    property.service_type === 'rent_collection' ? 'Rent Collection' :
                    property.service_type === 'let_only' ? 'Let Only' : null
                  } />}
                  {property.landlord_type !== 'internal' && <ReadField label="Charge" value={property.charge_percentage ? `${property.charge_percentage}%` : null} />}
                  {property.landlord_type !== 'internal' && <ReadField label="Total Charge" value={property.total_charge ? `£${property.total_charge}` : null} />}
                  <ReadField label="Council Tax" value={property.council_tax_band ? `Band ${property.council_tax_band}` : null} />
                  <ReadField label="EPC Grade" value={property.epc_grade ? (
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold ${EPC_COLORS[property.epc_grade] || 'bg-[var(--bg-hover)] text-[var(--text-muted)]'}`}>
                      {property.epc_grade}
                    </span>
                  ) : null} />
                  <ReadField label="Rent Review" value={formatDate(property.rent_review_date)} />
                  <ReadField label="Onboarded" value={formatDate(property.onboarded_date)} />
                  <ReadField label="Proof of Ownership" value={property.proof_of_ownership_received ? 'Yes' : 'No'} />
                  <ReadField label="Gas Supply" value={property.has_gas ? 'Yes' : 'No'} />
                </div>
              )}
            </GlassCard>

            {/* Leasehold (conditional) */}
            {(editing ? form.is_leasehold : property.is_leasehold) ? (
              <GlassCard className="p-4 sm:p-6">
                <SectionHeader title="Leasehold" icon={<KeyRound size={16} />} />
                {editing ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    <Toggle label="Leasehold Property" checked={form.is_leasehold} onChange={v => setForm({ ...form, is_leasehold: v })} />
                    <DatePicker label="Lease Start" value={form.leasehold_start_date} onChange={(v: string) => setForm({ ...form, leasehold_start_date: v })} />
                    <DatePicker label="Lease End" value={form.leasehold_end_date} onChange={(v: string) => setForm({ ...form, leasehold_end_date: v })} />
                    <Input label="Leasehold Issued By" value={form.leasehold_issued_by} onChange={(v: string) => setForm({ ...form, leasehold_issued_by: v })} />
                    <Input label="Email Address" value={form.leasehold_email} onChange={(v: string) => setForm({ ...form, leasehold_email: v })} type="email" />
                    <Input label="Contact Number" value={form.leasehold_phone} onChange={(v: string) => setForm({ ...form, leasehold_phone: v })} />
                    <Input label="Reference" value={form.leasehold_reference} onChange={(v: string) => setForm({ ...form, leasehold_reference: v })} />
                    <Input label="Portal Website" value={form.leasehold_portal_url} onChange={(v: string) => setForm({ ...form, leasehold_portal_url: v })} placeholder="https://…" />
                    <Input label="Portal Username" value={form.leasehold_portal_username} onChange={(v: string) => setForm({ ...form, leasehold_portal_username: v })} />
                    {user?.role === 'admin' && <Input label={property.leasehold_portal_password_set ? 'New Portal Password (leave blank to keep)' : 'Portal Password'} type="password" value={form.leasehold_portal_password} onChange={(v: string) => setForm({ ...form, leasehold_portal_password: v })} />}
                    <Input label="Portal Notes" value={form.leasehold_notes || form.leaseholder_info} onChange={(v: string) => setForm({ ...form, leasehold_notes: v, leaseholder_info: v })} className="col-span-full" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                    <ReadField label="Lease Start" value={formatDate(property.leasehold_start_date)} />
                    <ReadField label="Lease End" value={formatDate(property.leasehold_end_date)} />
                    <ReadField label="Leasehold Issued By" value={property.leasehold_issued_by} />
                    <ReadField label="Email Address" value={property.leasehold_email} />
                    <ReadField label="Contact Number" value={property.leasehold_phone} />
                    <ReadField label="Reference" value={property.leasehold_reference} />
                    <ReadField label="Portal Website" value={property.leasehold_portal_url ? <a href={property.leasehold_portal_url} target="_blank" rel="noreferrer" className="text-[var(--accent-orange)] hover:underline">Click to Open</a> : ''} />
                    <ReadField label="Portal Username" value={property.leasehold_portal_username} />
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">Portal Password</p>
                      {property.leasehold_portal_password_set ? user?.role === 'admin' ? (
                        <button type="button" onClick={() => revealPortalPassword('leasehold')} className="mt-0.5 text-sm font-medium text-[var(--accent-orange)] hover:underline">
                          <Eye size={14} className="inline mr-1" />{revealedPortalPasswords.leasehold || (revealingPortalPassword === 'leasehold' ? 'Revealing…' : 'Show Password')}
                        </button>
                      ) : <p className="mt-0.5 text-sm font-medium">Stored securely · Admin access required</p> : <p className="mt-0.5 text-sm font-medium">—</p>}
                    </div>
                    <ReadField label="Portal Notes" value={property.leasehold_notes || property.leaseholder_info} />
                  </div>
                )}
              </GlassCard>
            ) : editing ? (
              <div className="flex">
                <Toggle label="Mark as Leasehold" checked={false} onChange={v => setForm({ ...form, is_leasehold: v })} />
              </div>
            ) : null}

            {(editing || !!property.has_management_company || !!property.is_leasehold) && (
              <GlassCard className="p-4 sm:p-6">
                <SectionHeader title="Management Company" icon={<Landmark size={16} />} />
                {editing ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    <div className="col-span-full"><Toggle label="Management Company Appointed" checked={form.has_management_company} onChange={v => setForm({ ...form, has_management_company: v })} /></div>
                    {form.has_management_company && <>
                      <Input label="Company Name" value={form.management_company_name} onChange={(v: string) => setForm({ ...form, management_company_name: v })} />
                      <Input label="Email Address" value={form.management_company_email} onChange={(v: string) => setForm({ ...form, management_company_email: v })} type="email" />
                      <Input label="Contact Number" value={form.management_company_phone} onChange={(v: string) => setForm({ ...form, management_company_phone: v })} />
                      <Input label="Reference" value={form.management_company_reference} onChange={(v: string) => setForm({ ...form, management_company_reference: v })} />
                      <Input label="Portal Website" value={form.management_company_portal_url} onChange={(v: string) => setForm({ ...form, management_company_portal_url: v })} placeholder="https://…" />
                      <Input label="Portal Username" value={form.management_company_portal_username} onChange={(v: string) => setForm({ ...form, management_company_portal_username: v })} />
                      {user?.role === 'admin' && <Input label={property.management_company_portal_password_set ? 'New Portal Password (leave blank to keep)' : 'Portal Password'} type="password" value={form.management_company_portal_password} onChange={(v: string) => setForm({ ...form, management_company_portal_password: v })} />}
                      <Input label="Portal Notes" value={form.management_company_notes} onChange={(v: string) => setForm({ ...form, management_company_notes: v })} className="col-span-full" />
                    </>}
                  </div>
                ) : !property.has_management_company ? <p className="text-sm text-[var(--text-secondary)]">No Management Company Appointed</p> : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                    <ReadField label="Company Name" value={property.management_company_name} />
                    <ReadField label="Email Address" value={property.management_company_email} />
                    <ReadField label="Contact Number" value={property.management_company_phone} />
                    <ReadField label="Reference" value={property.management_company_reference} />
                    <ReadField label="Portal Website" value={property.management_company_portal_url ? <a href={property.management_company_portal_url} target="_blank" rel="noreferrer" className="text-[var(--accent-orange)] hover:underline">Click to Open</a> : ''} />
                    <ReadField label="Portal Username" value={property.management_company_portal_username} />
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">Portal Password</p>
                      {property.management_company_portal_password_set ? user?.role === 'admin' ? (
                        <button type="button" onClick={() => revealPortalPassword('management-company')} className="mt-0.5 text-sm font-medium text-[var(--accent-orange)] hover:underline">
                          <Eye size={14} className="inline mr-1" />{revealedPortalPasswords['management-company'] || (revealingPortalPassword === 'management-company' ? 'Revealing…' : 'Show Password')}
                        </button>
                      ) : <p className="mt-0.5 text-sm font-medium">Stored securely · Admin access required</p> : <p className="mt-0.5 text-sm font-medium">—</p>}
                    </div>
                    <ReadField label="Portal Notes" value={property.management_company_notes} />
                  </div>
                )}
              </GlassCard>
            )}

            {/* Tenancy information, including retained historic tenants */}
            {(!isToLet || linkedTenants.length > 0) && (
              <GlassCard className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4">
                  <SectionHeader title="Tenancy Information" icon={<Users size={16} />} />
                  <div className="flex flex-wrap gap-2 sm:ml-auto">
                  {!editing && previousTenants.length > 0 && (
                    <Button variant="outline" className="!bg-amber-100 !text-amber-900 !border-amber-300" size="sm" onClick={() => setShowPreviousTenancies(value => !value)}>
                      Previous Tenancies ({previousTenants.length})
                    </Button>
                  )}
                  {!editing && currentTenants.length === 0 && (
                    <Button variant="outline" className="!bg-emerald-600 !text-white !border-emerald-600" size="sm" onClick={() => { setShowTenantModal(true); setTenantModalMode('select'); }}>
                      <Plus size={14} className="mr-1.5" /> <span className="hidden sm:inline">Add Tenant</span><span className="sm:hidden">Add</span>
                    </Button>
                  )}
                  {!editing && currentTenants.length > 0 && (
                    <Button variant="outline" size="sm" onClick={handleRemoveTenant} className="!bg-red-600 !text-white !border-red-600 rounded-full">
                      <Trash2 size={14} className="mr-1.5" /> <span className="hidden sm:inline">End Tenancy</span>
                    </Button>
                  )}
                </div>
                </div>
                {currentTenants.length > 0 && !editing && (
                  <div className="mb-4 space-y-2">
                    {currentTenants.map(tenant => (
                      <div key={tenant.id || tenant.name} className="p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                        <div className="flex items-center gap-3">
                          <Avatar name={tenant.name} size="md" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{tenant.name}</p>
                            <p className="text-xs text-[var(--text-muted)]">{currentTenants.length > 1 ? 'Joint Tenant' : 'Current Tenant'} · End date: {tenant.tenancy_end_date ? formatDate(tenant.tenancy_end_date) : 'Not scheduled'}</p>
                          </div>
                          {tenant.id ? (
                            <button onClick={() => navigate(`/tenants/${tenant.id}`)} className="text-xs text-[var(--accent-orange)] hover:underline">
                              View
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!editing && scheduledTenants.length > 0 && <div className="mb-4 space-y-2">{scheduledTenants.map(tenant => <button key={tenant.id} onClick={() => navigate(`/tenants/${tenant.id}`)} className="w-full rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-left"><p className="text-sm font-medium">{tenant.name}</p><p className="text-xs text-[var(--text-muted)]">Scheduled · Starts {formatDate(tenant.tenancy_start_date || '')} · End date: {tenant.tenancy_end_date ? formatDate(tenant.tenancy_end_date) : 'Not scheduled'}</p></button>)}</div>}
                {showPreviousTenancies && !editing && (
                  <div className="mb-4 space-y-2 border-t border-[var(--border-subtle)] pt-4">
                    {previousTenants.map(tenant => (
                      <button key={tenant.id} onClick={() => navigate(`/tenants/${tenant.id}`)} className="w-full text-left rounded-xl bg-[var(--bg-subtle)] p-3 hover:bg-[var(--bg-hover)]">
                        <p className="text-sm font-medium">{tenant.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">Ended {tenant.tenancy_end_date ? formatDate(tenant.tenancy_end_date) : '—'}</p>
                      </button>
                    ))}
                  </div>
                )}
                {editing ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                      <Toggle label="Live Tenancy" checked={form.has_live_tenancy} onChange={v => setForm({ ...form, has_live_tenancy: v })} />
                      <Select label="Tenancy Type" value={form.tenancy_type} onChange={(v: string) => setForm({
                        ...form,
                        tenancy_type: v,
                        has_end_date: v === 'Fixed Term',
                        tenancy_end_date: v === 'Assured Periodic Tenancy' ? '' : form.tenancy_end_date,
                      })}
                        options={[
                          { value: '', label: 'Select...' },
                          ...(!['', 'Fixed Term', 'Assured Periodic Tenancy'].includes(form.tenancy_type) ? [{ value: form.tenancy_type, label: `${form.tenancy_type} (legacy)` }] : []),
                          { value: 'Fixed Term', label: 'Fixed Term' },
                          { value: 'Assured Periodic Tenancy', label: 'Assured Periodic Tenancy' },
                        ]} />
                      <DatePicker label="Start Date" value={form.tenancy_start_date} onChange={(v: string) => setForm({ ...form, tenancy_start_date: v })} />
                      {form.tenancy_type === 'Fixed Term' && <DatePicker label="End Date" value={form.tenancy_end_date} onChange={(v: string) => setForm({ ...form, tenancy_end_date: v })} />}
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                    <ReadField label="Tenancy Type" value={property.tenancy_type} />
                    <ReadField label="Start Date" value={formatDate(property.tenancy_start_date)} />
                    {property.has_end_date === 1 ? <ReadField label="End Date" value={formatDate(property.tenancy_end_date)} /> : null}
                    <ReadField label="Status" value={property.has_live_tenancy ? 'Active' : scheduledTenants.length ? 'Scheduled' : 'Inactive'} />
                    {property.has_end_date === 1 && property.tenancy_end_date && (() => {
                      const days = daysUntil(property.tenancy_end_date);
                      if (days === null) return null;
                      return (
                        <ReadField label="Time Remaining" value={
                          <span className={`text-sm font-medium ${days < 0 ? 'text-red-400' : days < 30 ? 'text-amber-400' : days < 90 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                            {days < 0 ? `Expired ${Math.abs(days)} days ago` : `${days} days`}
                          </span>
                        } />
                      );
                    })()}
                  </div>
                )}
              </GlassCard>
            )}


            <PropertyInventory propertyId={property.id} tenants={linkedTenants} onSaved={()=>setInventoryRefresh(n=>n+1)} />

            {/* Tasks */}
            <Card className="p-4 sm:p-6">
              <SectionHeader
                title="Tasks" icon={<ListChecks size={16} />}
                action={() => setShowAddTask(true)}
                actionLabel="Add New"
              />
              {propertyTasks.length ? (
                <div className="space-y-2">
                  {propertyTasks.map(task => (
                    <div key={task.id} onClick={() => openTaskDetail(task.id)}
                      className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        task.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'
                      }`}>
                        {task.status === 'completed' ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{task.title}</p>
                      </div>
                      <Tag>{task.priority}</Tag>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState message="No tasks for this property" />
              )}
            </Card>

            {/* Maintenance */}
            <Card className="p-4 sm:p-6">
              <SectionHeader title="Maintenance" icon={<Wrench size={16} />} action={() => setShowAddMaintenance(true)} actionLabel="Report Issue" />
              {maintenance.length ? (
                <div className="space-y-2">
                  {maintenance.slice(0, 5).map(m => (
                    <div
                      key={m.id}
                      onClick={() => navigate(`/maintenance/${m.id}`)}
                      className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        m.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                        m.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-amber-500/20 text-amber-400'
                      }`}>
                        <Wrench size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{m.title}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">{m.status === 'completed' ? 'Completed' : m.status === 'in_progress' ? 'In Progress' : 'Open'}</p>
                      </div>
                      <Tag>{m.priority}</Tag>
                      <ChevronRight size={14} className="text-[var(--text-muted)]" />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState message="No maintenance records" />
              )}
            </Card>

            {property.landlord_type==='internal'&&<PropertyInsurance propertyId={property.id}/>}
            {canAccessFinance() && <PropertyExpenses propertyId={property.id} />}

            {/* Rent Payments */}
            {canAccessFinance() && <RentPayments propertyId={property.id} compact />}
          </div>

          {/* RIGHT COLUMN — 1/3 */}
          <div className="lg:col-span-1 space-y-4 sm:space-y-6">
            {/* Compliance Overview */}
            <Card className="p-4 sm:p-6">
              <SectionHeader title="Compliance" icon={<ShieldCheck size={16} />} />
              <div className="flex justify-center mb-4">
                <ProgressRing value={overallCompliance()} size={90} strokeWidth={7} />
              </div>
              <div className="space-y-3">
                {editing ? <div className="space-y-4"><DatePicker label="EICR Expiry Date" value={form.eicr_expiry_date} onChange={v=>setForm(f=>({...f,eicr_expiry_date:v}))}/><DatePicker label="EPC Expiry Date" value={form.epc_expiry_date} onChange={v=>setForm(f=>({...f,epc_expiry_date:v}))}/>{form.has_gas&&<><DatePicker label="Gas Safety Expiry Date" value={form.gas_safety_expiry_date} onChange={v=>setForm(f=>({...f,gas_safety_expiry_date:v}))}/></>}</div>:<>
                <ComplianceRow label="EICR" expiry={property.compliance?.items.some(i=>i.docType==='EICR'&&i.hasDocument)?property.eicr_expiry_date:null} />{property.compliance?.items.filter(i=>i.docType==='EICR'&&!i.ready).map(i=><p key={i.docType} className="flex items-start gap-2 text-xs text-red-600"><AlertTriangle size={14} className="shrink-0"/>{i.reason}</p>)}
                <ComplianceRow label="EPC" expiry={property.compliance?.items.some(i=>i.docType==='EPC'&&i.hasDocument)?property.epc_expiry_date:null} grade={property.epc_grade} />{property.compliance?.items.filter(i=>i.docType==='EPC'&&!i.ready).map(i=><p key={i.docType} className="flex items-start gap-2 text-xs text-red-600"><AlertTriangle size={14} className="shrink-0"/>{i.reason}</p>)}
                {property.has_gas ? <><ComplianceRow label="Gas Safety" expiry={property.compliance?.items.some(i=>i.docType==='Gas Safety Certificate'&&i.hasDocument)?property.gas_safety_expiry_date:null} />{property.compliance?.items.filter(i=>i.docType==='Gas Safety Certificate'&&!i.ready).map(i=><p key={i.docType} className="flex items-start gap-2 text-xs text-red-600"><AlertTriangle size={14} className="shrink-0"/>{i.reason}</p>)}</> : null}</>}
              </div>
            </Card>

            {/* Compliance Reminders */}
            {reminders.length > 0 && (
              <Card className="p-4 sm:p-6 border-amber-500/30">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={16} className="text-amber-400" />
                  <span className="text-sm font-semibold text-amber-400">Expiring Soon</span>
                </div>
                <div className="space-y-2">
                  {reminders.map(r => (
                    <div key={r.label} className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">{r.label}</span>
                      <span className={`text-xs font-medium ${r.days < 0 ? 'text-red-400' : 'text-amber-400'}`}>
                        {r.days < 0 ? `Expired ${Math.abs(r.days)}d ago` : `${r.days} days`}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Landlords */}
            <Card className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4">
                <SectionHeader title="Landlords" icon={<User size={16} />} />
                {property.landlord_type !== 'internal' && <Button variant="outline" size="sm" onClick={() => setShowAddLandlord(true)}>
                  <Plus size={14} className="mr-1.5" /> <span className="hidden sm:inline">Add Landlord</span><span className="sm:hidden">Add</span>
                </Button>}
              </div>
              {propertyLandlords.length === 0 ? (
                <EmptyState message="No landlords linked" />
              ) : (
                <div className="space-y-2">
                  {propertyLandlords.map(landlord => (
                    <div key={landlord.link_id}>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors group">
                        <div
                          onClick={() => navigate(`/landlords/${landlord.id}`)}
                          className="flex items-center gap-3 flex-1 cursor-pointer">
                          <Avatar name={landlord.name} size="md" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium truncate">{landlord.name}</p>
                              {landlord.is_primary === 1 && (
                                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 whitespace-nowrap">
                                  Primary
                                </span>
                              )}
                              <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${
                                landlord.ownership_entity_type === 'company'
                                  ? 'bg-blue-500/20 text-blue-400'
                                  : 'bg-green-500/20 text-green-400'
                              }`}>
                                {landlord.ownership_entity_type === 'company' ? 'Limited Company' : 'Individual'}
                              </span>
                            </div>
                            <p className="text-xs text-[var(--text-muted)]">
                              {landlord.company_number && <span className="mr-2">Co. #{landlord.company_number}</span>}
                              {landlord.email || landlord.phone || 'Landlord'}
                            </p>
                          </div>
                        </div>
                        <div className={`flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ${property.landlord_type === 'internal' ? '!hidden' : ''}`}>
                          {landlord.is_primary !== 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSetPrimary(landlord.link_id, landlord.name)}
                              className="text-xs"
                            >
                              Set Primary
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveLandlord(landlord.link_id, landlord.name)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                      {/* Directors for company landlords */}
                      {landlord.ownership_entity_type === 'company' && landlordDirectors[landlord.id]?.length > 0 && (
                        <div className="ml-6 mt-1 mb-1 space-y-1">
                          <p className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider pl-3 pt-1">Directors / Officers</p>
                          {landlordDirectors[landlord.id].map(dir => (
                            <div key={dir.id} className="flex items-center gap-2.5 p-2 pl-3 rounded-lg bg-[var(--bg-hover)]/50 text-sm">
                              <div className="w-6 h-6 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                                <User size={12} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-xs truncate">{dir.name}</span>
                                  {dir.role && <span className="text-[9px] text-[var(--text-muted)]">{dir.role}</span>}
                                  {dir.kyc_completed ? (
                                    <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400">KYC</span>
                                  ) : (
                                    <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/20 text-red-400">No KYC</span>
                                  )}
                                </div>
                                <p className="text-[10px] text-[var(--text-muted)] truncate">
                                  {[dir.email, dir.phone].filter(Boolean).join(' · ') || 'No contact info'}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Land Registry Price Data */}
            {!!property.postcode && <PricePaidData postcode={property.postcode} />}

            {/* Documents */}
            <DocumentUpload refreshKey={inventoryRefresh} entityType="property" entityId={property.id} onChange={loadDetail} />

            {/* Activity */}
            {/* Notes */}
            <Card className="p-4 sm:p-6">
              <SectionHeader title="Notes" icon={<StickyNote size={16} />} />

              {/* Filter Tabs */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <button
                  onClick={() => setNotesFilter('property')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    notesFilter === 'property'
                      ? 'bg-[var(--text-primary)] text-[var(--bg-page)]'
                      : 'bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  Property ({notes.length})
                </button>
                {!!property.landlord_id && (
                  <button
                    onClick={() => setNotesFilter('landlord')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      notesFilter === 'landlord'
                        ? 'bg-[var(--text-primary)] text-[var(--bg-page)]'
                        : 'bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    Landlord ({landlordNotes.length})
                  </button>
                )}
                {activeLinkedTenants.map(tenant => (
                  <button
                    key={tenant.id}
                    onClick={() => setNotesFilter(`tenant-${tenant.id}`)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      notesFilter === `tenant-${tenant.id}`
                        ? 'bg-[var(--text-primary)] text-[var(--bg-page)]'
                        : 'bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    {tenant.name} ({tenantNotes[tenant.id]?.length || 0})
                  </button>
                ))}
              </div>

              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {displayedNotes.length === 0 && (
                  <p className="text-sm text-[var(--text-muted)]">No notes yet</p>
                )}
                {displayedNotes.map(n => (
                  <div key={n.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--bg-hover)] flex items-center justify-center shrink-0 mt-0.5">
                      <StickyNote size={14} className="text-[var(--text-muted)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2"><p className="text-sm whitespace-pre-wrap">{n.text}</p><DeleteNoteButton entity={notesFilter.startsWith('tenant-')?'tenant':notesFilter} id={notesFilter==='property'?property.id:notesFilter==='landlord'?property.landlord_id!:Number(notesFilter.replace('tenant-',''))} note={n} onDeleted={loadDetail} /></div>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                        {n.author}{n.created_at ? ` · ${new Date(n.created_at).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2 mt-2">
                  <textarea rows={2}
                    value={notesInput}
                    onChange={e => {setNotesInput(e.target.value);e.currentTarget.style.height="auto";e.currentTarget.style.height=`${e.currentTarget.scrollHeight}px`;}}

                    placeholder={`Add a note to ${notesFilter}...`}
                    className="flex-1 bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-orange)]/40 transition-colors"
                  />
                  <Button variant="gradient" onClick={addNote} disabled={!notesInput.trim()}>
                    Add
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="p-4 sm:p-6">
              <SectionHeader title="Activity" icon={<History size={16} />} />
              <ActivityTimeline entityType="property" entityId={property.id} />
            </Card>
          </div>
        </div>

        {/* Add Task Modal */}
        {showAddTask && (
          <div className="fixed inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setShowAddTask(false)}>
            <div className="bg-[var(--bg-card)] rounded-t-2xl sm:rounded-2xl border border-[var(--border-input)] w-full sm:max-w-[480px] max-h-[90vh] overflow-y-auto p-4 sm:p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4 sm:mb-5">
                <h3 className="text-base sm:text-lg font-bold line-clamp-1 pr-2">Add Task for {property.address}</h3>
                <button onClick={() => setShowAddTask(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0"><X size={18} /></button>
              </div>
              <div className="space-y-3 sm:space-y-4">
                <Input label="Title" value={taskForm.title} onChange={v => setTaskForm(p => ({...p, title: v}))} placeholder="Task title" />
                <Input label="Description" value={taskForm.description} onChange={v => setTaskForm(p => ({...p, description: v}))} placeholder="Description..." />
                <Select
                  label="Assigned To"
                  value={taskForm.assigned_to}
                  onChange={v => setTaskForm(p => ({...p, assigned_to: v}))}
                  options={[
                    { value: '', label: 'Select user...' },
                    ...users.map(u => ({ value: u.name, label: `${u.name} (${u.role})` }))
                  ]}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Priority</label>
                    <div className="flex gap-1.5">
                      {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                        <button key={k} onClick={() => setTaskForm(p => ({...p, priority: k}))}
                          className={`flex-1 text-xs py-2 rounded-lg border font-medium transition-colors ${
                            taskForm.priority === k ? PRIORITY_COLORS[k] + ' border-current' : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                          }`}>{v}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Type</label>
                    <Select
                      value={taskForm.task_type}
                      onChange={v => setTaskForm(p => ({...p, task_type: v}))}
                      options={TASK_TYPES.map(t => ({ value: t, label: t.replace('_', ' ').replace(/^\w/, c => c.toUpperCase()) }))}
                    />
                  </div>
                </div>
                <DatePicker label="Due Date" value={taskForm.due_date} onChange={v => setTaskForm(p => ({...p, due_date: v}))} />

                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setShowAddTask(false)}>Cancel</Button>
                  <Button variant="gradient" onClick={addTask} disabled={!taskForm.title}>Add Task</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Maintenance Modal */}
        {showAddMaintenance && (
          <div className="fixed inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setShowAddMaintenance(false)}>
            <div className="bg-[var(--bg-card)] rounded-t-2xl sm:rounded-2xl border border-[var(--border-input)] w-full sm:max-w-[480px] max-h-[90vh] overflow-y-auto p-4 sm:p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4 sm:mb-5">
                <h3 className="text-base sm:text-lg font-bold line-clamp-1 pr-2">Report Maintenance Issue</h3>
                <button onClick={() => setShowAddMaintenance(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0"><X size={18} /></button>
              </div>
              <div className="space-y-3 sm:space-y-4">
                <Select label="Assigned To" value={maintenanceForm.assigned_to} onChange={assigned_to=>setMaintenanceForm(f=>({...f,assigned_to}))} options={[{value:'',label:'Unassigned'},...users.map(u=>({value:String(u.id),label:u.name}))]}/>
                <DatePicker label="Follow-up Date" value={maintenanceForm.follow_up_date} onChange={follow_up_date=>setMaintenanceForm(f=>({...f,follow_up_date}))}/>
                <DatePicker label="Due By" value={maintenanceForm.due_date} onChange={due_date=>setMaintenanceForm(f=>({...f,due_date}))}/>
                <Input label="Title" value={maintenanceForm.title} onChange={v => setMaintenanceForm(p => ({...p, title: v}))} placeholder="Brief description of the issue" />
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Description</label>
                  <textarea
                    value={maintenanceForm.description}
                    onChange={e => setMaintenanceForm(p => ({...p, description: e.target.value}))}
                    placeholder="Detailed description..."
                    rows={3}
                    className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-orange)]/50"
                  />
                </div>
                <Select
                  label="Category"
                  value={maintenanceForm.category}
                  onChange={v => setMaintenanceForm(p => ({...p, category: v}))}
                  options={[
                    { value: 'plumbing', label: 'Plumbing' },
                    { value: 'electrical', label: 'Electrical' },
                    { value: 'heating', label: 'Heating' },
                    { value: 'structural', label: 'Structural' },
                    { value: 'appliance', label: 'Appliance' },
                    { value: 'pest', label: 'Pest Control' },
                    { value: 'garden', label: 'Garden' },
                    { value: 'other', label: 'Other' },
                  ]}
                />
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Priority</label>
                  <div className="flex gap-1.5">
                    {[['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['urgent', 'Urgent']].map(([k, v]) => (
                      <button key={k} onClick={() => setMaintenanceForm(p => ({...p, priority: k}))}
                        className={`flex-1 text-xs py-2 rounded-lg border font-medium transition-colors ${
                          maintenanceForm.priority === k
                            ? k === 'urgent' ? 'bg-red-500/20 border-red-500/50 text-red-400'
                              : k === 'high' ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                              : k === 'medium' ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                              : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                            : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                        }`}>{v}</button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setShowAddMaintenance(false)}>Cancel</Button>
                  <Button variant="gradient" onClick={addMaintenance} disabled={!maintenanceForm.title || !maintenanceForm.description}>Report Issue</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Task Detail Modal */}
        {selectedTask && (
          <div className="fixed inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setSelectedTask(null)}>
            <div className="bg-[var(--bg-card)] rounded-t-2xl sm:rounded-2xl border border-[var(--border-input)] w-full sm:max-w-[520px] max-h-[90vh] overflow-y-auto p-4 sm:p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base sm:text-lg font-bold line-clamp-1 pr-2">{selectedTask.title}</h3>
                <button onClick={() => setSelectedTask(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0"><X size={18} /></button>
              </div>

              {/* Status buttons */}
              <div className="flex gap-2 mb-4">
                {['pending', 'in_progress', 'completed'].map(s => (
                  <button
                    key={s}
                    onClick={() => updateTaskStatus(selectedTask.id, s)}
                    className={`flex-1 text-xs py-2 rounded-lg border font-medium transition-colors ${
                      selectedTask.status === s
                        ? s === 'completed' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                          : s === 'in_progress' ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                          : 'bg-[var(--bg-hover)] border-[var(--border-input)] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {s === 'pending' ? 'Pending' : s === 'in_progress' ? 'In Progress' : 'Completed'}
                  </button>
                ))}
              </div>

              {/* Task details */}
              <div className="space-y-3">
                {selectedTask.description && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Description</p>
                    <p className="text-sm text-[var(--text-secondary)]">{selectedTask.description}</p>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Priority</p>
                    <Tag>{selectedTask.priority}</Tag>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Type</p>
                    <p className="text-sm">{(selectedTask.task_type || 'manual').replace('_', ' ')}</p>
                  </div>
                  {selectedTask.assigned_to && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Assigned To</p>
                      <p className="text-sm">{selectedTask.assigned_to_name || selectedTask.assigned_to}</p>
                    </div>
                  )}
                  {selectedTask.due_date && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Due Date</p>
                      <p className="text-sm">{new Date(selectedTask.due_date).toLocaleDateString()}</p>
                    </div>
                  )}
                </div>
                {selectedTask.notes && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Notes</p>
                    <p className="text-sm text-[var(--text-secondary)]">{selectedTask.notes}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4 mt-4 border-t border-[var(--border-subtle)]">
                <Button variant="ghost" onClick={() => setSelectedTask(null)}>Close</Button>
                <Button variant="outline" size="sm" onClick={() => { setSelectedTask(null); navigate(`/tasks/${selectedTask.id}`); }}>
                  Open Full Page <ChevronRight size={14} className="ml-1" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Add Landlord Modal */}
        {showAddLandlord && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddLandlord(false)}>
            <div className="bg-[var(--bg-elevated)] rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)] px-6 py-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Add Landlord to Property</h2>
                <button onClick={() => setShowAddLandlord(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                    Ownership Type
                  </label>
                  <div className="flex items-center gap-1 bg-[var(--bg-input)] rounded-xl p-1 border border-[var(--border-input)] mb-4">
                    <button
                      type="button"
                      onClick={() => setOwnershipEntityType('individual')}
                      className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        ownershipEntityType === 'individual'
                          ? 'bg-[var(--text-primary)] text-[var(--bg-page)]'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                      }`}>
                      Individual
                    </button>
                    <button
                      type="button"
                      onClick={() => setOwnershipEntityType('company')}
                      className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        ownershipEntityType === 'company'
                          ? 'bg-[var(--text-primary)] text-[var(--bg-page)]'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                      }`}>
                      Limited Company
                    </button>
                  </div>
                  <Input
                    label="Search Landlords"
                    value={landlordSearch}
                    onChange={setLandlordSearch}
                    placeholder="Search by name, email, or phone..."
                  />
                </div>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {allLandlords
                    .filter(l =>
                      !propertyLandlords.find(pl => pl.id === l.id) &&
                      (ownershipEntityType === 'company' ? !!l.company_number : !l.company_number) &&
                      (landlordSearch === '' ||
                        l.name.toLowerCase().includes(landlordSearch.toLowerCase()) ||
                        l.email?.toLowerCase().includes(landlordSearch.toLowerCase()) ||
                        l.phone?.toLowerCase().includes(landlordSearch.toLowerCase()))
                    )
                    .map(landlord => (
                      <div
                        key={landlord.id}
                        onClick={() => {
                          setSelectedLandlordId(landlord.id);
                          handleAddLandlord(landlord.id);
                        }}
                        className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors">
                        <Avatar name={landlord.name} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{landlord.name}</p>
                          <p className="text-xs text-[var(--text-muted)] truncate">{landlord.email || landlord.phone || '—'}</p>
                        </div>
                        <ChevronRight size={16} className="text-[var(--text-muted)]" />
                      </div>
                    ))}
                  {allLandlords.filter(l =>
                    !propertyLandlords.find(pl => pl.id === l.id) &&
                    (ownershipEntityType === 'company' ? !!l.company_number : !l.company_number) &&
                    (landlordSearch === '' ||
                      l.name.toLowerCase().includes(landlordSearch.toLowerCase()) ||
                      l.email?.toLowerCase().includes(landlordSearch.toLowerCase()) ||
                      l.phone?.toLowerCase().includes(landlordSearch.toLowerCase()))
                  ).length === 0 && (
                    <EmptyState message={landlordSearch ? "No landlords match your search" : `No ${ownershipEntityType === 'company' ? 'limited company' : 'individual'} landlords available`} />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Modal */}
        {showConfirmModal && pendingAction && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowConfirmModal(false)}>
            <div className="bg-[var(--bg-elevated)] rounded-2xl shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <AlertTriangle size={24} className="text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">Confirm Action</h2>
                    <p className="text-sm text-[var(--text-muted)]">This is an important change</p>
                  </div>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-6">
                  {pendingAction.type === 'add' &&
                    `Are you sure you want to add this landlord to the property? ${propertyLandlords.length === 0 ? 'They will be set as the primary landlord.' : ''}`
                  }
                  {pendingAction.type === 'remove' &&
                    `Are you sure you want to remove ${pendingAction.data.landlordName} from this property? This action cannot be undone.`
                  }
                  {pendingAction.type === 'setPrimary' &&
                    `Are you sure you want to set ${pendingAction.data.landlordName} as the primary landlord? The current primary landlord will be changed to a secondary landlord.`
                  }
                </p>
                <div className="flex gap-3">
                  <Button variant="ghost" onClick={() => {
                    setShowConfirmModal(false);
                    setPendingAction(null);
                  }} className="flex-1">
                    Cancel
                  </Button>
                  <Button variant="gradient" onClick={confirmAction} className="flex-1">
                    Confirm
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add/Select Tenant Modal */}
        {showEndTenancy && currentTenants[0]?.id && <TenancyEndModal tenantId={currentTenants[0].id} linkedName={currentTenants[1]?.name} initialDate={currentTenants[0].tenancy_end_date || undefined} onClose={()=>setShowEndTenancy(false)} onSaved={loadDetail} />}
      {showTenantModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setShowTenantModal(false)}>
            <div className="bg-[var(--bg-elevated)] rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)] px-4 sm:px-6 py-4 flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-semibold">Add Tenant to Property</h2>
                <button onClick={() => setShowTenantModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 sm:p-6">
                {/* Mode Selector */}
                <div className="mb-4">
                  <div className="flex items-center gap-1 bg-[var(--bg-input)] rounded-xl p-1 border border-[var(--border-input)]">
                    <button
                      type="button"
                      onClick={() => setTenantModalMode('select')}
                      className={`flex-1 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        tenantModalMode === 'select'
                          ? 'bg-[var(--text-primary)] text-[var(--bg-page)]'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                      }`}>
                      Select Existing
                    </button>
                    <button
                      type="button"
                      onClick={() => setTenantModalMode('create')}
                      className={`flex-1 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        tenantModalMode === 'create'
                          ? 'bg-[var(--text-primary)] text-[var(--bg-page)]'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                      }`}>
                      Create New
                    </button>
                  </div>
                </div>

                {tenantModalMode === 'select' ? (
                  <>
                    <Input
                      label="Search Tenants"
                      value={tenantSearch}
                      onChange={setTenantSearch}
                      placeholder="Search by name, email, or phone..."
                      className="mb-4"
                    />
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {allTenants
                        .filter(t =>
                          tenantSearch === '' ||
                          `${t.first_name_1} ${t.last_name_1}`.toLowerCase().includes(tenantSearch.toLowerCase()) ||
                          t.email_1?.toLowerCase().includes(tenantSearch.toLowerCase()) ||
                          t.phone_1?.toLowerCase().includes(tenantSearch.toLowerCase())
                        )
                        .map(tenant => (
                          <div
                            key={tenant.id}
                            onClick={() => handleLinkTenant(tenant.id)}
                            className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors">
                            <Avatar name={`${tenant.first_name_1} ${tenant.last_name_1}`} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{tenant.first_name_1} {tenant.last_name_1}</p>
                              <p className="text-xs text-[var(--text-muted)] truncate">{tenant.email_1 || tenant.phone_1 || '—'}</p>
                            </div>
                            <ChevronRight size={16} className="text-[var(--text-muted)]" />
                          </div>
                        ))}
                      {allTenants.filter(t =>
                        tenantSearch === '' ||
                        `${t.first_name_1} ${t.last_name_1}`.toLowerCase().includes(tenantSearch.toLowerCase()) ||
                        t.email_1?.toLowerCase().includes(tenantSearch.toLowerCase()) ||
                        t.phone_1?.toLowerCase().includes(tenantSearch.toLowerCase())
                      ).length === 0 && (
                        <EmptyState message={tenantSearch ? "No tenants match your search" : "No tenants available"} />
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Input
                          label="First Name *"
                          value={newTenantForm.first_name_1}
                          onChange={(v: string) => setNewTenantForm(f => ({ ...f, first_name_1: v }))}
                          placeholder="John"
                        />
                        <Input
                          label="Last Name *"
                          value={newTenantForm.last_name_1}
                          onChange={(v: string) => setNewTenantForm(f => ({ ...f, last_name_1: v }))}
                          placeholder="Doe"
                        />
                      </div>
                      <Input
                        label="Email *"
                        value={newTenantForm.email_1}
                        onChange={(v: string) => setNewTenantForm(f => ({ ...f, email_1: v }))}
                        placeholder="john.doe@example.com"
                        type="email"
                      />
                      <Input
                        label="Phone *"
                        value={newTenantForm.phone_1}
                        onChange={(v: string) => setNewTenantForm(f => ({ ...f, phone_1: v }))}
                        placeholder="07123 456789"
                      />
                    </div>
                    <div className="flex gap-3 mt-4">
                      <Button variant="ghost" onClick={() => setShowTenantModal(false)} className="flex-1">
                        Cancel
                      </Button>
                      <Button
                        variant="gradient"
                        onClick={handleCreateAndLinkTenant}
                        disabled={!newTenantForm.first_name_1 || !newTenantForm.last_name_1}
                        className="flex-1"
                      >
                        Create & Link
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function ComplianceRow({ label, expiry, grade }: { label: string; expiry: string | null; grade?: string | null }) {
  // eslint-disable-next-line react-hooks/purity
  const days = useMemo(() => expiry ? Math.ceil((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null, [expiry]);
  const color = days === null ? 'text-red-400' : days < 0 ? 'text-red-400' : days < 30 ? 'text-amber-400' : 'text-emerald-400';
  const formatD = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  return (
    <div className="flex items-center justify-between py-2 border-b border-[var(--border-subtle)] last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-sm text-[var(--text-secondary)]">{label}</span>
        {grade && (
          <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold ${EPC_COLORS[grade] || 'bg-[var(--bg-hover)]'}`}>
            {grade}
          </span>
        )}
      </div>
      <div className="text-right">
        <p className={`text-xs font-medium ${color}`}>
          {days === null ? '' : days < 0 ? 'Expired' : `${days}d remaining`}
        </p>
        <p className="text-[10px] text-[var(--text-muted)]">{formatD(expiry)}</p>
      </div>
    </div>
  );
}
